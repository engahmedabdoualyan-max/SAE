"""Application settings loaded from environment variables / .env file."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    DATABASE_URL: str = "sqlite:///./sae_hub.db"
    SECRET_KEY: str = "dev-secret-key-change-me-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    SUMO_HOME: str | None = None
    API_V1_PREFIX: str = "/api/v1"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
