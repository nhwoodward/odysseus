"""Pin the MCP-connector SSRF fix (audit M2).

A self-serve custom MCP connector used to validate its URL once at creation,
then connect via the MCP SDK's httpx client with follow_redirects=True and no
IP pinning — so a public URL could 307-redirect the server to 169.254.169.254
(or DNS-rebind to a private address at connect time). The fix routes the
http/SSE MCP connection through a pinned, redirect-refusing httpx client factory
and refuses to connect at all when the URL is not a pinnable public address.
"""


def test_pinned_factory_refuses_internal_targets():
    from src.mcp_manager import _pinned_mcp_http_client_factory as f
    assert f("http://169.254.169.254/latest/meta-data/") is None  # cloud metadata
    assert f("http://127.0.0.1:8080/mcp") is None                 # loopback
    assert f("https://10.0.0.5/mcp") is None                      # RFC1918
    assert f("http://localhost/mcp") is None                      # localhost
    assert f("https://foo.internal/mcp") is None                  # internal TLD
    assert f("ftp://8.8.8.8/x") is None                           # unsupported scheme


def test_pinned_factory_pins_public_and_disables_redirects():
    from src.mcp_manager import _pinned_mcp_http_client_factory as f
    factory = f("https://8.8.8.8/mcp")  # literal public IP — no DNS lookup needed
    assert callable(factory)
    client = factory(headers={"X-Test": "1"})
    try:
        assert client.follow_redirects is False
    finally:
        # AsyncClient close is async; just drop the ref (no live connection made).
        del client
