"""Time helpers. Stored as UTC, shown and reasoned about in America/Los_Angeles (ARCHITECTURE.md §8)."""

from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

LA = ZoneInfo("America/Los_Angeles")


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def parse_ts(value: str | datetime | None) -> datetime | None:
    """ISO string or datetime -> aware UTC datetime. Naive values are treated as LA local time."""
    if value is None or value == "":
        return None
    dt = value if isinstance(value, datetime) else datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=LA)
    return dt.astimezone(timezone.utc)


def iso(dt: datetime | None) -> str | None:
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z") if dt else None


def la_today() -> date:
    return now_utc().astimezone(LA).date()


def la_day_bounds(day: date | None = None) -> tuple[datetime, datetime]:
    """Start and end (UTC) of a calendar day in LA."""
    day = day or la_today()
    start = datetime.combine(day, time.min, tzinfo=LA)
    return start.astimezone(timezone.utc), (start + timedelta(days=1)).astimezone(timezone.utc)


def friendly(dt: datetime | None) -> str:
    """'Sat 2:00 PM' in LA time."""
    if not dt:
        return ""
    local = dt.astimezone(LA)
    return local.strftime("%a ") + local.strftime("%I:%M %p").lstrip("0")


def friendly_time(dt: datetime | None) -> str:
    """'2:00 PM' in LA time."""
    return dt.astimezone(LA).strftime("%I:%M %p").lstrip("0") if dt else ""
