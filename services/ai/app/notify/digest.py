"""Morning freebie digest (ARCHITECTURE.md §7.3).

8:00 AM PT: today's freebie events + one-time deals -> every opted-in student, filtered by
their notify_categories. Nothing is sent on days with no freebies. notification_log makes
each student's digest once-per-day even if cron fires twice.
"""

import hashlib
import hmac
import uuid
from html import escape

from app.events import feed, store
from app.events.dates import friendly_time, la_day_bounds, la_today, now_utc, parse_ts
from app.events.settings import p3, signing_secret
from app.notify.email import EmailError, email_configured, send_email
from app.notify.push import send_push

CARDINAL, GOLD, INK, MUTED, LINE, BG = "#990000", "#FFCC00", "#1A1A1A", "#5C5C5C", "#E2E2E2", "#F7F5F2"
EMOJI = {"free_food": "🍕", "cultural": "🪔", "career": "💼", "sports": "🏟️", "social": "🎉", "academic": "📚", "other": "✨"}


def todays_items() -> list[dict]:
    start, end = la_day_bounds()
    events = store.search_events(start=start, end=end, freebie=True)
    return feed.today_freebies(events, store.search_deals(active=True))


def digest_ref(day=None) -> str:
    """One notification_log ref per calendar day (ref_id is a uuid column)."""
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"trojanhub-digest-{day or la_today()}"))


def unsubscribe_sig(user_id: str) -> str:
    return hmac.new(signing_secret(), f"unsub:{user_id}".encode(), hashlib.sha256).hexdigest()[:24]


def for_user(items: list[dict], categories: list[str] | None) -> list[dict]:
    """Empty notify_categories = everything. "deals" covers one-time deals."""
    if not categories:
        return items
    cats = set(categories)
    return [i for i in items if (i["kind"] == "deal" and "deals" in cats)
            or (i["kind"] == "event" and (i["event"]["category"] in cats or "free_food" in cats))]


def _line(item: dict) -> tuple[str, str, str, str]:
    """(emoji, headline, when · where, link) for one digest row."""
    if item["kind"] == "event":
        e = item["event"]
        start, end = parse_ts(e["starts_at"]), parse_ts(e["ends_at"])
        when = friendly_time(start) + (f"–{friendly_time(end)}" if end else "")
        where = e.get("location_text") or ""
        what = e.get("freebie_desc") or "Freebies"
        return EMOJI.get(e["category"], "✨"), f"{what} · {e['title']}", " · ".join(p for p in (when, where) if p), f"{p3.public_web_url}/events/{e['id']}"
    d = item["deal"]
    ends = parse_ts(d["expires_at"])
    when = f"until {friendly_time(ends)}" if ends else ""
    return "🎁", d["title"], " · ".join(p for p in (when, d.get("how_to_claim") or "") if p), d.get("link") or f"{p3.public_web_url}/deals"


def subject(items: list[dict]) -> str:
    names = []
    for i in items[:2]:
        if i["kind"] == "event":
            names.append((i["event"].get("freebie_desc") or i["event"]["title"]).lower().removeprefix("free "))
        else:
            names.append(i["deal"]["title"])
    more = f" + {len(items) - 2} more" if len(items) > 2 else ""
    return f"Free today: {', '.join(names)}{more}"


def render_html(items: list[dict], name: str | None = None, user_id: str | None = None) -> str:
    rows = []
    for item in items:
        emoji, headline, meta, link = _line(item)
        cal = ""
        if item["kind"] == "event":
            cal = (f'<a href="{p3.public_api_url}/api/events/{item["event"]["id"]}/ics" '
                   f'style="color:{CARDINAL};font-size:13px;font-weight:600;text-decoration:none">+ Add to calendar</a>')
        rows.append(f"""
        <tr><td style="padding:0 0 12px 0">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid {LINE};border-radius:12px">
            <tr>
              <td width="56" style="padding:16px 0 16px 16px;font-size:28px;vertical-align:top">{emoji}</td>
              <td style="padding:16px">
                <a href="{escape(link)}" style="color:{INK};font-size:16px;font-weight:700;text-decoration:none">{escape(headline)}</a>
                <div style="color:{MUTED};font-size:14px;margin-top:4px">{escape(meta)}</div>
                <div style="margin-top:8px">{cal}</div>
              </td>
            </tr>
          </table>
        </td></tr>""")
    greeting = f"Morning, {escape(name)}!" if name else "Morning, Trojan!"
    count = f"{len(items)} free thing{'s' if len(items) != 1 else ''} on campus today"
    unsub = ""
    if user_id:
        unsub = (f' · <a href="{p3.public_api_url}/api/notify/unsubscribe?u={user_id}&amp;s={unsubscribe_sig(user_id)}" '
                 f'style="color:{MUTED}">Unsubscribe</a>')
    return f"""<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{escape(subject(items)) if items else "TrojanHub"}</title></head>
<body style="margin:0;background:{BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{BG}"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
    <tr><td style="background:{CARDINAL};border-radius:16px 16px 0 0;padding:24px">
      <div style="color:#fff;font-size:22px;font-weight:800">Trojan<span style="color:{GOLD}">Hub</span></div>
      <div style="color:#fff;font-size:28px;font-weight:800;margin-top:16px">{greeting}</div>
      <div style="color:{GOLD};font-size:16px;font-weight:600;margin-top:4px">{count}</div>
    </td></tr>
    <tr><td style="background:{BG};padding:16px 0 0 0">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">{''.join(rows)}</table>
    </td></tr>
    <tr><td align="center" style="padding:8px 0 0 0">
      <a href="{p3.public_web_url}/events?freebie=true&amp;day={la_today().isoformat()}" style="display:inline-block;background:{CARDINAL};color:#fff;font-weight:700;font-size:15px;padding:12px 24px;border-radius:999px;text-decoration:none">See everything free today</a>
    </td></tr>
    <tr><td align="center" style="color:{MUTED};font-size:12px;padding:24px 0">
      You get this because you turned on freebie alerts in TrojanHub. For Trojans, by Trojans.{unsub}
    </td></tr>
  </table>
</td></tr></table>
</body></html>"""


def render_text(items: list[dict]) -> str:
    lines = ["Free on campus today:", ""]
    for item in items:
        _, headline, meta, link = _line(item)
        lines += [f"• {headline}", f"  {meta}", f"  {link}", ""]
    return "\n".join(lines)


def _push_body(items: list[dict]) -> str:
    return " · ".join(_line(i)[1] for i in items[:3])


def send_to_email(to: str, name: str | None = None, user_id: str | None = None, items: list[dict] | None = None) -> dict:
    """Demo button: send today's digest to one address right now (no once-a-day check)."""
    items = todays_items() if items is None else items
    if not items:
        return {"sent": 0, "skipped_reason": "Nothing free today, so no digest (that's on purpose)"}
    message_id = send_email(to, subject(items), render_html(items, name, user_id), render_text(items))
    return {"sent": 1, "to": to, "items": len(items), "message_id": message_id}


def run() -> dict:
    """The 8 AM job."""
    items = todays_items()
    if not items:
        return {"sent": 0, "skipped_reason": "Nothing free today"}
    ref = digest_ref()
    sent_email = sent_push = skipped = 0
    errors: list[str] = []
    for prof in store.notify_profiles():
        mine = for_user(items, prof.get("notify_categories"))
        if not mine:
            continue
        can_push = bool(prof.get("notify_push") and prof.get("expo_push_token"))
        can_email = bool(prof.get("notify_email") and email_configured())
        if not (can_push or can_email):
            continue  # nothing we can deliver; don't use up today's slot
        # claim first, so two runs at once can't both send
        if not store.log_notification(prof["id"], "digest", ref):
            skipped += 1
            continue
        delivered = 0
        if can_push:
            n = send_push([prof["expo_push_token"]], subject(mine), _push_body(mine), {"screen": "home"})
            sent_push += n
            delivered += n
        if can_email:
            to = store.user_email(prof["id"])
            if to:
                try:
                    send_email(to, subject(mine), render_html(mine, prof.get("name"), prof["id"]), render_text(mine))
                    sent_email += 1
                    delivered += 1
                except EmailError as e:
                    errors.append(str(e))
        if not delivered:
            store.unlog_notification(prof["id"], "digest", ref)  # failed: the next run tries again
    return {"sent": sent_email + sent_push, "email": sent_email, "push": sent_push, "already_sent": skipped,
            "items": len(items), "errors": errors[:5], "ran_at": now_utc().isoformat()}
