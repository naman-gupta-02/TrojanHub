"""P4 Jaymin: Admin dashboard API (ARCHITECTURE.md §6, §7.4).

GET   /admin/complaints     ?department=&building=&from=
PATCH /admin/complaints/{id}
GET   /admin/stats
GET   /admin/tickets.csv
"""

from fastapi import APIRouter

router = APIRouter(tags=["admin (P4)"])
