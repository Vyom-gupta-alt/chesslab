"""FastAPI entry point: API routes + the built dashboard on one port."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from app import jobs
from app.api import pros, uploads, videos
from app.core.config import get_settings

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    jobs.recover_interrupted()
    pros.seed_demo_library()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins,
                   allow_methods=["*"], allow_headers=["*"])
app.include_router(uploads.router)
app.include_router(videos.router)
app.include_router(pros.router)


@app.get("/api/health")
def health() -> dict:
    try:
        import mediapipe  # noqa: F401
        pose = True
    except Exception:
        pose = False
    return {"status": "ok", "queue": settings.queue, "pose_available": pose,
            "chunk_size": settings.upload_chunk_size_mb * 1024 * 1024}


if (settings.static_dir / "index.html").exists():
    app.mount("/", StaticFiles(directory=settings.static_dir, html=True), name="dashboard")
else:
    @app.get("/", response_class=HTMLResponse)
    def no_dashboard() -> str:
        return ("<h1>TT Analyzer API is running</h1><p>The dashboard hasn't been built. "
                "Run <code>npm install && npm run build</code> in <code>tabletennis/frontend</code>, "
                "then restart. API docs: <a href='/docs'>/docs</a></p>")
