"""P2 Vishwa: Lost & Found (ARCHITECTURE.md §6, §7.2).

POST /items                    multipart {photo, kind, description?, building_id?, location_text?}
GET  /items/search             ?q=&building_id=
POST /items/search-by-image    multipart {photo}
POST /items/{id}/claim
"""

from fastapi import APIRouter

router = APIRouter(tags=["lost & found (P2)"])
