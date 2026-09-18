import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ClipboardCheck, Download, Loader2, Clock, CheckCircle2, XCircle,
  Shield, UserCheck, History
} from "lucide-react";
import LogoMark from "../../components/LogoMark";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer
} from "recharts";
import PermissionGate from "../../components/auth/PermissionGate";
import { supabase } from "../../lib/supabase";
import { useGlobalFilter } from "../../contexts/FilterContext";
import EnterpriseReportView from "../../components/EnterpriseReportView";
import type { Decision, Approval, Team, Conflict } from "../../types/db";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const C = {
  green: "#34d399", amber: "#fbbf24", red: "#f87171",
  accent: "#4da6ff", orange: "#fb923c",
};

const tooltipStyle = {
  contentStyle: {
    background: "rgba(0, 30, 80, 0.85)", border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "8px", backdropFilter: "blur(12px)",
    fontSize: "0.75rem", padding: "8px 12px", boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
  },
  itemStyle: { color: "#f0f2f5", fontSize: "0.75rem" },
  labelStyle: { color: "#6b7d99", fontSize: "0.6875rem", marginBottom: "4px" },
};

const TEAM_SHORT: Record<Team, string> = { design: "DES", engineering: "ENG", procurement: "PROC", quality: "QA" };
const TEAMS: Team[] = ["design", "engineering", "procurement", "quality"];

type AuditEntry = {
  id: number;
  table_name: string;
  row_id: string;
  action: string;
  changed_by: string | null;
  old_values: unknown;
  new_values: unknown;
  changed_at: string;
};

function getCurrentWeek() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = (now.getTime() - start.getTime()) / 86400000;
  return Math.ceil((diff + start.getDay() + 1) / 7);
}

function timeAgo(iso: string | null | undefined) {
  if (!iso) return "-";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function ComplianceAuditReport() {
  const { filterRange } = useGlobalFilter();
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [profiles, setProfiles] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      let decQuery = supabase.from("decisions").select("*").order("created_at", { ascending: false });
      let auditQuery = supabase.from("audit_log").select("*").order("changed_at", { ascending: false }).limit(200);
      if (filterRange) {
        decQuery = decQuery.gte("updated_at", filterRange.start).lte("updated_at", filterRange.end);
        auditQuery = auditQuery.gte("changed_at", filterRange.start).lte("changed_at", filterRange.end);
      }
      const [decRes, appRes, confRes, auditRes, profRes] = await Promise.all([
        decQuery,
        supabase.from("approvals").select("*"),
        supabase.from("conflicts").select("*"),
        auditQuery,
        supabase.from("profiles").select("id, full_name"),
      ]);
      if (!cancelled) {
        setDecisions((decRes.data ?? []) as Decision[]);
        setApprovals((appRes.data ?? []) as Approval[]);
        setConflicts((confRes.data ?? []) as Conflict[]);
        setAuditLogs((auditRes.data ?? []) as AuditEntry[]);
        const pm = new Map<string, string>();
        if (profRes.data) {
          (profRes.data as { id: string; full_name: string }[]).forEach(p => pm.set(p.id, p.full_name));
        }
        setProfiles(pm);
        setLoading(false);
      }
    }
    load();
    const channel = supabase
      .channel("compliance-audit-report")
      .on("postgres_changes", { event: "*", schema: "public", table: "decisions" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "approvals" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "audit_log" }, () => load())
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [filterRange]);

  /* ── Computed Stats ── */
  const stats = useMemo(() => {
    const totalEvents = auditLogs.length;

    // Approval chain completeness
    const nonDraft = decisions.filter(d => d.status !== "draft");
    let completedChains = 0;
    for (const d of nonDraft) {
      const dApprovals = approvals.filter(a => a.decision_id === d.id);
      const allResolved = TEAMS.every(t => dApprovals.some(a => a.team === t && a.status !== "pending"));
      if (allResolved) completedChains++;
    }
    const chainCompleteness = nonDraft.length > 0 ? Math.round((completedChains / nonDraft.length) * 100) : 0;

    // RBAC violations (RC-5 red)
    const rbacViolations = decisions.filter(d => d.rc5_approval_rbac === "red").length;

    // Avg approval cycle time (submitted_at → status === "approved")
    const approvedDecs = decisions.filter(d => d.status === "approved" && d.submitted_at);
    let totalCycleDays = 0;
    for (const d of approvedDecs) {
      const subAt = new Date(d.submitted_at!).getTime();
      const upAt = new Date(d.updated_at).getTime();
      totalCycleDays += (upAt - subAt) / (1000 * 60 * 60 * 24);
    }
    const avgCycleDays = approvedDecs.length > 0 ? Math.round(totalCycleDays / approvedDecs.length * 10) / 10 : 0;

    return { totalEvents, chainCompleteness, rbacViolations, avgCycleDays };
  }, [decisions, approvals, auditLogs]);

  /* ── Approval Chain Matrix ── */
  const approvalMatrix = useMemo(() => {
    return decisions.filter(d => d.status !== "draft").map(d => {
      const dApprovals = approvals.filter(a => a.decision_id === d.id);
      const teamStatus: Record<Team, { status: string; by: string | null; at: string | null }> = {
        design: { status: "pending", by: null, at: null },
        engineering: { status: "pending", by: null, at: null },
        procurement: { status: "pending", by: null, at: null },
        quality: { status: "pending", by: null, at: null },
      };
      for (const a of dApprovals) {
        teamStatus[a.team] = { status: a.status, by: a.approved_by, at: a.decided_at };
      }
      return { decision: d, teamStatus };
    });
  }, [decisions, approvals]);

  /* ── Status Transition Chart ── */
  const statusTransitions = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const log of auditLogs) {
      if (log.table_name !== "decisions") continue;
      const newV = log.new_values as Record<string, unknown> | null;
      if (newV && typeof newV === "object" && "status" in newV) {
        const status = String(newV.status);
        counts[status] = (counts[status] || 0) + 1;
      }
    }
    const order = ["draft", "submitted", "under_review", "approved", "rejected"];
    return order.map(s => ({
      name: s.replace(/_/g, " "),
      count: counts[s] || 0,
      fill: s === "approved" ? C.green : s === "rejected" ? C.red : s === "under_review" ? C.amber : s === "submitted" ? C.accent : "#6b7d99",
    }));
  }, [auditLogs]);

  const kw = getCurrentWeek();
  const dateStr = new Date().toLocaleDateString("en-GB");



  /* ── PDF Export ── */
  async function exportPDF() {
    setExporting(true);
    try {
      const doc = new jsPDF({ orientation: "landscape" });
      doc.setFillColor(26, 26, 46);
      doc.rect(0, 0, 297, 26, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Compliance & Audit Trail Report", 14, 12);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`KW ${kw} / ${new Date().getFullYear()} · ${stats.totalEvents} audit events · Chain completeness: ${stats.chainCompleteness}%`, 14, 20);

      // Approval chain table
      autoTable(doc, {
        head: [["Component", "Area", "Status", "Design", "Engineering", "Procurement", "Quality", "Version"]],
        body: approvalMatrix.map(row => [
          row.decision.component_name, row.decision.business_area, row.decision.status,
          row.teamStatus.design.status, row.teamStatus.engineering.status,
          row.teamStatus.procurement.status, row.teamStatus.quality.status,
          `v${row.decision.version}`,
        ]),
        startY: 32,
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [45, 45, 68], textColor: [255, 255, 255], fontStyle: "bold" },
        didParseCell: (data: any) => {
          if (data.section === "body" && data.column.index >= 3 && data.column.index <= 6) {
            const val = data.cell.raw;
            if (val === "approved") data.cell.styles.textColor = [22, 163, 74];
            else if (val === "rejected") data.cell.styles.textColor = [220, 38, 38];
          }
        },
      });

      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 150);
        doc.text(`Chroma Sync - Compliance Audit Trail - Page ${i}/${pageCount}`, 14, doc.internal.pageSize.getHeight() - 8);
      }
      doc.save(`compliance-audit-KW${kw}-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <PermissionGate permission="reports.view">
      <div>
        {/* ── Hero Header ── */}
        <div style={{
          background: "linear-gradient(135deg, #1a0a0a, #2d1a0a, #1a1a0a)",
          borderRadius: "var(--r-lg)", padding: "1.5rem 2rem", marginBottom: "1.5rem",
          border: "1px solid rgba(251, 146, 60, 0.15)",
          display: "flex", justifyContent: "space-between", alignItems: "flex-end",
          flexWrap: "wrap", gap: "1rem",
          boxShadow: "0 8px 40px rgba(251, 146, 60, 0.06)",
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.375rem" }}>
              <div style={{
                width: 36, height: 36, borderRadius: "var(--r-md)",
                background: "linear-gradient(135deg, #fb923c, #f97316)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 0 20px rgba(251, 146, 60, 0.4)",
              }}>
                <ClipboardCheck size={18} style={{ color: "#fff" }} />
              </div>
              <h1 style={{ margin: 0, color: "#fff", fontSize: "1.375rem" }}>Compliance & Audit Trail</h1>
              <span style={{
                fontSize: "0.625rem", fontWeight: 700, color: "#fb923c",
                background: "rgba(251, 146, 60, 0.15)", padding: "2px 8px",
                borderRadius: "var(--r-full)", letterSpacing: "0.05em"
              }}>
                KW {kw} · {new Date().getFullYear()}
              </span>
            </div>
            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.8125rem", margin: 0 }}>
              Full decision lifecycle traceability · Approval chain audit · RBAC compliance · Generated {dateStr}
            </p>
          </div>
          <button className="btn btn-accent" onClick={exportPDF} disabled={exporting || decisions.length === 0}>
            {exporting ? <Loader2 size={13} className="spin" /> : <Download size={13} />}
            {exporting ? "Exporting..." : "Export PDF"}
          </button>
        </div>

        {loading && <p style={{ color: "var(--text-2)" }}>Loading audit data...</p>}

        {!loading && (
          <>
            {/* ── KPI Strip ── */}
            <div className="grid4" style={{ marginBottom: "1.5rem" }}>
              <div className="card" style={{ marginBottom: 0, padding: "1rem 1.25rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", marginBottom: "0.5rem" }}>
                  <History size={12} style={{ color: "var(--text-3)" }} />
                  <span style={{ fontSize: "0.6875rem", color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Audit Events</span>
                </div>
                <div style={{ fontSize: "1.75rem", fontWeight: 700, color: C.accent, fontFamily: "var(--font-outfit)" }}>{stats.totalEvents}</div>
              </div>
              <div className="card" style={{ marginBottom: 0, padding: "1rem 1.25rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", marginBottom: "0.5rem" }}>
                  <CheckCircle2 size={12} style={{ color: "var(--text-3)" }} />
                  <span style={{ fontSize: "0.6875rem", color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Chain Completeness</span>
                </div>
                <div style={{ fontSize: "1.75rem", fontWeight: 700, color: stats.chainCompleteness >= 80 ? C.green : stats.chainCompleteness >= 50 ? C.amber : C.red, fontFamily: "var(--font-outfit)" }}>{stats.chainCompleteness}%</div>
              </div>
              <div className="card" style={{ marginBottom: 0, padding: "1rem 1.25rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", marginBottom: "0.5rem" }}>
                  <Shield size={12} style={{ color: "var(--text-3)" }} />
                  <span style={{ fontSize: "0.6875rem", color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.04em" }}>RBAC Violations</span>
                </div>
                <div style={{ fontSize: "1.75rem", fontWeight: 700, color: stats.rbacViolations > 0 ? C.red : C.green, fontFamily: "var(--font-outfit)" }}>{stats.rbacViolations}</div>
              </div>
              <div className="card" style={{ marginBottom: 0, padding: "1rem 1.25rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", marginBottom: "0.5rem" }}>
                  <Clock size={12} style={{ color: "var(--text-3)" }} />
                  <span style={{ fontSize: "0.6875rem", color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Avg Cycle Time</span>
                </div>
                <div style={{ fontSize: "1.75rem", fontWeight: 700, color: C.orange, fontFamily: "var(--font-outfit)" }}>{stats.avgCycleDays > 0 ? `${stats.avgCycleDays}d` : "-"}</div>
              </div>
            </div>

            {/* ── Status Transitions Chart ── */}
            <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: "1.5rem" }}>
              <div style={{ padding: "0.875rem 1.25rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                <History size={14} style={{ color: "var(--text-3)" }} />
                <h2 style={{ margin: 0, fontSize: "0.875rem" }}>Status Transitions</h2>
                <span style={{ fontSize: "0.6875rem", color: "var(--text-3)", marginLeft: "auto" }}>Based on audit log activity</span>
              </div>
              <div style={{ padding: "1.25rem", height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statusTransitions} margin={{ top: 0, right: 12, left: -24, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: "#f0f2f5", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#6b7d99", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <RechartsTooltip {...tooltipStyle} />
                    <Bar dataKey="count" animationDuration={1200} radius={[4, 4, 0, 0]}>
                      {statusTransitions.map((entry, i) => (
                        <rect key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ── Approval Chain Matrix ── */}
            <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: "1.5rem" }}>
              <div style={{ padding: "0.875rem 1.25rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                <UserCheck size={14} style={{ color: "var(--text-3)" }} />
                <h2 style={{ margin: 0, fontSize: "0.875rem" }}>Approval Chain Matrix</h2>
                <span style={{ fontSize: "0.6875rem", color: "var(--text-3)", marginLeft: "auto" }}>{approvalMatrix.length} decisions tracked</span>
              </div>
              <div style={{ maxHeight: 420, overflowY: "auto" }}>
                <table className="data-table">
                  <thead style={{ position: "sticky", top: 0, background: "var(--bg-0)", zIndex: 1 }}>
                    <tr>
                      <th>Component</th>
                      <th>Area</th>
                      <th>Status</th>
                      {TEAMS.map(t => <th key={t} style={{ textAlign: "center" }}>{TEAM_SHORT[t]}</th>)}
                      <th style={{ textAlign: "center" }}>Ver.</th>
                      <th>Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {approvalMatrix.map(({ decision: d, teamStatus }) => (
                      <tr key={d.id}>
                        <td>
                          <Link to={`/decisions/${d.id}`} style={{ color: "var(--accent)", fontWeight: 500, textDecoration: "none" }}>
                            {d.component_name}
                          </Link>
                        </td>
                        <td>{d.business_area}</td>
                        <td><span className={`badge badge-${d.status === "approved" ? "green" : d.status === "rejected" ? "red" : d.status === "submitted" ? "blue" : d.status === "under_review" ? "amber" : "purple"}`}>{d.status.replace(/_/g, " ")}</span></td>
                        {TEAMS.map(t => {
                          const ts = teamStatus[t];
                          const icon = ts.status === "approved" ? <CheckCircle2 size={12} style={{ color: C.green }} /> :
                            ts.status === "rejected" ? <XCircle size={12} style={{ color: C.red }} /> :
                              <Clock size={12} style={{ color: "var(--text-3)" }} />;
                          return (
                            <td key={t} style={{ textAlign: "center" }} title={ts.by ? `${profiles.get(ts.by) || "Unknown"} - ${ts.at ? formatDate(ts.at) : ""}` : "Pending"}>
                              {icon}
                            </td>
                          );
                        })}
                        <td style={{ textAlign: "center", fontSize: "0.6875rem", color: "var(--text-3)" }}>v{d.version}</td>
                        <td style={{ fontSize: "0.6875rem", color: "var(--text-2)" }}>{d.submitted_at ? timeAgo(d.submitted_at) : "-"}</td>
                      </tr>
                    ))}
                    {approvalMatrix.length === 0 && (
                      <tr><td colSpan={9} style={{ textAlign: "center", padding: "3rem", color: "var(--text-2)" }}>No decisions in the workflow.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Recent Audit Log ── */}
            <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: "1.5rem" }}>
              <div style={{ padding: "0.875rem 1.25rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                <History size={14} style={{ color: C.orange }} />
                <h2 style={{ margin: 0, fontSize: "0.875rem" }}>Change History Feed</h2>
                <span style={{ fontSize: "0.6875rem", color: "var(--text-3)", marginLeft: "auto" }}>Last {Math.min(auditLogs.length, 50)} events</span>
              </div>
              <div style={{ maxHeight: 360, overflowY: "auto" }}>
                {auditLogs.slice(0, 50).map(log => {
                  const actionColor = log.action === "INSERT" ? C.green : log.action === "UPDATE" ? C.amber : log.action === "DELETE" ? C.red : "var(--text-3)";
                  const changedFields = log.new_values && typeof log.new_values === "object"
                    ? Object.keys(log.new_values as Record<string, unknown>).filter(k => k !== "updated_at").slice(0, 4)
                    : [];
                  return (
                    <div key={log.id} style={{
                      padding: "0.75rem 1.25rem", borderBottom: "1px solid var(--border)",
                      display: "flex", gap: "0.75rem", alignItems: "flex-start",
                    }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: "50%", background: actionColor,
                        flexShrink: 0, marginTop: 5,
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", gap: "0.375rem", alignItems: "center", marginBottom: "0.25rem", flexWrap: "wrap" }}>
                          <span className="badge" style={{ fontSize: "0.5625rem", background: `${actionColor}20`, color: actionColor, fontWeight: 700 }}>{log.action}</span>
                          <span style={{ fontSize: "0.6875rem", color: "var(--text-0)", fontWeight: 500 }}>{log.table_name}</span>
                          {log.changed_by && (
                            <span style={{ fontSize: "0.625rem", color: "var(--text-2)" }}>by {profiles.get(log.changed_by) || log.changed_by.slice(0, 8)}</span>
                          )}
                          <span style={{ fontSize: "0.5625rem", color: "var(--text-3)", marginLeft: "auto" }}>{timeAgo(log.changed_at)}</span>
                        </div>
                        {changedFields.length > 0 && (
                          <div style={{ fontSize: "0.625rem", color: "var(--text-3)" }}>
                            Fields: {changedFields.join(", ")}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {auditLogs.length === 0 && (
                  <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-3)" }}>No audit events found.</div>
                )}
              </div>
            </div>

          </>

        )}
      </div>
    </PermissionGate>
  );
}
