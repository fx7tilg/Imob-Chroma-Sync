import { useEffect, useMemo, useState } from "react";
import { Download, FileText, Loader2, Shield, ArrowUpDown } from "lucide-react";
import LogoMark from "../../components/LogoMark";
import { showToast } from "../../components/ui/Toast";
import PermissionGate from "../../components/auth/PermissionGate";
import { supabase } from "../../lib/supabase";
import type { Decision, MasterColourCode, Material } from "../../types/db";
import { exportMeldeliste } from "../../lib/reports";
import { useGlobalFilter } from "../../contexts/FilterContext";
import EnterpriseReportView from "../../components/EnterpriseReportView";
import type { Approval, Conflict } from "../../types/db";

const RC_KEYS = ["rc1_lifecycle", "rc2_compliance", "rc3_lead_time", "rc4_visual", "rc5_approval_rbac", "rc6_conflict"] as const;

function getCurrentWeek() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = (now.getTime() - start.getTime()) / 86400000;
  return Math.ceil((diff + start.getDay() + 1) / 7);
}

function ratingColor(r: string | null) {
  if (r === "green") return "#34d399";
  if (r === "yellow") return "#fbbf24";
  if (r === "red") return "#f87171";
  return "rgba(255,255,255,0.08)";
}

type SortConfig = { key: keyof Decision | "material_name"; direction: "asc" | "desc" } | null;

export default function Meldeliste() {
  const { filterRange } = useGlobalFilter();
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [colourMap, setColourMap] = useState<Map<string, MasterColourCode>>(new Map());
  const [materialMap, setMaterialMap] = useState<Map<string, Material>>(new Map());

  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState("");
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      let decQuery = supabase.from("decisions").select("*").eq("status", "approved");
      if (filterRange) {
        decQuery = decQuery.gte("updated_at", filterRange.start).lte("updated_at", filterRange.end);
      }

      const [decRes, colRes, matRes, appRes, confRes] = await Promise.all([
        decQuery,
        supabase.from("master_colour_codes").select("*"),
        supabase.from("materials").select("*"),
        supabase.from("approvals").select("*"),
        supabase.from("conflicts").select("*")
      ]);

      if (cancelled) return;

      const decs = (decRes.data ?? []) as Decision[];
      setDecisions(decs);
      setApprovals(appRes.data ?? []);
      setConflicts(confRes.data ?? []);

      const cm = new Map<string, MasterColourCode>();
      if (colRes.data) {
        (colRes.data as MasterColourCode[]).forEach(c => cm.set(c.code, c));
      }
      setColourMap(cm);

      const mm = new Map<string, Material>();
      if (matRes.data) {
        (matRes.data as Material[]).forEach(m => mm.set(m.code, m));
      }
      setMaterialMap(mm);

      if (!cancelled) setLoading(false);
    }

    load();

    const channel = supabase
      .channel("meldeliste-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "decisions", filter: "status=eq.approved" }, () => load())
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [filterRange]);

  const filteredAndSorted = useMemo(() => {
    let result = decisions;
    if (search) {
      const lower = search.toLowerCase();
      result = result.filter(d =>
        d.component_name.toLowerCase().includes(lower) ||
        d.business_area.toLowerCase().includes(lower) ||
        d.id.toLowerCase().includes(lower) ||
        (d.colour_code && d.colour_code.toLowerCase().includes(lower)) ||
        (d.material_reference && d.material_reference.toLowerCase().includes(lower)) ||
        (d.supplier && d.supplier.toLowerCase().includes(lower))
      );
    }

    if (sortConfig) {
      result = [...result].sort((a, b) => {
        let valA: any = a[sortConfig.key as keyof Decision];
        let valB: any = b[sortConfig.key as keyof Decision];
        
        if (sortConfig.key === "material_name") {
          valA = a.material_reference ? materialMap.get(a.material_reference)?.display_name : "";
          valB = b.material_reference ? materialMap.get(b.material_reference)?.display_name : "";
        }

        if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1;
        if (valA > valB) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [decisions, search, sortConfig, materialMap]);

  const handleSort = (key: keyof Decision | "material_name") => {
    setSortConfig(current => {
      if (!current || current.key !== key) return { key, direction: "asc" };
      if (current.direction === "asc") return { key, direction: "desc" };
      return null;
    });
  };

  const SortIcon = ({ column }: { column: keyof Decision | "material_name" }) => {
    if (sortConfig?.key === column) {
      return <ArrowUpDown size={12} style={{ color: "var(--accent)", marginLeft: 4 }} />;
    }
    return <ArrowUpDown size={12} style={{ color: "var(--text-3)", marginLeft: 4, opacity: 0.5 }} />;
  };

  const stats = useMemo(() => ({
    total: decisions.length,
    uniqueColours: new Set(decisions.map(d => d.colour_code).filter(Boolean)).size,
    suppliers: new Set(decisions.map(d => d.supplier).filter(Boolean)).size,
    avgLeadTime: decisions.filter(d => d.lead_time_days).length > 0
      ? Math.round(decisions.filter(d => d.lead_time_days).reduce((sum, d) => sum + (d.lead_time_days ?? 0), 0) / decisions.filter(d => d.lead_time_days).length)
      : 0
  }), [decisions]);

  const kw = getCurrentWeek();
  const dateStr = new Date().toLocaleDateString("en-GB");

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportMeldeliste(filteredAndSorted);
      showToast("success", "Meldeliste exported to XLSX");
    } catch (err: any) {
      showToast("error", "Export failed");
      console.error(err);
    } finally {
      setExporting(false);
    }
  };



  return (
    <PermissionGate permission="reports.view">
      <div>
        {/* ── Report Header ── */}
        <div style={{
          background: "linear-gradient(135deg, #1a1a2e, #16213e)",
          borderRadius: "var(--r-lg)",
          padding: "1.5rem 2rem",
          marginBottom: "1.5rem",
          border: "1px solid rgba(255,255,255,0.06)",
          display: "flex", justifyContent: "space-between", alignItems: "flex-end",
          flexWrap: "wrap", gap: "1rem"
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.375rem" }}>
              <FileText size={20} style={{ color: "#4da6ff" }} />
              <h1 style={{ margin: 0, color: "#fff", fontSize: "1.375rem" }}>Meldeliste</h1>
              <span style={{
                fontSize: "0.625rem", fontWeight: 700, color: "#4da6ff",
                background: "rgba(77, 166, 255, 0.12)", padding: "2px 8px",
                borderRadius: "var(--r-full)", letterSpacing: "0.05em"
              }}>
                KW {kw} · {new Date().getFullYear()}
              </span>
            </div>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.8125rem", margin: 0 }}>
              Consolidated approved decisions register · Generated {dateStr}
            </p>
          </div>
          <button className="btn btn-accent" onClick={handleExport} disabled={exporting || filteredAndSorted.length === 0}
            style={{ whiteSpace: "nowrap" }}>
            {exporting ? <Loader2 size={13} className="spin" /> : <Download size={13} />}
            {exporting ? "Exporting..." : "Export XLSX"}
          </button>
        </div>

        {/* ── KPI Strip ── */}
        <div className="grid4" style={{ marginBottom: "1.5rem" }}>
          <div className="card" style={{ marginBottom: 0 }}>
            <div className="stat-label">Approved Records</div>
            <div className="stat-value" style={{ color: "var(--green)" }}>{stats.total}</div>
          </div>
          <div className="card" style={{ marginBottom: 0 }}>
            <div className="stat-label">Unique Colours</div>
            <div className="stat-value">{stats.uniqueColours}</div>
          </div>
          <div className="card" style={{ marginBottom: 0 }}>
            <div className="stat-label">Suppliers</div>
            <div className="stat-value">{stats.suppliers}</div>
          </div>
          <div className="card" style={{ marginBottom: 0 }}>
            <div className="stat-label">Avg Lead Time</div>
            <div className="stat-value">{stats.avgLeadTime ? `${stats.avgLeadTime}d` : "-"}</div>
          </div>
        </div>

        {/* ── Report Table ── */}
        <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: "1.5rem" }}>
          <div style={{
            padding: "1rem 1.25rem", borderBottom: "1px solid var(--border)",
            display: "flex", justifyContent: "space-between", alignItems: "center",
            flexWrap: "wrap", gap: "1rem"
          }}>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <Shield size={14} style={{ color: "var(--text-3)" }} />
              <h2 style={{ margin: 0, fontSize: "0.875rem" }}>Approved Portfolio</h2>
              <span style={{ fontSize: "0.6875rem", color: "var(--text-3)" }}>
                {filteredAndSorted.length} of {decisions.length} records
              </span>
            </div>
            <input
              className="input"
              placeholder="Search report..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ minWidth: 220, padding: "4px 8px", height: "auto", fontSize: "0.8125rem" }}
            />
          </div>

          <div style={{ maxHeight: "500px", overflowY: "auto" }}>
            <table className="data-table">
              <thead style={{ position: "sticky", top: 0, background: "var(--bg-0)", zIndex: 1 }}>
                <tr>
                  <th style={{ width: 40 }}>Nr.</th>
                  <th style={{ cursor: "pointer" }} onClick={() => handleSort("component_name")}>
                    <div style={{ display: "flex", alignItems: "center" }}>Component <SortIcon column="component_name" /></div>
                  </th>
                  <th style={{ cursor: "pointer" }} onClick={() => handleSort("business_area")}>
                    <div style={{ display: "flex", alignItems: "center" }}>Business Area <SortIcon column="business_area" /></div>
                  </th>
                  <th style={{ cursor: "pointer", width: 90 }} onClick={() => handleSort("colour_code")}>
                    <div style={{ display: "flex", alignItems: "center" }}>Colour <SortIcon column="colour_code" /></div>
                  </th>
                  <th style={{ cursor: "pointer" }} onClick={() => handleSort("material_reference")}>
                    <div style={{ display: "flex", alignItems: "center" }}>Material Code <SortIcon column="material_reference" /></div>
                  </th>
                  <th style={{ cursor: "pointer" }} onClick={() => handleSort("material_name")}>
                    <div style={{ display: "flex", alignItems: "center" }}>Material Name <SortIcon column="material_name" /></div>
                  </th>
                  <th style={{ cursor: "pointer" }} onClick={() => handleSort("supplier")}>
                    <div style={{ display: "flex", alignItems: "center" }}>Supplier <SortIcon column="supplier" /></div>
                  </th>
                  <th style={{ cursor: "pointer", width: 70 }} onClick={() => handleSort("lead_time_days")}>
                    <div style={{ display: "flex", alignItems: "center" }}>Lead <SortIcon column="lead_time_days" /></div>
                  </th>
                  <th style={{ width: 140, textAlign: "center" }}>Scorecard (RC1-6)</th>
                  <th style={{ width: 40, textAlign: "center" }}>Ver.</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={10} style={{ textAlign: "center", padding: "2rem", color: "var(--text-2)" }}>
                      <Loader2 size={14} className="spin" style={{ display: "inline-block", marginRight: "0.5rem" }} />
                      Loading approved decisions...
                    </td>
                  </tr>
                )}
                {!loading && filteredAndSorted.length === 0 && (
                  <tr>
                    <td colSpan={10} style={{ textAlign: "center", padding: "3rem", color: "var(--text-2)" }}>
                      No approved decisions{search ? " match this filter" : " yet"}.
                    </td>
                  </tr>
                )}
                {filteredAndSorted.map((d, idx) => {
                  const colour = d.colour_code ? colourMap.get(d.colour_code) : null;
                  const material = d.material_reference ? materialMap.get(d.material_reference) : null;

                  return (
                    <tr key={d.id} style={{ background: idx % 2 === 0 ? "transparent" : "rgba(77, 166, 255, 0.015)" }}>
                      <td style={{ color: "var(--text-3)", fontSize: "0.6875rem", textAlign: "center" }}>{idx + 1}</td>
                      <td style={{ color: "var(--text-0)", fontWeight: 500 }}>{d.component_name}</td>
                      <td>{d.business_area}</td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                          {colour?.hex_preview ? (
                            <div style={{
                              width: 14, height: 14, borderRadius: 3, background: colour.hex_preview,
                              border: "1px solid rgba(255,255,255,0.15)", flexShrink: 0, boxShadow: `0 0 6px ${colour.hex_preview}40`
                            }} title={`${colour.name} (${colour.finish})`} />
                          ) : null}
                          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.6875rem" }}>
                            {d.colour_code || "-"}
                          </span>
                        </div>
                      </td>
                      <td style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.6875rem" }}>{d.material_reference || "-"}</td>
                      <td style={{ fontSize: "0.75rem", color: "var(--text-1)" }}>{material?.display_name || "-"}</td>
                      <td style={{ fontSize: "0.75rem" }}>{d.supplier ?? "-"}</td>
                      <td style={{ fontSize: "0.75rem" }}>{d.lead_time_days ? `${d.lead_time_days}d` : "-"}</td>
                      <td>
                        <div style={{ display: "flex", gap: "4px", justifyContent: "center" }}>
                          {RC_KEYS.map(k => {
                            const val = (d as any)[k] as string | null;
                            return (
                              <div key={k} style={{ width: 8, height: 8, borderRadius: 2, background: ratingColor(val) }} title={`${k}: ${val || "unscored"}`} />
                            );
                          })}
                        </div>
                      </td>
                      <td style={{ fontSize: "0.625rem", color: "var(--text-3)", textAlign: "center" }}>v{d.version ?? 1}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Enterprise AI Deep Analysis ── */}
        <EnterpriseReportView 
          reportType="meldeliste"
          title="Release Readiness & Data Completeness"
          decisions={filteredAndSorted}
          approvals={approvals}
          conflicts={conflicts}
        />
      </div>
    </PermissionGate>
  );
}
