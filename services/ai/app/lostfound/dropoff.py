"""Where a finder takes a valuable item (P2, ARCHITECTURE.md §7.2).

USC's only official lost & found is DPS ("DPS operates the university's centralized lost and
found service", https://dps.usc.edu/services/lost-and-found/, checked 2026-11-14). There is no
IT/ITS lost & found. So every valuable goes to DPS, which also checks proof of ownership.

These rows mirror the dropoff_points rows in supabase/seed.sql (same ids). Change both together.
The table has no address column, so the addresses for the map links live here.
"""

from __future__ import annotations

from urllib.parse import quote_plus

DPS_URL = "https://dps.usc.edu/services/lost-and-found/"

UPC_DPS_ID = "dd000000-0000-0000-0000-000000000001"
HSC_DPS_ID = "dd000000-0000-0000-0000-000000000002"

_DROPOFFS: dict[str, dict] = {
    UPC_DPS_ID: {
        "name": "DPS Lost & Found, 3667 McClintock Ave (University Park Campus)",
        "address": "3667 McClintock Ave, Los Angeles, CA 90089",
    },
    HSC_DPS_ID: {
        "name": "DPS Lost & Found, 2001 Soto Street (Health Sciences Campus)",
        "address": "2001 Soto Street, Los Angeles, CA 90032",
    },
}


def _map_link(address: str) -> str:
    return f"https://www.google.com/maps/search/?api=1&query={quote_plus(address)}"


def pick_dropoff(building_id: str | None = None) -> tuple[str, dict]:
    """Returns (dropoff_point_id, DropoffInfo) for a valuable found in `building_id`.

    Every building we have is on the University Park Campus, so this is always UPC DPS for now.
    If Health Sciences buildings are added, choose HSC_DPS_ID for them here.
    """
    point_id = UPC_DPS_ID
    d = _DROPOFFS[point_id]
    return point_id, {"name": d["name"], "url": DPS_URL, "map": _map_link(d["address"]), "hours": None}
