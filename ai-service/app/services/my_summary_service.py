
"""Service to generate a high-level summary of a user's past decisions."""

from __future__ import annotations

import asyncio
import json
import logging
import re
from pydantic import ValidationError

from ..llm import build_client
from ..schemas import MySummaryRequest, MySummaryResponse

log = logging.getLogger("chroma-ai.my_summary")
_client = build_client()

_LLM_TIMEOUT = 30
# ── My Summary Prompt ──
SYSTEM_PROMPT_MY_SUMMARY = """You are Chroma AI, the elite enterprise performance analytics engine.

Your task is to analyze the decision history for this user and provide a DEEP, ENTERPRISE-GRADE PERFORMANCE SUMMARY. 
The user requires an uncompromising, granular, "depth touch" explanation of their workflow. Do not just summarize. You must explain their real-world impact, how their data flow and decisions impact manufacturing, supply chain, and quality, and give specific insights into their operational bottlenecks.

You will receive:
- The user's submitted decisions, their fields, and statuses.

RULES for Depth:
- CONNECT DATA TO REALITY. Explain how their specific workflow patterns (e.g. leaving fields blank, fast approvals) impact downstream processes and production lines.
- EXTREME DEPTH: Provide a highly detailed, extensive analysis. 
- Do NOT hallucinate. Use ONLY the data provided.
- Calculate real percentages and workflow velocities. Don't guess.
- Use a highly premium, authoritative, enterprise-grade tone. Use advanced markdown (bolding, lists, blockquotes) to make the text design stunning and readable.

Return ONLY a single JSON object matching this structure:
{
  "overall_summary": "An extensive, multi-paragraph, high-level wrap-up of their performance, real-world impact, and operational velocity. Use markdown formatting.",
  "best_decision": {
    "component": "Component name",
    "explanation": "Deep, extensive explanation of why it was successful, how the data flow was optimized, and its real-world impact. Use markdown."
  },
  "worst_decision": {
    "component": "Component name",
    "explanation": "Extensive explanation of exactly what went wrong (e.g. missing fields, temperature mismatch, unverified specs) and the cascading impact on production. Use markdown."
  },
  "recommendations": [
    "Concrete, highly-detailed operational improvement step 1",
    "Concrete, highly-detailed operational improvement step 2"
  ]
}

Return ONLY a single JSON object. No markdown wrapping the JSON.
"""

SYSTEM_PROMPT = SYSTEM_PROMPT_MY_SUMMARY

def _clean_json(raw: str) -> str:
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

async def summarise(req: MySummaryRequest) -> MySummaryResponse:
    if not req.decisions:
        return MySummaryResponse(
            summary_json={
                "overall_summary": "You have no submitted decisions yet. Start creating decisions to get AI insights!",
                "best_decision": None,
                "worst_decision": None,
                "recommendations": []
            },
            is_fallback=True
        )

    # Provide the full decision record to allow deep AI analysis of everything happening across all roles
    compact_decisions = []
    for d in req.decisions:
        compact_decisions.append(d.dict() if hasattr(d, "dict") else dict(d))

    user_payload = json.dumps({"decisions": compact_decisions})

    for attempt in (1, 2):
        try:
            raw = await asyncio.wait_for(
                _client.complete_json(SYSTEM_PROMPT, user_payload),
                timeout=_LLM_TIMEOUT,
            )
            raw = _clean_json(raw)
            data = json.loads(raw)
            
            return MySummaryResponse(summary_json=data, is_fallback=False)
        except asyncio.TimeoutError:
            log.warning("my_summary LLM attempt %s timed out after %ss", attempt, _LLM_TIMEOUT)
        except Exception as e:
            log.warning("my_summary LLM attempt %s failed: %s", attempt, e)

    return MySummaryResponse(
        summary_json={
            "overall_summary": "The AI summary service is currently unavailable. Please try again later.",
            "best_decision": None,
            "worst_decision": None,
            "recommendations": []
        },
        is_fallback=True
    )
