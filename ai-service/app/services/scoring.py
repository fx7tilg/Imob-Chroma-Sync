"""Six-criterion deterministic scorer.

Every rating produced here must be reproducible from a spreadsheet - no LLM
involvement. The LLM narrator (readiness_service.evaluate) is called separately
and may only write the human-readable `reason` field.

Aggregation rule (as per our hackathon): worst colour across all applicable
dimensions. Any Red -> Red; else any Yellow -> Yellow; else Green.
"""

from __future__ import annotations

from typing import Any, Iterable

# Force uvicorn reload


from ..schemas import (
    ApproverProfile,
    CriterionResult,
    Decision,
    Material,
    ReadinessRequest,
    VredRow,
)

Rating = str  # "green" | "yellow" | "red"


# RC-1 Material lifecycle (DiMa)


def score_rc1(decision: Decision, material: Material | None) -> CriterionResult:
    if material is None:
        return CriterionResult(
            rating="red",
            reason=f"Material '{decision.material_reference}' not found in DiMa (orphan reference).",
            evidence={"material_reference": decision.material_reference, "found": False},
        )
    if material.lifecycle_status == "active":
        return CriterionResult(
            rating="green",
            reason=f"Material {material.code} is Active in DiMa.",
            evidence={"material_code": material.code, "lifecycle_status": "active"},
        )
    if material.lifecycle_status == "deprecated":
        return CriterionResult(
            rating="red",
            reason=f"Material {material.code} is Deprecated in DiMa - must be replaced.",
            evidence={"material_code": material.code, "lifecycle_status": "deprecated"},
        )
    return CriterionResult(
        rating="red",
        reason=f"Material {material.code} has no lifecycle status recorded.",
        evidence={"material_code": material.code, "lifecycle_status": None},
    )

# RC-2 Compliance (DiMa)


def score_rc2(material: Material | None) -> CriterionResult:
    if material is None or material.compliance_status is None:
        return CriterionResult(
            rating="yellow",
            reason="Material compliance status unknown - treat as pending.",
            evidence={"compliance_status": None},
        )
    if material.compliance_status == "pass":
        return CriterionResult(
            rating="green",
            reason=f"Material {material.code} compliance = Pass.",
            evidence={"material_code": material.code, "compliance_status": "pass"},
        )
    if material.compliance_status == "pending":
        return CriterionResult(
            rating="yellow",
            reason=f"Material {material.code} compliance still Pending.",
            evidence={"material_code": material.code, "compliance_status": "pending"},
        )
    return CriterionResult(
        rating="red",
        reason=f"Material {material.code} compliance = Fail - cannot proceed.",
        evidence={"material_code": material.code, "compliance_status": "fail"},
    )

# RC-3 Lead time (DiMa) - thresholds fixed by organiser: ≤12 / 13–20 / >20 weeks

def score_rc3(material: Material | None) -> CriterionResult:
    weeks = material.lead_time_weeks if material else None
    if weeks is None:
        return CriterionResult(
            rating="yellow",
            reason="Lead time not published in DiMa - assume risk.",
            evidence={"lead_time_weeks": None},
        )
    if weeks <= 12:
        return CriterionResult(
            rating="green",
            reason=f"Lead time {weeks} weeks (≤12).",
            evidence={"lead_time_weeks": weeks, "threshold": 12},
        )
    if weeks <= 20:
        return CriterionResult(
            rating="yellow",
            reason=f"Lead time {weeks} weeks (13–20 - plan around it).",
            evidence={"lead_time_weeks": weeks, "threshold": 20},
        )
    return CriterionResult(
        rating="red",
        reason=f"Lead time {weeks} weeks (>20) - programme risk.",
        evidence={"lead_time_weeks": weeks, "threshold": 20},
    )

# RC-4 Visual readiness (VRED)

def score_rc4(decision: Decision, vred_rows: Iterable[VredRow]) -> CriterionResult:
    component = decision.component_id
    material_code = decision.material_reference
    if component is None or material_code is None:
        return CriterionResult(
            rating="yellow",
            reason="Component or material not set - VRED lookup skipped.",
            evidence={"component_id": component, "material_code": material_code},
        )

    matches = [
        r for r in vred_rows
        if r.component_id == component and r.material_code == material_code
    ]
    if not matches:
        return CriterionResult(
            rating="yellow",
            reason=f"No VRED render found for {component} × {material_code}.",
            evidence={"component_id": component, "material_code": material_code},
        )

    # Prefer any row with an explicit mismatch (worst colour); else evaluate best.
    if any(r.visual_match == "mismatch" for r in matches):
        row = next(r for r in matches if r.visual_match == "mismatch")
        return CriterionResult(
            rating="red",
            reason=f"VRED {row.id} reports Visual Mismatch for {component} × {material_code}.",
            evidence={"vred_id": row.id, "visual_match": "mismatch"},
        )
    if any(r.render_status == "rendered" and r.visual_match == "match" for r in matches):
        row = next(r for r in matches if r.render_status == "rendered" and r.visual_match == "match")
        return CriterionResult(
            rating="green",
            reason=f"VRED {row.id} rendered and Visual Match.",
            evidence={"vred_id": row.id, "visual_match": "match"},
        )
    return CriterionResult(
        rating="yellow",
        reason=f"VRED for {component} × {material_code} not rendered yet.",
        evidence={"component_id": component, "material_code": material_code},
    )

# RC-5 Approval & RBAC

def score_rc5(req: ReadinessRequest) -> CriterionResult:
    status = req.decision.status
    if status == "rejected":
        return CriterionResult(
            rating="yellow",
            reason="Decision rejected - changes and re-approval required.",
            evidence={"status": "rejected"},
        )
    if status in ("draft", "submitted", "under_review"):
        return CriterionResult(
            rating="yellow",
            reason=f"In review (status = {status}) - no final approval yet.",
            evidence={"status": status},
        )
    # status == "approved" - every approval row must be by a user whose role = 'approver' and version must be current.
    role_by_id: dict[str, str] = {p.id: p.role for p in req.approver_profiles}
    non_approvers: list[tuple[str, str, str]] = []  # (team, user_id, role)
    stale_approvals: list[tuple[str, int]] = []  # (team, version)

    for a in req.approvals:
        if a.status != "approved" or not a.approved_by:
            continue
            
        if a.version < req.decision.version:
            stale_approvals.append((a.team, a.version))
            continue
            
        role = role_by_id.get(a.approved_by)
        if role and role != "approver":
            non_approvers.append((a.team, a.approved_by, role))
        elif not role:
            # We don't know the role - treat as unverifiable, downgrade to yellow.
            non_approvers.append((a.team, a.approved_by, "unknown"))

    if stale_approvals:
        return CriterionResult(
            rating="yellow",
            reason=(
                "Stale approvals detected - data was modified after approval: "
                + ", ".join(f"{t} (v{v})" for t, v in stale_approvals)
            ),
            evidence={"stale_approvals": [{"team": t, "version": v} for t, v in stale_approvals]},
        )

    if not non_approvers:
        return CriterionResult(
            rating="green",
            reason="All approvals cast by users with Approver role and are up-to-date.",
            evidence={"status": "approved"},
        )
    # Distinguish deterministic RBAC violation (role known and != approver) from
    # unverifiable (role missing).
    hard = [n for n in non_approvers if n[2] != "unknown"]
    if hard:
        return CriterionResult(
            rating="red",
            reason=(
                "RBAC violation - approved by non-Approver role: "
                + ", ".join(f"{t}:{r}" for t, _, r in hard)
            ),
            evidence={"violations": [
                {"team": t, "user_id": uid, "role": r} for t, uid, r in hard
            ]},
        )
    return CriterionResult(
        rating="yellow",
        reason="Cannot verify approver role for at least one approval.",
        evidence={"unverifiable": [
            {"team": t, "user_id": uid} for t, uid, _ in non_approvers
        ]},
    )


# RC-6 Cross-area conflict

def score_rc6(decision: Decision, siblings: Iterable[Decision]) -> CriterionResult:
    component = decision.component_id or decision.component_name
    same_component = [
        s for s in siblings
        if s.id != decision.id
        and s.model_year == decision.model_year
        and ((s.component_id and s.component_id == decision.component_id)
             or (not s.component_id and s.component_name == decision.component_name))
    ]
    if not same_component:
        return CriterionResult(
            rating="green",
            reason="No sibling decisions on this component.",
            evidence={"component": component, "siblings": 0},
        )

    hard_reasons: list[str] = []
    soft_reasons: list[str] = []
    hard_sibling_ids: set[str] = set()
    soft_sibling_ids: set[str] = set()
    # Structured conflict details for direct DB insertion
    conflict_details: list[dict] = []
    for s in same_component:
        # Direct incompatible conflicts (RC-6 Red per spec).
        if decision.finish_surface and s.finish_surface and decision.finish_surface != s.finish_surface:
            hard_reasons.append(
                f"finish conflict with {s.business_area} on component {component} (decision ID: {s.id}, material: {s.material_reference}) ({decision.finish_surface} vs {s.finish_surface})"
            )
            hard_sibling_ids.add(s.id)
            conflict_details.append({
                "sibling_id": s.id,
                "conflict_type": "finish_conflict",
                "explanation": f"Component {component} ({decision.model_year}): {decision.business_area} chose finish {decision.finish_surface}, {s.business_area} chose {s.finish_surface}.",
            })
        if (
            decision.colour_code and s.colour_code
            and decision.colour_code != s.colour_code
        ):
            hard_reasons.append(
                f"colour-code conflict with {s.business_area} on component {component} (decision ID: {s.id}, material: {s.material_reference}) ({decision.colour_code} vs {s.colour_code})"
            )
            hard_sibling_ids.add(s.id)
            conflict_details.append({
                "sibling_id": s.id,
                "conflict_type": "colour_code_conflict",
                "explanation": f"Component {component} ({decision.model_year}): colour code {decision.colour_code} ({decision.business_area}) vs {s.colour_code} ({s.business_area}).",
            })
        if (
            decision.material_reference and s.material_reference
            and decision.material_reference != s.material_reference
        ):
            soft_reasons.append(
                f"different material chosen in {s.business_area} on component {component} (decision ID: {s.id}) ({s.material_reference})"
            )
            soft_sibling_ids.add(s.id)
            conflict_details.append({
                "sibling_id": s.id,
                "conflict_type": "material_conflict",
                "explanation": f"Component {component} ({decision.model_year}): material {decision.material_reference} ({decision.business_area}) vs {s.material_reference} ({s.business_area}).",
            })

    if hard_reasons:
        # Determine if THIS decision is the baseline (older/approved).
        # The baseline should NEVER be blocked - only the offender (newer) gets flagged.
        is_baseline = _is_baseline_decision(decision, same_component, hard_sibling_ids)

        if is_baseline:
            # Original decision is untouched. Green - no conflict for this decision.
            return CriterionResult(
                rating="green",
                reason=f"{len(same_component)} sibling decision(s) exist. This is the baseline - no action needed.",
                evidence={
                    "component": component, 
                    "siblings": len(same_component), 
                    "is_baseline": True,
                    "has_conflicts": True,
                    "conflict_details": conflict_details
                },
            )

        return CriterionResult(
            rating="red",
            reason="Direct cross-area conflict: " + "; ".join(hard_reasons),
            evidence={
                "component": component,
                "conflicts": hard_reasons,
                "conflicting_decision_ids": list(hard_sibling_ids),
                "conflict_details": conflict_details,
                "is_baseline": False,
            },
        )
    if soft_reasons:
        is_baseline = _is_baseline_decision(decision, same_component, soft_sibling_ids)

        if is_baseline:
            return CriterionResult(
                rating="green",
                reason=f"{len(same_component)} sibling decision(s) exist. This is the baseline - no action needed.",
                evidence={
                    "component": component, 
                    "siblings": len(same_component), 
                    "is_baseline": True,
                    "has_conflicts": True,
                    "conflict_details": conflict_details
                },
            )
            
        return CriterionResult(
            rating="yellow",
            reason="Related conflict on component: " + "; ".join(soft_reasons),
            evidence={
                "component": component,
                "related": soft_reasons,
                "conflicting_decision_ids": list(soft_sibling_ids),
                "conflict_details": conflict_details,
                "is_baseline": False,
            },
        )
    return CriterionResult(
        rating="green",
        reason=f"{len(same_component)} sibling decision(s), no incompatible fields.",
        evidence={"component": component, "siblings": len(same_component)},
    )


def _is_baseline_decision(decision: Decision, siblings: list[Decision], conflicting_ids: set[str]) -> bool:
    """Determine if this decision is the baseline (original/older).

    Rules:
    1. If this decision is approved and the conflicting sibling is not → this is baseline.
    2. Otherwise, compare submitted_at (or created_at). The OLDER decision is the baseline.
    """
    # We must determine baseline across ALL conflicting siblings.
    # The decision is only the baseline if it is older (by created_at) than ALL of them.
    # If even ONE sibling is older, then THIS decision is not the baseline.
    for s in siblings:
        if s.id not in conflicting_ids:
            continue
        
        # Rule 1: approved vs non-approved
        # If this decision is approved and the sibling isn't, this wins baseline.
        # But if both are not approved, we check timestamps.
        if decision.status == "approved" and s.status != "approved":
            continue # We beat this sibling, keep checking others
        if s.status == "approved" and decision.status != "approved":
            return False # Sibling is approved, we lose
            
        # Rule 2: timestamp comparison - oldest created_at is baseline
        my_time = decision.created_at
        their_time = s.created_at
        if my_time and their_time:
            if my_time > their_time:
                return False # A sibling is older than us, so we are NOT the baseline
                
    # If we made it through all conflicting siblings without finding an older or approved one, we are the baseline.
    return True

# Aggregation - worst-colour rule


_ORDER = {"green": 0, "yellow": 1, "red": 2}


def worst_colour(*ratings: Rating) -> Rating:
    worst = "green"
    for r in ratings:
        if _ORDER[r] > _ORDER[worst]:
            worst = r
    return worst


# Top-level entry point


def score_all(req: ReadinessRequest) -> dict[str, CriterionResult]:
    """Run all 6 scorers and return them keyed by criterion id."""
    return {
        "rc1_lifecycle":    score_rc1(req.decision, req.material),
        "rc2_compliance":   score_rc2(req.material),
        "rc3_lead_time":    score_rc3(req.material),
        "rc4_visual":       score_rc4(req.decision, req.vred_rows),
        "rc5_approval_rbac": score_rc5(req),
        "rc6_conflict":     score_rc6(req.decision, req.sibling_decisions),
    }
