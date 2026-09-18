"""Chat service - powers the in-app assistant that guides users."""

from __future__ import annotations

import asyncio
import json
import logging
import re

from pydantic import ValidationError

from ..llm import build_client
from ..prompts import CHAT_SYSTEM
from ..schemas import ChatRequest, ChatResponse, RawLlmChat

log = logging.getLogger("chroma-ai.chat")
_client = build_client()

_LLM_TIMEOUT = 30


def _clean_json(raw: str) -> str:
    """Strip markdown fences and stray prose that some models wrap around JSON."""
    raw = raw.strip()
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw)
    if m:
        raw = m.group(1).strip()
    idx = raw.find("{")
    if idx > 0:
        raw = raw[idx:]
    ridx = raw.rfind("}")
    if ridx >= 0:
        raw = raw[: ridx + 1]
    return raw


def _build_user_payload(req: ChatRequest) -> str:
    """Serialise the conversation + who's asking into the LLM user turn."""
    return json.dumps(
        {
            "chat": True,
            "user_team": req.user_team,
            "is_project_lead": req.is_project_lead,
            "context": req.context,
            "messages": [m.model_dump() for m in req.messages],
        }
    )


async def reply(req: ChatRequest) -> ChatResponse:
    if not req.messages:
        return ChatResponse(reply="Hi! I'm the Chroma Sync assistant. Ask me how to create, review, or approve a decision.")

    user = _build_user_payload(req)

    for attempt in (1, 2):
        try:
            raw = await asyncio.wait_for(
                _client.complete_json(CHAT_SYSTEM, user),
                timeout=_LLM_TIMEOUT,
            )
            parsed = RawLlmChat.model_validate_json(_clean_json(raw))
            text = parsed.reply.strip()
            if text:
                return ChatResponse(reply=text)
            raise ValueError("empty reply")
        except asyncio.TimeoutError:
            log.warning("chat LLM attempt %s timed out after %ss", attempt, _LLM_TIMEOUT)
        except (ValidationError, json.JSONDecodeError, ValueError, KeyError) as e:
            log.warning("chat LLM attempt %s failed: %s", attempt, e)

    return ChatResponse(
        reply=(
            "I'm having trouble reaching the assistant right now. In the meantime: "
            "Design creates and submits a decision, then Engineering, Procurement and "
            "Quality review in that order - only Quality gives final approval."
        )
    )
