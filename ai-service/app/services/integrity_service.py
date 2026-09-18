"""Deterministic scenario detectors.

These detectors implement the organiser's Section 6 scenario catalogue as
pure-Python rules. No LLM involvement - every finding must be reproducible
from the DiMa / VRED / RBAC data by inspection.

Detector output uses the same shape as ``ConflictItem`` so the results can be
emitted straight into the ``conflicts`` table without translation.

Fair-play rule: detectors query by relationship (material_reference not in
materials, visual_match = mismatch, role != 'approver'), never by literal ID.
"""

from __future__ import annotations

from typing import Iterable

from ..schemas import (
    ApproverProfile,
    ConflictItem,
    Decision,
    Material,
    VredRow,
)


# ---------------------------------------------------------------------------
# Cross-record conflicts (paired: A vs B on the same component)
# ---------------------------------------------------------------------------


def find_pair_conflicts(decisions: list[Decision]) -> list[ConflictItem]:
    """Direct incompatible conflicts on the same component (RC-6 red).

    Groups decisions by (component, model_year) and flags every pair where
    finish, colour code, or material lifecycle disagree.
    Decisions for different model years are never compared - each model year
    is an independent configuration context (PLM best practice).
    """
    by_component: dict[tuple[str, str | None], list[Decision]] = {}
    for d in decisions:
        key = d.component_id or d.component_name
        if not key:
            continue
        group_key = (key, d.model_year)
        by_component.setdefault(group_key, []).append(d)

    conflicts: list[ConflictItem] = []
    for (component, _my), group in by_component.items():
        if len(group) < 2:
            continue
        for i, a in enumerate(group):
            for b in group[i + 1:]:
                if a.finish_surface and b.finish_surface and a.finish_surface != b.finish_surface:
                    conflicts.append(ConflictItem(
                        decision_a_id=a.id,
                        decision_b_id=b.id,
                        conflict_type="finish_conflict",
                        explanation=(
                            f"Component {component} ({a.model_year}): {a.business_area} chose finish "
                            f"{a.finish_surface}, {b.business_area} chose {b.finish_surface}."
                        ),
                    ))
                if a.colour_code and b.colour_code and a.colour_code != b.colour_code:
                    conflicts.append(ConflictItem(
                        decision_a_id=a.id,
                        decision_b_id=b.id,
                        conflict_type="colour_code_conflict",
                        explanation=(
                            f"Component {component} ({a.model_year}): colour code {a.colour_code} "
                            f"({a.business_area}) vs {b.colour_code} ({b.business_area})."
                        ),
                    ))
                if a.material_reference and b.material_reference and a.material_reference != b.material_reference:
                    conflicts.append(ConflictItem(
                        decision_a_id=a.id,
                        decision_b_id=b.id,
                        conflict_type="material_conflict",
                        explanation=(
                            f"Component {component} ({a.model_year}): material {a.material_reference} "
                            f"({a.business_area}) vs {b.material_reference} ({b.business_area})."
                        ),
                    ))
    return conflicts


def find_lifecycle_conflicts(
    decisions: list[Decision],
    materials_by_code: dict[str, Material],
) -> list[ConflictItem]:
    """Two decisions on the same component (same model year) using Active vs Deprecated materials."""
    by_component: dict[tuple[str, str | None], list[Decision]] = {}
    for d in decisions:
        key = d.component_id or d.component_name
        if not key or not d.material_reference:
            continue
        group_key = (key, d.model_year)
        by_component.setdefault(group_key, []).append(d)

    conflicts: list[ConflictItem] = []
    for (component, _my), group in by_component.items():
        if len(group) < 2:
            continue
        for i, a in enumerate(group):
            mat_a = materials_by_code.get(a.material_reference or "")
            if mat_a is None or mat_a.lifecycle_status is None:
                continue
            for b in group[i + 1:]:
                mat_b = materials_by_code.get(b.material_reference or "")
                if mat_b is None or mat_b.lifecycle_status is None:
                    continue
                if mat_a.lifecycle_status != mat_b.lifecycle_status:
                    conflicts.append(ConflictItem(
                        decision_a_id=a.id,
                        decision_b_id=b.id,
                        conflict_type="lifecycle_conflict",
                        explanation=(
                            f"Component {component}: {a.material_reference} is "
                            f"{mat_a.lifecycle_status}, {b.material_reference} is "
                            f"{mat_b.lifecycle_status}."
                        ),
                    ))
    return conflicts


# ---------------------------------------------------------------------------
# Single-decision integrity issues (encoded as A=B self-references so they
# can still land in the conflicts table for the UI to surface)
# ---------------------------------------------------------------------------


def find_orphan_materials(
    decisions: Iterable[Decision],
    materials_by_code: dict[str, Material],
) -> list[ConflictItem]:
    """decision.material_reference is set but does not exist in DiMa."""
    out: list[ConflictItem] = []
    for d in decisions:
        if d.material_reference and d.material_reference not in materials_by_code:
            out.append(ConflictItem(
                decision_a_id=d.id,
                decision_b_id=d.id,
                conflict_type="orphan_material",
                explanation=(
                    f"Material {d.material_reference} referenced by decision "
                    f"{d.id} is not present in the DiMa master list."
                ),
            ))
    return out


def find_rbac_violations(
    decisions: Iterable[Decision],
    approvals_by_decision: dict[str, list],
    profiles_by_id: dict[str, ApproverProfile],
) -> list[ConflictItem]:
    """Any decision approved by a user whose role != 'approver'."""
    out: list[ConflictItem] = []
    for d in decisions:
        if d.status != "approved":
            continue
        for a in approvals_by_decision.get(d.id, []):
            if a.status != "approved" or not a.approved_by:
                continue
            profile = profiles_by_id.get(a.approved_by)
            if profile is None:
                continue  # unknown role - treated as unverifiable, not violation
            if profile.role != "approver":
                out.append(ConflictItem(
                    decision_a_id=d.id,
                    decision_b_id=d.id,
                    conflict_type="rbac_violation",
                    explanation=(
                        f"Decision {d.id} was approved by user {a.approved_by} "
                        f"whose role is '{profile.role}', not 'approver'."
                    ),
                ))
    return out


def find_visual_mismatches(
    decisions: Iterable[Decision],
    vred_rows: Iterable[VredRow],
) -> list[ConflictItem]:
    """VRED row for (component, material) reports visual_match = mismatch."""
    mismatch_pairs = {
        (r.component_id, r.material_code): r
        for r in vred_rows if r.visual_match == "mismatch"
    }
    out: list[ConflictItem] = []
    for d in decisions:
        if not d.component_id or not d.material_reference:
            continue
        row = mismatch_pairs.get((d.component_id, d.material_reference))
        if row is not None:
            out.append(ConflictItem(
                decision_a_id=d.id,
                decision_b_id=d.id,
                conflict_type="visual_mismatch",
                explanation=(
                    f"VRED {row.id} reports Visual Mismatch for "
                    f"{d.component_id} × {d.material_reference}."
                ),
            ))
    return out


def find_audit_gaps(
    decisions: Iterable[Decision],
    approvals_by_decision: dict[str, list],
    audit_events_after_approval: dict[str, bool],
) -> list[ConflictItem]:
    """Decision modified after approval with no matching audit_log entry.

    `audit_events_after_approval[decision_id] = True` iff the caller has
    already verified at least one audit row exists for that decision with
    changed_at > max(approvals.decided_at). We only flag the *absence*.
    """
    out: list[ConflictItem] = []
    for d in decisions:
        approvals = approvals_by_decision.get(d.id, [])
        decided = [a.decided_at for a in approvals if a.decided_at]
        if not decided:
            continue
        # updated_at is on the Decision model; if not present, skip.
        updated_at = getattr(d, "updated_at", None)
        if not updated_at:
            continue
        last_decided = max(decided)
        if updated_at > last_decided and not audit_events_after_approval.get(d.id, False):
            out.append(ConflictItem(
                decision_a_id=d.id,
                decision_b_id=d.id,
                conflict_type="audit_gap",
                explanation=(
                    f"Decision {d.id} was modified after approval at {last_decided} "
                    "but no matching audit_log entry exists."
                ),
            ))
    return out


# ---------------------------------------------------------------------------
# Top-level convenience
# ---------------------------------------------------------------------------


def detect_all(
    decisions: list[Decision],
    materials_by_code: dict[str, Material],
    vred_rows: list[VredRow],
    approvals_by_decision: dict[str, list],
    profiles_by_id: dict[str, ApproverProfile],
    audit_events_after_approval: dict[str, bool] | None = None,
) -> list[ConflictItem]:
    """Run every detector and return the merged, ordered list."""
    audit_events_after_approval = audit_events_after_approval or {}
    return [
        *find_orphan_materials(decisions, materials_by_code),
        *find_rbac_violations(decisions, approvals_by_decision, profiles_by_id),
        *find_visual_mismatches(decisions, vred_rows),
        *find_audit_gaps(decisions, approvals_by_decision, audit_events_after_approval),
        *find_pair_conflicts(decisions),
        *find_lifecycle_conflicts(decisions, materials_by_code),
    ]
