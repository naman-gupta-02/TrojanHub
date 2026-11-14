"""App settings, read from env vars or .env (owned by P4)."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

SERVICE_DIR = Path(__file__).resolve().parents[2]  # services/ai
REPO_ROOT = SERVICE_DIR.parents[1]
MOCKS_DIR = REPO_ROOT / "packages" / "shared" / "mocks"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # services/ai/.env wins over the repo-root .env
        env_file=(REPO_ROOT / ".env", SERVICE_DIR / ".env"),
        extra="ignore",
    )

    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""

    llm_base_url: str = ""
    llm_api_key: str = ""
    llm_model: str = ""
    llm_vision_base_url: str = ""
    llm_vision_api_key: str = ""
    llm_vision_model: str = ""

    use_mocks: bool = True
    embed_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    cors_origins: str = "http://localhost:3000,http://localhost:8081"

    resend_api_key: str = ""
    cron_secret: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
