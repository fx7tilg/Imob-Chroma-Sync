import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Shield, AlertTriangle, Play, Download, Clock, ArrowLeft, Zap, Users, Activity, CheckCircle2, FileText, Share2, Search, ArrowRight } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { supabase } from "../lib/supabase";
import { fetchLatestComprehensiveAudit, runNewComprehensiveAudit } from "../lib/comprehensiveAudit";
import { computeSnapshotHash } from "../lib/hash";
import { runAudit, type AuditResult } from "../lib/auditSignals";
import type { ComprehensiveAudit, Decision, Approval, Conflict } from "../types/db";
import LogoMark from "../components/LogoMark";
import { useAuth } from "../auth/AuthContext";
import { checkAndUseCredit } from "../lib/credits";

export default function ComprehensiveAuditPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  
  const [audit, setAudit] = useState<ComprehensiveAudit | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  
  // Real-time data fetch
  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      const [decRes, appRes, confRes] = await Promise.all([
        supabase.from("decisions").select("*"),
        supabase.from("approvals").select("*"),
        supabase.from("conflicts").select("*").eq("resolved", false)
      ]);
      
      if (!cancelled) {
        if (decRes.data) setDecisions(decRes.data as Decision[]);
        if (appRes.data) setApprovals(appRes.data as Approval[]);
        if (confRes.data) setConflicts(confRes.data as Conflict[]);
      }
    }
    loadData();
    
    const channel = supabase
      .channel(`comprehensive-audit-global`)
      .on("postgres_changes", { event: "*", schema: "public", table: "decisions" }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "approvals" }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "conflicts" }, () => loadData())
      .subscribe();
      
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  // Fetch analysis
  useEffect(() => {
    async function loadAudit() {
      const a = await fetchLatestComprehensiveAudit();
      setAudit(a);
      setLoading(false);
    }
    loadAudit();
  }, []);

  const auditResult = useMemo(() => {
    if (decisions.length === 0) return null;
    return runAudit(decisions, approvals, conflicts);
  }, [decisions, approvals, conflicts]);

  const isStale = useMemo(() => {
    if (!audit || !auditResult) return false;
    
    // Hash based on what we feed into the prompt
    const currentSnapshot = {
      decisions: decisions.map(d => ({ id: d.id, version: d.version, status: d.status })),
      approvals: approvals.map(a => ({ id: a.id, status: a.status, version: a.version })),
      conflicts: conflicts.map(c => c.id),
      findings: auditResult.findings
    };
    
    const currentHash = computeSnapshotHash(currentSnapshot);
    return currentHash !== audit.snapshot_hash;
  }, [audit, auditResult, decisions, approvals, conflicts]);

  async function handleRunNew() {
    if (decisions.length === 0 || !auditResult) return;
    
    const { allowed, remaining } = await checkAndUseCredit("comprehensive_audit");
    if (!allowed) {
      setError("You have exhausted your 3 credits for Comprehensive Audit today.");
      return;
    }

    setRunning(true);
    setError(null);
    try {
      const newAudit = await runNewComprehensiveAudit(decisions, approvals, conflicts);
      setAudit(newAudit);
    } catch (e: any) {
      setError(e.message || "Failed to generate comprehensive audit.");
    } finally {
      setRunning(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
        <div className="spinner"></div>
      </div>
    );
  }

  const content = audit?.content || {};

  return (
    <div className="risk-assessment-page" style={{ maxWidth: "1000px", margin: "0 auto", paddingBottom: "4rem" }}>
      {/* Back Navigation */}
      <div className="no-print" style={{ marginBottom: "2rem" }}>
        <Link to="/" className="btn btn-ghost" style={{ display: "inline-flex", gap: "0.5rem", color: "var(--text-2)", paddingLeft: 0, textDecoration: "none" }}>
          <ArrowLeft size={16} /> Back to Dashboard
        </Link>
      </div>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: "0.75rem", margin: 0 }}>
            <Search className="text-accent" size={28} /> SaaS Comprehensive Audit
          </h1>
          <p style={{ margin: "0.5rem 0 0 0", color: "var(--text-1)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontWeight: 600, color: "var(--text-0)" }}>Global Scope</span>
            <span style={{ color: "var(--text-3)" }}>•</span>
            All Active Decisions & Pipelines
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }} className="no-print">
          <button className="btn btn-secondary" onClick={handlePrint} disabled={!audit || running}>
            <Download size={14} /> Download PDF
          </button>
          <button className="btn btn-accent" onClick={handleRunNew} disabled={running || decisions.length === 0}>
            {running ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <Play size={14} />}
            Run Comprehensive Audit
          </button>
        </div>
      </div>

      {error && (
        <div className="alert" style={{ background: "var(--red-light)", color: "var(--red)", marginBottom: "2rem" }}>
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {isStale && !running && audit && (
        <div className="alert" style={{ background: "rgba(251, 191, 36, 0.1)", color: "var(--amber)", border: "1px solid rgba(251, 191, 36, 0.2)", marginBottom: "2rem" }}>
          <AlertTriangle size={16} />
          <strong>Platform state has changed</strong> — this audit was generated for an older state of the SaaS. Run a new audit to get current intelligence.
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
          <h3 style={{ margin: "0 0 0.5rem 0", color: "var(--text-0)" }}>Scanning Entire Platform...</h3>
          <p style={{ margin: 0, color: "var(--text-2)", fontSize: "0.875rem" }}>
            Analyzing {decisions.length} decisions → Inspecting cross-team impacts → Evaluating compliance
          </p>
        </div>
      )}

      {!audit && !running ? (
        <div style={{ 
          background: "var(--bg-1)", padding: "4rem 2rem", borderRadius: "var(--r-lg)", 
          border: "1px dashed var(--border)", textAlign: "center" 
        }}>
          <Search size={48} style={{ color: "var(--text-3)", margin: "0 auto 1rem auto" }} />
          <h3>No Comprehensive Audit Found</h3>
          <p style={{ color: "var(--text-2)", marginBottom: "1.5rem" }}>
            Run the first Comprehensive Audit to analyze the health of the entire SaaS platform.
          </p>
          <button className="btn btn-accent" onClick={handleRunNew} disabled={decisions.length === 0}>
            <Play size={14} /> Run First Audit
          </button>
        </div>
      ) : (
        audit && !running && audit.status === "completed" && (
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
                  <div style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--text-0)" }}>Comprehensive Audit Report</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-2)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Clock size={12} /> Generated: {new Date(audit.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ padding: "2rem" }}>
              {/* Overview Strip */}
              {auditResult && (
                <div className="audit-overview-strip no-print" style={{ marginBottom: "3rem" }}>
                  <div>
                    <div className="audit-stat-value">{auditResult.summary.decisionsReviewed}</div>
                    <div className="audit-stat-label">Reviewed</div>
                  </div>
                  <div>
                    <div className="audit-stat-value" style={{ color: "var(--green)" }}>{auditResult.summary.ready}</div>
                    <div className="audit-stat-label">Ready</div>
                  </div>
                  <div>
                    <div className="audit-stat-value" style={{ color: "var(--amber)" }}>{auditResult.summary.needsAttention}</div>
                    <div className="audit-stat-label">Needs Attention</div>
                  </div>
                  <div>
                    <div className="audit-stat-value" style={{ color: "var(--red)" }}>{auditResult.summary.blocked}</div>
                    <div className="audit-stat-label">Blocked</div>
                  </div>
                  <div>
                    <div className="audit-stat-value" style={{ color: "var(--red)" }}>{auditResult.summary.conflicts}</div>
                    <div className="audit-stat-label">Conflicts</div>
                  </div>
                  <div>
                    <div className="audit-stat-value" style={{ color: "var(--amber)" }}>{auditResult.summary.missingEvidence}</div>
                    <div className="audit-stat-label">Missing Data</div>
                  </div>
                </div>
              )}

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

              {/* Global Health & Bottlenecks */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem", marginBottom: "3rem" }}>
                {content.global_pipeline_health && (
                  <div>
                    <h2 style={{ fontSize: "1.125rem", color: "var(--text-0)", margin: "0 0 1rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <Activity size={18} className="text-accent" /> Global Pipeline Health
                    </h2>
                    <div className="markdown-content" style={{ fontSize: "0.9375rem", color: "var(--text-1)", background: "var(--bg-1)", padding: "1rem", borderRadius: "var(--r-md)" }}>
                      <ReactMarkdown>{content.global_pipeline_health}</ReactMarkdown>
                    </div>
                  </div>
                )}
                {content.systemic_bottlenecks && (
                  <div>
                    <h2 style={{ fontSize: "1.125rem", color: "var(--amber)", margin: "0 0 1rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <AlertTriangle size={18} /> Systemic Bottlenecks
                    </h2>
                    <div className="markdown-content" style={{ fontSize: "0.9375rem", color: "var(--text-1)", background: "rgba(251, 191, 36, 0.05)", border: "1px solid rgba(251, 191, 36, 0.2)", padding: "1rem", borderRadius: "var(--r-md)" }}>
                      <ReactMarkdown>{content.systemic_bottlenecks}</ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>

              {/* Cross Team Impact & Compliance */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem", marginBottom: "3rem" }}>
                {content.cross_team_impact_analysis && (
                  <div>
                    <h2 style={{ fontSize: "1.125rem", color: "var(--text-0)", margin: "0 0 1rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <Share2 size={18} className="text-accent" /> Cross-Team Impact
                    </h2>
                    <div className="markdown-content" style={{ fontSize: "0.9375rem", color: "var(--text-1)", background: "var(--bg-1)", padding: "1rem", borderRadius: "var(--r-md)" }}>
                      <ReactMarkdown>{content.cross_team_impact_analysis}</ReactMarkdown>
                    </div>
                  </div>
                )}
                {content.compliance_and_rbac_audit && (
                  <div>
                    <h2 style={{ fontSize: "1.125rem", color: "var(--text-0)", margin: "0 0 1rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <Shield size={18} className="text-accent" /> Compliance & RBAC Audit
                    </h2>
                    <div className="markdown-content" style={{ fontSize: "0.9375rem", color: "var(--text-1)", background: "var(--bg-1)", padding: "1rem", borderRadius: "var(--r-md)" }}>
                      <ReactMarkdown>{content.compliance_and_rbac_audit}</ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>

              {/* Critical Findings */}
              {content.critical_findings && content.critical_findings.length > 0 && (
                <div style={{ marginBottom: "3rem" }}>
                  <h2 style={{ fontSize: "1.25rem", color: "var(--red)", margin: "0 0 1rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <AlertTriangle size={18} /> Critical Findings
                  </h2>
                  <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                    {content.critical_findings.map((item: any, i: number) => (
                      <div key={i} style={{ border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "1.5rem", background: item.severity === "critical" ? "rgba(248, 113, 113, 0.05)" : "var(--bg-1)" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                          <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-0)" }}>{item.title}</div>
                          <div style={{ 
                            fontSize: "0.6875rem", textTransform: "uppercase", padding: "0.125rem 0.5rem", borderRadius: "4px",
                            background: item.severity === "critical" || item.severity === "high" ? "rgba(248, 113, 113, 0.1)" : "rgba(251, 191, 36, 0.1)",
                            color: item.severity === "critical" || item.severity === "high" ? "var(--red)" : "var(--amber)",
                            fontWeight: 700
                          }}>
                            {item.severity}
                          </div>
                        </div>
                        <div className="markdown-content" style={{ fontSize: "0.9375rem", color: "var(--text-1)" }}>
                          <ReactMarkdown>{item.details}</ReactMarkdown>
                        </div>
                        {item.affected_decision_ids && item.affected_decision_ids.length > 0 && (
                          <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px dashed var(--border)", display: "flex", justifyContent: "flex-end" }}>
                            <button
                              className="btn btn-ghost"
                              onClick={(e) => { e.stopPropagation(); navigate(`/decisions?ids=${item.affected_decision_ids.join(",")}`); }}
                              style={{ fontSize: "0.8125rem", padding: "0.375rem 0.875rem" }}
                            >
                              View {item.affected_decision_ids.length} decision{item.affected_decision_ids.length > 1 ? "s" : ""} <ArrowRight size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Strategic Recommendations */}
              {content.strategic_recommendations && content.strategic_recommendations.length > 0 && (
                <div>
                  <h2 style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--accent)", marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <Play size={24} /> STRATEGIC RECOMMENDATIONS
                  </h2>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", background: "var(--bg-1)", padding: "2rem", borderRadius: "var(--r-lg)", border: "1px solid var(--border)" }}>
                    {content.strategic_recommendations.map((action: string, i: number) => (
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
