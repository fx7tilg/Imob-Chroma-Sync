import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Shield, AlertTriangle, Play, Download, Clock, ArrowLeft, Zap, Users, Activity, CheckCircle2, FileText, Share2, Layers } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { supabase } from "../lib/supabase";
import { fetchLatestDeepAnalysis, runNewDeepAnalysis } from "../lib/deepAnalysis";
import { computeSnapshotHash } from "../lib/hash";
import { runAudit, type AuditResult } from "../lib/auditSignals";
import type { DecisionDeepAnalysis, Decision, Approval, Conflict } from "../types/db";
import LogoMark from "../components/LogoMark";
import { useAuth } from "../auth/AuthContext";
import { checkAndUseCredit } from "../lib/credits";

export default function DecisionDeepAnalysisPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  
  const [analysis, setAnalysis] = useState<DecisionDeepAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [decision, setDecision] = useState<Decision | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [auditEvents, setAuditEvents] = useState<any[]>([]);
  
  // Real-time data fetch
  useEffect(() => {
    if (!id) return;
    const decisionId = id;
    let cancelled = false;

    async function loadData() {
      const [decRes, appRes, confRes, auditRes] = await Promise.all([
        supabase.from("decisions").select("*").eq("id", decisionId).single(),
        supabase.from("approvals").select("*").eq("decision_id", decisionId),
        supabase.from("conflicts").select("*").or(`decision_a_id.eq.${decisionId},decision_b_id.eq.${decisionId}`).eq("resolved", false),
        supabase.from("audit_logs").select("*").eq("record_id", decisionId).order("created_at", { ascending: false }).limit(20)
      ]);
      
      if (!cancelled) {
        if (decRes.data) setDecision(decRes.data as Decision);
        if (appRes.data) setApprovals(appRes.data as Approval[]);
        if (confRes.data) setConflicts(confRes.data as Conflict[]);
        if (auditRes.data) setAuditEvents(auditRes.data);
      }
    }
    loadData();
    
    const channel = supabase
      .channel(`deep-analysis-${decisionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "decisions", filter: `id=eq.${decisionId}` }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "approvals", filter: `decision_id=eq.${decisionId}` }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "conflicts", filter: `decision_id=eq.${decisionId}` }, () => loadData())
      .subscribe();
      
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [id]);

  // Fetch analysis
  useEffect(() => {
    if (!id) return;
    async function loadAnalysis() {
      const a = await fetchLatestDeepAnalysis(id as string);
      setAnalysis(a);
      setLoading(false);
    }
    loadAnalysis();
  }, [id]);

  const auditResult = useMemo(() => {
    if (!decision) return null;
    return runAudit([decision], approvals, conflicts);
  }, [decision, approvals, conflicts]);

  const isStale = useMemo(() => {
    if (!analysis || !auditResult || !decision) return false;
    
    // Hash based on what we feed into the prompt
    const currentSnapshot = {
      decision_version: decision.version,
      status: decision.status,
      approvals: approvals.map(a => ({ id: a.id, status: a.status, version: a.version })),
      conflicts: conflicts.map(c => c.id),
      findings: auditResult.findings
    };
    
    const currentHash = computeSnapshotHash(currentSnapshot);
    return currentHash !== analysis.snapshot_hash;
  }, [analysis, auditResult, decision, approvals, conflicts]);

  async function handleRunNew() {
    if (!decision || !auditResult) return;
    
    const { allowed, remaining } = await checkAndUseCredit("deep_analysis");
    if (!allowed) {
      setError("You have exhausted your 3 credits for Deep Analysis today.");
      return;
    }

    setRunning(true);
    setError(null);
    try {
      const newAnalysis = await runNewDeepAnalysis(decision, approvals, conflicts, auditEvents);
      setAnalysis(newAnalysis);
    } catch (e: any) {
      setError(e.message || "Failed to generate deep analysis.");
    } finally {
      setRunning(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  if (loading || !decision) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
        <div className="spinner"></div>
      </div>
    );
  }

  const content = analysis?.content || {};

  return (
    <div className="risk-assessment-page" style={{ maxWidth: "1000px", margin: "0 auto", paddingBottom: "4rem" }}>
      {/* Back Navigation */}
      <div className="no-print" style={{ marginBottom: "2rem" }}>
        <button 
          onClick={() => navigate(`/decisions/${decision.id}`)} 
          className="btn btn-ghost" 
          style={{ display: "inline-flex", gap: "0.5rem", color: "var(--text-2)", paddingLeft: 0 }}
        >
          <ArrowLeft size={16} /> Back to Decision Details
        </button>
      </div>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: "0.75rem", margin: 0 }}>
            <Zap className="text-accent" size={28} /> AI Deep Analysis
          </h1>
          <p style={{ margin: "0.5rem 0 0 0", color: "var(--text-1)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontWeight: 600, color: "var(--text-0)" }}>{decision.component_name}</span>
            <span style={{ color: "var(--text-3)" }}>•</span>
            {decision.business_area}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }} className="no-print">
          <button className="btn btn-secondary" onClick={handlePrint} disabled={!analysis || running}>
            <Download size={14} /> Download PDF
          </button>
          <button className="btn btn-accent" onClick={handleRunNew} disabled={running}>
            {running ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <Play size={14} />}
            Run New Deep Analysis
          </button>
        </div>
      </div>

      {error && (
        <div className="alert" style={{ background: "var(--red-light)", color: "var(--red)", marginBottom: "2rem" }}>
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {isStale && !running && analysis && (
        <div className="alert" style={{ background: "rgba(251, 191, 36, 0.1)", color: "var(--amber)", border: "1px solid rgba(251, 191, 36, 0.2)", marginBottom: "2rem" }}>
          <AlertTriangle size={16} />
          <strong>Decision data has changed</strong> — this analysis was generated for an older state (v{analysis.decision_version}). Run a new analysis to see updated intelligence.
        </div>
      )}

      {running && (
        <div style={{ 
          background: "var(--bg-1)", padding: "3rem", borderRadius: "var(--r-lg)", 
          border: "1px solid var(--border)", textAlign: "center", marginBottom: "2rem" 
        }}>
          <div className="ai-core-loader" style={{ margin: "0 auto 1.5rem auto" }}>
            <div className="ai-core-ring" />
            <div className="ai-core-ring-inner" />
            <div className="ai-core-icon"><LogoMark size={32} /></div>
          </div>
          <h3 style={{ margin: "0 0 0.5rem 0", color: "var(--text-0)" }}>Generating Decision Intelligence...</h3>
          <p style={{ margin: 0, color: "var(--text-2)", fontSize: "0.875rem" }}>
            Analyzing workflow → Tracing approvals → Inspecting audit logs → Synthesizing impact
          </p>
        </div>
      )}

      {!analysis && !running ? (
        <div style={{ 
          background: "var(--bg-1)", padding: "4rem 2rem", borderRadius: "var(--r-lg)", 
          border: "1px dashed var(--border)", textAlign: "center" 
        }}>
          <Zap size={48} style={{ color: "var(--text-3)", margin: "0 auto 1rem auto" }} />
          <h3>No Analysis Found</h3>
          <p style={{ color: "var(--text-2)", marginBottom: "1.5rem" }}>
            Run the first Deep Analysis to reconstruct the complete state of this decision.
          </p>
          <button className="btn btn-accent" onClick={handleRunNew}>
            <Play size={14} /> Run First Analysis
          </button>
        </div>
      ) : (
        analysis && !running && analysis.status === "completed" && (
          <div className="assessment-document" style={{ 
            background: "var(--bg-0)", borderRadius: "var(--r-lg)", border: "1px solid var(--border)",
            boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)"
          }}>
            {/* Meta */}
            <div style={{ 
              padding: "1.5rem", borderBottom: "1px solid var(--border)", background: "var(--bg-1)",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              borderTopLeftRadius: "var(--r-lg)", borderTopRightRadius: "var(--r-lg)"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <div style={{
                  width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg, rgba(77,166,255,0.15) 0%, rgba(139,92,246,0.1) 100%)",
                  display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)"
                }}>
                  <LogoMark size={20} />
                </div>
                <div>
                  <div style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--text-0)" }}>Decision Deep Analysis</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-2)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Clock size={12} /> Generated: {new Date(analysis.created_at).toLocaleString()}
                    <span style={{ color: "var(--border)" }}>|</span>
                    v{analysis.decision_version}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ padding: "2rem" }}>
              {/* Executive Summary */}
              {content.executive_summary && (
                <div style={{ marginBottom: "3rem" }}>
                  <h2 style={{ fontSize: "1.25rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem", marginBottom: "1rem", color: "var(--text-0)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <FileText size={18} className="text-accent" /> Executive Summary
                  </h2>
                  <div className="markdown-content" style={{ fontSize: "1.0625rem", lineHeight: 1.6, color: "var(--text-1)", fontWeight: 500 }}>
                    <ReactMarkdown>{content.executive_summary}</ReactMarkdown>
                  </div>
                </div>
              )}

              {/* Who is Doing What */}
              {content.who_is_doing_what && content.who_is_doing_what.length > 0 && (
                <div style={{ marginBottom: "3rem" }}>
                  <h2 style={{ fontSize: "1.125rem", color: "var(--text-0)", margin: "0 0 1rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Users size={18} className="text-accent" /> Who Is Doing What
                  </h2>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
                    {content.who_is_doing_what.map((roleInfo: any, i: number) => (
                      <div key={i} style={{ padding: "1rem", background: "var(--bg-1)", border: "1px solid var(--border)", borderRadius: "var(--r-md)" }}>
                        <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-0)", marginBottom: "0.5rem", display: "flex", justifyContent: "space-between" }}>
                          {roleInfo.role}
                          <span style={{ fontSize: "0.6875rem", background: "var(--bg-2)", padding: "2px 6px", borderRadius: "4px", color: "var(--text-2)" }}>{roleInfo.current_state}</span>
                        </div>
                        <div style={{ fontSize: "0.8125rem", color: "var(--text-1)", marginBottom: "0.5rem" }}>
                          <span style={{ color: "var(--green)", marginRight: "0.25rem" }}>✓</span>
                          {roleInfo.what_they_did}
                        </div>
                        <div style={{ fontSize: "0.8125rem", color: "var(--text-1)" }}>
                          <span style={{ color: "var(--amber)", marginRight: "0.25rem" }}>!</span>
                          {roleInfo.what_they_need}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Workflow & Approvals */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem", marginBottom: "3rem" }}>
                {content.workflow_analysis && (
                  <div>
                    <h2 style={{ fontSize: "1.125rem", color: "var(--text-0)", margin: "0 0 1rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <Share2 size={18} className="text-accent" /> Workflow Analysis
                    </h2>
                    <div className="markdown-content" style={{ fontSize: "0.9375rem", color: "var(--text-1)", background: "var(--bg-1)", padding: "1rem", borderRadius: "var(--r-md)" }}>
                      <ReactMarkdown>{content.workflow_analysis}</ReactMarkdown>
                    </div>
                  </div>
                )}
                {content.approval_analysis && (
                  <div>
                    <h2 style={{ fontSize: "1.125rem", color: "var(--text-0)", margin: "0 0 1rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <CheckCircle2 size={18} className="text-green" /> Approval Status
                    </h2>
                    <div className="markdown-content" style={{ fontSize: "0.9375rem", color: "var(--text-1)", background: "var(--bg-1)", padding: "1rem", borderRadius: "var(--r-md)" }}>
                      <ReactMarkdown>{content.approval_analysis}</ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>

              {/* Version & Activity */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem", marginBottom: "3rem" }}>
                {content.version_analysis && (
                  <div>
                    <h2 style={{ fontSize: "1.125rem", color: "var(--text-0)", margin: "0 0 1rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <Layers size={18} className="text-accent" /> Version Analysis
                    </h2>
                    <div className="markdown-content" style={{ fontSize: "0.9375rem", color: "var(--text-1)", background: "var(--bg-1)", padding: "1rem", borderRadius: "var(--r-md)" }}>
                      <div style={{ marginBottom: "0.5rem", fontWeight: 600 }}>Current: {content.version_analysis.current_version} ({content.version_analysis.status})</div>
                      <ReactMarkdown>{content.version_analysis.history_markdown}</ReactMarkdown>
                    </div>
                  </div>
                )}
                {content.activity_analysis && (
                  <div>
                    <h2 style={{ fontSize: "1.125rem", color: "var(--text-0)", margin: "0 0 1rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <Activity size={18} className="text-accent" /> Activity Analysis
                    </h2>
                    <div className="markdown-content" style={{ fontSize: "0.9375rem", color: "var(--text-1)", background: "var(--bg-1)", padding: "1rem", borderRadius: "var(--r-md)" }}>
                      <ReactMarkdown>{content.activity_analysis}</ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>

              {/* Conflicts & Readiness */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem", marginBottom: "3rem" }}>
                {content.conflict_analysis && (
                  <div>
                    <h2 style={{ fontSize: "1.125rem", color: "var(--red)", margin: "0 0 1rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <AlertTriangle size={18} /> Conflict Analysis
                    </h2>
                    <div className="markdown-content" style={{ fontSize: "0.9375rem", color: "var(--text-1)", background: "rgba(248, 113, 113, 0.05)", padding: "1rem", borderRadius: "var(--r-md)", border: "1px solid rgba(248, 113, 113, 0.2)" }}>
                      <ReactMarkdown>{content.conflict_analysis}</ReactMarkdown>
                    </div>
                  </div>
                )}
                {content.readiness_analysis && (
                  <div>
                    <h2 style={{ fontSize: "1.125rem", color: "var(--text-0)", margin: "0 0 1rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <Shield size={18} className="text-accent" /> Readiness Analysis
                    </h2>
                    <div className="markdown-content" style={{ fontSize: "0.9375rem", color: "var(--text-1)", background: "var(--bg-1)", padding: "1rem", borderRadius: "var(--r-md)" }}>
                      <ReactMarkdown>{content.readiness_analysis}</ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>

              {/* Risks */}
              {content.risk_analysis && (
                <div style={{ marginBottom: "3rem" }}>
                  <h2 style={{ fontSize: "1.125rem", color: "var(--text-0)", margin: "0 0 1rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <AlertTriangle size={18} className="text-amber" /> Risk Analysis
                  </h2>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem" }}>
                    <div style={{ background: "rgba(52, 211, 153, 0.05)", padding: "1.5rem", borderRadius: "var(--r-md)", border: "1px solid rgba(52, 211, 153, 0.2)" }}>
                      <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--green)", textTransform: "uppercase", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                        <CheckCircle2 size={14} /> Already Being Done
                      </div>
                      <div className="markdown-content" style={{ fontSize: "0.9375rem", color: "var(--text-1)" }}>
                        <ReactMarkdown>{content.risk_analysis.already_being_done}</ReactMarkdown>
                      </div>
                    </div>
                    <div style={{ background: "rgba(248, 113, 113, 0.05)", padding: "1.5rem", borderRadius: "var(--r-md)", border: "1px solid rgba(248, 113, 113, 0.2)" }}>
                      <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--red)", textTransform: "uppercase", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                        <AlertTriangle size={14} /> Still Needs Attention
                      </div>
                      <div className="markdown-content" style={{ fontSize: "0.9375rem", color: "var(--text-1)" }}>
                        <ReactMarkdown>{content.risk_analysis.still_needs_attention}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Dependencies & Feedback */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem", marginBottom: "3rem" }}>
                {content.dependency_analysis && (
                  <div>
                    <h2 style={{ fontSize: "1.125rem", color: "var(--text-0)", margin: "0 0 1rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <Share2 size={18} className="text-accent" /> Dependencies
                    </h2>
                    <div className="markdown-content" style={{ fontSize: "0.9375rem", color: "var(--text-1)", background: "var(--bg-1)", padding: "1rem", borderRadius: "var(--r-md)" }}>
                      <ReactMarkdown>{content.dependency_analysis}</ReactMarkdown>
                    </div>
                  </div>
                )}
                {content.feedback_analysis && (
                  <div>
                    <h2 style={{ fontSize: "1.125rem", color: "var(--text-0)", margin: "0 0 1rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <FileText size={18} className="text-accent" /> Feedback & Rejections
                    </h2>
                    <div className="markdown-content" style={{ fontSize: "0.9375rem", color: "var(--text-1)", background: "var(--bg-1)", padding: "1rem", borderRadius: "var(--r-md)" }}>
                      <ReactMarkdown>{content.feedback_analysis}</ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>

              {/* What to Check */}
              {content.what_to_check_by_role && content.what_to_check_by_role.length > 0 && (
                <div style={{ marginBottom: "3rem" }}>
                  <h2 style={{ fontSize: "1.25rem", color: "var(--text-0)", margin: "0 0 1rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Shield size={18} className="text-accent" /> What Every Role Should Check
                  </h2>
                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    {content.what_to_check_by_role.map((item: any, i: number) => (
                      <div key={i} style={{ border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "1.5rem" }}>
                        <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-0)", marginBottom: "0.5rem" }}>{item.role}</div>
                        <div className="markdown-content" style={{ fontSize: "0.9375rem", color: "var(--text-1)" }}>
                          <ReactMarkdown>{item.guidance}</ReactMarkdown>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Next Actions */}
              {content.next_actions && content.next_actions.length > 0 && (
                <div>
                  <h2 style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--accent)", marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <Play size={24} /> WHAT SHOULD HAPPEN NEXT
                  </h2>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", background: "var(--bg-1)", padding: "2rem", borderRadius: "var(--r-lg)", border: "1px solid var(--border)" }}>
                    {content.next_actions.map((action: string, i: number) => (
                      <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "1rem" }}>
                        <div style={{ 
                          width: 28, height: 28, borderRadius: "50%", background: "var(--accent-light)", 
                          color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center",
                          fontWeight: 700, fontSize: "0.875rem", flexShrink: 0
                        }}>
                          {i + 1}
                        </div>
                        <div style={{ fontSize: "1.0625rem", color: "var(--text-0)", lineHeight: 1.5, paddingTop: "3px" }}>
                          {action}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      )}
    </div>
  );
}
