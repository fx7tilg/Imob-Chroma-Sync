import type { AiRating, Approval, Decision, Material } from "../types/db";
import { AI_SERVICE_URL } from "./supabase";
import { supabase } from "./supabase";

export const DOCUMENT_TYPES = ["Render", "Spec", "Quote", "CAD", "Other"] as const;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatOptions {
  userTeam?: string | null;
  isProjectLead?: boolean;
  context?: string;
}

// In-app assistant. Sends the conversation to the AI service /chat endpoint
// and returns the assistant's reply text.
export async function sendChat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  const res = await fetch(`${AI_SERVICE_URL}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      messages,
      user_team: opts.userTeam ?? null,
      is_project_lead: opts.isProjectLead ?? false,
      context: opts.context ?? ""
    })
  });
  if (!res.ok) throw new Error(`Chat ${res.status}`);
  const data = (await res.json()) as { reply: string };
  return data.reply;
}

interface CriterionResult {
  rating: AiRating;
  reason: string;
  evidence?: Record<string, unknown>;
}

interface ReadinessResponse {
  rating: AiRating;
  reason: string;
  flags: { flag: string; detail?: string }[];
  rc1_lifecycle?: CriterionResult;
  rc2_compliance?: CriterionResult;
  rc3_lead_time?: CriterionResult;
  rc4_visual?: CriterionResult;
  rc5_approval_rbac?: CriterionResult;
  rc6_conflict?: CriterionResult;
}

// Fire-and-forget AI readiness check. Runs the six-criterion deterministic
// scorer server-side and writes all values via the extended set_ai_readiness
// RPC so realtime subscribers pick it up.
export async function runReadinessCheck(decisionId: string): Promise<ReadinessResponse | null> {
  let decisionRow: Decision | null = null;
  try {
    const [{ data: decision }, { data: approvals }] = await Promise.all([
      supabase.from("decisions").select("*").eq("id", decisionId).single(),
      supabase.from("approvals").select("*").eq("decision_id", decisionId)
    ]);
    if (!decision) return null;

    decisionRow = decision as Decision;

    let material: Material | null = null;
    if (decisionRow.material_reference) {
      const { data } = await supabase
        .from("materials")
        .select("*")
        .eq("code", decisionRow.material_reference)
        .single();
      material = (data as Material | null) ?? null;
    }

    // RC-4: VRED rows for the (component, material) pair.
    let vred_rows: unknown[] = [];
    if (decisionRow.component_id && decisionRow.material_reference) {
      const { data } = await supabase
        .from("vred_visualizations")
        .select("*")
        .eq("component_id", decisionRow.component_id)
        .eq("material_code", decisionRow.material_reference);
      vred_rows = data ?? [];
    }

    // RC-6: sibling decisions on the same component (excluding self).
    let sibling_decisions: unknown[] = [];
    if (decisionRow.component_id) {
      const { data } = await supabase
        .from("decisions")
        .select("*")
        .eq("component_id", decisionRow.component_id)
        .neq("id", decisionId);
      sibling_decisions = data ?? [];
    } else if (decisionRow.component_name) {
      const { data } = await supabase
        .from("decisions")
        .select("*")
        .eq("component_name", decisionRow.component_name)
        .neq("id", decisionId);
      sibling_decisions = data ?? [];
    }

    // RC-5: approver role lookup - only for users referenced in approvals.
    const approvalRows = (approvals ?? []) as Approval[];
    const approverIds = approvalRows
      .map((a) => a.approved_by)
      .filter((id): id is string => Boolean(id));
    let approver_profiles: unknown[] = [];
    if (approverIds.length > 0) {
      const { data } = await supabase
        .from("profiles")
        .select("id, team, role")
        .in("id", approverIds);
      approver_profiles = data ?? [];
    }

    let previous_decision: unknown = null;
    if (decisionRow.version > 1) {
      const { data: snap } = await supabase
        .from("decision_snapshots")
        .select("snapshot")
        .eq("decision_id", decisionId)
        .eq("version", decisionRow.version - 1)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (snap && snap.snapshot) previous_decision = snap.snapshot;
    }

    const res = await fetch(`${AI_SERVICE_URL}/readiness`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        decision,
        previous_decision,
        material,
        approvals: approvalRows,
        vred_rows,
        sibling_decisions,
        approver_profiles
      })
    });
    if (!res.ok) throw new Error(`AI ${res.status}`);
    const parsed = (await res.json()) as ReadinessResponse;

    const rc_flags: Record<string, unknown> = {};
    for (const key of ["rc1_lifecycle", "rc2_compliance", "rc3_lead_time",
                       "rc4_visual", "rc5_approval_rbac", "rc6_conflict"] as const) {
      const result = parsed[key];
      if (result) rc_flags[key] = { reason: result.reason, evidence: result.evidence ?? {} };
    }

    const { error } = await supabase.rpc("set_ai_readiness", {
      p_decision_id: decisionId,
      p_rating: parsed.rating,
      p_reason: parsed.reason,
      p_flags: parsed.flags,
      p_rc1_lifecycle:     parsed.rc1_lifecycle?.rating,
      p_rc2_compliance:    parsed.rc2_compliance?.rating,
      p_rc3_lead_time:     parsed.rc3_lead_time?.rating,
      p_rc4_visual:        parsed.rc4_visual?.rating,
      p_rc5_approval_rbac: parsed.rc5_approval_rbac?.rating,
      p_rc6_conflict:      parsed.rc6_conflict?.rating,
      p_rc_flags:          rc_flags
    });
    if (error) console.error("AI readiness RPC error:", error);

    // If the AI flagged a conflict, insert the conflict rows directly into the
    // database using the structured evidence from the scoring service.
    // This bypasses the broken /conflicts endpoint and the 30-minute cron job entirely.
    console.log("[CONFLICT-SYNC] rc6_conflict result:", JSON.stringify(parsed.rc6_conflict, null, 2));
    const evidence = parsed.rc6_conflict?.evidence as Record<string, unknown> | undefined;
    const hasConflicts = evidence?.has_conflicts === true || parsed.rc6_conflict?.rating === "red" || parsed.rc6_conflict?.rating === "yellow";

    if (hasConflicts) {
      console.log("[CONFLICT-SYNC] Conflict detected or present! Rating:", parsed.rc6_conflict?.rating);
      const conflictDetails = (evidence?.conflict_details ?? []) as Array<{
        sibling_id: string;
        conflict_type: string;
        explanation: string;
      }>;
      console.log("[CONFLICT-SYNC] conflict_details count:", conflictDetails.length, conflictDetails);

      if (conflictDetails.length > 0) {
        // Use await directly instead of fire-and-forget so we can see errors
        try {
          for (const detail of conflictDetails) {
            console.log("[CONFLICT-SYNC] Processing detail:", detail);
            // Skip self-conflicts (DB constraint: decision_a_id <> decision_b_id)
            if (detail.sibling_id === decisionId) {
              console.log("[CONFLICT-SYNC] Skipping self-conflict");
              continue;
            }

            // Check if this exact conflict already exists (unresolved)
            const { data: existing, error: checkErr } = await supabase
              .from("conflicts")
              .select("id")
              .or(
                `and(decision_a_id.eq.${decisionId},decision_b_id.eq.${detail.sibling_id}),` +
                `and(decision_a_id.eq.${detail.sibling_id},decision_b_id.eq.${decisionId})`
              )
              .eq("conflict_type", detail.conflict_type)
              .eq("resolved", false)
              .maybeSingle();

            console.log("[CONFLICT-SYNC] Existing check:", existing, "Error:", checkErr);

            if (!existing) {
              const insertPayload = {
                decision_a_id: decisionId,
                decision_b_id: detail.sibling_id,
                conflict_type: detail.conflict_type,
                explanation: detail.explanation,
              };
              console.log("[CONFLICT-SYNC] Inserting:", insertPayload);
              const { data: insertData, error: insertErr } = await supabase.from("conflicts").insert(insertPayload).select();
              console.log("[CONFLICT-SYNC] Insert result:", insertData, "Error:", insertErr);
            } else {
              console.log("[CONFLICT-SYNC] Conflict already exists, skipping");
            }
          }
        } catch (err) {
          console.error("[CONFLICT-SYNC] Direct conflict sync failed:", err);
        }
      } else {
        console.warn("[CONFLICT-SYNC] No conflict_details in evidence! The AI service may not have returned structured data.");
      }
    } else if (parsed.rc6_conflict?.rating === "green") {
      console.log("[CONFLICT-SYNC] No conflict flagged and has_conflicts is false. Auto-resolving existing open conflicts.");
      try {
        const { error: resolveErr } = await supabase
          .from("conflicts")
          .update({
            resolved: true,
            resolution_type: 'spec_updated',
            resolution_notes: 'Auto-resolved: AI re-scan confirmed no remaining conflicts after data update.',
            resolved_at: new Date().toISOString()
          })
          .eq('resolved', false)
          .or(`decision_a_id.eq.${decisionId},decision_b_id.eq.${decisionId}`);
        if (resolveErr) console.error("[CONFLICT-SYNC] Error auto-resolving conflicts:", resolveErr);
      } catch (err) {
        console.error("[CONFLICT-SYNC] Direct conflict resolve failed:", err);
      }
    }
    return parsed;
  } catch (e) {
    console.warn("AI readiness check failed:", e);

    // If we never loaded the decision, there's nothing to reconcile.
    if (!decisionRow) return null;

    // Calculate the worst color based on existing scores in the DB so we don't cause an inconsistency
    const rcs = [
      decisionRow.rc1_lifecycle,
      decisionRow.rc2_compliance,
      decisionRow.rc3_lead_time,
      decisionRow.rc4_visual,
      decisionRow.rc5_approval_rbac,
      decisionRow.rc6_conflict
    ];
    let worstColor: AiRating = "green";
    if (rcs.includes("red")) worstColor = "red";
    else if (rcs.includes("yellow")) worstColor = "yellow";
    // If all are null/empty, fallback to yellow just in case it's completely new
    if (rcs.every(r => !r)) worstColor = "yellow";

    const { error } = await supabase.rpc("set_ai_readiness", {
      p_decision_id: decisionId,
      p_rating: worstColor,
      p_reason: "AI service unavailable - human review needed.",
      p_flags: [{ flag: "ai_unavailable" }],
      // preserve the existing RC ratings in the DB
      p_rc1_lifecycle: decisionRow.rc1_lifecycle ?? undefined,
      p_rc2_compliance: decisionRow.rc2_compliance ?? undefined,
      p_rc3_lead_time: decisionRow.rc3_lead_time ?? undefined,
      p_rc4_visual: decisionRow.rc4_visual ?? undefined,
      p_rc5_approval_rbac: decisionRow.rc5_approval_rbac ?? undefined,
      p_rc6_conflict: decisionRow.rc6_conflict ?? undefined,
      p_rc_flags: decisionRow.rc_flags ?? undefined
    });
    if (error) console.error("Fallback AI readiness RPC error:", error);
    return null;
  }
}
