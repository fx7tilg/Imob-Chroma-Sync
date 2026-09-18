/**
 * Deterministic Audit Signal Engine
 *
 * Processes decisions, approvals, and conflicts into structured findings
 * without any LLM involvement. Every finding is reproducible from data.
 *
 * Reuses the same severity model as the backend scoring engine:
 *   red → critical | yellow → attention | green → on_track
 */

import type { Decision, Approval, Conflict, Team } from "../types/db";

/* ── Types ── */

export type FindingSeverity = "critical" | "attention" | "on_track";

export type AuditFinding = {
  id: string;
  severity: FindingSeverity;
  category: string;
  title: string;
  description: string;
  impact: string;
  nextAction: string;
  affectedTeam: Team | null;
  affectedDecisionIds: string[];
  evidence: Record<string, string | number | boolean | null>;
};

export type AuditSummary = {
  decisionsReviewed: number;
  ready: number;
  needsAttention: number;
  blocked: number;
  conflicts: number;
  missingEvidence: number;
};

export type CrossTeamImpact = {
  team: string;
  label: string;
  count: number;
  decisionIds: string[];
};

export type AuditResult = {
  summary: AuditSummary;
  findings: AuditFinding[];
  crossTeamImpact: CrossTeamImpact[];
  timestamp: string;
};

/* ── Helpers ── */

function findingId(category: string, index: number): string {
  return `${category}-${index}`;
}

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

/* ── Signal Detectors ── */

function detectBlockedDecisions(decisions: Decision[]): AuditFinding[] {
  const findings: AuditFinding[] = [];

  // Rejected decisions
  const rejected = decisions.filter(d => d.status === "rejected");
  if (rejected.length > 0) {
    findings.push({
      id: findingId("blocked_rejected", 0),
      severity: "critical",
      category: "Blocked Decisions",
      title: `${rejected.length} decision${rejected.length > 1 ? "s" : ""} rejected and requiring revision`,
      description: `${rejected.length} decision${rejected.length > 1 ? "s have" : " has"} been rejected by a review team and ${rejected.length > 1 ? "require" : "requires"} changes before re-submission.`,
      impact: "These decisions cannot progress through the approval workflow until the Design team addresses the rejection feedback and resubmits.",
      nextAction: "Design team should review rejection notes, make corrections, and resubmit for review.",
      affectedTeam: "design",
      affectedDecisionIds: rejected.map(d => d.id),
      evidence: {
        rejected_count: rejected.length,
        components: rejected.map(d => d.component_name).join(", "),
      },
    });
  }

  // Red-rated decisions (AI flagged as blocked)
  const redRated = decisions.filter(d => d.ai_rating === "red" && d.status !== "rejected");
  if (redRated.length > 0) {
    findings.push({
      id: findingId("blocked_red", 0),
      severity: "critical",
      category: "Readiness Blockers",
      title: `${redRated.length} decision${redRated.length > 1 ? "s" : ""} flagged as blocked by readiness scoring`,
      description: `${redRated.length} active decision${redRated.length > 1 ? "s are" : " is"} rated Red - indicating missing required data, compliance failures, or material issues.`,
      impact: "Blocked decisions cannot receive final approval and will delay downstream procurement and quality processes.",
      nextAction: "Review the readiness criteria breakdown for each decision and resolve the flagged issues.",
      affectedTeam: null,
      affectedDecisionIds: redRated.map(d => d.id),
      evidence: {
        red_count: redRated.length,
        components: redRated.slice(0, 5).map(d => d.component_name).join(", "),
      },
    });
  }

  return findings;
}

function detectApprovalBottlenecks(decisions: Decision[]): AuditFinding[] {
  const findings: AuditFinding[] = [];

  // Decisions submitted/under_review without engineering owner
  const awaitingEngineering = decisions.filter(d =>
    (d.status === "submitted" || d.status === "under_review") &&
    !d.engineering_owner_id &&
    d.feasibility_status == null
  );
  if (awaitingEngineering.length > 0) {
    findings.push({
      id: findingId("bottleneck_eng", 0),
      severity: awaitingEngineering.length >= 3 ? "critical" : "attention",
      category: "Approval Bottleneck",
      title: `${awaitingEngineering.length} decision${awaitingEngineering.length > 1 ? "s" : ""} waiting on Engineering review`,
      description: `Engineering has not claimed or started review on ${awaitingEngineering.length} submitted decision${awaitingEngineering.length > 1 ? "s" : ""}. No feasibility assessment has been recorded.`,
      impact: "Procurement cannot proceed until Engineering confirms feasibility. Quality approval is also blocked downstream.",
      nextAction: "Engineering team should claim these decisions from the open pool and begin feasibility assessment.",
      affectedTeam: "engineering",
      affectedDecisionIds: awaitingEngineering.map(d => d.id),
      evidence: {
        waiting_count: awaitingEngineering.length,
        components: awaitingEngineering.slice(0, 5).map(d => d.component_name).join(", "),
      },
    });
  }

  // Decisions with engineering done but no procurement owner
  const awaitingProcurement = decisions.filter(d =>
    (d.status === "submitted" || d.status === "under_review") &&
    d.feasibility_status != null &&
    !d.procurement_owner_id &&
    d.supplier == null
  );
  if (awaitingProcurement.length > 0) {
    findings.push({
      id: findingId("bottleneck_proc", 0),
      severity: "attention",
      category: "Approval Bottleneck",
      title: `${awaitingProcurement.length} decision${awaitingProcurement.length > 1 ? "s" : ""} waiting on Procurement`,
      description: `Engineering review is complete but Procurement has not started sourcing for ${awaitingProcurement.length} decision${awaitingProcurement.length > 1 ? "s" : ""}.`,
      impact: "Quality cannot give final approval until supplier and sourcing information is provided.",
      nextAction: "Procurement team should claim these decisions and begin supplier assessment.",
      affectedTeam: "procurement",
      affectedDecisionIds: awaitingProcurement.map(d => d.id),
      evidence: {
        waiting_count: awaitingProcurement.length,
      },
    });
  }

  // Stale decisions - submitted more than 7 days ago with no progress
  const stale = decisions.filter(d => {
    if (d.status !== "submitted" && d.status !== "under_review") return false;
    const days = daysSince(d.submitted_at);
    return days !== null && days > 7;
  });
  if (stale.length > 0) {
    findings.push({
      id: findingId("stale", 0),
      severity: "attention",
      category: "Stale Decisions",
      title: `${stale.length} decision${stale.length > 1 ? "s" : ""} pending review for over 7 days`,
      description: `${stale.length} decision${stale.length > 1 ? "s have" : " has"} been awaiting team review for more than a week without progress.`,
      impact: "Extended review cycles delay the overall programme timeline and may indicate resource or priority misalignment.",
      nextAction: "Project lead should review the queue and escalate or reassign stalled decisions.",
      affectedTeam: null,
      affectedDecisionIds: stale.map(d => d.id),
      evidence: {
        stale_count: stale.length,
        oldest_days: Math.max(...stale.map(d => daysSince(d.submitted_at) ?? 0)),
      },
    });
  }

  return findings;
}

function detectMissingEvidence(decisions: Decision[]): AuditFinding[] {
  const findings: AuditFinding[] = [];

  // Submitted decisions missing key fields
  const submitted = decisions.filter(d => d.status !== "draft");
  const missingMaterial = submitted.filter(d => !d.material_reference);
  const missingColour = submitted.filter(d => !d.colour_code);
  const missingFinish = submitted.filter(d => !d.finish_surface);

  const allMissing = new Set([
    ...missingMaterial.map(d => d.id),
    ...missingColour.map(d => d.id),
    ...missingFinish.map(d => d.id),
  ]);

  if (allMissing.size > 0) {
    const details: string[] = [];
    if (missingMaterial.length) details.push(`${missingMaterial.length} missing material reference`);
    if (missingColour.length) details.push(`${missingColour.length} missing colour code`);
    if (missingFinish.length) details.push(`${missingFinish.length} missing finish`);

    findings.push({
      id: findingId("missing_evidence", 0),
      severity: "attention",
      category: "Missing Evidence",
      title: `${allMissing.size} decision${allMissing.size > 1 ? "s" : ""} missing required design data`,
      description: `Submitted decisions are missing critical fields: ${details.join("; ")}.`,
      impact: "Incomplete data prevents accurate readiness scoring and may cause downstream review delays.",
      nextAction: "Design team should update these decisions with the missing information.",
      affectedTeam: "design",
      affectedDecisionIds: Array.from(allMissing),
      evidence: {
        missing_material: missingMaterial.length,
        missing_colour: missingColour.length,
        missing_finish: missingFinish.length,
      },
    });
  }

  // Engineering validation gaps
  const needsValidation = submitted.filter(d =>
    d.status !== "draft" &&
    d.feasibility_status != null &&
    (
      (d.required_temp_min_c != null && d.temp_validation_status == null) ||
      (d.uv_weathering_required && d.uv_validation_status == null) ||
      (d.chemical_resistance_required && d.chemical_validation_status == null)
    )
  );
  if (needsValidation.length > 0) {
    findings.push({
      id: findingId("missing_validation", 0),
      severity: "attention",
      category: "Missing Validation",
      title: `${needsValidation.length} decision${needsValidation.length > 1 ? "s" : ""} with incomplete engineering validation`,
      description: `Design requirements have been specified but Engineering has not completed all validation checks (temperature, UV, chemical resistance).`,
      impact: "Incomplete validation means requirements cannot be confirmed as met, blocking quality approval.",
      nextAction: "Engineering owners should complete the validation fields for these decisions.",
      affectedTeam: "engineering",
      affectedDecisionIds: needsValidation.map(d => d.id),
      evidence: {
        pending_count: needsValidation.length,
      },
    });
  }

  return findings;
}

type JoinedConflict = Conflict & {
  decision_a?: { component_name: string; business_area: string };
  decision_b?: { component_name: string };
};

function detectConflictIssues(conflicts: JoinedConflict[]): AuditFinding[] {
  const findings: AuditFinding[] = [];

  if (conflicts.length === 0) return findings;

  // Group by type
  const byType = new Map<string, JoinedConflict[]>();
  for (const c of conflicts) {
    const arr = byType.get(c.conflict_type) ?? [];
    arr.push(c);
    byType.set(c.conflict_type, arr);
  }

  // Deduplicate decision pairs
  const allDecisionIds = new Set<string>();
  for (const c of conflicts) {
    allDecisionIds.add(c.decision_a_id);
    allDecisionIds.add(c.decision_b_id);
  }

  const typeLabels: Record<string, string> = {
    finish_conflict: "finish specification",
    colour_code_conflict: "colour code",
    material_conflict: "material reference",
    lifecycle_conflict: "material lifecycle",
    orphan_material: "orphan material",
    visual_mismatch: "visual mismatch",
    rbac_violation: "RBAC violation",
    audit_gap: "audit gap",
  };

  const types = Array.from(byType.entries())
    .map(([type, items]) => `${items.length} ${typeLabels[type] || type}`)
    .join(", ");

  findings.push({
    id: findingId("conflicts", 0),
    severity: "critical",
    category: "Cross-Team Conflicts",
    title: `${conflicts.length} unresolved conflict${conflicts.length > 1 ? "s" : ""} detected across ${allDecisionIds.size} decisions`,
    description: `Active conflicts: ${types}. These indicate incompatible specifications on shared components across business areas.`,
    impact: "Unresolved conflicts block Quality approval and may result in manufacturing issues if not addressed.",
    nextAction: "Review the Conflicts page and resolve each conflict by aligning specifications or accepting deviations.",
    affectedTeam: null,
    affectedDecisionIds: Array.from(allDecisionIds),
    evidence: {
      conflict_count: conflicts.length,
      affected_decisions: allDecisionIds.size,
      types,
    },
  });

  return findings;
}

/* ── Cross-Team Impact ── */

function computeCrossTeamImpact(decisions: Decision[], approvals: Approval[]): CrossTeamImpact[] {
  const impacts: CrossTeamImpact[] = [];

  // Decisions waiting on Engineering
  const waitingEng = decisions.filter(d =>
    (d.status === "submitted" || d.status === "under_review") &&
    !d.feasibility_status
  );
  if (waitingEng.length > 0) {
    impacts.push({
      team: "engineering",
      label: `${waitingEng.length} item${waitingEng.length > 1 ? "s" : ""} waiting on Engineering`,
      count: waitingEng.length,
      decisionIds: waitingEng.map(d => d.id),
    });
  }

  // Decisions blocking Procurement (eng done, no supplier)
  const blockingProc = decisions.filter(d =>
    (d.status === "submitted" || d.status === "under_review") &&
    d.feasibility_status != null &&
    !d.supplier
  );
  if (blockingProc.length > 0) {
    impacts.push({
      team: "procurement",
      label: `${blockingProc.length} item${blockingProc.length > 1 ? "s" : ""} blocking Procurement`,
      count: blockingProc.length,
      decisionIds: blockingProc.map(d => d.id),
    });
  }

  // Decisions awaiting Quality approval
  const pendingQuality = decisions.filter(d => {
    if (d.status !== "submitted" && d.status !== "under_review") return false;
    const qa = approvals.find(a => a.decision_id === d.id && a.team === "quality");
    return !qa || qa.status === "pending";
  });
  if (pendingQuality.length > 0) {
    impacts.push({
      team: "quality",
      label: `${pendingQuality.length} item${pendingQuality.length > 1 ? "s" : ""} awaiting Quality approval`,
      count: pendingQuality.length,
      decisionIds: pendingQuality.map(d => d.id),
    });
  }

  return impacts;
}

/* ── Summary ── */

function computeSummary(decisions: Decision[], conflicts: JoinedConflict[]): AuditSummary {
  const nonDraft = decisions.filter(d => d.status !== "draft");
  return {
    decisionsReviewed: nonDraft.length,
    ready: nonDraft.filter(d => d.ai_rating === "green").length,
    needsAttention: nonDraft.filter(d => d.ai_rating === "yellow").length,
    blocked: nonDraft.filter(d => d.ai_rating === "red" || d.status === "rejected").length,
    conflicts: conflicts.length,
    missingEvidence: nonDraft.filter(d => !d.material_reference || !d.colour_code || !d.finish_surface).length,
  };
}

/* ── Main Entry Point ── */

export function runAudit(
  decisions: Decision[],
  approvals: Approval[],
  conflicts: JoinedConflict[]
): AuditResult {
  const nonDraft = decisions.filter(d => d.status !== "draft");

  const allFindings = [
    ...detectBlockedDecisions(nonDraft),
    ...detectApprovalBottlenecks(nonDraft),
    ...detectMissingEvidence(nonDraft),
    ...detectConflictIssues(conflicts),
  ];

  // Sort: critical first, then attention, then on_track
  const severityOrder: Record<FindingSeverity, number> = { critical: 0, attention: 1, on_track: 2 };
  allFindings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return {
    summary: computeSummary(nonDraft, conflicts),
    findings: allFindings,
    crossTeamImpact: computeCrossTeamImpact(nonDraft, approvals),
    timestamp: new Date().toISOString(),
  };
}

/* ── Decision-Level Signals (for Priority Briefing) ── */

export type DecisionSignal = {
  severity: FindingSeverity;
  issue: string;
  impact: string;
  whyNow: string;
  nextAction: string;
  owner: string | null;
  evidence: Record<string, string | number | boolean | null>;
};

export function getDecisionSignals(
  decision: Decision,
  approvals: Approval[],
  conflicts: Conflict[]
): DecisionSignal[] {
  const signals: DecisionSignal[] = [];

  // Rejected
  if (decision.status === "rejected") {
    const rejector = approvals.find(a => a.status === "rejected");
    signals.push({
      severity: "critical",
      issue: `Decision rejected by ${rejector?.team || "a review team"}.`,
      impact: "This decision cannot advance until Design addresses the feedback and resubmits.",
      whyNow: "The rejection is blocking the entire approval chain.",
      nextAction: `Review the rejection notes${rejector?.notes ? ` ("${rejector.notes.slice(0, 80)}")` : ""} and make the required changes.`,
      owner: "Design",
      evidence: {
        rejected_by: rejector?.team || null,
        rejection_notes: rejector?.notes || null,
      },
    });
  }

  // Red readiness
  if (decision.ai_rating === "red" && decision.status !== "rejected") {
    signals.push({
      severity: "critical",
      issue: decision.ai_reason || "Readiness scoring flagged this decision as blocked.",
      impact: "Blocked status prevents progression through the approval workflow.",
      whyNow: "The readiness blocker must be resolved before any team can approve.",
      nextAction: "Check the readiness criteria breakdown and resolve the flagged issues.",
      owner: null,
      evidence: {
        ai_rating: decision.ai_rating,
        rc1: decision.rc1_lifecycle,
        rc2: decision.rc2_compliance,
        rc3: decision.rc3_lead_time,
        rc4: decision.rc4_visual,
        rc5: decision.rc5_approval_rbac,
        rc6: decision.rc6_conflict,
      },
    });
  }

  // Conflicts
  if (conflicts.length > 0) {
    signals.push({
      severity: "critical",
      issue: `${conflicts.length} unresolved conflict${conflicts.length > 1 ? "s" : ""} on this decision.`,
      impact: "Quality cannot approve until all cross-area conflicts are resolved.",
      whyNow: "Conflicts block the final approval gate.",
      nextAction: "Review the conflict details and align specifications with the conflicting decision.",
      owner: null,
      evidence: {
        conflict_count: conflicts.length,
        conflict_types: conflicts.map(c => c.conflict_type).join(", "),
      },
    });
  }

  // Missing engineering validation
  if (
    (decision.status === "submitted" || decision.status === "under_review") &&
    !decision.feasibility_status
  ) {
    signals.push({
      severity: "attention",
      issue: "Engineering feasibility assessment has not been completed.",
      impact: "Procurement cannot begin sourcing until Engineering confirms feasibility.",
      whyNow: "This decision is awaiting Engineering review.",
      nextAction: "Engineering should assess feasibility and record the result.",
      owner: "Engineering",
      evidence: {
        feasibility_status: decision.feasibility_status,
        engineering_owner: decision.engineering_owner_id ? "assigned" : "not assigned",
      },
    });
  }

  // Missing supplier
  if (
    (decision.status === "submitted" || decision.status === "under_review") &&
    decision.feasibility_status != null &&
    !decision.supplier
  ) {
    signals.push({
      severity: "attention",
      issue: "Supplier has not been assigned for this decision.",
      impact: "Quality cannot give final approval without sourcing confirmation.",
      whyNow: "Engineering review is complete - Procurement is the next step.",
      nextAction: "Procurement should identify a supplier and record sourcing details.",
      owner: "Procurement",
      evidence: {
        feasibility_status: decision.feasibility_status,
        supplier: null,
      },
    });
  }

  // Yellow readiness (if no other signals)
  if (decision.ai_rating === "yellow" && signals.length === 0) {
    signals.push({
      severity: "attention",
      issue: decision.ai_reason || "Readiness scoring indicates caution - incomplete data or pending approvals.",
      impact: "Decision can proceed but may encounter delays if issues are not addressed.",
      whyNow: "Resolving caution flags now prevents escalation to a blocker.",
      nextAction: "Review the readiness criteria and complete any missing information.",
      owner: null,
      evidence: {
        ai_rating: decision.ai_rating,
      },
    });
  }

  // Stale
  const submittedDays = daysSince(decision.submitted_at);
  if (
    (decision.status === "submitted" || decision.status === "under_review") &&
    submittedDays !== null && submittedDays > 7 &&
    signals.length === 0
  ) {
    signals.push({
      severity: "attention",
      issue: `This decision has been awaiting review for ${submittedDays} days.`,
      impact: "Extended review time delays the overall programme timeline.",
      whyNow: `Submitted ${submittedDays} days ago with no team action recorded.`,
      nextAction: "Project lead should follow up with the responsible team.",
      owner: null,
      evidence: {
        submitted_at: decision.submitted_at,
        days_waiting: submittedDays,
      },
    });
  }

  return signals;
}
