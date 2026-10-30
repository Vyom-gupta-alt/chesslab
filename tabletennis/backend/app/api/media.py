"""Serve video files with HTTP Range support (needed for seeking in <video>)."""

from __future__ import annotations

import mimetypes
from pathlib import Path

from fastapi import HTTPException, Request
from fastapi.responses import Response, StreamingResponse

_CHUNK = 1024 * 1024


def range_response(request: Request, path: Path, download_name: str | None = None) -> Response:
    if not path.is_file():
        raise HTTPException(404, "file not found")
    size = path.stat().st_size
    ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    headers = {"Accept-Ranges": "bytes"}
    if download_name:
        headers["Content-Disposition"] = f'attachment; filename="{download_name}"'

    start, end = 0, size - 1
    status = 200
    rng = request.headers.get("range")
    if rng and rng.startswith("bytes="):
        first, _, last = rng[6:].split(",")[0].partition("-")
        try:
            if first:
                start = int(first)
                end = int(last) if last else size - 1
            else:                                   # suffix range: last N bytes
                start = max(size - int(last), 0)
        except ValueError:
            raise HTTPException(416, "bad range") from None
        end = min(end, size - 1)
        if start > end or start >= size:
            return Response(status_code=416, headers={"Content-Range": f"bytes */{size}"})
        status = 206
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    headers["Content-Length"] = str(end - start + 1)

    def body():
        with open(path, "rb") as fh:
            fh.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                data = fh.read(min(_CHUNK, remaining))
                if not data:
                    break
                remaining -= len(data)
                yield data

    return StreamingResponse(body(), status_code=status, media_type=ctype, headers=headers)
