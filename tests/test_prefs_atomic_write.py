import json
import os

import routes.prefs_routes as prefs_routes


def test_save_writes_prefs_file_atomically_and_owner_only(monkeypatch, tmp_path):
    # _save delegates to core.atomic_io.atomic_write_json, which writes a
    # sibling .tmp.<pid> file at 0600, fsyncs, then os.replace's into place.
    # Atomicity/crash-safety is the helper's contract (covered in
    # test_atomic_io.py); here we assert the prefs file lands owner-only and
    # leaves no tmp behind — the world-readable-write gap this fix closes.
    prefs_file = tmp_path / "data" / "user_prefs.json"
    monkeypatch.setattr(prefs_routes, "PREFS_FILE", str(prefs_file))

    prefs_routes._save({"theme": "dark"})

    assert json.loads(prefs_file.read_text(encoding="utf-8")) == {"theme": "dark"}
    assert (prefs_file.stat().st_mode & 0o777) == 0o600
    assert not list(prefs_file.parent.glob("*.tmp.*"))


def test_save_for_user_preserves_scoped_user_prefs(monkeypatch, tmp_path):
    prefs_file = tmp_path / "data" / "user_prefs.json"
    monkeypatch.setattr(prefs_routes, "PREFS_FILE", str(prefs_file))

    prefs_routes._save_for_user("alice", {"theme": "dark"})

    data = json.loads(prefs_file.read_text(encoding="utf-8"))
    assert data == {"_users": {"alice": {"theme": "dark"}}}
    assert prefs_routes._load_for_user("alice") == {"theme": "dark"}


def test_save_for_user_preserves_flat_prefs_when_auth_disabled(monkeypatch, tmp_path):
    prefs_file = tmp_path / "data" / "user_prefs.json"
    monkeypatch.setattr(prefs_routes, "PREFS_FILE", str(prefs_file))

    prefs_routes._save_for_user(None, {"theme": "dark"})

    data = json.loads(prefs_file.read_text(encoding="utf-8"))
    assert data == {"theme": "dark"}
    assert prefs_routes._load_for_user(None) == {"theme": "dark"}
