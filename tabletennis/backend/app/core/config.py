"""Backend settings, read from environment variables / .env (prefix TT_)."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_ROOT = Path(__file__).resolve().parents[3]          # .../tabletennis


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="TT_", env_file=".env", extra="ignore")

    app_name: str = "TT Analyzer API"
    storage_dir: Path = _ROOT / "storage"            # uploads, clips, JSON results
    pro_library_dir: Path | None = None              # default: <storage_dir>/pro_library
    seed_demo_pros: bool = True                      # add labelled synthetic references
    static_dir: Path = _ROOT / "frontend" / "out"    # built dashboard (next build)
    cors_origins: list[str] = ["http://localhost:3000"]
    upload_chunk_size_mb: int = 16                   # client chunk size for multi-GB uploads
    max_upload_gb: float = 20.0
    pipeline_config: Path | None = None              # ml_pipeline YAML config

    # "inline" runs jobs in a background thread (no Redis needed);
    # "celery" sends them to the Celery worker through Redis.
    queue: str = "inline"
    redis_url: str = "redis://localhost:6379/0"

    # "accurate" re-encodes clips (frame-exact 1 s pre-roll);
    # "copy" stream-copies (no quality loss, cuts snap to keyframes).
    cut_mode: str = "accurate"
    cut_crf: int = 18

    @property
    def pros_dir(self) -> Path:
        return self.pro_library_dir or self.storage_dir / "pro_library"


@lru_cache
def get_settings() -> Settings:
    return Settings()
