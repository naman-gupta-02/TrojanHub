"""P3 Parnavi: Notifications (ARCHITECTURE.md §6, §7.3).

POST /notify/daily-digest     (cron 8 AM PT, header X-Cron-Secret)
POST /notify/reminders        (cron every 10 min, header X-Cron-Secret)
POST /notify/digest-now       (admins) {email?, everyone?}: the on-stage "Send digest now" button
GET  /notify/digest/preview   today's digest email as a web page (public: it's only public events)
GET  /notify/unsubscribe      one-click unsubscribe link from the email footer

push.py / email.py / digest.py / reminders.py sit next to this file. P2 calls push.send_push for match alerts.
"""

import hmac

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from app.core.auth import require_admin, require_cron_secret
from app.events import store
from app.events.settings import db_live
from app.notify import digest, reminders
from app.notify.email import EmailError, email_configured

router = APIRouter(tags=["notify (P3)"])
OWNER = "P3 Parnavi"


class DigestNowRequest(BaseModel):
    email: str | None = Field(None, max_length=254)  # default: the signed-in admin's own email
    everyone: bool = False  # true = run the real 8 AM job now


@router.post("/notify/daily-digest", dependencies=[Depends(require_cron_secret)])
def daily_digest() -> dict:
    if not db_live():
        return {"sent": 0, "skipped_reason": "mock mode: nothing sent"}
    return digest.run()


@router.post("/notify/reminders", dependencies=[Depends(require_cron_secret)])
def send_reminders() -> dict:
    if not db_live():
        return {"sent": 0, "skipped_reason": "mock mode: nothing sent"}
    return reminders.run()


@router.post("/notify/digest-now")
def digest_now(req: DigestNowRequest | None = None, user_id: str = Depends(require_admin)) -> dict:
    req = req or DigestNowRequest()
    if not db_live():
        return {"sent": 0, "skipped_reason": "mock mode: nothing sent"}
    if req.everyone:
        return digest.run()
    if not email_configured():
        raise HTTPException(503, detail={"code": "email_not_configured", "message": "Set RESEND_API_KEY in services/ai/.env"})
    to = req.email or store.user_email(user_id)
    if not to or "@" not in to:
        raise HTTPException(422, detail={"code": "no_email", "message": "Pass an email, or sign in so we know where to send it"})
    prof = store.profile(user_id) or {}
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


@router.get("/notify/unsubscribe", response_class=HTMLResponse)
def unsubscribe(u: str, s: str) -> HTMLResponse:
    if not store.is_uuid(u) or not hmac.compare_digest(s, digest.unsubscribe_sig(u)):
        raise HTTPException(400, detail={"code": "bad_link", "message": "This unsubscribe link isn't valid"})
    if db_live():
        store.update_profile(u, {"notify_email": False})
    return HTMLResponse(
        "<div style='font-family:sans-serif;max-width:480px;margin:64px auto;text-align:center'>"
        "<h1 style='color:#990000'>You're unsubscribed</h1>"
        "<p>No more freebie emails. You can turn them back on any time in TrojanHub settings.</p></div>"
    )
