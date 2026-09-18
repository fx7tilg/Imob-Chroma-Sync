import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { runReadinessCheck } from "../lib/ai";
import type { Approval, Conflict, Decision, DecisionStatus, Material, Profile, Team } from "../types/db";
import { useAuth } from "../auth/AuthContext";
import RatingBadge from "../components/RatingBadge";
import ApprovalPanel from "../components/ApprovalPanel";
import MaterialContext from "../components/MaterialContext";
import ConflictBanner from "../components/ConflictBanner";
import DecisionFields from "../components/DecisionFields";
import DecisionHistory from "../components/DecisionHistory";
import ApprovalHistory from "../components/ApprovalHistory";
import AiAnalysingOverlay from "../components/AiAnalysingOverlay";
import { Shield, Zap } from "lucide-react";
import { checkAndUseCredit } from "../lib/credits";

export default function DecisionDetail() {
  const { id } = useParams<{ id: string }>();
  const { session, profile } = useAuth();
  const [decision, setDecision] = useState<Decision | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [material, setMaterial] = useState<Material | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [creatorProfile, setCreatorProfile] = useState<Profile | null>(null);
  const [submitterProfile, setSubmitterProfile] = useState<Profile | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [showRevertModal, setShowRevertModal] = useState(false);
  const [revertReason, setRevertReason] = useState("");
  const [submittingRevert, setSubmittingRevert] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [viewsUsed, setViewsUsed] = useState<number>(0);

  useEffect(() => {
    if (!id) return;
    const decisionId = id;
    let cancelled = false;

    async function load() {
      const [{ data: d }, { data: a }, { data: c }, quotaRes] = await Promise.all([
        supabase.from("decisions").select("*").eq("id", decisionId).single(),
        supabase.from("approvals").select("*").eq("decision_id", decisionId),
        supabase
          .from("conflicts")
          .select(`
            *,
            decision_a:decision_a_id(id, status, submitted_at, created_at),
            decision_b:decision_b_id(id, status, submitted_at, created_at)
          `)
          .or(`decision_a_id.eq.${decisionId},decision_b_id.eq.${decisionId}`)
          .eq("resolved", false),
        profile?.team ? supabase
          .from("ai_summary_quotas")
          .select("views_used")
          .eq("decision_id", decisionId)
          .eq("team", profile.team)
          .single() : { data: null }
      ]);
      if (cancelled) return;
      const dec = (d ?? null) as Decision | null;
      setDecision(dec);
      setApprovals((a ?? []) as Approval[]);
      // Only show conflicts where this decision is the OFFENDER (newer one).
      // The baseline (older/approved) decision should never see conflict banners.
      const allConflicts = (c ?? []) as (Conflict & { decision_a?: any; decision_b?: any })[];
      const offenderConflicts = allConflicts.filter(conflict => {
        const da = conflict.decision_a;
        const db = conflict.decision_b;
        if (!da || !db) return true; // fallback: show if we can't determine

        // Determine which is the offender (newer)
        // Rule 1: approved decision is always the baseline
        if (da.status === "approved" && db.status !== "approved") {
          // B is offender - show only if we are B
          return decisionId === conflict.decision_b_id;
        }
        if (db.status === "approved" && da.status !== "approved") {
          // A is offender - show only if we are A
          return decisionId === conflict.decision_a_id;
        }
        // Rule 2: compare timestamps - newer is the offender
        const timeA = new Date(da.submitted_at ?? da.created_at).getTime();
        const timeB = new Date(db.submitted_at ?? db.created_at).getTime();
        if (timeA > timeB) {
          // A is offender - show only if we are A
          return decisionId === conflict.decision_a_id;
        }
        // B is offender - show only if we are B
        return decisionId === conflict.decision_b_id;
      });
      setConflicts(offenderConflicts as Conflict[]);
      setViewsUsed((quotaRes?.data as any)?.views_used ?? 0);

      // Resolve creator and submitter profiles
      if (dec) {
        const userIds = [dec.created_by, dec.submitted_by].filter(Boolean) as string[];
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("*")
            .in("id", userIds);
          if (profiles) {
            const pList = profiles as Profile[];
            setCreatorProfile(pList.find(p => p.id === dec.created_by) ?? null);
            setSubmitterProfile(pList.find(p => p.id === dec.submitted_by) ?? null);
          }
        }
      }
    }

    load();

    const channel = supabase
      .channel(`decision-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "decisions", filter: `id=eq.${id}` },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "approvals", filter: `decision_id=eq.${id}` },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conflicts" },
        () => load()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [id]);

  useEffect(() => {
    const ref = decision?.material_reference;
    if (!ref) {
      setMaterial(null);
      return;
    }
    let cancelled = false;
    supabase
      .from("materials")
      .select("*")
      .eq("code", ref)
      .single()
      .then(({ data }) => {
        if (!cancelled) setMaterial((data ?? null) as Material | null);
      });
    return () => {
      cancelled = true;
    };
  }, [decision?.material_reference]);

  if (!decision) {
    return (
      <div style={{ color: "var(--text-2)", padding: "2rem", textAlign: "center" }}>Loading…</div>
    );
  }

  // Find rejection info for the banner
  const rejectionApproval = approvals.find(a => a.status === "rejected");

  async function updateStatus(nextStatus: DecisionStatus) {
    setStatusError(null);

    if (nextStatus === "submitted") {
      // ── HARD BLOCK: design_status must be "ready_for_engineering" ──
      // Only "Ready for Engineering" means the design is complete and ready for
      // cross-team review. All other statuses block submission.
      const ds = decision!.design_status;
      if (!ds || ds !== "ready_for_engineering") {
        const statusLabels: Record<string, string> = {
          wip: "Work In Progress - Design is still being worked on. Not ready for team review.",
          concept_review: "Concept Review - Design is in early evaluation. Not ready for Engineering.",
          on_hold: "On Hold - This decision is paused. Cannot submit for review.",
          cancelled: "Cancelled - This decision has been cancelled. Cannot submit for review.",
        };
        const label = ds ? (statusLabels[ds] ?? `"${ds}"`) : "not set";
        setStatusError(
          `Cannot submit for review. Design Status is: ${label}\n\n` +
          `Only decisions with Design Status = \"Ready for Engineering\" can be submitted. ` +
          `Change the Design Status to \"Ready for Engineering\" first.`
        );
        return;
      }

      const missing: string[] = [];
      if (!decision!.colour_code) missing.push("Colour Code");
      if (!decision!.material_reference) missing.push("Material Reference");
      if (!decision!.finish_surface) missing.push("Finish / Surface");
      if (decision!.required_temp_min_c == null) missing.push("Required Temp Min");
      if (decision!.required_temp_max_c == null) missing.push("Required Temp Max");
      if (!decision!.uv_weathering_required) missing.push("UV Weathering Requirement");
      if (!decision!.chemical_resistance_required) missing.push("Chemical Resistance");
      if (missing.length > 0) {
        setStatusError(`Cannot submit: missing ${missing.join(", ")}. Fill these in first.`);
        return;
      }
    }



    const updates: Partial<Decision> = { status: nextStatus };
    if (nextStatus === "submitted") {
      updates.submitted_by = session?.user?.id;
      updates.submitted_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from("decisions")
      .update(updates as any)
      .eq("id", decision!.id)
      .select("*")
      .single();

    if (error) {
      if (error.message.includes("only design")) {
        setStatusError("Only the Design team can perform this action.");
      } else if (error.message.includes("only quality")) {
        setStatusError("Only the Quality team can approve or reject.");
      } else if (error.message.includes("invalid status transition")) {
        setStatusError(`This status transition is not allowed (${decision!.status} → ${nextStatus}).`);
      } else {
        setStatusError(error.message);
      }
      return;
    }

    if (data) {
      setDecision(data as Decision);
      if (nextStatus === "submitted") {
        setAiBusy(true);
        await runReadinessCheck(decision!.id);
        setAiBusy(false);
        window.location.reload();
      }
    }
  }

  async function rerunAi() {
    const { allowed, remaining } = await checkAndUseCredit("ai_check");
    if (!allowed) {
      setStatusError("You have exhausted your 3 credits for AI Check today.");
      return;
    }
    setAiBusy(true);
    await runReadinessCheck(decision!.id);
    setAiBusy(false);
    window.location.reload();
  }

  const userTeam: Team | null = profile?.team ?? null;
  const isLead = profile?.is_project_lead ?? false;
  
  // Only actual Design team can edit design fields. Project leads cannot (unless they are also Design team).
  const canDesign = userTeam === "design";
  
  const statusBadge =
    decision.status === "approved" ? "badge-green" :
    decision.status === "rejected" ? "badge-red" :
    decision.status === "draft" ? "badge-purple" :
    decision.status === "submitted" ? "badge-blue" : "badge-amber";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <h1>{decision.component_name}</h1>
            <span className="badge" style={{ 
              background: "rgba(59,130,246,0.15)", color: "var(--blue)", 
              fontSize: "0.6875rem", fontWeight: 700 
            }}>
              Version {decision.version}{decision.version > 0 ? " - Current" : ""}
            </span>
          </div>
          <div style={{ fontSize: "0.8125rem", color: "var(--text-2)", marginTop: "0.375rem", display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
            <span>{decision.business_area}</span>
            <span>·</span>
            <span className={`badge ${statusBadge}`} style={{ textTransform: "capitalize" }}>
              {decision.status.replace("_", " ")}
            </span>
          </div>

          {/* User attribution */}
          <div style={{ fontSize: "0.6875rem", color: "var(--text-3)", marginTop: "0.375rem", display: "flex", flexDirection: "column", gap: "0.125rem" }}>
            <span>
              Created by: <strong style={{ color: "var(--text-2)" }}>{creatorProfile?.full_name || "Unknown"}</strong>
              {creatorProfile?.email && <span style={{ color: "var(--text-3)" }}> &lt;{creatorProfile.email}&gt;</span>}
              {creatorProfile?.team && <span> ({creatorProfile.team})</span>}
              {" · "}{new Date(decision.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </span>
            {submitterProfile && decision.submitted_at && (
              <span>
                Submitted by: <strong style={{ color: "var(--text-2)" }}>{submitterProfile.full_name}</strong>
                {submitterProfile.email && <span style={{ color: "var(--text-3)" }}> &lt;{submitterProfile.email}&gt;</span>}
                {" · "}{new Date(decision.submitted_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          {/* AI Action Buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            {decision.status !== "draft" && (
              <Link 
                to={`/decisions/${decision.id}/deep-analysis`}
                className="premium-btn" 
                style={{ textDecoration: "none" }}
              >
                <div className="premium-btn-content">
                  <Zap size={16} className="premium-icon" />
                  <span className="premium-text">AI Deep Analysis</span>
                </div>
              </Link>
            )}
          </div>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <RatingBadge
              rating={decision.ai_rating}
              reason={decision.ai_reason}
              flags={decision.ai_flags as any}
              perCriterion={{
                rc1_lifecycle: decision.rc1_lifecycle,
                rc2_compliance: decision.rc2_compliance,
                rc3_lead_time: decision.rc3_lead_time,
                rc4_visual: decision.rc4_visual,
                rc5_approval_rbac: decision.rc5_approval_rbac,
                rc6_conflict: decision.rc6_conflict,
              }}
              rcFlags={decision.rc_flags as any}
              large
            />
            {decision.ai_rating === null && decision.status !== "draft" && (
              <button 
                className="btn btn-ghost" 
                style={{ alignSelf: "flex-end", fontSize: "0.6875rem", padding: "0.25rem 0.5rem" }}
                onClick={rerunAi}
                disabled={aiBusy}
              >
                {aiBusy ? "Retrying..." : "Retry AI Check"}
              </button>
            )}
          </div>
        </div>
      </div>

      <AiAnalysingOverlay isVisible={aiBusy} />

      {/* On Hold banner */}
      {decision.status === "draft" && decision.design_status === "on_hold" && (
        <div style={{
          background: "linear-gradient(135deg, rgba(251, 191, 36, 0.08), rgba(251, 191, 36, 0.03))",
          border: "1px solid rgba(251, 191, 36, 0.3)",
          borderRadius: "var(--r-md)",
          padding: "1.25rem 1.5rem",
          marginBottom: "1rem",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.375rem" }}>
            <span style={{ fontSize: "1.125rem" }}>⏸️</span>
            <div style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--amber)" }}>
              Decision On Hold
            </div>
          </div>
          <div style={{ fontSize: "0.8125rem", color: "var(--text-2)", lineHeight: 1.5 }}>
            This decision has been paused by Design. It cannot be submitted for team review until the designer changes the Design Status to <strong>"Ready for Engineering"</strong>. No action is required from other teams.
          </div>
        </div>
      )}

      {/* Cancelled banner */}
      {decision.status === "draft" && decision.design_status === "cancelled" && (
        <div style={{
          background: "linear-gradient(135deg, rgba(239, 68, 68, 0.08), rgba(239, 68, 68, 0.03))",
          border: "1px solid rgba(239, 68, 68, 0.3)",
          borderRadius: "var(--r-md)",
          padding: "1.25rem 1.5rem",
          marginBottom: "1rem",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.375rem" }}>
            <span style={{ fontSize: "1.125rem" }}>🚫</span>
            <div style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--red)" }}>
              Decision Cancelled
            </div>
          </div>
          <div style={{ fontSize: "0.8125rem", color: "var(--text-2)", lineHeight: 1.5 }}>
            This decision has been cancelled by Design. It will not proceed through the approval workflow. To reactivate, the designer must change the Design Status.
          </div>
        </div>
      )}

      {/* Design Status info banner (WIP / Concept Review) */}
      {decision.status === "draft" && decision.design_status && 
       !["ready_for_engineering", "on_hold", "cancelled"].includes(decision.design_status) && (
        <div style={{
          background: "var(--bg-1)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-md)",
          padding: "0.875rem 1rem",
          marginBottom: "1rem",
          display: "flex", alignItems: "center", gap: "0.5rem",
        }}>
          <span style={{ fontSize: "0.875rem" }}>📝</span>
          <div style={{ fontSize: "0.8125rem", color: "var(--text-2)" }}>
            <strong>Design Status: {decision.design_status === "wip" ? "Work In Progress" : decision.design_status === "concept_review" ? "Concept Review" : decision.design_status}</strong> - 
            This decision is not yet ready for team review. The designer must set Design Status to <strong>"Ready for Engineering"</strong> before submitting.
          </div>
        </div>
      )}

      {/* Rejection revision banner */}
      {decision.status === "rejected" && rejectionApproval && (
        <div style={{
          background: "linear-gradient(135deg, rgba(239, 68, 68, 0.08), rgba(239, 68, 68, 0.03))",
          border: "1px solid rgba(239, 68, 68, 0.3)",
          borderRadius: "var(--r-md)",
          padding: "1.25rem 1.5rem",
          marginBottom: "1rem",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.625rem" }}>
            <div style={{
              width: 32, height: 32, borderRadius: "var(--r-md)",
              background: "rgba(239, 68, 68, 0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "1rem"
            }}>🚫</div>
            <div>
              <div style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--red)" }}>
                Revision Required - Rejected by {rejectionApproval.team.charAt(0).toUpperCase() + rejectionApproval.team.slice(1)}
              </div>
              <div style={{ fontSize: "0.6875rem", color: "var(--text-3)" }}>
                {rejectionApproval.decided_at && new Date(rejectionApproval.decided_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          </div>
          {rejectionApproval.notes && (
            <div style={{
              fontSize: "0.875rem", color: "var(--text-1)", lineHeight: 1.6,
              padding: "0.75rem 1rem",
              background: "rgba(239, 68, 68, 0.04)",
              borderRadius: "var(--r-sm)",
              border: "1px solid rgba(239, 68, 68, 0.12)",
              marginBottom: "0.625rem"
            }}>
              "{rejectionApproval.notes}"
            </div>
          )}
          <div style={{ fontSize: "0.75rem", color: "var(--text-2)" }}>
            Design must address the feedback above, then click <strong>"Unlock to Fix"</strong> on the relevant section → edit → <strong>"Submit Updates & Run AI"</strong>. A new version (v{decision.version + 1}) will be created and downstream approvals will be reset.
          </div>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
            <span className="badge" style={{ fontSize: "0.625rem", background: "var(--bg-2)" }}>
              Current Version: v{decision.version}
            </span>
            <span className="badge badge-red" style={{ fontSize: "0.625rem" }}>
              Changes Required by {rejectionApproval.team.charAt(0).toUpperCase() + rejectionApproval.team.slice(1)}
            </span>
          </div>
        </div>
      )}

      {conflicts.map((c) => (
        <ConflictBanner key={c.id} conflict={c} currentDecisionId={decision.id} />
      ))}

      {statusError && (
        <div style={{
          color: "var(--red)",
          fontSize: "0.8125rem",
          padding: "0.75rem 1rem",
          background: "rgba(239, 68, 68, 0.06)",
          border: "1px solid rgba(239, 68, 68, 0.2)",
          borderRadius: "var(--r-md)",
          marginBottom: "1rem",
        }}>
          {statusError}
        </div>
      )}

      {/* Workflow action bar */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "0.875rem 1rem",
        background: "var(--bg-1)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-md)",
        marginBottom: "1rem",
        gap: "1rem",
        flexWrap: "wrap"
      }}>
        <div>
          <div style={{ fontSize: "0.6875rem", color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Workflow · PPAP
          </div>
          <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-0)", marginTop: 2 }}>
            {decision.status === "draft" ? draftWorkflowLabel(decision.design_status) : workflowLabel(decision.status)}
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {aiBusy && (
            <span style={{ fontSize: "0.6875rem", color: "var(--accent)", display: "flex", alignItems: "center", gap: "0.25rem" }}>
              <span className="live-dot" style={{ width: 6, height: 6, background: "var(--accent)", boxShadow: "0 0 8px var(--accent)" }} />
              AI analysing…
            </span>
          )}
          <button className="btn btn-ghost" onClick={rerunAi} disabled={aiBusy} title="Re-run AI readiness check">
            {aiBusy ? "Checking…" : "Re-run AI Check"}
          </button>
          {decision.status === "draft" && canDesign && (
            <>
              <button
                className="btn btn-accent"
                onClick={() => updateStatus("submitted")}
                disabled={decision.design_status !== "ready_for_engineering"}
                title={decision.design_status !== "ready_for_engineering"
                  ? `Blocked: Design Status must be "Ready for Engineering" (currently: ${decision.design_status || "not set"})`
                  : "Submit this decision for team review"}
              >
                Submit for Review
              </button>
              {decision.design_status && decision.design_status !== "ready_for_engineering" && (
                <span style={{
                  fontSize: "0.6875rem",
                  color: decision.design_status === "on_hold" ? "var(--amber)" 
                       : decision.design_status === "cancelled" ? "var(--red)" 
                       : "var(--text-3)",
                  display: "flex", alignItems: "center", gap: "0.25rem"
                }}>
                  {decision.design_status === "on_hold" ? "⏸️" 
                   : decision.design_status === "cancelled" ? "🚫" 
                   : "⚠️"}
                  {decision.design_status === "wip" ? "WIP - set to Ready for Eng."
                   : decision.design_status === "concept_review" ? "In Concept Review"
                   : decision.design_status === "on_hold" ? "On Hold"
                   : decision.design_status === "cancelled" ? "Cancelled"
                   : decision.design_status}
                </span>
              )}
            </>
          )}

          {/* Delete: designer can delete own drafts */}
          {(decision.status === "draft" && canDesign && decision.created_by === session?.user?.id) && (
            <button
              className="btn btn-ghost"
              style={{ color: "var(--red)", borderColor: "rgba(239, 68, 68, 0.3)" }}
              onClick={async () => {
                if (!window.confirm(`Are you sure you want to permanently delete "${decision.component_name}"? This action cannot be undone.`)) return;
                const { error } = await supabase.from("decisions").delete().eq("id", decision.id);
                if (error) { setStatusError(error.message); return; }
                window.location.href = "/dashboard";
              }}
              title="Delete draft"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* ADMIN INTERVENTION PANEL */}
      {isLead && (
        <div style={{
          background: "var(--bg-1)",
          border: "1px solid rgba(245, 158, 11, 0.4)",
          borderLeft: "4px solid var(--amber)",
          borderRadius: "var(--r-md)",
          padding: "1.25rem",
          marginBottom: "1rem",
          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.875rem" }}>
            <span style={{ fontSize: "1.125rem" }}>🛡️</span>
            <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--amber)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Administrative Override Active
            </div>
          </div>
          <div style={{ fontSize: "0.8125rem", color: "var(--text-1)", marginBottom: "1rem", lineHeight: 1.5 }}>
            As a Project Lead, you have overseer permissions. You can edit any field across all teams directly. If a decision is stuck, you can revert it to draft. Actions taken here will be logged and badged for transparency.
          </div>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
            <button
              className="btn"
              style={{ background: "var(--bg-0)", color: "var(--text-0)", borderColor: "var(--amber)", fontWeight: 600 }}
              onClick={() => setShowRevertModal(true)}
            >
              Admin: Revert to Draft
            </button>
          </div>
        </div>
      )}

      {decision.ai_last_checked_at && (
        <div style={{ fontSize: "0.6875rem", color: "var(--text-3)", marginBottom: "0.75rem", marginTop: "-0.5rem" }}>
          AI last checked: {new Date(decision.ai_last_checked_at).toLocaleString()}
        </div>
      )}

      <div className="grid-2">
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h2 style={{ margin: 0, fontSize: "1.125rem", color: "var(--text-0)" }}>Decision Details</h2>
          </div>
          <DecisionFields
            decision={decision}
            approvals={approvals ?? []}
            userTeam={userTeam}
            userRole={profile?.role ?? null}
            isLead={isLead}
            onSaved={(next) => setDecision(next)}
            onApprovalsChanged={(nextApprovals) => setApprovals(nextApprovals)}
            onRunAI={rerunAi}
            aiBusy={aiBusy}
          />
        </div>
        <div className="decision-sidebar">
          <MaterialContext material={material} decision={decision} />
          <ApprovalPanel
            decision={decision}
            approvals={approvals}
            conflicts={conflicts}
            userTeam={userTeam}
            userRole={profile?.role ?? null}
            profileId={profile?.id ?? null}
            onOptimisticUpdate={(nextApprovals) => setApprovals(nextApprovals)}
            onDecisionUpdate={(nextDecision) => setDecision(nextDecision)}
          />
          <DecisionHistory decisionId={decision.id} currentVersion={decision.version} />
          <ApprovalHistory decisionId={decision.id} currentVersion={decision.version} />
        </div>
      </div>

      {/* Admin Revert Modal */}
      {showRevertModal && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000, padding: "1rem"
        }}>
          <div style={{
            background: "var(--bg-0)",
            padding: "2rem",
            borderRadius: "var(--r-lg)",
            width: "100%", maxWidth: "480px",
            boxShadow: "0 20px 40px rgba(0,0,0,0.4), 0 0 0 1px var(--border)",
            borderTop: "4px solid var(--amber)"
          }}>
            <h2 style={{ margin: "0 0 1rem 0", fontSize: "1.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontSize: "1.5rem" }}>⚠️</span> Revert to Draft
            </h2>
            {statusError && (
              <div style={{ background: "rgba(239, 68, 68, 0.1)", color: "var(--red)", padding: "0.75rem", borderRadius: "var(--r-md)", marginBottom: "1rem", fontSize: "0.875rem" }}>
                {statusError}
              </div>
            )}
            <p style={{ fontSize: "0.875rem", color: "var(--text-1)", marginBottom: "1.5rem", lineHeight: 1.5 }}>
              Are you sure you want to revert this decision to Draft? This will allow edits and require re-submission. Please provide a reason so the team knows what to fix.
            </p>
            <textarea
              className="input"
              rows={3}
              placeholder="e.g. 'Engineering inputs are incorrect, please fix before resubmitting.'"
              value={revertReason}
              onChange={(e) => setRevertReason(e.target.value)}
              style={{ width: "100%", marginBottom: "1.5rem" }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "1rem" }}>
              <button className="btn btn-ghost" onClick={() => setShowRevertModal(false)} disabled={submittingRevert}>
                Cancel
              </button>
              <button 
                className="btn"
                style={{ background: "var(--amber)", color: "#000", fontWeight: 600 }}
                disabled={submittingRevert || !revertReason.trim()}
                onClick={async () => {
                  try {
                    setSubmittingRevert(true);
                    setStatusError(null);
                    const adminName = profile?.full_name ?? session?.user?.email ?? "Admin";

                    const existingFlags = Array.isArray(decision.rc_flags) ? (decision.rc_flags as Array<{flag: string, detail?: string}>) : [];
                    const newFlags = [...existingFlags.filter(f => f.flag !== "admin_override"), { flag: "admin_override", detail: `${adminName} - Reason: ${revertReason.trim()}` }];

                    const { error: updateErr } = await supabase.from("decisions").update({ 
                      status: "draft",
                      rc_flags: newFlags as any
                    }).eq("id", decision.id);
                    
                    if (updateErr) { 
                      throw new Error(`Failed to update decision: ${updateErr.message}`);
                    }
                    
                    // Add an audit log or approval note to track the override
                    const { error: upsertErr } = await supabase.from("approvals").upsert({
                      decision_id: decision.id,
                      team: "quality",
                      status: "pending",
                      approved_by: session?.user?.id || null,
                      notes: `[ADMIN OVERRIDE] Reverted to draft by Project Lead (${adminName}). Reason: ${revertReason.trim()}`,
                      decided_at: new Date().toISOString(),
                      version: decision.version
                    }, { onConflict: "decision_id,team" });
                    
                    if (upsertErr) {
                      console.warn("Failed to write audit log:", upsertErr);
                      // Don't block the revert if just the audit log fails
                    }
                    
                    window.location.reload(); // Hard refresh to show draft state instantly
                  } catch (err: any) {
                    console.error("Revert error:", err);
                    setStatusError(err.message || String(err));
                    setSubmittingRevert(false);
                  }
                }}
              >
                {submittingRevert ? "Reverting..." : "Confirm Revert to Draft"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function workflowLabel(status: DecisionStatus): string {
  switch (status) {
    case "draft": return "Draft - Design is preparing this decision";
    case "submitted": return "Submitted - Awaiting team reviews (AAR)";
    case "under_review": return "Under Review - Teams are assessing feasibility";
    case "approved": return "Approved - Ready for Meldeliste & Production";
    case "rejected": return "Changes Required - Correction window open for all teams";
  }
}

function draftWorkflowLabel(designStatus: string | null): string {
  switch (designStatus) {
    case "ready_for_engineering": return "Draft - Ready for Engineering · Submit when all fields are complete";
    case "wip": return "Draft - Work In Progress · Not ready for submission";
    case "concept_review": return "Draft - Concept Review · Design is in early evaluation";
    case "on_hold": return "Draft - On Hold · Decision is paused";
    case "cancelled": return "Draft - Cancelled · Decision will not proceed";
    default: return "Draft - Set Design Status to proceed";
  }
}
