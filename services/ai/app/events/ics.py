"""Calendar exports: an RFC 5545 .ics file and a Google Calendar link for one event."""

from datetime import timedelta
from urllib.parse import urlencode

from app.events.dates import now_utc, parse_ts
from app.events.settings import p3

# Same as everywhere else in the app: an event with no end time counts as 2 hours long
DEFAULT_LENGTH = timedelta(hours=2)


def _stamp(dt) -> str:
    return dt.strftime("%Y%m%dT%H%M%SZ")


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\r", "").replace("\n", "\\n")


def _fold(line: str) -> list[str]:
    """Lines longer than 75 octets continue on the next line, indented by one space."""
    out, current = [], ""
    for ch in line:
        if len((current + ch).encode()) > 75:
            out.append(current)
            current = " " + ch
        else:
            current += ch
    return out + [current]


def _details(e: dict) -> str:
    parts = [e.get("description") or ""]
    if e.get("has_freebie") and e.get("freebie_desc"):
        parts.append(f"Free: {e['freebie_desc']}")
    link = e.get("register_url") or e.get("ticket_url")
    if link:
        parts.append(f"Register: {link}")
    parts.append(f"{p3.public_web_url}/events/{e['id']}")
    return "\n".join(p for p in parts if p)


def ics(e: dict) -> str:
    start = parse_ts(e["starts_at"])
    end = parse_ts(e.get("ends_at")) or start + DEFAULT_LENGTH
    lines = [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//TrojanHub//Events//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        f"UID:{e['id']}@trojanhub",
        f"DTSTAMP:{_stamp(now_utc())}",
        f"DTSTART:{_stamp(start)}",
        f"DTEND:{_stamp(end)}",
        "SUMMARY:" + _escape(e["title"]),
        "DESCRIPTION:" + _escape(_details(e)),
        f"URL:{p3.public_web_url}/events/{e['id']}",
    ]
    if e.get("location_text"):
        lines.append("LOCATION:" + _escape(e["location_text"]))
    # 30-minute heads-up, same as our own reminders
    lines += ["BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + _escape(e["title"]), "TRIGGER:-PT30M", "END:VALARM"]
    lines += ["END:VEVENT", "END:VCALENDAR"]
    return "\r\n".join(folded for line in lines for folded in _fold(line)) + "\r\n"


def google_calendar_url(e: dict) -> str:
    start = parse_ts(e["starts_at"])
    end = parse_ts(e.get("ends_at")) or start + DEFAULT_LENGTH
    params = {
        "action": "TEMPLATE",
        "text": e["title"],
        "dates": f"{_stamp(start)}/{_stamp(end)}",
        "details": _details(e),
        "location": e.get("location_text") or "",
    }
    return "https://calendar.google.com/calendar/render?" + urlencode(params)
