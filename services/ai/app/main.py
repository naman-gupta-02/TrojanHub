"""TrojanHub AI service: app, CORS and router mounting (owned by P4).

Run from services/ai:  uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
Swagger docs:          http://localhost:8000/docs
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.admin.routes import router as admin_router
from app.chat.routes import router as chat_router
from app.complaints.routes import router as complaints_router
from app.core.config import settings
from app.events.routes import router as events_router
from app.lostfound.routes import router as lostfound_router
from app.notify.routes import router as notify_router

app = FastAPI(title="TrojanHub AI", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "use_mocks": settings.use_mocks}


for router in (
    chat_router,        # P1 Naman:   /chat, /chat/confirm
    lostfound_router,   # P2 Vishwa:  /items...
    events_router,      # P3 Parnavi: /flyers, /events, /deals, /rewards, /feed
    notify_router,      # P3 Parnavi: /notify/...
    complaints_router,  # P4 Jaymin:  /complaints, /tickets
    admin_router,       # P4 Jaymin:  /admin/...
):
    app.include_router(router, prefix="/api")
