"""Built-in scheduler for the two cron jobs, so the demo needs no external cron.

Set CRON_INLINE=true on exactly one instance (the demo laptop). Every tick it checks:
- reminders.run()  every REMINDERS_EVERY_MIN minutes
- digest.run()     once per LA day, the first tick at or after DIGEST_HOUR

Both jobs record what they sent (notification_log / event_saves.reminder_sent_at), so a
restart or an external cron hitting the same endpoints never double-sends.
"""

import asyncio
import logging
from datetime import datetime, timedelta

from app.events.dates import LA, now_utc
from app.events.settings import db_live, p3
from app.notify import digest, reminders

# uvicorn's logger, so these lines show up in the normal server output
log = logging.getLogger("uvicorn.error")

_task: asyncio.Task | None = None
stats: dict = {"ticks": 0, "last_reminders_at": None, "last_digest_at": None, "last_error": None}


async def _loop() -> None:
    last_reminders: datetime | None = None
    last_digest_day = None
    while True:
        try:
            stats["ticks"] += 1
            now = now_utc()
            if last_reminders is None or now - last_reminders >= timedelta(minutes=p3.reminders_every_min):
                last_reminders = now
                result = await asyncio.to_thread(reminders.run)
                stats["last_reminders_at"] = now.isoformat()
                if result.get("sent") or result.get("errors"):
                    log.info("cron reminders: %s", result)
            local = now.astimezone(LA)
            if local.hour >= p3.digest_hour and last_digest_day != local.date():
                last_digest_day = local.date()
                result = await asyncio.to_thread(digest.run)
                stats["last_digest_at"] = now.isoformat()
                log.info("cron daily digest: %s", result)
        except Exception as e:  # keep the loop alive no matter what a job does
            stats["last_error"] = str(e)
            log.exception("cron job failed")
        await asyncio.sleep(p3.cron_tick_seconds)


def start() -> bool:
    """Call once at app startup. Returns True if the scheduler is running."""
    global _task
    if not p3.cron_inline:
        return False
    if not db_live():
        log.warning("CRON_INLINE=true but Supabase is not configured; scheduler not started")
        return False
    if _task is None or _task.done():
        _task = asyncio.get_event_loop().create_task(_loop(), name="trojanhub-cron")
        log.info("inline scheduler on: reminders every %d min, digest at %02d:00 LA", p3.reminders_every_min, p3.digest_hour)
    return True


def running() -> bool:
    return _task is not None and not _task.done()
