"""P1 Naman: Tommy chat (ARCHITECTURE.md §6, §7.1).

POST /chat           {session_id, message, image_url?} -> SSE stream
POST /chat/confirm   {session_id, action_id, approved, edits?}
"""

from fastapi import APIRouter

router = APIRouter(tags=["chat (P1)"])
