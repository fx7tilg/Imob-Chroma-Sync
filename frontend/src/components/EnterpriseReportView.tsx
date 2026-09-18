import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Play, Download, Clock, AlertTriangle, FileText, Activity, AlertCircle, Search, ArrowRight, Shield } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { fetchLatestEnterpriseReport, runNewEnterpriseReport } from "../lib/enterpriseReports";
import { computeSnapshotHash } from "../lib/hash";
import { runAudit, type AuditResult } from "../lib/auditSignals";
import type { EnterpriseReport, EnterpriseReportType, Decision, Approval, Conflict } from "../types/db";
import LogoMark from "./LogoMark";
import { checkAndUseCredit } from "../lib/credits";

interface Props {
  reportType: EnterpriseReportType;
  title: string;
  decisions: Decision[];
  approvals: Approval[];
  conflicts: Conflict[];
}

export default function EnterpriseReportView({ reportType, title, decisions, approvals, conflicts }: Props) {
  const navigate = useNavigate();
  const [report, setReport] = useState<EnterpriseReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const a = await fetchLatestEnterpriseReport(reportType);
      setReport(a);
      setLoading(false);
    }
    load();
  }, [reportType]);

  const auditResult = useMemo(() => {
    if (decisions.length === 0) return null;
    return runAudit(decisions, approvals, conflicts);
  }, [decisions, approvals, conflicts]);

  const isStale = useMemo(() => {
    if (!report || !auditResult) return false;
    const currentSnapshot = {
      decisions: decisions.map(d => ({ id: d.id, version: d.version, status: d.status })),
      approvals: approvals.map(a => ({ id: a.id, status: a.status, version: a.version })),
      conflicts: conflicts.map(c => c.id),
      findings: auditResult.findings
    };
    const currentHash = computeSnapshotHash(currentSnapshot);
    return currentHash !== report.snapshot_hash;
  }, [report, auditResult, decisions, approvals, conflicts]);

  async function handleRunNew() {
    if (decisions.length === 0 || !auditResult) return;
    
    // We can track credits per report type for granularity, e.g. "enterprise_report_supply_chain"
    const { allowed, remaining } = await checkAndUseCredit(`enterprise_report_${reportType}`);
    if (!allowed) {
      setError(`You have exhausted your 3 credits for this report today.`);
      return;
    }

    setRunning(true);
    setError(null);
    try {
      const newReport = await runNewEnterpriseReport(reportType, decisions, approvals, conflicts);
      setReport(newReport);
    } catch (e: any) {
      setError(e.message || "Failed to generate report.");
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

  const content = report?.content || {};
  const standardKeys = ["executive_summary", "critical_findings", "strategic_recommendations"];
  const dynamicKeys = Object.keys(content).filter(k => !standardKeys.includes(k));

  return (
    <div className="enterprise-report-view" style={{ marginTop: "3rem", paddingBottom: "4rem" }}>
      {/* Header Controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }} className="no-print">
        <h2 style={{ display: "flex", alignItems: "center", gap: "0.5rem", margin: 0, fontSize: "1.25rem", color: "var(--text-0)" }}>
          <Shield size={20} className="text-accent" /> AI Deep Analysis
        </h2>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button className="btn btn-secondary" onClick={handlePrint} disabled={!report || running}>
            <Download size={14} /> Download PDF
          </button>
          <button className="btn btn-accent" onClick={handleRunNew} disabled={running || decisions.length === 0}>
            {running ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <Play size={14} />}
            Run AI Analysis
          </button>
        </div>
      </div>

      {error && (
        <div className="alert" style={{ background: "var(--red-light)", color: "var(--red)", marginBottom: "2rem" }}>
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {isStale && !running && report && (
        <div className="alert" style={{ background: "rgba(251, 191, 36, 0.1)", color: "var(--amber)", border: "1px solid rgba(251, 191, 36, 0.2)", marginBottom: "2rem" }}>
          <AlertTriangle size={16} />
          <strong>Platform state has changed</strong> — this report was generated for an older state of the SaaS. Run a new analysis to get current intelligence.
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
          <h3 style={{ margin: "0 0 0.5rem 0", color: "var(--text-0)" }}>Analyzing {title}...</h3>
          <p style={{ margin: 0, color: "var(--text-2)", fontSize: "0.875rem" }}>
            Evaluating {decisions.length} decisions → Inspecting data points → Generating executive summary
          </p>
        </div>
      )}

      {!report && !running ? (
        <div style={{ 
          background: "var(--bg-1)", padding: "4rem 2rem", borderRadius: "var(--r-lg)", 
          border: "1px dashed var(--border)", textAlign: "center" 
        }}>
          <Search size={48} style={{ color: "var(--text-3)", margin: "0 auto 1rem auto" }} />
          <h3>No AI Analysis Found</h3>
          <p style={{ color: "var(--text-2)", marginBottom: "1.5rem" }}>
            Run the first AI analysis to generate a deep dive report for {title}.
          </p>
          <button className="btn btn-accent" onClick={handleRunNew} disabled={decisions.length === 0}>
            <Play size={14} /> Run First Analysis
          </button>
        </div>
      ) : (
        report && !running && report.status === "completed" && (
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
                  <div style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--text-0)" }}>Enterprise AI Report: {title}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-2)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Clock size={12} /> Generated: {new Date(report.created_at).toLocaleString()}
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

              {/* Dynamic Sections (e.g. Pipeline Health, Bottlenecks) */}
              {dynamicKeys.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem", marginBottom: "3rem" }}>
                  {dynamicKeys.map(key => (
                    <div key={key}>
                      <h2 style={{ fontSize: "1.125rem", color: "var(--text-0)", margin: "0 0 1rem 0", display: "flex", alignItems: "center", gap: "0.5rem", textTransform: "capitalize" }}>
                        <Activity size={18} className="text-accent" /> {key.replace(/_/g, " ")}
                      </h2>
                      <div className="markdown-content" style={{ fontSize: "0.9375rem", color: "var(--text-1)", background: "var(--bg-1)", padding: "1rem", borderRadius: "var(--r-md)" }}>
                        <ReactMarkdown>{content[key]}</ReactMarkdown>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Critical Findings */}
              {content.critical_findings && content.critical_findings.length > 0 && (
                <div style={{ marginBottom: "3rem" }}>
                  <h2 style={{ fontSize: "1.25rem", color: "var(--red)", margin: "0 0 1rem 0", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <AlertCircle size={18} /> Critical Findings
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
                          <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px dashed var(--border)", display: "flex", justifyContent: "flex-end" }} className="no-print">
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
