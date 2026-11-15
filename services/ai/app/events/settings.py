"""P3 settings + "is it live?" switches. Same .env files as app/core/config.py.

The global USE_MOCKS stays true until every feature is real, so P3 decides on its own:
- Database: real Supabase whenever the URL + service role key are set (P3_USE_MOCKS=true forces mocks).
- Flyer scan: real LLM whenever a model + key/base URL are set, otherwise the mock.
"""

from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.config import REPO_ROOT, SERVICE_DIR, settings


class P3Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(REPO_ROOT / ".env", SERVICE_DIR / ".env"), extra="ignore")

    p3_use_mocks: bool = False
    # Used in emails and .ics files, so links work outside the app
    public_api_url: str = "http://localhost:8000"
    public_web_url: str = "http://localhost:3000"
    # Resend's shared sender works without a verified domain (delivers to the account owner only)
    digest_from: str = "TrojanHub <onboarding@resend.dev>"
    # Built-in scheduler (notify/scheduler.py). Turn on for ONE instance only, e.g. the demo laptop.
    cron_inline: bool = False
    digest_hour: int = 8  # LA time
    reminders_every_min: int = 10
    cron_tick_seconds: int = 60

    @model_validator(mode="after")
    def _api_url_defaults_to_web_url(self) -> "P3Settings":
        # On Replit the website and the API share one address (API under /api, see DEPLOY.md),
        # so setting PUBLIC_WEB_URL alone is enough for the links in emails and .ics files.
        if "public_api_url" not in self.model_fields_set and "localhost" not in self.public_web_url:
            self.public_api_url = self.public_web_url
        self.public_web_url = self.public_web_url.rstrip("/")
        self.public_api_url = self.public_api_url.rstrip("/")
        return self


@lru_cache
def get_p3_settings() -> P3Settings:
    return P3Settings()


p3 = get_p3_settings()


def db_live() -> bool:
    return bool(settings.supabase_url and settings.supabase_service_role_key) and not p3.p3_use_mocks


def llm_live() -> bool:
    has_model = bool(settings.llm_vision_model or settings.llm_model)
    has_endpoint = bool(settings.llm_api_key or settings.llm_base_url or settings.llm_vision_base_url)
    return has_model and has_endpoint


def signing_secret() -> bytes:
    """For check-in codes and unsubscribe links. Never sent to clients."""
    return (settings.cron_secret or settings.supabase_service_role_key or "trojanhub-dev").encode()
