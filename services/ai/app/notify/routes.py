"""P3 Parnavi: Notifications (ARCHITECTURE.md §6, §7.3).

POST /notify/daily-digest   (cron, secret header)
POST /notify/reminders      (cron every 10 min)
"""

from fastapi import APIRouter

router = APIRouter(tags=["notify (P3)"])
