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
    # Features that are real even while USE_MOCKS=true, comma-separated. Names: chat, lostfound,
    # events, notify, complaints, admin. Lets one finished feature go live while the rest stay mocked.
    real_features: str = ""
    embed_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    cors_origins: str = "http://localhost:3000,http://localhost:8081"

    resend_api_key: str = ""
    cron_secret: str = ""

    # Shown for safety complaints instead of a ticket. UPC emergency line, copied from
    # https://dps.usc.edu/contact/ on 2026-11-14. Override with DPS_EMERGENCY_PHONE.
    dps_emergency_phone: str = "213-740-4321"

    def mock(self, feature: str) -> bool:
        """Should `feature` serve mocks? USE_MOCKS=false -> nothing is mocked.
        USE_MOCKS=true -> everything is, except the features listed in REAL_FEATURES."""
        real = {f.strip().lower() for f in self.real_features.split(",") if f.strip()}
        return self.use_mocks and feature not in real

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
