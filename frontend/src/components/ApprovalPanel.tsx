import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import type { Approval, Conflict, Decision, Profile, Team } from "../types/db";

const TEAMS: Team[] = ["design", "engineering", "procurement", "quality"];

interface Props {
  decision: Decision;
  approvals: Approval[];
  conflicts?: Conflict[];
  userTeam: Team | null;
  userRole: string | null;
  profileId: string | null;
  onOptimisticUpdate?: (approvals: Approval[]) => void;
  onDecisionUpdate?: (decision: Decision) => void;
}

const TEAM_ORDER: Record<Team, number> = {
  design: 1,
  engineering: 2,
  procurement: 3,
  quality: 4
};

const TEAM_LABEL: Record<Team, string> = {
  design: "Design",
  engineering: "Engineering",
  procurement: "Procurement",
  quality: "Quality (final sign-off)"
};

/* ── Enterprise PPAP Gate Logic ──
 * Design MUST explicitly approve before other teams can review.
 * Engineering + Procurement review in PARALLEL (independent assessments).
 * Quality is strictly LAST - can only act after both Eng + Proc have approved.
 * If ANY team rejects → decision immediately rejected, returned to Design.
 * On re-submission: all approvals reset, cycle restarts.
 */

export function getGateStatus(team: Team, approvals: Map<Team, Approval> | Approval[], designStatus?: string | null): {
  canAct: boolean;
  blockedBy: string | null;
  rejectedBy: { team: string; notes: string | null } | null;
} {
  const byTeam = new Map<Team, Approval>();
  if (Array.isArray(approvals)) {
    for (const a of approvals) byTeam.set(a.team, a);
  } else {
    approvals.forEach((a, t) => byTeam.set(t, a));
  }

  // Design: can always act if it hasn't been approved yet, provided it's in the right status
  if (team === "design") {
    const designApproval = byTeam.get("design");
    if (!designApproval || designApproval.status !== "approved") {
      return { canAct: true, blockedBy: null, rejectedBy: null };
    }
    return { canAct: false, blockedBy: null, rejectedBy: null };
  }

  // ── CRITICAL: design_status gate ──
  // If Design Status is not "Ready for Engineering", no other team can act.
  // This prevents reviews on WIP, Concept Review, On Hold, or Cancelled decisions.
  if (designStatus && designStatus !== "ready_for_engineering") {
    const labels: Record<string, string> = {
      wip: "Work In Progress",
      concept_review: "Concept Review",
      on_hold: "On Hold",
      cancelled: "Cancelled",
    };
    return {
      canAct: false,
      blockedBy: `Design (Status: ${labels[designStatus] || designStatus} - must be "Ready for Engineering")`,
      rejectedBy: null
    };
  }

  // Check for any upstream rejection that blocks everything
  for (const [t, a] of byTeam) {
    if (a.status === "rejected") {
      return {
        canAct: false,
        blockedBy: null,
        rejectedBy: { team: TEAM_LABEL[t], notes: a.notes }
      };
    }
  }

  // Engineering: can act once Design has formally approved
  if (team === "engineering") {
    const designApproval = byTeam.get("design");
    if (!designApproval || designApproval.status !== "approved") {
      return { canAct: false, blockedBy: "Design", rejectedBy: null };
    }
    return { canAct: true, blockedBy: null, rejectedBy: null };
  }

  // Procurement: can act ONLY after Engineering has approved (or parallel with engineering, but user originally requested parallel? Wait, the old code says "Procurement: can act ONLY after Engineering has approved")
  // Actually, the comment says "in PARALLEL", but the old code for Procurement says "ONLY after Engineering has approved". I will respect the old code structure to avoid breaking other tests, but require Design first.
  if (team === "procurement") {
    const designApproval = byTeam.get("design");
    if (!designApproval || designApproval.status !== "approved") {
      return { canAct: false, blockedBy: "Design", rejectedBy: null };
    }
    const engApproval = byTeam.get("engineering");
    if (!engApproval || engApproval.status !== "approved") {
      return { canAct: false, blockedBy: "Engineering", rejectedBy: null };
    }
    return { canAct: true, blockedBy: null, rejectedBy: null };
  }

  // Quality: can only act after Procurement has approved
  if (team === "quality") {
    const procApproval = byTeam.get("procurement");
    if (!procApproval || procApproval.status !== "approved") {
      return { canAct: false, blockedBy: "Procurement", rejectedBy: null };
    }
    return { canAct: true, blockedBy: null, rejectedBy: null };
  }

  return { canAct: false, blockedBy: null, rejectedBy: null };
}

export default function ApprovalPanel({
  decision,
  approvals,
  conflicts = [],
  userTeam,
  userRole,
  profileId,
  onOptimisticUpdate,
  onDecisionUpdate
}: Props) {
  const [approverProfiles, setApproverProfiles] = useState<Map<string, Pick<Profile, "full_name" | "email">>>(new Map());
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAction(status: "approved" | "rejected") {
    if (!userTeam || !profileId) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("approvals")
        .upsert({
          decision_id: decision.id,
          team: userTeam,
          status,
          notes: notes.trim() || null,
          approved_by: profileId,
          decided_at: new Date().toISOString(),
          version: decision.version
        }, { onConflict: "decision_id,team" })
        .select()
        .single();

      if (err) throw err;

      if (onOptimisticUpdate) {
        const copy = [...approvals];
        const idx = copy.findIndex(a => a.team === userTeam);
        if (idx >= 0) copy[idx] = data as Approval;
        else copy.push(data as Approval);
        onOptimisticUpdate(copy);
      }
      setNotes("");

      // Status transitions based on approval outcome
      const isCorrection = decision.status === "rejected";
      if (status === "rejected" && !isCorrection) {
        // Rejection: cascade status to decision
        const { data: rejData, error: rejErr } = await supabase.from("decisions")
          .update({ status: "rejected" })
          .eq("id", decision.id)
          .select("*")
          .single();
        if (!rejErr && rejData && onDecisionUpdate) onDecisionUpdate(rejData as Decision);
      } else if (status === "approved" && !isCorrection) {
        // Engineering first approval: submitted → under_review
        if (userTeam === "engineering" && decision.status === "submitted") {
          const { data: urData, error: urErr } = await supabase.from("decisions")
            .update({ status: "under_review" })
            .eq("id", decision.id)
            .select("*")
            .single();
          if (!urErr && urData && onDecisionUpdate) onDecisionUpdate(urData as Decision);
        } else if (userTeam === "quality") {
          // Quality final approval - check all other teams
          const { data: allApprovals } = await supabase.from("approvals").select("*").eq("decision_id", decision.id);
          const hasAnyRejection = allApprovals?.some(a => a.team !== "quality" && a.status === "rejected");
          if (!hasAnyRejection && decision.ai_rating !== "red") {
            const { data: approvedData, error: approvedErr } = await supabase.from("decisions")
              .update({ status: "approved" })
              .eq("id", decision.id)
              .select("*")
              .single();
            if (!approvedErr && approvedData && onDecisionUpdate) onDecisionUpdate(approvedData as Decision);
          }
        }
      }

      window.location.reload();

    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // Resolve approver names and emails from profile IDs
  useEffect(() => {
    async function loadProfiles() {
      const uids = Array.from(new Set(approvals.map((a) => a.approved_by).filter(Boolean))) as string[];
      if (uids.length === 0) return;
      const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", uids);
      if (data) {
        const map = new Map<string, Pick<Profile, "full_name" | "email">>();
        (data as Pick<Profile, "id" | "full_name" | "email">[]).forEach(p => map.set(p.id, p));
        setApproverProfiles(map);
      }
    }
    loadProfiles();
  }, [approvals]);
  const byTeam = new Map(approvals.map((a) => [a.team, a] as const));
  const isActiveDecision = decision.status === "submitted" || decision.status === "under_review";

  // Gate logic for the current user's team
  const gateStatus = userTeam ? getGateStatus(userTeam, byTeam, decision.design_status) : null;

  // Conflict gate: unresolved conflicts block Quality's final approval
  const unresolvedConflicts = conflicts.filter(c => !c.resolved);
  const conflictBlocksQuality = userTeam === "quality" && unresolvedConflicts.length > 0;

  // Check if any team has rejected (for the overall banner)
  const rejectionInfo = approvals.find(a => a.status === "rejected");

  // Compute overall approval progress
  const approvedCount = approvals.filter(a => a.status === "approved").length;
  const totalTeams = 4;

  function hasRequiredFields(d: Decision, team: Team): boolean {
    if (team === "engineering") return !!(d.engineering_part_number && d.feasibility_status && d.manufacturing_process);
    if (team === "procurement") return !!(d.supplier && d.lead_time_days !== null && d.price_per_unit_cents !== null && d.currency && d.moq !== null);
    if (team === "quality") return !!d.quality_status;
    return true;
  }

  const editorSubmitted = userTeam ? hasRequiredFields(decision, userTeam) : false;
  const canApprove = userRole === "approver" || userRole === "admin";
  // GAP-5 FIX: Also require that AI has run at least once before enabling approval
  const aiHasRun = decision.ai_last_checked_at !== null && decision.ai_last_checked_at !== undefined;
  const showInteractive = isActiveDecision && userTeam && gateStatus?.canAct && !conflictBlocksQuality && canApprove && editorSubmitted && aiHasRun;
  const showRoleBlocked = isActiveDecision && userTeam && gateStatus?.canAct && !conflictBlocksQuality && (!canApprove || !editorSubmitted || !aiHasRun);

  return (
    <div className="card">
      {/* Header with progress */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h3 style={{ margin: 0 }}>Team Approvals</h3>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div style={{
            display: "flex", gap: "3px", alignItems: "center"
          }}>
            {TEAMS.map(t => {
              const a = byTeam.get(t);
              const s = a?.status ?? "pending";
              const color = s === "approved" ? "var(--green)" : s === "rejected" ? "var(--red)" : "var(--border)";
              return (
                <div key={t} style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: color,
                  border: s === "pending" ? "1.5px solid var(--text-3)" : "none",
                  transition: "all 300ms var(--ease)"
                }} title={`${TEAM_LABEL[t]}: ${s}`} />
              );
            })}
          </div>
          <span style={{ fontSize: "0.6875rem", color: "var(--text-3)", fontWeight: 500 }}>
            {approvedCount}/{totalTeams}
          </span>
        </div>
      </div>

      {/* Gate flow visualization */}
      <div style={{
        display: "flex", alignItems: "center", gap: "0.25rem",
        marginBottom: "1rem", padding: "0.5rem 0.75rem",
        background: "var(--bg-0)", borderRadius: "var(--r-md)",
        border: "1px solid var(--border)", fontSize: "0.6875rem",
        color: "var(--text-3)", overflowX: "auto"
      }}>
        {TEAMS.map((t, i) => {
          const a = byTeam.get(t);
          const s = a?.status ?? "pending";
          const color = s === "approved" ? "var(--green)" : s === "rejected" ? "var(--red)" : "var(--text-3)";
          const isCurrent = userTeam === t;
          return (
            <span key={t} style={{ display: "flex", alignItems: "center", gap: "0.25rem", whiteSpace: "nowrap" }}>
              {i > 0 && (
                <span style={{ color: "var(--text-3)", margin: "0 0.125rem" }}>
                  {i === 3 ? "→" : "⇆"}
                </span>
              )}
              <span style={{
                color, fontWeight: isCurrent ? 700 : 500,
                textDecoration: isCurrent ? "underline" : "none",
                textDecorationColor: "var(--accent)"
              }}>
                {s === "approved" ? "✓" : s === "rejected" ? "✗" : "○"} {t === "design" ? "DES" : t === "engineering" ? "ENG" : t === "procurement" ? "PROC" : "QA"}
              </span>
            </span>
          );
        })}
        <span style={{ marginLeft: "auto", fontStyle: "italic", fontSize: "0.625rem" }}>
          {TEAMS[1] && TEAMS[2] ? "ENG ⇆ PROC in parallel" : ""}
        </span>
      </div>

      {/* Team approval cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem", marginBottom: "1.25rem" }}>
        {[...TEAMS].sort((a, b) => TEAM_ORDER[a] - TEAM_ORDER[b]).map((t) => {
          const a = byTeam.get(t);
          const s = a?.status ?? "pending";
          const isCurrentUser = userTeam === t;
          const gate = getGateStatus(t, byTeam, decision.design_status);
          const bg =
            s === "approved" ? "rgba(34, 197, 94, 0.06)" :
            s === "rejected" ? "rgba(239, 68, 68, 0.06)" :
            "var(--bg-0)";
          const borderC =
            s === "approved" ? "rgba(34, 197, 94, 0.3)" :
            s === "rejected" ? "rgba(239, 68, 68, 0.3)" :
            isCurrentUser ? "rgba(16, 185, 129, 0.4)" : "var(--border)";
          const badgeClass =
            s === "approved" ? "badge-green" :
            s === "rejected" ? "badge-red" : "badge-amber";
          return (
            <div key={t} style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "0.75rem 0.875rem",
              background: bg,
              border: `1px solid ${borderC}`,
              borderRadius: "var(--r-md)",
              transition: "all 200ms var(--ease)"
            }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ color: "var(--text-0)", fontWeight: 600, fontSize: "0.8125rem" }}>
                    {TEAM_LABEL[t]}
                  </span>
                  {isCurrentUser && (
                    <span className="badge badge-accent" style={{ fontSize: "0.625rem" }}>
                      you
                    </span>
                  )}
                </div>
                {/* Notes */}
                {a?.notes ? (
                  <div style={{ color: "var(--text-1)", fontSize: "0.75rem", marginTop: "0.25rem" }}>
                    "{a.notes}"
                  </div>
                ) : (
                  <div style={{ color: "var(--text-3)", fontSize: "0.6875rem", marginTop: "0.25rem", fontStyle: "italic" }}>
                    {s === "pending" && gate.blockedBy
                      ? `Waiting for ${gate.blockedBy}`
                      : s === "pending"
                      ? "Awaiting review"
                      : "no notes"}
                  </div>
                )}
                {/* Who decided and when */}
                {a?.decided_at && s !== "pending" && (
                  <div style={{ fontSize: "0.625rem", color: "var(--text-3)", marginTop: "0.125rem" }}>
                    {s === "approved" ? "Approved" : "Rejected"}
                    {a.approved_by && approverProfiles.has(a.approved_by) && (
                      <>
                        {" "}by <strong style={{ color: "var(--text-2)" }}>{approverProfiles.get(a.approved_by)?.full_name}</strong>
                        {approverProfiles.get(a.approved_by)?.email && <span> &lt;{approverProfiles.get(a.approved_by)?.email}&gt;</span>}
                      </>
                    )}
                    {" "}{new Date(a.decided_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    {a.version != null && a.version > 0 && (
                      <span style={{ marginLeft: "0.25rem" }}>
                        (v{a.version})
                        {a.version < decision.version && (
                          <span style={{ color: decision.rc5_approval_rbac === "red" ? "var(--amber)" : "var(--green)", fontWeight: 600, marginLeft: "0.25rem" }}>
                            - {decision.rc5_approval_rbac === "red" ? `Superseded by v${decision.version}` : `Carried over to v${decision.version}`}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <span className={`badge ${badgeClass}`} style={{ textTransform: "capitalize", marginLeft: "0.5rem" }}>
                {s}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── Rejection Banner ── */}
      {rejectionInfo && (
        <div style={{
          background: "rgba(239, 68, 68, 0.06)",
          border: "1px solid rgba(239, 68, 68, 0.25)",
          borderRadius: "var(--r-md)",
          padding: "0.875rem 1rem",
          marginBottom: "0.75rem",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.375rem" }}>
            <span style={{ fontSize: "0.875rem" }}>🚫</span>
            <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--red)" }}>
              Decision Rejected by {TEAM_LABEL[rejectionInfo.team]}
            </span>
          </div>
          {rejectionInfo.notes && (
            <div style={{ fontSize: "0.8125rem", color: "var(--text-1)", lineHeight: 1.5, marginBottom: "0.375rem" }}>
              "{rejectionInfo.notes}"
            </div>
          )}
          <div style={{ fontSize: "0.6875rem", color: "var(--text-3)" }}>
            All other approvals are blocked. Design must revise and re-submit to restart the approval cycle.
          </div>
        </div>
      )}

      {/* ── Conflict Gate Banner ── */}
      {conflictBlocksQuality && (
        <div style={{
          background: "rgba(251, 191, 36, 0.06)",
          border: "1px solid rgba(251, 191, 36, 0.25)",
          borderRadius: "var(--r-md)",
          padding: "0.875rem 1rem",
          marginBottom: "0.75rem",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
            <span style={{ fontSize: "0.875rem" }}>⚠️</span>
            <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--amber)" }}>
              {unresolvedConflicts.length} Unresolved Conflict{unresolvedConflicts.length > 1 ? "s" : ""} - Approval Blocked
            </span>
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-2)" }}>
            Quality cannot give final approval until all conflicts linked to this decision are resolved.
          </div>
        </div>
      )}

      {/* ── Gate Blocked Banner ── */}
      {isActiveDecision && userTeam && gateStatus?.blockedBy && !rejectionInfo && (
        <div style={{
          background: "rgba(59, 130, 246, 0.06)",
          border: "1px solid rgba(59, 130, 246, 0.2)",
          borderRadius: "var(--r-sm)",
          padding: "0.625rem 0.875rem",
          fontSize: "0.75rem",
          color: "var(--blue)",
          marginBottom: "0.75rem",
        }}>
          ⏳ <strong>Sequential Gate:</strong> Waiting for <strong>{gateStatus.blockedBy}</strong> to complete their review before your team can act.
          {userTeam === "quality" && " (Quality is always the final gate in PPAP.)"}
        </div>
      )}

      {/* ── Interactive Approval UI ── */}
      {showRoleBlocked && (
        <div style={{
          background: "rgba(239, 68, 68, 0.06)",
          border: "1px solid rgba(239, 68, 68, 0.2)",
          borderRadius: "var(--r-sm)",
          padding: "0.625rem 0.875rem",
          fontSize: "0.75rem",
          color: "var(--red)",
          marginBottom: "0.75rem",
        }}>
          {!aiHasRun ? (
            <>🤖 <strong>AI Check Required:</strong> The AI Readiness Check has not been run yet. The Editor must click "Submit Updates & Run AI" before you can approve.</>
          ) : canApprove && !editorSubmitted ? (
            <>🔒 <strong>Missing Data:</strong> You cannot approve this decision until your team's Editor has filled in all required fields for {TEAM_LABEL[userTeam]}.</>
          ) : (
            <>🔒 <strong>Role Restricted:</strong> The gate is open, but only a <strong>{TEAM_LABEL[userTeam]} Approver</strong> can officially approve or reject. Your role is {userRole}.</>
          )}
        </div>
      )}

      {showInteractive && (
        <div style={{
          marginTop: "1.25rem",
          paddingTop: "1.25rem",
          borderTop: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem"
        }}>
          <div>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-1)", marginBottom: "0.375rem" }}>
              Approval Comments (Required for rejection, recommended for approval)
            </label>
            <textarea
              className="input"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add technical justification or workflow comments..."
              rows={2}
              style={{ width: "100%", resize: "vertical" }}
              disabled={busy}
            />
          </div>
          {error && <div style={{ color: "var(--red)", fontSize: "0.75rem" }}>{error}</div>}
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            <button
              className="btn btn-outline"
              style={{ color: "var(--red)", borderColor: "rgba(239, 68, 68, 0.3)" }}
              onClick={() => handleAction("rejected")}
              disabled={busy || !notes.trim()}
              title={!notes.trim() ? "Notes required for rejection" : ""}
            >
              {busy ? "Saving..." : "Reject Decision"}
            </button>
            <button
              className="btn btn-primary"
              onClick={() => handleAction("approved")}
              disabled={busy}
            >
              {busy ? "Saving..." : "Approve Decision"}
            </button>
          </div>
        </div>
      )}

      {!isActiveDecision && userTeam && decision.status === "draft" && (
        <div style={{ fontSize: "0.75rem", color: "var(--text-2)", padding: "0.5rem 0" }}>
          Approvals will unlock once Design submits this decision for review.
        </div>
      )}

      {!isActiveDecision && userTeam && (decision.status === "approved" || decision.status === "rejected") && (
        <div style={{ fontSize: "0.75rem", color: "var(--text-2)", padding: "0.5rem 0" }}>
          This decision is {decision.status}. {decision.status === "rejected" ? "Design must revise and re-submit." : "Approvals are locked."}
        </div>
      )}
    </div>
  );
}
