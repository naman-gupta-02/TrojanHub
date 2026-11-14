"""P4 Jaymin: Admin dashboard API (ARCHITECTURE.md §6, §7.4). dept_admin / usg_admin only.

GET   /admin/complaints     ?department=&building=&urgency=&from=
PATCH /admin/complaints/{id}  {corrected_department?, status?}
GET   /admin/stats
GET   /admin/tickets.csv
"""

import csv
import io
import logging
import uuid
from collections import Counter
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from pydantic import BaseModel

from app.complaints import store
from app.complaints.routing import build_route, find_route
from app.core.auth import require_admin
from app.core.config import settings
from app.core.mocks import load_mock

log = logging.getLogger(__name__)
router = APIRouter(tags=["admin (P4)"], dependencies=[Depends(require_admin)])

Department = Literal["Facilities", "Housing", "ITS", "Transportation", "DPS"]
CSV_COLUMNS = [
    "id", "ticket_id", "logged_at", "text", "building", "room", "source", "ai_department", "ai_confidence",
    "ai_reason", "corrected_department", "forwarded_to", "forwarded_at", "status", "urgency", "report_count",
]


class ComplaintPatch(BaseModel):
    corrected_department: Department | None = None
    status: Literal["reported", "sent", "resolved"] | None = None


def _not_found() -> HTTPException:
    return HTTPException(404, detail={"code": "not_found", "message": "Complaint not found"})


async def _run(fn, *args):
    """Run blocking Supabase work off the event loop; unknown failures become a 502."""
    try:
        return await run_in_threadpool(fn, *args)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        log.exception("admin: %s failed", fn.__name__)
        raise HTTPException(502, detail={"code": "admin_unavailable", "message": f"{type(e).__name__}: {e}"}) from e


def _department(row: dict) -> str | None:
    """Where the complaint actually belongs: the admin's correction if there is one, else the AI's pick."""
    return row["corrected_department"] or row["ai_department"]


def _filter(rows: list[dict], department: str | None, building: str | None, urgency: str | None) -> list[dict]:
    if department:
        rows = [r for r in rows if _department(r) == department]
    if building:
        rows = [r for r in rows if r["building"] == building]
    if urgency:
        rows = [r for r in rows if r["urgency"] == urgency]
    return rows


# ---------------------------------------------------------------------------
# Real mode
# ---------------------------------------------------------------------------
def _to_row(c: dict) -> dict:
    """One `complaints` row (with its ticket and building) -> AdminComplaintRow."""
    ticket = c.get("ticket") or {}
    return {
        "id": c["id"],
        "ticket_id": c.get("ticket_id"),
        "logged_at": c["created_at"],
        "text": c["raw_text"],
        "building": (c.get("building") or {}).get("code"),
        "room": c.get("room"),
        "source": c.get("source") or "form",
        "ai_department": c.get("ai_department"),
        "ai_confidence": c.get("ai_confidence"),
        "ai_reason": c.get("ai_reason"),
        "corrected_department": c.get("corrected_department"),
        "forwarded_to": c.get("forwarded_to"),
        "forwarded_at": c.get("forwarded_at"),
        "status": ticket.get("status") or "reported",
        "urgency": ticket.get("urgency") or "medium",
        "report_count": ticket.get("report_count") or 1,
    }


def _rows(since: str | None = None) -> list[dict]:
    return [_to_row(c) for c in store.admin_complaints(since=since)]


def _one(complaint_id: str) -> dict:
    try:
        uuid.UUID(complaint_id)
    except ValueError:
        raise _not_found() from None
    found = store.admin_complaints(complaint_id=complaint_id)
    if not found:
        raise _not_found()
    return _to_row(found[0])


def _patch(complaint_id: str, patch: ComplaintPatch) -> dict:
    row = _one(complaint_id)
    ticket_id = row["ticket_id"]

    if patch.corrected_department and patch.corrected_department != _department(row):
        target = patch.corrected_department
        # Picking the AI's own answer again undoes a correction, so it stops counting against accuracy.
        correction = None if target == row["ai_department"] else target
        changes: dict = {"corrected_department": correction}

        # A corrected complaint is re-routed to the right office.
        ticket = store.get_ticket(ticket_id) if ticket_id else None
        if ticket:
            route_url, forwarded_to = build_route(
                find_route(target, ticket["category"]), department=target, summary=ticket["summary"],
                building_code=row["building"], room=ticket.get("room"), urgency=ticket["urgency"],
            )
            changes["forwarded_to"] = forwarded_to
            changes["forwarded_at"] = datetime.now(timezone.utc).isoformat() if forwarded_to else None
            store.update_ticket(ticket_id, {"department": target, "route_url": route_url})
            # Every report grouped under this ticket was sorted the same way, so fix them together.
            store.update_ticket_complaints(ticket_id, changes)
        else:
            store.update_complaint(complaint_id, changes)

    if patch.status and ticket_id:
        store.update_ticket(ticket_id, {"status": patch.status})

    return _one(complaint_id)


def _stats(rows: list[dict]) -> dict:
    total = len(rows)

    def pct(count: int) -> float:
        return round(100 * count / total, 1) if total else 0.0

    by_department = Counter(_department(r) or "Unsorted" for r in rows)
    by_building = Counter(r["building"] or "Unknown" for r in rows)
    return {
        "total": total,
        "forwarded_pct": pct(sum(1 for r in rows if r["forwarded_at"])),
        # Share of complaints where an admin did NOT have to correct the AI's department.
        "routing_accuracy_pct": pct(sum(1 for r in rows if not r["corrected_department"])),
        "by_department": [{"department": d, "count": n} for d, n in by_department.most_common()],
        "by_building": [{"building": b, "count": n} for b, n in by_building.most_common()],
    }


def _csv_cell(value):
    """Student text is untrusted: stop a spreadsheet from running it as a formula."""
    if isinstance(value, str) and value[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + value
    return value


def _csv(rows: list[dict]) -> Response:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=CSV_COLUMNS, extrasaction="ignore")
    writer.writeheader()
    writer.writerows({k: _csv_cell(r.get(k)) for k in CSV_COLUMNS} for r in rows)
    return Response(buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="tickets.csv"'})


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@router.get("/admin/complaints")
async def admin_complaints(
    department: str | None = None, building: str | None = None, urgency: str | None = None, from_: str | None = Query(None, alias="from")
) -> list:
    rows = load_mock("admin_complaints") if settings.use_mocks else await _run(_rows, from_)
    return _filter(rows, department, building, urgency)


@router.patch("/admin/complaints/{complaint_id}")
async def patch_complaint(complaint_id: str, patch: ComplaintPatch) -> dict:
    if settings.use_mocks:
        for row in load_mock("admin_complaints"):
            if row["id"] == complaint_id:
                return {**row, **patch.model_dump(exclude_none=True)}
        raise _not_found()
    return await _run(_patch, complaint_id, patch)


@router.get("/admin/stats")
async def admin_stats() -> dict:
    if settings.use_mocks:
        return load_mock("admin_stats")
    return _stats(await _run(_rows))


@router.get("/admin/tickets.csv")
async def tickets_csv() -> Response:
    return _csv(load_mock("admin_complaints") if settings.use_mocks else await _run(_rows))
