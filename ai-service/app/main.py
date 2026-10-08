"""Chroma Sync AI service - one FastAPI app, 3 endpoints 

(we guard every LLM boundary with Pydantic becuase we are not building just MVP, 

we are building something special for VW group).

Every LLM boundary is guarded by Pydantic. Invalid JSON is retried once and
then falls back to a safe, labelled result so the UI never breaks.
"""

from __future__ import annotations

import logging
import os

from dotenv import load_dotenv

load_dotenv(override=True)

from fastapi import Depends, FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .schemas import (
    ReadinessRequest,
    ReadinessResponse,
    ConflictRequest,
    ConflictResponse,
    SummaryRequest,
    SummaryResponse,
    MySummaryRequest,
    MySummaryResponse,
    PriorityBriefingRequest,
    PriorityBriefingResponse,
    ChatRequest,
    ChatResponse,
    ReportSummaryRequest,
    ReportSummaryResponse,
)
from .security import (
    APP_ENV,
    AUTH_ENABLED,
    IS_PRODUCTION,
    MAX_BODY_BYTES,
    allowed_origins,
    require_caller,
)
from .services import readiness_service, conflicts_service, summary_service, my_summary_service, priority_briefing_service, chat_service, report_summary_service

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO").upper())
log = logging.getLogger("chroma-ai")

_LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "mock").strip().lower()

if IS_PRODUCTION and _LLM_PROVIDER == "mock":
    raise RuntimeError(
        "LLM_PROVIDER=mock with APP_ENV=production: the mock client returns "
        "fabricated ratings. Set a real provider or drop APP_ENV."
    )

app = FastAPI(title="Chroma Sync AI", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins(),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["authorization", "content-type"],
)


@app.middleware("http")
async def limit_body_size(request: Request, call_next):
    """Reject oversized payloads before they reach Pydantic or an LLM."""
    declared = request.headers.get("content-length")
    if declared is not None:
        try:
            too_big = int(declared) > MAX_BODY_BYTES
        except ValueError:
            return JSONResponse(
                {"detail": "invalid content-length"},
                status_code=status.HTTP_400_BAD_REQUEST,
            )
        if too_big:
            return JSONResponse(
                {"detail": "request body too large"},
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )
    return await call_next(request)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Log the detail, return an opaque message - never leak internals."""
    log.exception("unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        {"detail": "internal error"},
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )


@app.on_event("startup")
async def _startup_banner() -> None:
    log.info(
        "chroma-ai starting: env=%s provider=%s auth=%s",
        APP_ENV,
        _LLM_PROVIDER,
        "enabled" if AUTH_ENABLED else "DISABLED",
    )


@app.get("/health")
def health() -> dict[str, object]:
    """Liveness plus enough config state to spot a misconfigured deploy."""
    return {
        "status": "ok",
        "env": APP_ENV,
        "llm_provider": _LLM_PROVIDER,
        "auth_enabled": AUTH_ENABLED,
        "degraded": _LLM_PROVIDER == "mock",
    }


@app.post("/readiness", response_model=ReadinessResponse)
async def readiness(req: ReadinessRequest, _=Depends(require_caller)) -> ReadinessResponse:
    return await readiness_service.evaluate(req)


@app.post("/conflicts", response_model=ConflictResponse)
async def conflicts(req: ConflictRequest, _=Depends(require_caller)) -> ConflictResponse:
    return await conflicts_service.detect(req)


@app.post("/summarise", response_model=SummaryResponse)
async def summarise(req: SummaryRequest, _=Depends(require_caller)) -> SummaryResponse:
    return await summary_service.summarise(req)


@app.post("/my-summary", response_model=MySummaryResponse)
async def my_summary(req: MySummaryRequest, _=Depends(require_caller)) -> MySummaryResponse:
    return await my_summary_service.summarise(req)


@app.post("/report-summary", response_model=ReportSummaryResponse)
async def report_summary(
    req: ReportSummaryRequest, _=Depends(require_caller)
) -> ReportSummaryResponse:
    return await report_summary_service.summarise(req)


@app.post("/priority-briefing", response_model=PriorityBriefingResponse)
async def priority_briefing(
    req: PriorityBriefingRequest, _=Depends(require_caller)
) -> PriorityBriefingResponse:
    return await priority_briefing_service.briefing(req)


@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, _=Depends(require_caller)) -> ChatResponse:
    return await chat_service.reply(req)
