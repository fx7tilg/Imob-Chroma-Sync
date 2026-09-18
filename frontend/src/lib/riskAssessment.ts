import { supabase } from "./supabase";
import type { RiskAssessment } from "../types/db";
import { computeSnapshotHash } from "./hash";
import type { AuditResult } from "./auditSignals";

const AI_API = import.meta.env.VITE_AI_API_URL || "http://localhost:8000";

export async function fetchLatestAssessment(): Promise<RiskAssessment | null> {
  const { data, error } = await (supabase as any)
    .from("risk_assessments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    console.error("Failed to fetch latest risk assessment:", error);
    return null;
  }
  return data as RiskAssessment;
}

export async function runNewRiskAssessment(
  decisions: any[],
  auditResult: AuditResult
): Promise<RiskAssessment | null> {
  // 1. Snapshot the data
  const snapshotData = {
    decisions: decisions.map(d => ({
      id: d.id,
      component: d.component_name,
      status: d.status,
      ai_rating: d.ai_rating,
      business_area: d.business_area,
      owner_team: d.owner_team,
      supplier: d.supplier,
      engineering_owner_id: d.engineering_owner_id,
      procurement_owner_id: d.procurement_owner_id,
      submitted_at: d.submitted_at,
    })),
    findings: auditResult.findings,
  };
  
  const snapshot_hash = computeSnapshotHash(snapshotData);

  // 2. Get user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // 3. Create 'running' record
  const { data: record, error: insertError } = await (supabase as any)
    .from("risk_assessments")
    .insert({
      created_by: user.id,
      snapshot_hash,
      decisions_snapshot: snapshotData.decisions,
      deterministic_signals: auditResult.findings,
      cross_team_impact: auditResult.crossTeamImpact,
      status: "running"
    })
    .select()
    .single();

  if (insertError) {
    console.error("Failed to insert running assessment:", insertError);
    throw insertError;
  }

  // 4. Call AI Service
  try {
    const res = await fetch(`${AI_API}/priority-briefing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decisions,
        context: "risk_assessment",
        audit_stats: auditResult.summary,
        decision_signals: auditResult.findings, // passed as signals
        cross_team_impact: auditResult.crossTeamImpact,
      }),
    });

    if (!res.ok) throw new Error(`AI service returned ${res.status}`);
    const apiData = await res.json();
    
    const structured = apiData.structured_audit || {};
    
    // 5. Update record with success
    const { data: updated, error: updateError } = await (supabase as any)
      .from("risk_assessments")
      .update({
        status: "completed",
        top_5_risks: structured.top_5_risks || [],
        executive_summary: structured.executive_summary || apiData.briefing_markdown || "",
        all_risks: structured.what_needs_attention_first || "",
      })
      .eq("id", record.id)
      .select()
      .single();
      
    if (updateError) throw updateError;
    return updated as RiskAssessment;

  } catch (error: any) {
    // 6. Update record with failure
    await (supabase as any)
      .from("risk_assessments")
      .update({
        status: "failed",
        error_message: error.message
      })
      .eq("id", record.id);
      
    throw error;
  }
}
