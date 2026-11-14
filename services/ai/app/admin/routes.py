"""P4 Jaymin: Admin dashboard API (ARCHITECTURE.md §6, §7.4). dept_admin / usg_admin only.

GET   /admin/complaints     ?department=&building=&urgency=&from=
PATCH /admin/complaints/{id}  {corrected_department?, status?}
GET   /admin/stats
GET   /admin/tickets.csv
"""

import csv
import io
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel

from app.core.auth import require_admin
from app.core.config import settings
from app.core.mocks import load_mock, not_built

router = APIRouter(tags=["admin (P4)"], dependencies=[Depends(require_admin)])
OWNER = "P4 Jaymin"

Department = Literal["Facilities", "Housing", "ITS", "Transportation", "DPS"]


class ComplaintPatch(BaseModel):
    corrected_department: Department | None = None
    status: Literal["reported", "sent", "resolved"] | None = None


def _filtered_rows(department: str | None, building: str | None, urgency: str | None) -> list[dict]:
    rows = load_mock("admin_complaints")
    if department:
        rows = [r for r in rows if (r["corrected_department"] or r["ai_department"]) == department]
    if building:
        rows = [r for r in rows if r["building"] == building]
    if urgency:
        rows = [r for r in rows if r["urgency"] == urgency]
    return rows


@router.get("/admin/complaints")
async def admin_complaints(
    department: str | None = None, building: str | None = None, urgency: str | None = None, from_: str | None = Query(None, alias="from")
) -> list:
    if settings.use_mocks:
        return _filtered_rows(department, building, urgency)
    raise not_built(OWNER)


@router.patch("/admin/complaints/{complaint_id}")
async def patch_complaint(complaint_id: str, patch: ComplaintPatch) -> dict:
    if settings.use_mocks:
        for row in load_mock("admin_complaints"):
            if row["id"] == complaint_id:
                return {**row, **patch.model_dump(exclude_none=True)}
        raise HTTPException(404, detail={"code": "not_found", "message": "Complaint not found"})
    raise not_built(OWNER)


@router.get("/admin/stats")
async def admin_stats() -> dict:
    if settings.use_mocks:
        return load_mock("admin_stats")
    raise not_built(OWNER)


@router.get("/admin/tickets.csv")
async def tickets_csv() -> Response:
    if settings.use_mocks:
        rows = load_mock("admin_complaints")
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
        return Response(buf.getvalue(), media_type="text/csv",
                        headers={"Content-Disposition": 'attachment; filename="tickets.csv"'})
    raise not_built(OWNER)
