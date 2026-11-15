"""Email through Resend's HTTP API (free tier). One function; nothing else here knows about Resend."""

import httpx

from app.core.config import settings
from app.events.settings import p3

RESEND_URL = "https://api.resend.com/emails"


class EmailError(RuntimeError):
    pass


def email_configured() -> bool:
    return bool(settings.resend_api_key)


def send_email(to: str, subject: str, html: str, text: str | None = None) -> str:
    """Returns Resend's message id. Raises EmailError with Resend's reason on failure."""
    if not email_configured():
        raise EmailError("RESEND_API_KEY is not set")
    body = {"from": p3.digest_from, "to": [to], "subject": subject, "html": html}
    if text:
        body["text"] = text
    try:
        r = httpx.post(RESEND_URL, json=body, timeout=15,
                       headers={"Authorization": f"Bearer {settings.resend_api_key}"})
    except httpx.HTTPError as e:
        raise EmailError(f"Couldn't reach Resend: {e}") from e
    if r.status_code >= 300:
        try:
            reason = r.json().get("message", r.text)
        except ValueError:
            reason = r.text
        raise EmailError(f"Resend said {r.status_code}: {reason}")
    return r.json().get("id", "")
