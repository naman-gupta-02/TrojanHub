"""TrojanHub AI service: app, CORS, error format and router mounting (owned by P4).

Run from services/ai:  uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
Swagger docs:          http://localhost:8000/docs
"""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException  # also catches routing 404/405s

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
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?"
    + (f"|{settings.cors_origin_regex}" if settings.cors_origin_regex else ""),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Every error is {error: {code, message}} (ARCHITECTURE.md §8)
@app.exception_handler(HTTPException)
async def http_error(_: Request, exc: HTTPException) -> JSONResponse:
    if isinstance(exc.detail, dict) and "code" in exc.detail:
        body = exc.detail
    else:
        body = {"code": f"http_{exc.status_code}", "message": str(exc.detail)}
    return JSONResponse({"error": body}, status_code=exc.status_code, headers=getattr(exc, "headers", None))


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    first = exc.errors()[0] if exc.errors() else {}
    where = ".".join(str(p) for p in first.get("loc", []))
    return JSONResponse(
        {"error": {"code": "validation_error", "message": f"{where}: {first.get('msg', 'invalid request')}"}},
        status_code=422,
    )


@app.get("/health")
def health() -> dict:
    real = [f.strip() for f in settings.real_features.split(",") if f.strip()]
    return {"ok": True, "use_mocks": settings.use_mocks, "real_features": real if settings.use_mocks else ["all"]}


for router in (
    chat_router,        # P1 Naman:   /chat, /chat/confirm
    lostfound_router,   # P2 Vishwa:  /items...
    events_router,      # P3 Parnavi: /flyers, /events, /deals, /rewards, /feed
    notify_router,      # P3 Parnavi: /notify/...
    complaints_router,  # P4 Jaymin:  /complaints, /tickets
    admin_router,       # P4 Jaymin:  /admin/...
):
    app.include_router(router, prefix="/api")
