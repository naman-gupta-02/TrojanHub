"""Reminders (ARCHITECTURE.md §7.3), run every 10 minutes:

- Saved/registered events starting within 35 min -> push + email, once (event_saves.reminder_sent_at).
- Ticket alerts: saved events whose tickets go on sale within 35 min, so nobody misses
  the Diwali tickets again. Once per user per event (notification_log).
"""

import uuid
from datetime import timedelta
from html import escape

from app.events import store
from app.events.dates import friendly, friendly_time, now_utc, parse_ts
from app.events.settings import p3
from app.notify.email import EmailError, email_configured, send_email
from app.notify.push import send_push

# Anything starting within the next 35 min that hasn't been reminded yet. Starting the window at
# "now" (not 25 min) means a late or slow run can't skip an event; each one is still sent once.
WINDOW = (timedelta(0), timedelta(minutes=35))


def _minutes_until(when, now) -> int:
    return max(round((when - now).total_seconds() / 60), 1)


def _notify(user_id: str, title: str, body: str, link: str, data: dict) -> tuple[int, str | None]:
    prof = store.profile(user_id) or {}
    sent, error = 0, None
    if prof.get("notify_push", True) and prof.get("expo_push_token"):
        sent += send_push([prof["expo_push_token"]], title, body, data)
    if prof.get("notify_email") and email_configured():
        to = store.user_email(user_id)
        if to:
            html = (f'<p style="font-family:sans-serif;font-size:16px"><b>{escape(title)}</b><br>{escape(body)}</p>'
                    f'<p><a href="{escape(link)}" style="color:#990000;font-weight:700">Open in TrojanHub</a></p>')
            try:
                send_email(to, title, html, f"{title}\n{body}\n{link}")
                sent += 1
            except EmailError as e:
                error = str(e)
    return sent, error


def run() -> dict:
    now = now_utc()
    lo, hi = now + WINDOW[0], now + WINDOW[1]
    sent, errors = 0, []

    events = {e["id"]: e for e in store.events_starting_between(lo, hi)}
    for save in store.saves_for_events(list(events)):
        if save["reminder_sent_at"]:
            continue
        e = events[save["event_id"]]
        start = parse_ts(e["starts_at"])
        where = f" at {e['location_text']}" if e.get("location_text") else ""
        free = f" · {e['freebie_desc']}" if e.get("has_freebie") and e.get("freebie_desc") else ""
        n, err = _notify(save["user_id"], f"Starts in {_minutes_until(start, now)} min: {e['title']}", f"{friendly_time(start)}{where}{free}",
                         f"{p3.public_web_url}/events/{e['id']}", {"event_id": e["id"]})
        store.mark_reminder_sent(save["id"])
        sent += n
        if err:
            errors.append(err)

    ticket_events = {e["id"]: e for e in store.events_tickets_open_between(lo, hi)}
    for save in store.saves_for_events(list(ticket_events)):
        e = ticket_events[save["event_id"]]
        ref = str(uuid.uuid5(uuid.NAMESPACE_URL, f"trojanhub-tickets-{e['id']}"))
        if not store.log_notification(save["user_id"], "reminder", ref):
            continue
        opens = parse_ts(e["tickets_open_at"])
        n, err = _notify(save["user_id"], f"Tickets open in {_minutes_until(opens, now)} min: {e['title']}", f"On sale {friendly(opens)}. Be ready!",
                         e.get("ticket_url") or f"{p3.public_web_url}/events/{e['id']}", {"event_id": e["id"]})
        sent += n
        if err:
            errors.append(err)

    return {"sent": sent, "events_starting": len(events), "ticket_alerts": len(ticket_events), "errors": errors[:5]}
