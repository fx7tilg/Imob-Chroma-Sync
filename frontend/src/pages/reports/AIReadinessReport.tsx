import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Shield, Download, Loader2, TrendingUp
} from "lucide-react";
import LogoMark from "../../components/LogoMark";
import {
  ResponsiveContainer, PieChart, Pie, Cell, RadialBarChart, RadialBar,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip
} from "recharts";
import PermissionGate from "../../components/auth/PermissionGate";
import { supabase } from "../../lib/supabase";
import { useGlobalFilter } from "../../contexts/FilterContext";
import EnterpriseReportView from "../../components/EnterpriseReportView";
import type { Decision, Approval, Conflict } from "../../types/db";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* ── Theme ── */
const C = {
  green: "#34d399", amber: "#fbbf24", red: "#f87171",
  accent: "#4da6ff", surface: "rgba(0, 30, 80, 0.15)",
  grid: "rgba(255,255,255,0.04)", text: "#6b7d99",
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

const RC_LABELS: Record<string, { short: string; full: string; icon: string }> = {
  rc1_lifecycle: { short: "RC-1", full: "Material Lifecycle", icon: "🔄" },
  rc2_compliance: { short: "RC-2", full: "Compliance Status", icon: "📋" },
  rc3_lead_time: { short: "RC-3", full: "Supply Chain Lead Time", icon: "📦" },
  rc4_visual: { short: "RC-4", full: "Visual Validation (VRED)", icon: "🎨" },
  rc5_approval_rbac: { short: "RC-5", full: "Approval & RBAC", icon: "🔐" },
  rc6_conflict: { short: "RC-6", full: "Cross-Area Conflict", icon: "⚡" },
};

const RC_KEYS = Object.keys(RC_LABELS) as (keyof typeof RC_LABELS)[];

function getCurrentWeek() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = (now.getTime() - start.getTime()) / 86400000;
  return Math.ceil((diff + start.getDay() + 1) / 7);
}

function ratingColor(r: string | null) {
  if (r === "green") return C.green;
  if (r === "yellow") return C.amber;
  if (r === "red") return C.red;
  return "rgba(255,255,255,0.08)";
}

function ratingLabel(r: string | null) {
  if (r === "green") return "Ready";
  if (r === "yellow") return "Caution";
  if (r === "red") return "Blocked";
  return "-";
}

export default function AIReadinessReport() {
  const { filterRange } = useGlobalFilter();
  const navigate = useNavigate();
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [loading, setLoading] = useState(true);

  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      let query = supabase.from("decisions").select("*").order("business_area");
      if (filterRange) {
        query = query.gte("updated_at", filterRange.start).lte("updated_at", filterRange.end);
      }
      const [decRes, appRes, confRes] = await Promise.all([
        query,
        supabase.from("approvals").select("*"),
        supabase.from("conflicts").select("*")
      ]);
      if (!cancelled) {
        setDecisions((decRes.data ?? []) as Decision[]);
        setApprovals((appRes.data ?? []) as Approval[]);
        setConflicts((confRes.data ?? []) as Conflict[]);
        setLoading(false);
      }
    }
    load();
    const channel = supabase
      .channel("ai-readiness-report")
      .on("postgres_changes", { event: "*", schema: "public", table: "decisions" }, () => load())
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [filterRange]);

  /* ── Computed Stats ── */
  const scored = useMemo(() => decisions.filter(d => d.ai_rating), [decisions]);

  const healthScore = useMemo(() => {
    if (scored.length === 0) return 0;
    let total = 0;
    for (const d of scored) {
      if (d.ai_rating === "green") total += 100;
      else if (d.ai_rating === "yellow") total += 50;
    }
    return Math.round(total / scored.length);
  }, [scored]);

  const rcBreakdown = useMemo(() => {
    return RC_KEYS.map(key => {
      let green = 0, yellow = 0, red = 0, unscored = 0;
      for (const d of decisions) {
        const val = (d as any)[key];
        if (val === "green") green++;
        else if (val === "yellow") yellow++;
        else if (val === "red") red++;
        else unscored++;
      }
      return {
        key,
        label: RC_LABELS[key].short,
        fullLabel: RC_LABELS[key].full,
        icon: RC_LABELS[key].icon,
        green, yellow, red, unscored,
        total: decisions.length,
        passRate: decisions.length > 0 ? Math.round((green / decisions.length) * 100) : 0,
      };
    });
  }, [decisions]);

  const overallBreakdown = useMemo(() => [
    { name: "Ready", value: scored.filter(d => d.ai_rating === "green").length, color: C.green },
    { name: "Caution", value: scored.filter(d => d.ai_rating === "yellow").length, color: C.amber },
    { name: "Blocked", value: scored.filter(d => d.ai_rating === "red").length, color: C.red },
    { name: "Unscored", value: decisions.length - scored.length, color: "#3d506b" },
  ].filter(d => d.value > 0), [decisions, scored]);

  const kw = getCurrentWeek();
  const dateStr = new Date().toLocaleDateString("en-GB");



  /* ── PDF Export ── */
  async function exportPDF() {
    setExporting(true);
    try {
      const doc = new jsPDF({ orientation: "landscape" });

      // Header
      doc.setFillColor(26, 26, 46);
      doc.rect(0, 0, 297, 26, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("AI Readiness Scorecard", 14, 12);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`KW ${kw} / ${new Date().getFullYear()} · Generated ${dateStr} · Pipeline Health: ${healthScore}/100`, 14, 20);

      // RC breakdown table
      autoTable(doc, {
        head: [["Criterion", "Description", "Green", "Yellow", "Red", "Unscored", "Pass Rate"]],
        body: rcBreakdown.map(rc => [
          rc.label, rc.fullLabel,
          String(rc.green), String(rc.yellow), String(rc.red), String(rc.unscored),
          `${rc.passRate}%`
        ]),
        startY: 32,
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [45, 45, 68], textColor: [255, 255, 255], fontStyle: "bold" },
      });

      // Decision heatmap table
      const hmY = (doc as any).lastAutoTable?.finalY + 10 || 80;
      autoTable(doc, {
        head: [["Component", "Area", "Status", "AI", "RC-1", "RC-2", "RC-3", "RC-4", "RC-5", "RC-6"]],
        body: decisions.map(d => [
          d.component_name, d.business_area, d.status,
          d.ai_rating || "-",
          d.rc1_lifecycle || "-", d.rc2_compliance || "-", d.rc3_lead_time || "-",
          d.rc4_visual || "-", d.rc5_approval_rbac || "-", d.rc6_conflict || "-",
        ]),
        startY: hmY,
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [45, 45, 68], textColor: [255, 255, 255], fontStyle: "bold" },
        didParseCell: (data: any) => {
          if (data.section === "body" && data.column.index >= 3) {
            const val = data.cell.raw;
            if (val === "green") data.cell.styles.textColor = [22, 163, 74];
            else if (val === "yellow") data.cell.styles.textColor = [202, 138, 4];
            else if (val === "red") data.cell.styles.textColor = [220, 38, 38];
          }
        },
      });

      // Footer
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 150);
        doc.text(`Chroma Sync - AI Readiness Scorecard - Page ${i}/${pageCount}`, 14, doc.internal.pageSize.getHeight() - 8);
      }

      doc.save(`ai-readiness-scorecard-KW${kw}-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <PermissionGate permission="reports.view">
      <div>

        {/* ── Hero Header ── */}
        <div style={{
          background: "linear-gradient(135deg, #0a0a1a, #1a1040, #0d2847)",
          borderRadius: "var(--r-lg)", padding: "1.5rem 2rem", marginBottom: "1.5rem",
          border: "1px solid rgba(139, 92, 246, 0.15)",
          display: "flex", justifyContent: "space-between", alignItems: "flex-end",
          flexWrap: "wrap", gap: "1rem",
          boxShadow: "0 8px 40px rgba(139, 92, 246, 0.08)",
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.375rem" }}>
              <div style={{
                width: 36, height: 36, borderRadius: "var(--r-md)",
                background: "linear-gradient(135deg, #8b5cf6, #6366f1)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 0 20px rgba(139, 92, 246, 0.5)",
              }}>
                <Shield size={18} style={{ color: "#fff" }} />
              </div>
              <h1 style={{ margin: 0, color: "#fff", fontSize: "1.375rem" }}>AI Readiness Scorecard</h1>
              <span style={{
                fontSize: "0.625rem", fontWeight: 700, color: "#8b5cf6",
                background: "rgba(139, 92, 246, 0.15)", padding: "2px 8px",
                borderRadius: "var(--r-full)", letterSpacing: "0.05em"
              }}>
                KW {kw} · {new Date().getFullYear()}
              </span>
            </div>
            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.8125rem", margin: 0 }}>
              Deterministic AI scoring across 6 readiness criteria · {decisions.length} decisions · Generated {dateStr}
            </p>
          </div>
          <button className="btn btn-accent" onClick={exportPDF} disabled={exporting || decisions.length === 0}>
            {exporting ? <Loader2 size={13} className="spin" /> : <Download size={13} />}
            {exporting ? "Exporting..." : "Export PDF"}
          </button>
        </div>

        {loading && <p style={{ color: "var(--text-2)" }}>Loading decisions...</p>}

        {!loading && (
          <>
            {/* ── Pipeline Health + Overall Distribution ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
              {/* Health Gauge */}
              <div className="card" style={{ marginBottom: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
                <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "1rem" }}>
                  Pipeline Health Score
                </div>
                <div style={{ width: 140, height: 140, position: "relative" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <RadialBarChart cx="50%" cy="50%" innerRadius="70%" outerRadius="100%" startAngle={180} endAngle={0}
                      data={[{ name: "Health", value: healthScore, fill: healthScore >= 70 ? C.green : healthScore >= 40 ? C.amber : C.red }]}
                    >
                      <RadialBar background={{ fill: "rgba(255,255,255,0.04)" }} dataKey="value" cornerRadius={8} />
                    </RadialBarChart>
                  </ResponsiveContainer>
                  <div style={{ position: "absolute", top: "40%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center" }}>
                    <div style={{
                      fontSize: "2rem", fontWeight: 800, fontFamily: "var(--font-outfit)",
                      color: healthScore >= 70 ? C.green : healthScore >= 40 ? C.amber : C.red,
                    }}>{healthScore}</div>
                    <div style={{ fontSize: "0.5625rem", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.1em" }}>of 100</div>
                  </div>
                </div>
              </div>

              {/* AI Rating Distribution */}
              <div className="card" style={{ marginBottom: 0, padding: "1.5rem" }}>
                <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                  <LogoMark size={12} /> Overall AI Distribution
                </div>
                <div style={{ height: 140, position: "relative" }}>
                  {overallBreakdown.length === 0 ? (
                    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)" }}>No ratings</div>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={overallBreakdown} cx="50%" cy="50%" innerRadius={40} outerRadius={58} paddingAngle={4} dataKey="value" stroke="none" animationDuration={1200}>
                            {overallBreakdown.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                          </Pie>
                          <RechartsTooltip {...tooltipStyle} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center" }}>
                        <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "var(--text-0)", fontFamily: "var(--font-outfit)" }}>{scored.length}</div>
                        <div style={{ fontSize: "0.5rem", color: "var(--text-3)" }}>scored</div>
                      </div>
                    </>
                  )}
                </div>
                <div style={{ display: "flex", justifyContent: "center", gap: "0.75rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                  {overallBreakdown.map(item => (
                    <div key={item.name} style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: item.color }} />
                      <span style={{ fontSize: "0.5625rem", color: "var(--text-2)" }}>{item.name}</span>
                      <span style={{ fontSize: "0.625rem", fontWeight: 700, color: "var(--text-0)" }}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* KPI Cards */}
              <div style={{ display: "grid", gridTemplateRows: "1fr 1fr", gap: "0.75rem" }}>
                <div className="card" style={{ marginBottom: 0, padding: "1rem 1.25rem" }}>
                  <div style={{ fontSize: "0.6875rem", color: "var(--text-2)", marginBottom: "0.25rem" }}>Decisions Scored</div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700, color: C.accent, fontFamily: "var(--font-outfit)" }}>
                    {scored.length}<span style={{ fontSize: "0.75rem", color: "var(--text-3)", fontWeight: 400 }}> / {decisions.length}</span>
                  </div>
                </div>
                <div className="card" style={{ marginBottom: 0, padding: "1rem 1.25rem" }}>
                  <div style={{ fontSize: "0.6875rem", color: "var(--text-2)", marginBottom: "0.25rem" }}>Blocked (Red)</div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700, color: scored.filter(d => d.ai_rating === "red").length > 0 ? C.red : C.green, fontFamily: "var(--font-outfit)" }}>
                    {scored.filter(d => d.ai_rating === "red").length}
                  </div>
                </div>
              </div>
            </div>

            {/* ── RC-1 → RC-6 Breakdown Chart ── */}
            <div className="card" style={{ marginBottom: "1.5rem", padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "0.875rem 1.25rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                <TrendingUp size={14} style={{ color: "var(--text-3)" }} />
                <h2 style={{ margin: 0, fontSize: "0.875rem" }}>Readiness Criteria Breakdown</h2>
              </div>
              <div style={{ padding: "1.25rem" }}>
                <div style={{ height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={rcBreakdown.map(rc => ({
                        name: rc.label,
                        Green: rc.green, Yellow: rc.yellow, Red: rc.red, Unscored: rc.unscored,
                      }))}
                      layout="vertical"
                      margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                      <XAxis type="number" tick={{ fill: "#6b7d99", fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" tick={{ fill: "#f0f2f5", fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} width={48} />
                      <RechartsTooltip {...tooltipStyle} />
                      <Bar dataKey="Green" stackId="a" fill={C.green} radius={[0, 0, 0, 0]} />
                      <Bar dataKey="Yellow" stackId="a" fill={C.amber} />
                      <Bar dataKey="Red" stackId="a" fill={C.red} />
                      <Bar dataKey="Unscored" stackId="a" fill="#3d506b" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* RC Detail cards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem", marginTop: "1.25rem" }}>
                  {rcBreakdown.map(rc => (
                    <div key={rc.key} style={{
                      padding: "0.875rem 1rem", borderRadius: "var(--r-md)",
                      background: "var(--bg-1)", border: "1px solid var(--border)",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                          <span style={{ fontSize: "1rem" }}>{rc.icon}</span>
                          <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--text-0)" }}>{rc.label}</span>
                        </div>
                        <span style={{
                          fontSize: "0.625rem", fontWeight: 700,
                          color: rc.passRate >= 70 ? C.green : rc.passRate >= 40 ? C.amber : C.red,
                        }}>{rc.passRate}% pass</span>
                      </div>
                      <div style={{ fontSize: "0.6875rem", color: "var(--text-2)", marginBottom: "0.625rem" }}>{rc.fullLabel}</div>
                      {/* Mini progress bar */}
                      <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", background: "rgba(255,255,255,0.04)" }}>
                        {rc.green > 0 && <div style={{ width: `${(rc.green / rc.total) * 100}%`, background: C.green }} />}
                        {rc.yellow > 0 && <div style={{ width: `${(rc.yellow / rc.total) * 100}%`, background: C.amber }} />}
                        {rc.red > 0 && <div style={{ width: `${(rc.red / rc.total) * 100}%`, background: C.red }} />}
                      </div>
                      <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.375rem" }}>
                        <span style={{ fontSize: "0.5625rem", color: C.green }}>● {rc.green}</span>
                        <span style={{ fontSize: "0.5625rem", color: C.amber }}>● {rc.yellow}</span>
                        <span style={{ fontSize: "0.5625rem", color: C.red }}>● {rc.red}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Decision Heatmap ── */}
            <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: "1.5rem" }}>
              <div style={{ padding: "0.875rem 1.25rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                <Shield size={14} style={{ color: "var(--text-3)" }} />
                <h2 style={{ margin: 0, fontSize: "0.875rem" }}>Decision Heatmap</h2>
                <span style={{ fontSize: "0.6875rem", color: "var(--text-3)", marginLeft: "auto" }}>{decisions.length} decisions</span>
              </div>
              <div style={{ maxHeight: 420, overflowY: "auto" }}>
                <table className="data-table">
                  <thead style={{ position: "sticky", top: 0, background: "var(--bg-0)", zIndex: 1 }}>
                    <tr>
                      <th>Component</th>
                      <th>Area</th>
                      <th>Status</th>
                      <th style={{ textAlign: "center" }}>Overall</th>
                      {RC_KEYS.map(k => <th key={k} style={{ textAlign: "center", fontSize: "0.625rem" }}>{RC_LABELS[k].short}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {decisions.map(d => (
                      <tr key={d.id} onClick={() => navigate(`/decisions/${d.id}`)} style={{ cursor: "pointer" }}>
                        <td style={{ color: "var(--text-0)", fontWeight: 500 }}>{d.component_name}</td>
                        <td>{d.business_area}</td>
                        <td><span className={`badge badge-${d.status === "approved" ? "green" : d.status === "rejected" ? "red" : d.status === "submitted" ? "blue" : d.status === "under_review" ? "amber" : "purple"}`}>{d.status.replace(/_/g, " ")}</span></td>
                        <td style={{ textAlign: "center" }}>
                          <div style={{ width: 10, height: 10, borderRadius: "50%", background: ratingColor(d.ai_rating), margin: "0 auto", boxShadow: d.ai_rating ? `0 0 6px ${ratingColor(d.ai_rating)}50` : "none" }}
                            title={ratingLabel(d.ai_rating)} />
                        </td>
                        {RC_KEYS.map(k => {
                          const val = (d as any)[k] as string | null;
                          return (
                            <td key={k} style={{ textAlign: "center" }}>
                              <div style={{ width: 10, height: 10, borderRadius: 2, background: ratingColor(val), margin: "0 auto" }}
                                title={`${RC_LABELS[k].short}: ${ratingLabel(val)}`} />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {decisions.length === 0 && (
                      <tr><td colSpan={10} style={{ textAlign: "center", padding: "3rem", color: "var(--text-2)" }}>No decisions found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Enterprise AI Deep Analysis ── */}
            <EnterpriseReportView 
              reportType="ai_readiness"
              title="AI Scorecard & Velocity Analysis"
              decisions={decisions}
              approvals={approvals}
              conflicts={conflicts}
            />
          </>
        )}
      </div>
    </PermissionGate>
  );
}
