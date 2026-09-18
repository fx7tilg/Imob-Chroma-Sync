import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Package, Download, Loader2, AlertTriangle, TrendingUp, ShieldAlert
} from "lucide-react";
import LogoMark from "../../components/LogoMark";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from "recharts";
import PermissionGate from "../../components/auth/PermissionGate";
import { supabase } from "../../lib/supabase";
import { useGlobalFilter } from "../../contexts/FilterContext";
import EnterpriseReportView from "../../components/EnterpriseReportView";

import type { Decision, Material, Approval, Conflict } from "../../types/db";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const C = {
  green: "#34d399", amber: "#fbbf24", red: "#f87171",
  accent: "#4da6ff", teal: "#2dd4bf",
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

function getCurrentWeek() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = (now.getTime() - start.getTime()) / 86400000;
  return Math.ceil((diff + start.getDay() + 1) / 7);
}


export default function SupplyChainReport() {
  const { filterRange } = useGlobalFilter();
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [loading, setLoading] = useState(true);

  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      let decQuery = supabase.from("decisions").select("*").order("business_area");
      if (filterRange) {
        decQuery = decQuery.gte("updated_at", filterRange.start).lte("updated_at", filterRange.end);
      }
      const [decRes, matRes, appRes, confRes] = await Promise.all([
        decQuery,
        supabase.from("materials").select("*"),
        supabase.from("approvals").select("*"),
        supabase.from("conflicts").select("*")
      ]);
      if (!cancelled) {
        setDecisions((decRes.data ?? []) as Decision[]);
        setMaterials((matRes.data ?? []) as Material[]);
        setApprovals((appRes.data ?? []) as Approval[]);
        setConflicts((confRes.data ?? []) as Conflict[]);
        setLoading(false);
      }
    }
    load();
    const channel = supabase
      .channel("supply-chain-report")
      .on("postgres_changes", { event: "*", schema: "public", table: "decisions" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "materials" }, () => load())
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [filterRange]);

  const materialMap = useMemo(() => {
    const m = new Map<string, Material>();
    materials.forEach(mat => m.set(mat.code, mat));
    return m;
  }, [materials]);

  /* ── Supply Chain Metrics ── */
  const stats = useMemo(() => {
    const uniqueSuppliers = new Set(decisions.map(d => d.supplier).filter(Boolean));
    const withLeadTime = decisions.filter(d => d.lead_time_days);
    const avgLeadTime = withLeadTime.length > 0
      ? Math.round(withLeadTime.reduce((s, d) => s + (d.lead_time_days ?? 0), 0) / withLeadTime.length)
      : 0;

    // Materials at risk (deprecated or failing compliance)
    const usedMaterialCodes = new Set(decisions.map(d => d.material_reference).filter(Boolean));
    const atRiskMaterials = materials.filter(m =>
      usedMaterialCodes.has(m.code) && (m.lifecycle_status === "deprecated" || m.compliance_status === "fail")
    );

    // Single-source components: components where only 1 supplier exists
    const componentSuppliers = new Map<string, Set<string>>();
    for (const d of decisions) {
      if (!d.supplier) continue;
      const set = componentSuppliers.get(d.component_name) ?? new Set();
      set.add(d.supplier);
      componentSuppliers.set(d.component_name, set);
    }
    const singleSource = Array.from(componentSuppliers.entries()).filter(([, s]) => s.size === 1).length;

    return {
      totalSuppliers: uniqueSuppliers.size,
      avgLeadTimeDays: avgLeadTime,
      materialsAtRisk: atRiskMaterials.length,
      singleSourceComponents: singleSource,
    };
  }, [decisions, materials]);

  /* ── Supplier Concentration ── */
  const supplierConcentration = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of decisions) {
      const sup = d.supplier || "Unassigned";
      counts[sup] = (counts[sup] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([name, count]) => ({ name: name.length > 20 ? name.slice(0, 18) + "…" : name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [decisions]);

  /* ── Lead Time Distribution ── */
  const leadTimeDistribution = useMemo(() => {
    const brackets = [
      { name: "≤ 4 wk", min: 0, max: 28, color: C.green, count: 0 },
      { name: "5-8 wk", min: 29, max: 56, color: C.green, count: 0 },
      { name: "9-12 wk", min: 57, max: 84, color: C.amber, count: 0 },
      { name: "13-16 wk", min: 85, max: 112, color: C.amber, count: 0 },
      { name: "17-20 wk", min: 113, max: 140, color: C.red, count: 0 },
      { name: "> 20 wk", min: 141, max: Infinity, color: C.red, count: 0 },
    ];
    for (const d of decisions) {
      if (!d.lead_time_days) continue;
      for (const b of brackets) {
        if (d.lead_time_days >= b.min && d.lead_time_days <= b.max) { b.count++; break; }
      }
    }
    return brackets;
  }, [decisions]);

  /* ── Material Risk Matrix ── */
  const materialRiskList = useMemo(() => {
    const usedCodes = new Set(decisions.map(d => d.material_reference).filter(Boolean));
    return materials
      .filter(m => usedCodes.has(m.code))
      .sort((a, b) => {
        const riskA = (a.lifecycle_status === "deprecated" ? 2 : 0) + (a.compliance_status === "fail" ? 2 : a.compliance_status === "pending" ? 1 : 0);
        const riskB = (b.lifecycle_status === "deprecated" ? 2 : 0) + (b.compliance_status === "fail" ? 2 : b.compliance_status === "pending" ? 1 : 0);
        return riskB - riskA;
      });
  }, [decisions, materials]);

  /* ── At-Risk Decisions ── */
  const atRiskDecisions = useMemo(() => {
    const deprecatedCodes = new Set(materials.filter(m => m.lifecycle_status === "deprecated").map(m => m.code));
    const failCodes = new Set(materials.filter(m => m.compliance_status === "fail").map(m => m.code));
    return decisions.filter(d =>
      d.material_reference && (deprecatedCodes.has(d.material_reference) || failCodes.has(d.material_reference))
    );
  }, [decisions, materials]);

  const complianceBreakdown = useMemo(() => {
    const usedCodes = new Set(decisions.map(d => d.material_reference).filter(Boolean));
    const used = materials.filter(m => usedCodes.has(m.code));
    return [
      { name: "Pass", value: used.filter(m => m.compliance_status === "pass").length, color: C.green },
      { name: "Pending", value: used.filter(m => m.compliance_status === "pending").length, color: C.amber },
      { name: "Fail", value: used.filter(m => m.compliance_status === "fail").length, color: C.red },
      { name: "Unknown", value: used.filter(m => !m.compliance_status).length, color: "#3d506b" },
    ].filter(d => d.value > 0);
  }, [decisions, materials]);

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
      doc.text("Supply Chain Intelligence Report", 14, 12);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`KW ${kw} / ${new Date().getFullYear()} · ${stats.totalSuppliers} suppliers · ${materialRiskList.length} materials tracked`, 14, 20);

      // Material risk table
      autoTable(doc, {
        head: [["Material Code", "Name", "Lifecycle", "Compliance", "Lead Time (wk)", "Risk Level"]],
        body: materialRiskList.map(m => {
          const risk = (m.lifecycle_status === "deprecated" ? "HIGH" : "") +
            (m.compliance_status === "fail" ? " CRITICAL" : m.compliance_status === "pending" ? " MODERATE" : "");
          return [m.code, m.display_name, m.lifecycle_status || "-", m.compliance_status || "-", m.lead_time_weeks?.toString() || "-", risk.trim() || "LOW"];
        }),
        startY: 32,
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [45, 45, 68], textColor: [255, 255, 255], fontStyle: "bold" },
      });

      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 150);
        doc.text(`Chroma Sync - Supply Chain Intelligence - Page ${i}/${pageCount}`, 14, doc.internal.pageSize.getHeight() - 8);
      }
      doc.save(`supply-chain-intelligence-KW${kw}-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <PermissionGate permission="reports.view">
      <div>
        {/* ── Hero Header ── */}
        <div style={{
          background: "linear-gradient(135deg, #0a1628, #0d2a3d, #0a2818)",
          borderRadius: "var(--r-lg)", padding: "1.5rem 2rem", marginBottom: "1.5rem",
          border: "1px solid rgba(45, 212, 191, 0.15)",
          display: "flex", justifyContent: "space-between", alignItems: "flex-end",
          flexWrap: "wrap", gap: "1rem",
          boxShadow: "0 8px 40px rgba(45, 212, 191, 0.06)",
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.375rem" }}>
              <div style={{
                width: 36, height: 36, borderRadius: "var(--r-md)",
                background: "linear-gradient(135deg, #2dd4bf, #14b8a6)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 0 20px rgba(45, 212, 191, 0.4)",
              }}>
                <Package size={18} style={{ color: "#fff" }} />
              </div>
              <h1 style={{ margin: 0, color: "#fff", fontSize: "1.375rem" }}>Supply Chain Intelligence</h1>
              <span style={{
                fontSize: "0.625rem", fontWeight: 700, color: "#2dd4bf",
                background: "rgba(45, 212, 191, 0.15)", padding: "2px 8px",
                borderRadius: "var(--r-full)", letterSpacing: "0.05em"
              }}>
                KW {kw} · {new Date().getFullYear()}
              </span>
            </div>
            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "0.8125rem", margin: 0 }}>
              Supplier risk analysis · Material lifecycle tracking · Lead time monitoring · Generated {dateStr}
            </p>
          </div>
          <button className="btn btn-accent" onClick={exportPDF} disabled={exporting || decisions.length === 0}>
            {exporting ? <Loader2 size={13} className="spin" /> : <Download size={13} />}
            {exporting ? "Exporting..." : "Export PDF"}
          </button>
        </div>

        {loading && <p style={{ color: "var(--text-2)" }}>Loading supply chain data...</p>}

        {!loading && (
          <>
            {/* ── KPI Strip ── */}
            <div className="grid4" style={{ marginBottom: "1.5rem" }}>
              <div className="card" style={{ marginBottom: 0, padding: "1rem 1.25rem" }}>
                <div style={{ fontSize: "0.6875rem", color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "0.5rem" }}>Total Suppliers</div>
                <div style={{ fontSize: "1.75rem", fontWeight: 700, color: C.teal, fontFamily: "var(--font-outfit)" }}>{stats.totalSuppliers}</div>
              </div>
              <div className="card" style={{ marginBottom: 0, padding: "1rem 1.25rem" }}>
                <div style={{ fontSize: "0.6875rem", color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "0.5rem" }}>Avg Lead Time</div>
                <div style={{ fontSize: "1.75rem", fontWeight: 700, color: C.accent, fontFamily: "var(--font-outfit)" }}>{stats.avgLeadTimeDays ? `${stats.avgLeadTimeDays}d` : "-"}</div>
              </div>
              <div className="card" style={{ marginBottom: 0, padding: "1rem 1.25rem" }}>
                <div style={{ fontSize: "0.6875rem", color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "0.5rem" }}>Materials At Risk</div>
                <div style={{ fontSize: "1.75rem", fontWeight: 700, color: stats.materialsAtRisk > 0 ? C.red : C.green, fontFamily: "var(--font-outfit)" }}>{stats.materialsAtRisk}</div>
              </div>
              <div className="card" style={{ marginBottom: 0, padding: "1rem 1.25rem" }}>
                <div style={{ fontSize: "0.6875rem", color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "0.5rem" }}>Single-Source Risk</div>
                <div style={{ fontSize: "1.75rem", fontWeight: 700, color: stats.singleSourceComponents > 0 ? C.amber : C.green, fontFamily: "var(--font-outfit)" }}>{stats.singleSourceComponents}</div>
              </div>
            </div>

            {/* ── Charts Row ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
              {/* Supplier Concentration */}
              <div className="card" style={{ marginBottom: 0, padding: 0, overflow: "hidden" }}>
                <div style={{ padding: "0.875rem 1.25rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                  <TrendingUp size={13} style={{ color: "var(--text-3)" }} />
                  <span style={{ fontSize: "0.75rem", fontWeight: 700 }}>Supplier Concentration</span>
                </div>
                <div style={{ padding: "1rem", height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={supplierConcentration} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                      <XAxis type="number" tick={{ fill: "#6b7d99", fontSize: 9 }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" tick={{ fill: "#f0f2f5", fontSize: 9 }} axisLine={false} tickLine={false} width={80} />
                      <RechartsTooltip {...tooltipStyle} />
                      <Bar dataKey="count" fill={C.teal} radius={[0, 4, 4, 0]} animationDuration={1200} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Lead Time Distribution */}
              <div className="card" style={{ marginBottom: 0, padding: 0, overflow: "hidden" }}>
                <div style={{ padding: "0.875rem 1.25rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                  <Package size={13} style={{ color: "var(--text-3)" }} />
                  <span style={{ fontSize: "0.75rem", fontWeight: 700 }}>Lead Time Distribution</span>
                </div>
                <div style={{ padding: "1rem", height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={leadTimeDistribution} margin={{ top: 0, right: 12, left: -24, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fill: "#f0f2f5", fontSize: 9 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#6b7d99", fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <RechartsTooltip {...tooltipStyle} />
                      <Bar dataKey="count" animationDuration={1200} radius={[4, 4, 0, 0]}>
                        {leadTimeDistribution.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Compliance Breakdown */}
              <div className="card" style={{ marginBottom: 0, padding: 0, overflow: "hidden" }}>
                <div style={{ padding: "0.875rem 1.25rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                  <ShieldAlert size={13} style={{ color: "var(--text-3)" }} />
                  <span style={{ fontSize: "0.75rem", fontWeight: 700 }}>Material Compliance</span>
                </div>
                <div style={{ padding: "1rem", height: 200, position: "relative" }}>
                  {complianceBreakdown.length === 0 ? (
                    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-3)" }}>No data</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={complianceBreakdown} cx="50%" cy="50%" innerRadius={38} outerRadius={56} paddingAngle={4} dataKey="value" stroke="none" animationDuration={1200}>
                          {complianceBreakdown.map((e, i) => <Cell key={i} fill={e.color} />)}
                        </Pie>
                        <RechartsTooltip {...tooltipStyle} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <div style={{ display: "flex", justifyContent: "center", gap: "0.75rem", padding: "0.5rem 1rem 1rem", flexWrap: "wrap" }}>
                  {complianceBreakdown.map(item => (
                    <div key={item.name} style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: item.color }} />
                      <span style={{ fontSize: "0.5625rem", color: "var(--text-2)" }}>{item.name}</span>
                      <span style={{ fontSize: "0.625rem", fontWeight: 700, color: "var(--text-0)" }}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Material Risk Matrix ── */}
            <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: "1.5rem" }}>
              <div style={{ padding: "0.875rem 1.25rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                <AlertTriangle size={14} style={{ color: C.amber }} />
                <h2 style={{ margin: 0, fontSize: "0.875rem" }}>Material Risk Matrix</h2>
                <span style={{ fontSize: "0.6875rem", color: "var(--text-3)", marginLeft: "auto" }}>{materialRiskList.length} materials in use</span>
              </div>
              <div style={{ maxHeight: 360, overflowY: "auto" }}>
                <table className="data-table">
                  <thead style={{ position: "sticky", top: 0, background: "var(--bg-0)", zIndex: 1 }}>
                    <tr>
                      <th>Material Code</th>
                      <th>Name</th>
                      <th>Lifecycle</th>
                      <th>Compliance</th>
                      <th>Lead Time</th>
                      <th>Finish</th>
                      <th>Decisions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {materialRiskList.map(m => {
                      const depCount = decisions.filter(d => d.material_reference === m.code).length;
                      const isRisk = m.lifecycle_status === "deprecated" || m.compliance_status === "fail";
                      return (
                        <tr key={m.code} style={{ background: isRisk ? "rgba(239,68,68,0.04)" : undefined }}>
                          <td style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.75rem", fontWeight: 600 }}>{m.code}</td>
                          <td style={{ color: "var(--text-0)", fontWeight: 500 }}>{m.display_name}</td>
                          <td>
                            <span className={`badge ${m.lifecycle_status === "active" ? "badge-green" : m.lifecycle_status === "deprecated" ? "badge-red" : ""}`}>
                              {m.lifecycle_status || "-"}
                            </span>
                          </td>
                          <td>
                            <span className={`badge ${m.compliance_status === "pass" ? "badge-green" : m.compliance_status === "fail" ? "badge-red" : m.compliance_status === "pending" ? "badge-amber" : ""}`}>
                              {m.compliance_status || "-"}
                            </span>
                          </td>
                          <td>{m.lead_time_weeks ? `${m.lead_time_weeks} wk` : "-"}</td>
                          <td style={{ fontSize: "0.75rem" }}>{m.finish || "-"}</td>
                          <td style={{ textAlign: "center" }}>
                            <span style={{ fontWeight: 700, color: depCount > 3 ? C.amber : "var(--text-0)" }}>{depCount}</span>
                          </td>
                        </tr>
                      );
                    })}
                    {materialRiskList.length === 0 && (
                      <tr><td colSpan={7} style={{ textAlign: "center", padding: "3rem", color: "var(--text-2)" }}>No materials in use.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── At-Risk Decisions ── */}
            {atRiskDecisions.length > 0 && (
              <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: "1.5rem" }}>
                <div style={{ padding: "0.875rem 1.25rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                  <AlertTriangle size={14} style={{ color: C.red }} />
                  <h2 style={{ margin: 0, fontSize: "0.875rem", color: C.red }}>At-Risk Decisions</h2>
                  <span className="badge badge-red" style={{ marginLeft: "0.25rem" }}>{atRiskDecisions.length}</span>
                </div>
                <div style={{ maxHeight: 280, overflowY: "auto" }}>
                  <table className="data-table">
                    <thead style={{ position: "sticky", top: 0, background: "var(--bg-0)", zIndex: 1 }}>
                      <tr><th>Component</th><th>Area</th><th>Material</th><th>Issue</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {atRiskDecisions.map(d => {
                        const mat = d.material_reference ? materialMap.get(d.material_reference) : null;
                        const issues: string[] = [];
                        if (mat?.lifecycle_status === "deprecated") issues.push("Deprecated Material");
                        if (mat?.compliance_status === "fail") issues.push("Compliance Failed");
                        return (
                          <tr key={d.id}>
                            <td><Link to={`/decisions/${d.id}`} style={{ color: "var(--accent)", fontWeight: 500 }}>{d.component_name}</Link></td>
                            <td>{d.business_area}</td>
                            <td style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.75rem" }}>{d.material_reference}</td>
                            <td>{issues.map((iss, i) => <span key={i} className="badge badge-red" style={{ marginRight: "0.25rem", fontSize: "0.5625rem" }}>{iss}</span>)}</td>
                            <td><span className={`badge badge-${d.status === "approved" ? "green" : d.status === "rejected" ? "red" : "amber"}`}>{d.status.replace(/_/g, " ")}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── Enterprise AI Deep Analysis ── */}
            <EnterpriseReportView 
              reportType="supply_chain"
              title="Supply Chain & Material Risk Intelligence"
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
