"""Regression test for FINDING M2: DNS-rebinding (TOCTOU) SSRF in the
research/web content fetcher (``services.search.content``).

Before the fix, ``_get_public_url`` validated the hostname's resolved IPs and
then called ``httpx.get(<hostname-url>, ...)``, which RE-RESOLVED the hostname.
A hostname that was public at validation time could rebind to a private IP
(e.g. cloud metadata at 169.254.169.254) by the time httpx connected.

The fix resolves the host exactly once and pins the actual connection to that
validated IP (rewriting the URL host to the IP for plain HTTP while preserving
the original ``Host`` header; for HTTPS a custom transport keeps SNI + cert
verification on the hostname). These tests pin that behavior.
"""

import importlib.util
import ipaddress
import sys
import types
from pathlib import Path

import pytest

_ip = ipaddress.ip_address


def _load_content(monkeypatch, name="services.search.content_m2_rebind"):
    """Load services/search/content.py in isolation with stubbed siblings.

    Mirrors the loader used by tests/test_security_regressions.py so the module
    can be exercised without importing the whole search package.
    """
    services_pkg = types.ModuleType("services")
    services_pkg.__path__ = []
    search_pkg = types.ModuleType("services.search")
    search_pkg.__path__ = []
    analytics = types.ModuleType("services.search.analytics")
    analytics.RateLimitError = RuntimeError
    analytics.error_logger = types.SimpleNamespace(
        error=lambda *a, **k: None, warning=lambda *a, **k: None
    )
    cache = types.ModuleType("services.search.cache")
    cache.CONTENT_CACHE_DIR = Path("/tmp/odysseus-test-content-cache-m2")
    cache.content_cache_index = {}
    cache.generate_cache_key = lambda url: "test-cache-key"
    cache.cleanup_cache = lambda *a, **k: None

    monkeypatch.setitem(sys.modules, "services", services_pkg)
    monkeypatch.setitem(sys.modules, "services.search", search_pkg)
    monkeypatch.setitem(sys.modules, "services.search.analytics", analytics)
    monkeypatch.setitem(sys.modules, "services.search.cache", cache)

    spec = importlib.util.spec_from_file_location(
        name,
        Path(__file__).resolve().parent.parent / "services" / "search" / "content.py",
    )
    content = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(content)
    return content


def test_get_public_url_pins_validated_ip_against_dns_rebinding(monkeypatch):
    """The actual connection must target the IP seen at validation time, and the
    host must be resolved exactly once -- so a rebind to a private IP between
    validation and connect cannot reach an internal service."""
    content = _load_content(monkeypatch)

    calls = {"n": 0}

    def rebinding_resolver(host):
        calls["n"] += 1
        # Public on the first (validation) lookup; PRIVATE on any re-resolution.
        if calls["n"] == 1:
            return [_ip("93.184.216.34")]
        return [_ip("169.254.169.254")]  # cloud-metadata / link-local

    monkeypatch.setattr(content, "_resolve_hostname_ips", rebinding_resolver)

    captured = {}

    class _Resp:
        status_code = 200
        headers = {}

        def __init__(self, url):
            self.url = url

    def fake_get(url, **kwargs):
        captured["url"] = url
        captured["headers"] = kwargs.get("headers")
        return _Resp(url)

    monkeypatch.setattr(content.httpx, "get", fake_get)

    resp = content._get_public_url(
        "http://rebind.example/path?q=1", headers={"User-Agent": "x"}, timeout=5
    )

    assert resp.status_code == 200
    # Connection target is the validated public IP literal, NEVER the hostname.
    assert "93.184.216.34" in captured["url"]
    assert "rebind.example" not in captured["url"]
    # Host header is preserved so legitimate virtual-host routing still works.
    assert captured["headers"].get("Host") == "rebind.example"
    # Resolved exactly once: there is no second lookup a rebind could hijack.
    assert calls["n"] == 1


def test_get_public_url_preserves_port_and_path_on_pinned_url(monkeypatch):
    """Pinning to the IP must keep the original port, path, query and Host."""
    content = _load_content(monkeypatch, "services.search.content_m2_port")
    monkeypatch.setattr(
        content, "_resolve_hostname_ips", lambda host: [_ip("93.184.216.34")]
    )

    captured = {}

    class _Resp:
        status_code = 200
        headers = {}

        def __init__(self, url):
            self.url = url

    def fake_get(url, **kwargs):
        captured["url"] = url
        captured["headers"] = kwargs.get("headers")
        return _Resp(url)

    monkeypatch.setattr(content.httpx, "get", fake_get)

    content._get_public_url(
        "http://rebind.example:8080/a/b?x=1", headers={}, timeout=5
    )

    assert captured["url"] == "http://93.184.216.34:8080/a/b?x=1"
    assert captured["headers"].get("Host") == "rebind.example:8080"


def test_validated_pinned_ip_requires_all_resolved_ips_public(monkeypatch):
    """_validated_pinned_ip fails closed: any private resolved IP (or none)
    blocks the URL, so a rebinding answer mixing public+private is rejected."""
    content = _load_content(monkeypatch, "services.search.content_m2_helper")

    # A public literal IP pins to itself (no DNS, no rebinding window).
    assert content._validated_pinned_ip("http://93.184.216.34/") == "93.184.216.34"

    # Mixed public + private answer -> blocked (None).
    monkeypatch.setattr(
        content,
        "_resolve_hostname_ips",
        lambda host: [_ip("93.184.216.34"), _ip("10.0.0.5")],
    )
    assert content._validated_pinned_ip("https://innocent.example/") is None

    # Empty resolution -> blocked (None).
    monkeypatch.setattr(content, "_resolve_hostname_ips", lambda host: [])
    assert content._validated_pinned_ip("https://innocent.example/") is None


def test_get_public_url_still_blocks_redirect_into_private(monkeypatch):
    """The per-redirect re-validation loop must still reject a 302 into a
    private address (guards against regressing the existing protection)."""
    content = _load_content(monkeypatch, "services.search.content_m2_redirect")
    monkeypatch.setattr(
        content, "_resolve_hostname_ips", lambda host: [_ip("93.184.216.34")]
    )

    class _Resp:
        status_code = 302
        url = "http://public.example/start"
        headers = {"location": "http://169.254.169.254/latest/meta-data/"}

    monkeypatch.setattr(content.httpx, "get", lambda url, **kwargs: _Resp())

    with pytest.raises(content.httpx.RequestError) as exc:
        content._get_public_url("http://public.example/start", headers={}, timeout=5)
    assert "Blocked" in str(exc.value)
