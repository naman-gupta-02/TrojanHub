"""The one LLM wrapper (ARCHITECTURE.md §3, §13). Switching providers = changing env vars."""

from functools import lru_cache

from openai import AsyncOpenAI, OpenAI

from app.core.config import settings


@lru_cache
def get_client() -> OpenAI:
    """Main client: chat + tool calling."""
    return OpenAI(base_url=settings.llm_base_url or None, api_key=settings.llm_api_key or "not-set")


@lru_cache
def get_vision_client() -> OpenAI:
    """Vision client (flyers, photos). Falls back to the main client if no separate one is set."""
    if settings.llm_vision_base_url:
        return OpenAI(
            base_url=settings.llm_vision_base_url,
            api_key=settings.llm_vision_api_key or settings.llm_api_key or "not-set",
        )
    return get_client()


@lru_cache
def get_async_client() -> AsyncOpenAI:
    """Async version of the main client (used for streaming chat)."""
    return AsyncOpenAI(base_url=settings.llm_base_url or None, api_key=settings.llm_api_key or "not-set")


def model_name(vision: bool = False) -> str:
    if vision and settings.llm_vision_model:
        return settings.llm_vision_model
    return settings.llm_model
