import { supabase } from "./supabase";
import type { EnterpriseReport, EnterpriseReportType, Decision, Approval, Conflict } from "../types/db";
import { computeSnapshotHash } from "./hash";
import { runAudit } from "./auditSignals";

const AI_API = import.meta.env.VITE_AI_API_URL || "http://localhost:8000";

export async function fetchLatestEnterpriseReport(reportType: EnterpriseReportType): Promise<EnterpriseReport | null> {
  const { data, error } = await (supabase as any)
    .from("enterprise_reports")
    .select("*")
    .eq("report_type", reportType)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    console.error(`Failed to fetch latest ${reportType} report:`, error);
    return null;
  }
  return data as EnterpriseReport;
}

export async function runNewEnterpriseReport(
  reportType: EnterpriseReportType,
  decisions: Decision[],
  approvals: Approval[],
  conflicts: Conflict[]
): Promise<EnterpriseReport> {
  // 1. Audit to get deterministic signals
  const auditResult = runAudit(decisions, approvals, conflicts);

  // 2. Snapshot the data for hashing
  const snapshotData = {
    decisions: decisions.map(d => ({ id: d.id, version: d.version, status: d.status })),
    approvals: approvals.map(a => ({ id: a.id, status: a.status, version: a.version })),
    conflicts: conflicts.map(c => c.id),
    findings: auditResult.findings
  };
  
  const snapshot_hash = computeSnapshotHash(snapshotData);

  // 3. Get user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // 4. Create 'running' record
  const { data: record, error: insertError } = await (supabase as any)
    .from("enterprise_reports")
    .insert({
      created_by: user.id,
      report_type: reportType,
      snapshot_hash,
      status: "running"
    })
    .select()
    .single();

  if (insertError) {
    console.error(`Failed to insert running ${reportType} report:`, insertError);
    throw insertError;
  }

  // 5. Call AI Service
  try {
    const res = await fetch(`${AI_API}/priority-briefing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decisions: decisions,
        context: reportType,
        audit_stats: auditResult.summary,
        decision_signals: auditResult.findings,
        approvals,
        conflicts,
        cross_team_impact: auditResult.crossTeamImpact
      }),
    });

    if (!res.ok) throw new Error(`AI service returned ${res.status}`);
    const apiData = await res.json();
    
    // 6. Update record with success
    const { data: updated, error: updateError } = await (supabase as any)
      .from("enterprise_reports")
      .update({
        status: "completed",
        content: apiData.structured_audit || {},
      })
      .eq("id", record.id)
      .select()
      .single();
      
    if (updateError) throw updateError;
    return updated as EnterpriseReport;

  } catch (error: any) {
    // 7. Update record with failure
    await (supabase as any)
      .from("enterprise_reports")
      .update({
        status: "failed",
        error_message: error.message
      })
      .eq("id", record.id);
      
    throw error;
  }
}
