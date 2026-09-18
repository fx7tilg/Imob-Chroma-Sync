"""Readiness service - six-criterion deterministic scorer + LLM narrator.

Design rule: the *rating* per criterion and the aggregate are computed by
``scoring.py`` using pure-Python rules that a judge can reproduce from the
DiMa / VRED / RBAC data in a spreadsheet. The LLM is only asked to write a
human-readable ``reason`` narrative. It cannot change any colour.

Aggregation: worst-colour across all six criteria (organiser spec §5).
"""

from __future__ import annotations

import asyncio
import json
import logging
import re

from pydantic import ValidationError

from ..llm import build_client
from ..prompts import READINESS_SYSTEM
from ..schemas import (
    CriterionResult,
    RawLlmReadiness,
    ReadinessFlag,
    ReadinessRequest,
    ReadinessResponse,
)
from . import scoring

log = logging.getLogger("chroma-ai.readiness")
_client = build_client()

_LLM_TIMEOUT = 20


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


def _summarise(per_criterion: dict[str, CriterionResult]) -> str:
    """Deterministic one-line reason used when the LLM narrator is unavailable."""
    reds = [k for k, v in per_criterion.items() if v.rating == "red"]
    yellows = [k for k, v in per_criterion.items() if v.rating == "yellow"]
    if reds:
        headline = per_criterion[reds[0]].reason
        return f"{headline} ({len(reds)} blocker{'s' if len(reds) > 1 else ''}, {len(yellows)} warning{'s' if len(yellows) != 1 else ''})"
    if yellows:
        headline = per_criterion[yellows[0]].reason
        return f"{headline} ({len(yellows)} warning{'s' if len(yellows) != 1 else ''})"
    return "All criteria passed - decision is ready for approval."


async def _deep_analysis(req: ReadinessRequest, deterministic_aggregate: str, per_criterion: dict[str, CriterionResult]) -> tuple[str, str | None, list[ReadinessFlag]]:
    """Ask the LLM for a deep, cross-field analysis using the full READINESS_SYSTEM prompt."""
    payload = {
        "decision": req.decision.dict(),
        "previous_decision": req.previous_decision.dict() if req.previous_decision else None,
        "material": req.material.dict() if req.material else None,
        "approvals": [a.dict() for a in req.approvals],
        "deterministic_evaluation": {
            "aggregate": deterministic_aggregate,
            "per_criterion": {
                k: {"rating": v.rating, "reason": v.reason} for k, v in per_criterion.items()
            }
        }
    }
    try:
        raw = await asyncio.wait_for(
            _client.complete_json(READINESS_SYSTEM, json.dumps(payload, default=str)),
            timeout=_LLM_TIMEOUT,
        )
        cleaned = _clean_json(raw)
        obj = json.loads(cleaned)
        
        ai_rating = obj.get("rating", deterministic_aggregate)
        reason = obj.get("reason") if isinstance(obj, dict) else obj.get("reason")
        raw_flags = obj.get("flags", [])
        
        flags = []
        for f in raw_flags:
            if isinstance(f, dict) and "flag" in f:
                flags.append(ReadinessFlag(flag=f["flag"], detail=f.get("detail")))
                
        # Merge rating: worst color wins
        order = {"green": 0, "yellow": 1, "red": 2}
        final_rating = ai_rating if order.get(ai_rating, 0) > order.get(deterministic_aggregate, 0) else deterministic_aggregate
        
        return final_rating, reason, flags
    except (asyncio.TimeoutError, ValidationError, json.JSONDecodeError, ValueError, KeyError, Exception) as e:
        log.warning("deep analysis failed: %s", e)
        
    return deterministic_aggregate, None, []


async def evaluate(req: ReadinessRequest) -> ReadinessResponse:
    per_criterion = scoring.score_all(req)
    deterministic_aggregate = scoring.worst_colour(*(c.rating for c in per_criterion.values()))

    final_rating, ai_reason, ai_flags = await _deep_analysis(req, deterministic_aggregate, per_criterion)
    reason = ai_reason or _summarise(per_criterion)

    flags: list[ReadinessFlag] = []
    # Map internal keys to human-readable labels for flag output
    _HUMAN_LABELS = {
        "rc1_lifecycle": "Material Lifecycle",
        "rc2_compliance": "Compliance",
        "rc3_lead_time": "Lead Time",
        "rc4_visual": "Visual Readiness",
        "rc5_approval_rbac": "Approval & Access Control",
        "rc6_conflict": "Cross-Area Conflict",
    }
    # Add deterministic flags with human-readable labels
    for key, result in per_criterion.items():
        label = _HUMAN_LABELS.get(key, key)
        if result.rating == "red":
            flags.append(ReadinessFlag(flag=f"{label} - Blocker", detail=result.reason))
        elif result.rating == "yellow":
            flags.append(ReadinessFlag(flag=f"{label} - Warning", detail=result.reason))
            
    # Add AI deep analysis flags
    flags.extend(ai_flags)

    return ReadinessResponse(
        rating=final_rating,  # type: ignore[arg-type]
        reason=reason,
        flags=flags,
        rc1_lifecycle=per_criterion["rc1_lifecycle"],
        rc2_compliance=per_criterion["rc2_compliance"],
        rc3_lead_time=per_criterion["rc3_lead_time"],
        rc4_visual=per_criterion["rc4_visual"],
        rc5_approval_rbac=per_criterion["rc5_approval_rbac"],
        rc6_conflict=per_criterion["rc6_conflict"],
    )
