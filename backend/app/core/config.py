from pydantic_settings import BaseSettings
from pydantic import field_validator
from functools import lru_cache

_BOM = "﻿"


def _strip_bom(v: str) -> str:
    """Remove UTF-8/UTF-16 BOM that Windows tools may prepend to env var values."""
    return v.lstrip(_BOM).strip() if isinstance(v, str) else v


class Settings(BaseSettings):
    # Supabase
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str
    supabase_jwt_secret: str

    # Anthropic (optional — AI categorization disabled if not set)
    anthropic_api_key: str = ""

    # Internal security
    internal_api_token: str

    # Sentry
    sentry_dsn: str = ""

    # App
    app_env: str = "development"
    app_version: str = "1.0.0"
    cors_origins: str = "http://localhost:5173"

    @field_validator(
        "supabase_url", "supabase_anon_key", "supabase_service_role_key",
        "supabase_jwt_secret", "internal_api_token", "anthropic_api_key",
        "cors_origins", mode="before",
    )
    @classmethod
    def strip_bom(cls, v: str) -> str:
        return _strip_bom(v)

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",")]

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    return Settings()
