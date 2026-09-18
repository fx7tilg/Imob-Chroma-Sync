"""Summary service for Meldeliste / Colour-Mix-Chart."""

from __future__ import annotations

import asyncio
import json
import logging
import re

from pydantic import ValidationError

from ..llm import build_client
from ..prompts import SUMMARY_SYSTEM
from ..schemas import SummaryItem, SummaryRequest, SummaryResponse

log = logging.getLogger("chroma-ai.summary")
_client = build_client()

_LLM_TIMEOUT = 30
_MAX_SUMMARY_WORDS = 25  # slightly generous - we'll trim to 20 but allow a buffer


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


def _truncate_summary(text: str, max_words: int = 20) -> str:
    """Ensure summary is at most max_words words."""
    words = text.split()
    if len(words) <= max_words:
        return text
    truncated = " ".join(words[:max_words])
    if not truncated.endswith("."):
        truncated += "…"
    return truncated


async def summarise(req: SummaryRequest) -> SummaryResponse:
    if not req.decisions:
        return SummaryResponse(summaries=[])

    user = req.model_dump_json()

    for attempt in (1, 2):
        try:
            raw = await asyncio.wait_for(
                _client.complete_json(SUMMARY_SYSTEM, user),
                timeout=_LLM_TIMEOUT,
            )
            cleaned = _clean_json(raw)
            data = json.loads(cleaned)
            items_raw = data.get("summaries", [])
            out: list[SummaryItem] = []
            valid_ids = {d.id for d in req.decisions}
            for it in items_raw:
                try:
                    item = SummaryItem.model_validate(it)
                except ValidationError:
                    continue
                # Only keep summaries for IDs that were actually requested
                if item.id not in valid_ids:
                    continue
                # Enforce the 20-word limit
                item.summary = _truncate_summary(item.summary.strip())
                out.append(item)
            if out:
                # If the LLM missed some decisions, fill them with deterministic fallback
                returned_ids = {s.id for s in out}
                for d in req.decisions:
                    if d.id not in returned_ids:
                        out.append(SummaryItem(
                            id=d.id,
                            summary=_build_fallback_summary(d),
                        ))
                return SummaryResponse(summaries=out)
        except asyncio.TimeoutError:
            log.warning("summary LLM attempt %s timed out after %ss", attempt, _LLM_TIMEOUT)
        except (json.JSONDecodeError, ValueError) as e:
            log.warning("summary LLM attempt %s failed: %s", attempt, e)

    # Safe fallback: build a deterministic sentence per record.
    return SummaryResponse(
        summaries=[
            SummaryItem(id=d.id, summary=_build_fallback_summary(d))
            for d in req.decisions
        ]
    )


def _build_fallback_summary(d) -> str:
    """Deterministic per-record summary used when the LLM is unavailable."""
    return _truncate_summary(
        f"{d.component_name} - colour {d.colour_code or 'n/a'}, "
        f"material {d.material_reference or 'n/a'}, status {d.status}."
    )
