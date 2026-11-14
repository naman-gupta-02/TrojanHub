"""P3 Parnavi: Notifications (ARCHITECTURE.md §6, §7.3).

POST /notify/daily-digest   (cron 8 AM PT, header X-Cron-Secret)
POST /notify/reminders      (cron every 10 min, header X-Cron-Secret)

push.py / email.py / digest.py / reminders.py go next to this file. P2 calls push.py for match alerts.
"""

from fastapi import APIRouter, Depends

from app.core.auth import require_cron_secret
from app.core.config import settings
from app.core.mocks import not_built

router = APIRouter(tags=["notify (P3)"], dependencies=[Depends(require_cron_secret)])
OWNER = "P3 Parnavi"


@router.post("/notify/daily-digest")
async def daily_digest() -> dict:
    if settings.use_mocks:
        return {"sent": 0, "skipped_reason": "mock mode: nothing sent"}
    raise not_built(OWNER)


@router.post("/notify/reminders")
async def reminders() -> dict:
    if settings.use_mocks:
        return {"sent": 0, "skipped_reason": "mock mode: nothing sent"}
    raise not_built(OWNER)
