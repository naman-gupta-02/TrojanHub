"""P3 Parnavi: Notifications (ARCHITECTURE.md §6, §7.3).

POST /notify/daily-digest     (cron 8 AM PT, header X-Cron-Secret)
POST /notify/reminders        (cron every 10 min, header X-Cron-Secret)
POST /notify/digest-now       (admins) {email?, everyone?}: the on-stage "Send digest now" button
GET  /notify/digest/preview   today's digest email as a web page (public: it's only public events)
GET  /notify/unsubscribe      unsubscribe page from the email footer (asks first)
POST /notify/unsubscribe      does the unsubscribe
GET  /me/notify               my alert settings
PATCH /me/notify              {notify_email?, notify_push?, notify_categories?}
GET  /notify/status           is the built-in scheduler running?

With CRON_INLINE=true the service runs both cron jobs itself (scheduler.py).
push.py / email.py / digest.py / reminders.py sit next to this file. P2 calls push.send_push for match alerts.
"""

import hmac
import time
from html import escape
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from app.core.auth import ADMIN_ROLES, get_user_id, require_admin, require_cron_secret, require_signed_in
from app.core.config import settings
from app.events import store
from app.events.settings import db_live, p3
from app.notify import digest, reminders, scheduler
from app.notify.email import EmailError, email_configured

router = APIRouter(tags=["notify (P3)"])
OWNER = "P3 Parnavi"

NotifyCategory = Literal["free_food", "cultural", "career", "social", "academic", "sports", "other", "deals"]


@router.on_event("startup")
def _start_scheduler() -> None:
    scheduler.start()


class DigestNowRequest(BaseModel):
    email: str | None = Field(None, max_length=254)  # default: the signed-in admin's own email
    everyone: bool = False  # true = run the real 8 AM job now


class NotifyPrefsPatch(BaseModel):
    notify_email: bool | None = None
    notify_push: bool | None = None
    notify_categories: list[NotifyCategory] | None = None  # [] = everything


DEFAULT_PREFS = {"notify_email": False, "notify_push": False, "notify_categories": []}


def _prefs(profile: dict) -> dict:
    return {k: profile.get(k, v) for k, v in DEFAULT_PREFS.items()}


@router.get("/me/notify")
def get_notify_prefs(user_id: str = Depends(get_user_id)) -> dict:
    if not db_live():
        return {**DEFAULT_PREFS, "notify_email": True}
    profile = store.profile(user_id)
    return _prefs(profile) if profile else DEFAULT_PREFS


@router.patch("/me/notify")
def patch_notify_prefs(req: NotifyPrefsPatch, user_id: str = Depends(require_signed_in)) -> dict:
    changes = req.model_dump(exclude_none=True)
    if not db_live():
        return {**DEFAULT_PREFS, **changes}
    if not store.profile(user_id):
        raise HTTPException(401, detail={"code": "sign_in_required", "message": "Sign in with your @usc.edu email first"})
    if changes:
        store.update_profile(user_id, changes)
    return _prefs(store.profile(user_id) or {})


@router.get("/notify/status")
def notify_status() -> dict:
    return {
        "scheduler": scheduler.running(),
        "email": email_configured(),
        "digest_hour_la": p3.digest_hour,
        "reminders_every_min": p3.reminders_every_min,
        # links in emails and .ics files only work on this computer while these say localhost
        "links_point_to_localhost": "localhost" in p3.public_web_url or "localhost" in p3.public_api_url,
        **scheduler.stats,
    }


def _real_cron_secret() -> None:
    """With real data, the cron endpoints always need CRON_SECRET (even while USE_MOCKS is on),
    so nobody on the Wi-Fi can trigger sends. The inline scheduler doesn't use these endpoints."""
    if db_live() and not settings.cron_secret:
        raise HTTPException(403, detail={"code": "cron_disabled",
                                         "message": "Set CRON_SECRET to use the cron endpoints, or CRON_INLINE=true"})


@router.post("/notify/daily-digest", dependencies=[Depends(require_cron_secret), Depends(_real_cron_secret)])
def daily_digest() -> dict:
    if not db_live():
        return {"sent": 0, "skipped_reason": "mock mode: nothing sent"}
    return digest.run()


@router.post("/notify/reminders", dependencies=[Depends(require_cron_secret), Depends(_real_cron_secret)])
def send_reminders() -> dict:
    if not db_live():
        return {"sent": 0, "skipped_reason": "mock mode: nothing sent"}
    return reminders.run()


# "Send digest now" is a demo button, not a mailer: at most a few sends per 10 minutes
_DIGEST_NOW_LIMIT = 5
_digest_now_sent: list[float] = []


def _check_rate() -> None:
    now = time.time()
    _digest_now_sent[:] = [t for t in _digest_now_sent if now - t < 600]
    if len(_digest_now_sent) >= _DIGEST_NOW_LIMIT:
        raise HTTPException(429, detail={"code": "slow_down", "message": "That's a lot of digests. Try again in a few minutes."})
    _digest_now_sent.append(now)


@router.post("/notify/digest-now")
def digest_now(req: DigestNowRequest | None = None, user_id: str = Depends(require_admin)) -> dict:
    req = req or DigestNowRequest()
    if not db_live():
        return {"sent": 0, "skipped_reason": "mock mode: nothing sent"}
    # require_admin lets everyone through while USE_MOCKS is on, so check the role here too
    prof = store.profile(user_id) or {}
    if prof.get("role") not in ADMIN_ROLES:
        raise HTTPException(403, detail={"code": "forbidden", "message": "Only admins can send the digest"})
    if req.everyone:
        return digest.run()
    if not email_configured():
        raise HTTPException(503, detail={"code": "email_not_configured", "message": "Set RESEND_API_KEY in services/ai/.env"})
    own = store.user_email(user_id)
    to = (req.email or own or "").strip()
    if not to or "@" not in to:
        raise HTTPException(422, detail={"code": "no_email", "message": "Pass an email, or sign in so we know where to send it"})
    if to.lower() != (own or "").lower() and not to.lower().endswith("@usc.edu"):
        raise HTTPException(422, detail={"code": "usc_only", "message": "The digest only goes to @usc.edu addresses"})
    _check_rate()
    try:
        return digest.send_to_email(to, prof.get("name"), user_id if prof else None)
    except EmailError as e:
        raise HTTPException(502, detail={"code": "email_failed", "message": str(e)}) from e


@router.get("/notify/digest/preview", response_class=HTMLResponse)
def digest_preview() -> HTMLResponse:
    if not db_live():
        return HTMLResponse("<p>Mock mode: connect Supabase to preview the digest.</p>")
    items = digest.todays_items()
    if not items:
        return HTMLResponse("<p style='font-family:sans-serif'>Nothing free today, so no digest goes out.</p>")
    return HTMLResponse(digest.render_html(items))


def _check_unsub(u: str, s: str) -> None:
    if not store.is_uuid(u) or not hmac.compare_digest(s, digest.unsubscribe_sig(u)):
        raise HTTPException(400, detail={"code": "bad_link", "message": "This unsubscribe link isn't valid"})


def _page(title: str, body: str) -> HTMLResponse:
    return HTMLResponse(
        "<!doctype html><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<div style='font-family:sans-serif;max-width:480px;margin:64px auto;padding:0 16px;text-align:center'>"
        f"<h1 style='color:#990000'>{title}</h1>{body}</div>"
    )


@router.get("/notify/unsubscribe", response_class=HTMLResponse)
def unsubscribe_page(u: str, s: str) -> HTMLResponse:
    """Asks first: email security scanners open every link, and a GET mustn't unsubscribe anyone."""
    _check_unsub(u, s)
    return _page(
        "Stop freebie emails?",
        f"<form method='post' action='unsubscribe?u={escape(u)}&amp;s={escape(s)}'>"
        "<button style='background:#990000;color:#fff;border:0;border-radius:999px;padding:12px 24px;font-size:16px;"
        "font-weight:700;cursor:pointer'>Unsubscribe</button></form>",
    )


@router.post("/notify/unsubscribe", response_class=HTMLResponse)
def unsubscribe(u: str, s: str) -> HTMLResponse:
    _check_unsub(u, s)
    if db_live():
        store.update_profile(u, {"notify_email": False})
    return _page("You're unsubscribed",
                 "<p>No more freebie emails. You can turn them back on any time in TrojanHub settings.</p>")
