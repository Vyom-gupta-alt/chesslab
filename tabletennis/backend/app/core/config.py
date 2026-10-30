"""Backend settings, read from environment variables / .env (prefix TT_)."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="TT_", env_file=".env", extra="ignore")

    app_name: str = "TT Analyzer API"
    storage_dir: Path = Path("./storage")          # uploads, clips, JSON results
    redis_url: str = "redis://localhost:6379/0"
    cors_origins: list[str] = ["http://localhost:3000"]
    upload_chunk_size_mb: int = 16                 # client chunk size for multi-GB uploads
    max_upload_gb: float = 20.0
    pipeline_config: Path | None = None            # ml_pipeline YAML config


@lru_cache
def get_settings() -> Settings:
    return Settings()
