"""Chroma Sync AI service - one FastAPI app, three endpoints.

Every LLM boundary is guarded by Pydantic. Invalid JSON is retried once and
then falls back to a safe, labelled result so the UI never breaks.
"""

from __future__ import annotations

import logging
from dotenv import load_dotenv
load_dotenv(override=True)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
from .services import readiness_service, conflicts_service, summary_service, my_summary_service, priority_briefing_service, chat_service, report_summary_service

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("chroma-ai")

app = FastAPI(title="Chroma Sync AI", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/readiness", response_model=ReadinessResponse)
async def readiness(req: ReadinessRequest) -> ReadinessResponse:
    return await readiness_service.evaluate(req)


@app.post("/conflicts", response_model=ConflictResponse)
async def conflicts(req: ConflictRequest) -> ConflictResponse:
    return await conflicts_service.detect(req)


@app.post("/summarise", response_model=SummaryResponse)
async def summarise(req: SummaryRequest) -> SummaryResponse:
    return await summary_service.summarise(req)


@app.post("/my-summary", response_model=MySummaryResponse)
async def my_summary(req: MySummaryRequest) -> MySummaryResponse:
    return await my_summary_service.summarise(req)


@app.post("/report-summary", response_model=ReportSummaryResponse)
async def report_summary(req: ReportSummaryRequest) -> ReportSummaryResponse:
    return await report_summary_service.summarise(req)


@app.post("/priority-briefing", response_model=PriorityBriefingResponse)
async def priority_briefing(req: PriorityBriefingRequest) -> PriorityBriefingResponse:
    return await priority_briefing_service.briefing(req)


@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    return await chat_service.reply(req)
