"""Celery application. Video analysis and FFmpeg cutting tasks register here (Phase 2)."""

from celery import Celery

from app.core.config import get_settings

settings = get_settings()

celery_app = Celery("tt", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    worker_prefetch_multiplier=1,      # analysis jobs are long; don't hoard them
    task_acks_late=True,
    task_routes={"app.workers.tasks.analyze_*": {"queue": "analysis"},
                 "app.workers.tasks.cut_*": {"queue": "ffmpeg"}},
)
