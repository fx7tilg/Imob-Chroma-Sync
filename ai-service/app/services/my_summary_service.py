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

SYSTEM_PROMPT = """You are Chroma AI, the elite, highly intelligent system at the core of this modern SaaS platform.
You are reviewing a user's colour & material decision portfolio.

You have access to the FULL decision records, including all fields from Design (requirements), Engineering (feasibility, temperature/UV validations), Procurement (supplier, pricing), and Quality (inspection).

Produce a BEAUTIFUL, PROFESSIONAL PERFORMANCE SNAPSHOT in markdown. Make the text outstanding, premium, and very easy to understand. Use a sleek, modern tone that makes the user feel like they are receiving an elite AI analysis of their entire workflow.

Structure your analysis elegantly using exactly these sections:

**📈 Overall Summary** - A concise, high-level wrap-up of their performance. Include total decisions, approval rate, rejection rate, and average AI health rating.
**🏆 Best Decision** - Identify the smoothest, highest-rated, or most complete decision they created. Reference the component name and explain why it was successful.
**⚠️ Worst Decision** - Identify the most problematic, rejected, or lowest-rated decision they created. Reference the component name and explain exactly what went wrong (e.g. missing fields, temperature mismatch).
**🎯 Chroma AI Recommendations** - 2-3 concrete, actionable steps to improve workflow and data integrity across the pipeline.

RULES:
- Be clear, accessible, and beautifully written. Avoid overly dense jargon.
- Reference actual component names, colour codes, and technical requirements from the data.
- Read every single field (temperature, feasibility, supplier status, etc.) to form your intelligence.
- Calculate real percentages. Don't guess.
- You MUST include "Overall Summary", "Best Decision", and "Worst Decision".
Output MUST be a highly professional raw markdown string. Do NOT wrap it in JSON. Do NOT wrap it in a code block. Just return the markdown text directly.
"""


async def summarise(req: MySummaryRequest) -> MySummaryResponse:
    if not req.decisions:
        return MySummaryResponse(summary_markdown="You have no submitted decisions yet. Start creating decisions to get AI insights!")

    # Provide the full decision record to allow deep AI analysis of everything happening across all roles
    compact_decisions = []
    for d in req.decisions:
        compact_decisions.append(d.dict() if hasattr(d, "dict") else dict(d))

    user_payload = json.dumps({"decisions": compact_decisions})

    for attempt in (1, 2):
        try:
            md = await asyncio.wait_for(
                _client.complete_text(SYSTEM_PROMPT, user_payload),
                timeout=_LLM_TIMEOUT,
            )
            md = md.strip()
            if md:
                return MySummaryResponse(summary_markdown=md, is_fallback=False)
        except asyncio.TimeoutError:
            log.warning("my_summary LLM attempt %s timed out after %ss", attempt, _LLM_TIMEOUT)
        except Exception as e:
            log.warning("my_summary LLM attempt %s failed: %s", attempt, e)

    return MySummaryResponse(summary_markdown="The AI summary service is currently unavailable. Please try again later.", is_fallback=True)
