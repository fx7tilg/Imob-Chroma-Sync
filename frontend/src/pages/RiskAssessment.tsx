import { useEffect, useRef, useState, useMemo } from "react";
import { Shield, AlertTriangle, Play, Download, Clock, CheckCircle2, ChevronRight, Check, ChevronDown, ChevronUp, EyeOff, Eye, ArrowLeft } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { supabase } from "../lib/supabase";
import { fetchLatestAssessment, runNewRiskAssessment } from "../lib/riskAssessment";
import { computeSnapshotHash } from "../lib/hash";
import { runAudit, type AuditResult } from "../lib/auditSignals";
import type { RiskAssessment as RiskAssessmentType, Decision, Approval, Conflict } from "../types/db";
import LogoMark from "../components/LogoMark";
import { useAuth } from "../auth/AuthContext";
import { checkAndUseCredit } from "../lib/credits";
import { downloadElementAsPdf } from "../lib/pdfExport";

export default function RiskAssessment() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const reportRef = useRef<HTMLDivElement>(null);
  const [assessment, setAssessment] = useState<RiskAssessmentType | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hiddenRisks, setHiddenRisks] = useState<Record<number, boolean>>({});
  
  const toggleRisk = (index: number) => {
    setHiddenRisks(prev => ({ ...prev, [index]: !prev[index] }));
  };
  
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  
  // Real-time data fetch
  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      const [decRes, appRes, confRes] = await Promise.all([
        supabase.from("decisions").select("*").order("created_at", { ascending: false }),
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
      .channel("risk-data")
      .on("postgres_changes", { event: "*", schema: "public", table: "decisions" }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "approvals" }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "conflicts" }, () => loadData())
      .subscribe();
      
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  // Fetch assessment
  useEffect(() => {
    async function loadAssessment() {
      const a = await fetchLatestAssessment();
      setAssessment(a);
      setLoading(false);
    }
    loadAssessment();
  }, []);

  const auditResult = useMemo(() => {
    if (decisions.length === 0) return null;
    return runAudit(decisions, approvals, conflicts);
  }, [decisions, approvals, conflicts]);

  const isStale = useMemo(() => {
    if (!assessment || !auditResult) return false;
    const currentSnapshot = {
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
    const currentHash = computeSnapshotHash(currentSnapshot);
    return currentHash !== assessment.snapshot_hash;
  }, [assessment, auditResult, decisions]);

  async function handleRunNew() {
    if (!auditResult) return;

    const { allowed, remaining } = await checkAndUseCredit("risk_assessment");
    if (!allowed) {
      setError("You have exhausted your 3 credits for Risk Assessment today.");
      return;
    }

    setRunning(true);
    setError(null);
    try {
      const newAssessment = await runNewRiskAssessment(decisions, auditResult);
      setAssessment(newAssessment);
    } catch (e: any) {
      setError(e.message || "Failed to generate risk assessment.");
    } finally {
      setRunning(false);
    }
  }

  async function handlePrint() {
    if (!reportRef.current) return;
    await downloadElementAsPdf(reportRef.current, "Risk-Assessment");
  }

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="risk-assessment-page" style={{ maxWidth: "1000px", margin: "0 auto", paddingBottom: "4rem" }}>
      {/* Back Navigation */}
      <div className="no-print" style={{ marginBottom: "2rem" }}>
        <button 
          onClick={() => navigate(-1)} 
          className="btn btn-ghost" 
          style={{ display: "inline-flex", gap: "0.5rem", color: "var(--text-2)", paddingLeft: 0 }}
        >
          <ArrowLeft size={16} /> Back to Decisions
        </button>
      </div>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: "0.75rem", margin: 0 }}>
            <Shield className="text-accent" size={28} /> Enterprise Risk Assessment
          </h1>
          <p style={{ margin: "0.5rem 0 0 0", color: "var(--text-1)" }}>
            Persistent, definitive analysis of the complete decision landscape.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }} className="no-print">
          <button className="btn btn-secondary" onClick={handlePrint} disabled={!assessment || running}>
            <Download size={14} /> Download PDF
          </button>
          <button className="btn btn-accent" onClick={handleRunNew} disabled={running}>
            {running ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <Play size={14} />}
            Run New Assessment
          </button>
        </div>
      </div>

      {error && (
        <div className="alert" style={{ background: "var(--red-light)", color: "var(--red)", marginBottom: "2rem" }}>
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {isStale && !running && assessment && (
        <div className="alert" style={{ background: "rgba(251, 191, 36, 0.1)", color: "var(--amber)", border: "1px solid rgba(251, 191, 36, 0.2)", marginBottom: "2rem" }}>
          <AlertTriangle size={16} />
          <strong>New data available</strong> — this assessment is based on an earlier snapshot. Run a new assessment to see updated risks.
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
          <h3 style={{ margin: "0 0 0.5rem 0", color: "var(--text-0)" }}>Generating Executive Intelligence...</h3>
          <p style={{ margin: 0, color: "var(--text-2)", fontSize: "0.875rem" }}>
            Collecting data → Detecting risks → Ranking → Analyzing dependencies → Generating explanations
          </p>
        </div>
      )}

      {!assessment && !running ? (
        <div style={{ 
          background: "var(--bg-1)", padding: "4rem 2rem", borderRadius: "var(--r-lg)", 
          border: "1px dashed var(--border)", textAlign: "center" 
        }}>
          <Shield size={48} style={{ color: "var(--text-3)", margin: "0 auto 1rem auto" }} />
          <h3>No Assessment Found</h3>
          <p style={{ color: "var(--text-2)", marginBottom: "1.5rem" }}>
            Run the first Enterprise Risk Assessment to generate a definitive risk posture.
          </p>
          <button className="btn btn-accent" onClick={handleRunNew}>
            <Play size={14} /> Run First Assessment
          </button>
        </div>
      ) : (
        assessment && !running && assessment.status === "completed" && (
          <div className="assessment-document" ref={reportRef} style={{ 
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
                  width: 40, height: 40, borderRadius: "50%", background: "var(--accent-light)",
                  display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)"
                }}>
                  <LogoMark size={20} />
                </div>
                <div>
                  <div style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--text-0)" }}>Assessment Report</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-2)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Clock size={12} /> Generated: {new Date(assessment.created_at).toLocaleString()}
                    <span style={{ color: "var(--border)" }}>|</span>
                    ID: {assessment.id.slice(0, 8)}...
                  </div>
                </div>
              </div>
            </div>

            <div style={{ padding: "2rem" }}>
              {/* Executive Summary */}
              <div style={{ marginBottom: "3rem" }}>
                <h2 style={{ fontSize: "1.25rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem", marginBottom: "1rem", color: "var(--text-0)" }}>
                  Executive Overview
                </h2>
                <div className="markdown-content" style={{ fontSize: "0.9375rem", lineHeight: 1.7, color: "var(--text-1)" }}>
                  <ReactMarkdown>{assessment.executive_summary || ""}</ReactMarkdown>
                </div>
              </div>

              {/* What needs attention first */}
              <div style={{ 
                background: "rgba(77, 166, 255, 0.05)", border: "1px solid rgba(77, 166, 255, 0.2)",
                borderRadius: "var(--r-md)", padding: "1.5rem", marginBottom: "3rem"
              }}>
                <h2 style={{ fontSize: "1.125rem", color: "var(--accent)", margin: "0 0 1rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Play size={16} /> What Needs Attention First
                </h2>
                <div className="markdown-content" style={{ fontSize: "0.9375rem", lineHeight: 1.6, color: "var(--text-0)" }}>
                  <ReactMarkdown>{assessment.all_risks || ""}</ReactMarkdown>
                </div>
              </div>

              {/* Top 5 Risks */}
              <div>
                <h2 style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--red)", marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <AlertTriangle size={24} /> TOP 5 CRITICAL RISKS
                </h2>
                <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
                  {(assessment.top_5_risks || []).map((risk: any, i: number) => (
                    <div key={i} style={{
                      border: "1px solid var(--border)", borderRadius: "var(--r-md)", overflow: "hidden"
                    }}>
                      <div style={{
                        background: risk.severity === 'critical' ? 'rgba(248, 113, 113, 0.1)' : 'rgba(251, 191, 36, 0.1)',
                        padding: "1rem 1.5rem", borderBottom: "1px solid var(--border)",
                        display: "flex", alignItems: "center", gap: "1rem"
                      }}>
                        <div style={{ 
                          fontSize: "1.5rem", fontWeight: 900, color: risk.severity === 'critical' ? 'var(--red)' : 'var(--amber)',
                          opacity: 0.5
                        }}>#{risk.rank || i + 1}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--text-0)" }}>{risk.title}</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-2)", marginTop: "0.25rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            Severity: {risk.severity} • Teams: {risk.affected_teams?.join(", ")}
                          </div>
                        </div>
                        <button 
                          className="btn btn-ghost no-print" 
                          onClick={() => toggleRisk(i)}
                          style={{ color: "var(--text-2)", padding: "0.25rem 0.5rem" }}
                        >
                          {hiddenRisks[i] ? <><Eye size={14} /> Show</> : <><EyeOff size={14} /> Hide</>}
                        </button>
                      </div>
                      
                      {!hiddenRisks[i] && (
                        <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.5rem", background: "var(--bg-0)" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                          <div>
                            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", marginBottom: "0.5rem" }}>What is the risk?</div>
                            <div style={{ fontSize: "0.9375rem", color: "var(--text-1)", lineHeight: 1.6 }}>{risk.what_is_the_risk}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", marginBottom: "0.5rem" }}>Why is it critical?</div>
                            <div style={{ fontSize: "0.9375rem", color: "var(--text-1)", lineHeight: 1.6 }}>{risk.why_is_it_critical}</div>
                          </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
                          <div style={{ background: "rgba(52, 211, 153, 0.05)", padding: "1rem", borderRadius: "var(--r-sm)", border: "1px solid rgba(52, 211, 153, 0.2)" }}>
                            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--green)", textTransform: "uppercase", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                              <CheckCircle2 size={12} /> Already being done
                            </div>
                            <div style={{ fontSize: "0.875rem", color: "var(--text-1)", lineHeight: 1.5 }}>{risk.already_being_done}</div>
                          </div>
                          <div style={{ background: "rgba(248, 113, 113, 0.05)", padding: "1rem", borderRadius: "var(--r-sm)", border: "1px solid rgba(248, 113, 113, 0.2)" }}>
                            <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--red)", textTransform: "uppercase", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                              <AlertTriangle size={12} /> Still needs attention
                            </div>
                            <div style={{ fontSize: "0.875rem", color: "var(--text-1)", lineHeight: 1.5 }}>{risk.still_needs_attention}</div>
                          </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
                          <div>
                            <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", marginBottom: "0.25rem" }}>Impact</div>
                            <div style={{ fontSize: "0.8125rem", color: "var(--text-0)" }}>{risk.impact}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", marginBottom: "0.25rem" }}>Why Now?</div>
                            <div style={{ fontSize: "0.8125rem", color: "var(--text-0)" }}>{risk.why_now}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", marginBottom: "0.25rem" }}>Next Action</div>
                            <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--accent)" }}>{risk.next_action}</div>
                          </div>
                        </div>
                        
                        {risk.affected_decisions && risk.affected_decisions.length > 0 && (
                          <div style={{ paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
                            <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", marginBottom: "0.5rem" }}>Affected Decisions</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                              {risk.affected_decisions.map((id: string) => (
                                <Link to={`/decisions/${id}`} key={id} style={{ 
                                  fontSize: "0.6875rem", padding: "0.125rem 0.375rem", 
                                  background: "var(--bg-2)", borderRadius: "var(--r-sm)", color: "var(--accent)", textDecoration: "none", fontWeight: 600, border: "1px solid rgba(77, 166, 255, 0.2)"
                                }} className="affected-decision-link">
                                  {id.slice(0, 8)}
                                </Link>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}
