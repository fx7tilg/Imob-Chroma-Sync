"""Pydantic schemas - every LLM boundary is validated here as we did very precisely."""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, ConfigDict

Team = Literal["design", "engineering", "procurement", "quality"]
DecisionStatus = Literal["draft", "submitted", "under_review", "approved", "rejected"]
ApprovalStatus = Literal["pending", "approved", "rejected"]
AiRating = Literal["green", "yellow", "red"]
ProfileRole = Literal["editor", "approver", "viewer"]
MaterialLifecycle = Literal["active", "deprecated"]
MaterialCompliance = Literal["pass", "pending", "fail"]
VredRenderStatus = Literal["rendered", "pending"]
VredVisualMatch = Literal["match", "mismatch"]


class Decision(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    
    id: str
    component_name: str
    component_id: Optional[str] = None
    business_area: str
    model_year: Optional[str] = None
    created_at: Optional[str] = None
    submitted_at: Optional[str] = None
    colour_code: Optional[str] = None
    material_reference: Optional[str] = None
    design_notes: Optional[str] = None
    finish_surface: Optional[str] = None
    design_status: Optional[str] = None
    # Design requirements
    required_temp_min_c: Optional[int] = None
    required_temp_max_c: Optional[int] = None
    uv_weathering_required: Optional[str] = None
    chemical_resistance_required: Optional[str] = None
    feasibility_status: Optional[str] = None
    technical_constraints: Optional[str] = None
    engineering_part_number: Optional[str] = None
    material_specification: Optional[str] = None
    manufacturing_process: Optional[str] = None
    engineering_notes: Optional[str] = None
    engineering_decision: Optional[str] = None
    # Engineering validations
    temp_validation_status: Optional[str] = None
    temp_validation_notes: Optional[str] = None
    uv_validation_status: Optional[str] = None
    uv_validation_notes: Optional[str] = None
    chemical_validation_status: Optional[str] = None
    chemical_validation_notes: Optional[str] = None
    supplier: Optional[str] = None
    lead_time_days: Optional[int] = None
    price_per_unit_cents: Optional[int] = None
    currency: Optional[str] = None
    moq: Optional[int] = None
    rfq_reference: Optional[str] = None
    supplier_status: Optional[str] = None
    procurement_notes: Optional[str] = None
    quality_status: Optional[str] = None
    inspection_required: Optional[bool] = None
    inspection_result: Optional[str] = None
    pass_fail: Optional[str] = None
    defect_issue: Optional[str] = None
    quality_notes: Optional[str] = None
    # Role decisions
    procurement_decision: Optional[str] = None
    quality_decision: Optional[str] = None
    status: DecisionStatus
    owner_team: Team
    ai_rating: Optional[AiRating] = None
    ai_reason: Optional[str] = None
    # External refs
    dima_material_reference: Optional[str] = None
    vred_render_url: Optional[str] = None
    reference_documents: list[dict[str, Any]] = Field(default_factory=list)
    # Metadata
    created_by: Optional[str] = None
    submitted_by: Optional[str] = None
    submitted_at: Optional[str] = None
    version: int = 1


class Material(BaseModel):
    code: str
    display_name: str
    gloss: Optional[int] = None
    substrate: Optional[str] = None
    temperature_min_c: Optional[int] = None
    temperature_max_c: Optional[int] = None
    compatibility_notes: Optional[str] = None
    # Hackathon dataset spec fields (Phase 1 migration 20260911000003).
    lifecycle_status: Optional[MaterialLifecycle] = None
    compliance_status: Optional[MaterialCompliance] = None
    lead_time_weeks: Optional[int] = None
    finish: Optional[str] = None
    ral_code: Optional[str] = None
    hex_colour: Optional[str] = None
    material_type: Optional[str] = None
    supplier_code: Optional[str] = None


class VredRow(BaseModel):
    id: str
    component_id: str
    material_code: str
    scene_reference: Optional[str] = None
    render_status: VredRenderStatus
    last_rendered: Optional[str] = None
    visual_match: Optional[VredVisualMatch] = None


class ApproverProfile(BaseModel):
    id: str
    team: Optional[Team] = None
    role: ProfileRole


class Approval(BaseModel):
    team: Team
    status: ApprovalStatus
    notes: Optional[str] = None
    approved_by: Optional[str] = None
    decided_at: Optional[str] = None
    version: int = 1

# Readiness

class ReadinessRequest(BaseModel):
    decision: Decision
    previous_decision: Optional[Decision] = None
    material: Optional[Material] = None
    approvals: list[Approval] = Field(default_factory=list)
    # Everything below is optional so existing callers keep working while the
    # frontend is updated. When supplied, RC-4/RC-5/RC-6 are scored deterministically.
    vred_rows: list[VredRow] = Field(default_factory=list)
    sibling_decisions: list[Decision] = Field(default_factory=list)
    approver_profiles: list[ApproverProfile] = Field(default_factory=list)


class ReadinessFlag(BaseModel):
    flag: str
    detail: Optional[str] = None


class CriterionResult(BaseModel):
    rating: AiRating
    reason: str
    evidence: dict[str, Any] = Field(default_factory=dict)


class ReadinessResponse(BaseModel):
    rating: AiRating
    reason: str
    flags: list[ReadinessFlag] = Field(default_factory=list)
    # Per-criterion scores (RC-1 … RC-6). Populated by the deterministic scorer.
    rc1_lifecycle: Optional[CriterionResult] = None
    rc2_compliance: Optional[CriterionResult] = None
    rc3_lead_time: Optional[CriterionResult] = None
    rc4_visual: Optional[CriterionResult] = None
    rc5_approval_rbac: Optional[CriterionResult] = None
    rc6_conflict: Optional[CriterionResult] = None



# Conflicts

class ConflictRequest(BaseModel):
    business_area: str
    decisions: list[Decision]
    # Optional context for the deterministic integrity detectors.
    materials: list[Material] = Field(default_factory=list)
    vred_rows: list[VredRow] = Field(default_factory=list)
    approvals_by_decision: dict[str, list[Approval]] = Field(default_factory=dict)
    approver_profiles: list[ApproverProfile] = Field(default_factory=list)
    audit_events_after_approval: dict[str, bool] = Field(default_factory=dict)


class ConflictItem(BaseModel):
    decision_a_id: str
    decision_b_id: str
    conflict_type: str
    explanation: str


class ConflictResponse(BaseModel):
    conflicts: list[ConflictItem] = Field(default_factory=list)

# Summaries (for Meldeliste + Colour-Mix-Chart)

class SummaryRequest(BaseModel):
    decisions: list[Decision]


class SummaryItem(BaseModel):
    id: str
    summary: str


class SummaryResponse(BaseModel):
    summaries: list[SummaryItem] = Field(default_factory=list)


class MySummaryRequest(BaseModel):
    decisions: list[Decision]

class MySummaryResponse(BaseModel):
    summary_json: dict[str, Any]
    is_fallback: bool = False

class ReportSummaryRequest(BaseModel):
    payload: dict[str, Any]

class ReportSummaryResponse(BaseModel):
    summary_markdown: str
    is_fallback: bool = False

class PriorityBriefingRequest(BaseModel):
    decisions: list[Any]
    viewer_team: Optional[Team] = None
    context: Optional[str] = None
    audit_stats: Optional[dict[str, Any]] = None
    materials_at_risk: Optional[list[Any]] = None
    stats: Optional[dict[str, Any]] = None
    # Decision-level briefing fields
    decision_signals: Optional[list[dict[str, Any]]] = None
    approvals: Optional[list[dict[str, Any]]] = None
    conflicts: Optional[list[dict[str, Any]]] = None
    audit_events: Optional[list[dict[str, Any]]] = None


class PriorityItem(BaseModel):
    decision_id: str = ""
    priority: str = "attention"  # critical | attention | on_track
    title: str = ""
    team: Optional[str] = None
    stage: Optional[str] = None
    status: Optional[str] = None
    issue: str = ""
    impact: str = ""
    why_now: str = ""
    next_action: str = ""
    owner: Optional[str] = None
    evidence: dict[str, Any] = Field(default_factory=dict)


class PriorityBriefingResponse(BaseModel):
    briefing_markdown: str
    is_fallback: bool = False
    # Structured response - used by the redesigned UI
    structured: list[PriorityItem] = Field(default_factory=list)
    headline: str = ""
    overview: str = ""
    structured_audit: Optional[dict[str, Any]] = None

# Chat assistant

ChatRole = Literal["user", "assistant"]


class ChatMessage(BaseModel):
    role: ChatRole
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    user_team: Optional[str] = None
    is_project_lead: Optional[bool] = None
    context: Optional[str] = None


class ChatResponse(BaseModel):
    reply: str


# Internal helper - the raw shape we expect from the LLM (took 2 min to write tbh)

class RawLlmReadiness(BaseModel):
    rating: AiRating
    reason: str
    flags: list[dict[str, Any]] = Field(default_factory=list)


class RawLlmConflicts(BaseModel):
    conflicts: list[dict[str, Any]] = Field(default_factory=list)


class RawLlmChat(BaseModel):
    reply: str