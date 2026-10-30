"""Celery tasks (used when TT_QUEUE=celery)."""

from app.jobs import run_analysis
from app.workers.celery_app import celery_app


@celery_app.task(name="app.workers.tasks.analyze_video")
def analyze_video_task(video_id: str) -> None:
    run_analysis(video_id)
