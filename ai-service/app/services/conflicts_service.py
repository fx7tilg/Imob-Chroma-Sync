"""Conflict detection service - deterministic detectors first, LLM extras second."""

from __future__ import annotations

import asyncio
import json
import logging
import re

from pydantic import ValidationError

from ..llm import build_client
from ..prompts import CONFLICTS_SYSTEM
from ..schemas import (
    ConflictItem,
    ConflictRequest,
    ConflictResponse,
    RawLlmConflicts,
)
from . import integrity_service

log = logging.getLogger("chroma-ai.conflicts")
_client = build_client()

_LLM_TIMEOUT = 45


def _normalise_conflict_type(raw: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", raw.strip().lower()).strip("_")


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


def _dedup_conflicts(items: list[ConflictItem]) -> list[ConflictItem]:
    """Remove duplicate (unordered-pair, conflict_type) rows."""
    seen: set[tuple[str, str, str]] = set()
    unique: list[ConflictItem] = []
    for item in items:
        a, b = sorted([item.decision_a_id, item.decision_b_id])
        key = (a, b, item.conflict_type)
        if key not in seen:
            seen.add(key)
            unique.append(item)
    return unique


async def _llm_extras(req: ConflictRequest) -> list[ConflictItem]:
    """Ask the LLM for any additional conflicts beyond deterministic detectors."""
    if len(req.decisions) < 2:
        return []
    user = req.model_dump_json()
    for attempt in (1, 2):
        try:
            raw = await asyncio.wait_for(
                _client.complete_json(CONFLICTS_SYSTEM, user),
                timeout=_LLM_TIMEOUT,
            )
            cleaned = _clean_json(raw)
            parsed = RawLlmConflicts.model_validate_json(cleaned)
            valid_ids = {d.id for d in req.decisions}
            out: list[ConflictItem] = []
            for c in parsed.conflicts:
                try:
                    item = ConflictItem.model_validate(c)
                except ValidationError:
                    continue
                item.conflict_type = _normalise_conflict_type(item.conflict_type)
                if item.decision_a_id not in valid_ids or item.decision_b_id not in valid_ids:
                    continue
                if item.decision_a_id == item.decision_b_id:
                    continue  # LLM shouldn't emit self-conflicts (that's for integrity detectors)
                out.append(item)
            return out
        except asyncio.TimeoutError:
            log.warning("conflicts LLM attempt %s timed out", attempt)
        except (ValidationError, json.JSONDecodeError, ValueError) as e:
            log.warning("conflicts LLM attempt %s failed: %s", attempt, e)
    return []


async def detect(req: ConflictRequest) -> ConflictResponse:
    # 1. Run every deterministic detector (reproducible, no LLM).
    materials_by_code = {m.code: m for m in req.materials}
    profiles_by_id = {p.id: p for p in req.approver_profiles}
    deterministic = integrity_service.detect_all(
        decisions=req.decisions,
        materials_by_code=materials_by_code,
        vred_rows=req.vred_rows,
        approvals_by_decision=req.approvals_by_decision,
        profiles_by_id=profiles_by_id,
        audit_events_after_approval=req.audit_events_after_approval,
    )

    # 2. Ask the LLM for anything additional the deterministic rules missed.
    llm_extras = await _llm_extras(req)

    return ConflictResponse(conflicts=_dedup_conflicts(deterministic + llm_extras))
