"""Regression test for finding M11: Pillow decompression-bomb cap.

A tiny image file that *declares* enormous pixel dimensions must be rejected
(and its bytes removed) instead of being decoded and exhausting memory.
"""

import io
import os
import struct
import zlib

import pytest
from fastapi import HTTPException

import src.upload_handler as upload_handler


def _png(width: int, height: int) -> bytes:
    """Build a minimal valid PNG whose IHDR declares (width, height).

    The IDAT payload is irrelevant: PIL reads the dimensions from IHDR and
    runs its decompression-bomb check at open() time, before any pixels are
    decoded, so a few bytes on disk can claim billions of pixels.
    """
    sig = b"\x89PNG\r\n\x1a\n"

    def chunk(typ: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + typ
            + data
            + struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)  # 8-bit RGB
    return (
        sig
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(b"\x00"))
        + chunk(b"IEND", b"")
    )


class _DummyUpload:
    """Stand-in for FastAPI's UploadFile (save_upload only uses .file/.filename)."""

    def __init__(self, fileobj, filename):
        self.file = fileobj
        self.filename = filename


def _make_handler(tmp_path):
    return upload_handler.UploadHandler(
        base_dir=str(tmp_path),
        upload_dir=str(tmp_path / "uploads"),
    )


def _stored_image_files(uploads_root: str):
    found = []
    for root, _dirs, files in os.walk(uploads_root):
        for f in files:
            if f in ("uploads.json", "uploads.json.bak"):
                continue
            found.append(os.path.join(root, f))
    return found


def test_decompression_bomb_is_rejected(tmp_path):
    handler = _make_handler(tmp_path)
    # 60000 x 60000 = 3.6e9 px, far above the ~100MP cap (>2x => hard error).
    bomb = _png(60000, 60000)
    up = _DummyUpload(io.BytesIO(bomb), "bomb.png")

    with pytest.raises(HTTPException) as excinfo:
        handler.save_upload(up, client_ip="10.0.0.1", owner=None)

    assert excinfo.value.status_code == 400
    # The bomb must not be left on disk.
    assert _stored_image_files(str(tmp_path / "uploads")) == []


def test_near_bomb_warning_is_rejected(tmp_path):
    handler = _make_handler(tmp_path)
    # 11000 x 11000 = 1.21e8 px: above the 100MP cap but below 2x, so PIL emits
    # a DecompressionBombWarning rather than an error -- still must be rejected.
    near = _png(11000, 11000)
    up = _DummyUpload(io.BytesIO(near), "near.png")

    with pytest.raises(HTTPException) as excinfo:
        handler.save_upload(up, client_ip="10.0.0.2", owner=None)

    assert excinfo.value.status_code == 400
    assert _stored_image_files(str(tmp_path / "uploads")) == []


def test_normal_image_still_accepted(tmp_path):
    """A legitimate small image is still stored and its dimensions recorded."""
    from PIL import Image

    handler = _make_handler(tmp_path)
    buf = io.BytesIO()
    Image.new("RGB", (8, 6), (10, 20, 30)).save(buf, format="PNG")
    buf.seek(0)
    up = _DummyUpload(buf, "ok.png")

    meta = handler.save_upload(up, client_ip="10.0.0.3", owner=None)

    assert meta["width"] == 8
    assert meta["height"] == 6
    assert os.path.exists(meta["path"])
