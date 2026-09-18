import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, Palette, Grid3X3, AlertTriangle } from "lucide-react";
import LogoMark from "../../components/LogoMark";
import { showToast } from "../../components/ui/Toast";
import PermissionGate from "../../components/auth/PermissionGate";
import { supabase } from "../../lib/supabase";
import type { Approval, Decision, MasterColourCode, Team, Material } from "../../types/db";
import { exportColourMixChart } from "../../lib/reports";
import { useGlobalFilter } from "../../contexts/FilterContext";
import EnterpriseReportView from "../../components/EnterpriseReportView";
import type { Conflict } from "../../types/db";

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  approved: { bg: "rgba(34, 197, 94, 0.12)", border: "rgba(34, 197, 94, 0.4)", text: "var(--green)" },
  under_review: { bg: "rgba(251, 191, 36, 0.12)", border: "rgba(251, 191, 36, 0.4)", text: "var(--amber)" },
  submitted: { bg: "rgba(59, 130, 246, 0.12)", border: "rgba(59, 130, 246, 0.4)", text: "var(--blue)" },
  rejected: { bg: "rgba(239, 68, 68, 0.12)", border: "rgba(239, 68, 68, 0.4)", text: "var(--red)" },
  draft: { bg: "rgba(128, 128, 128, 0.08)", border: "rgba(128, 128, 128, 0.3)", text: "var(--text-3)" },
};

const TEAM_LABELS: Record<Team, string> = { design: "DES", engineering: "ENG", procurement: "PROC", quality: "QA" };

function getCurrentWeek() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = (now.getTime() - start.getTime()) / 86400000;
  return Math.ceil((diff + start.getDay() + 1) / 7);
}

export default function ColourMixChart() {
  const { filterRange } = useGlobalFilter();
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [colourMap, setColourMap] = useState<Map<string, MasterColourCode>>(new Map());
  const [materialMap, setMaterialMap] = useState<Map<string, Material>>(new Map());
  const [approvalsMap, setApprovalsMap] = useState<Map<string, Approval[]>>(new Map());
  const [flatApprovals, setFlatApprovals] = useState<Approval[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"matrix" | "cards">("matrix");


  useEffect(() => {
    let cancelled = false;

    async function load() {
      let query = supabase.from("decisions").select("*");
      if (filterRange) {
        query = query.gte("updated_at", filterRange.start).lte("updated_at", filterRange.end);
      }

      const [decRes, colRes, matRes, confRes] = await Promise.all([
        query,
        supabase.from("master_colour_codes").select("*"),
        supabase.from("materials").select("*"),
        supabase.from("conflicts").select("*")
      ]);

      if (cancelled) return;

      const decs = (decRes.data ?? []) as Decision[];
      setDecisions(decs);
      setConflicts((confRes.data ?? []) as Conflict[]);

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

      // Load approvals
      if (decs.length > 0) {
        const { data: apprData } = await supabase
          .from("approvals")
          .select("*")
          .in("decision_id", decs.map(d => d.id));

        if (!cancelled && apprData) {
          const am = new Map<string, Approval[]>();
          for (const a of apprData as Approval[]) {
            const list = am.get(a.decision_id) ?? [];
            list.push(a);
            am.set(a.decision_id, list);
          }
          setApprovalsMap(am);
          setFlatApprovals(apprData as Approval[]);
        }
      }

      if (!cancelled) setLoading(false);
    }

    load();

    const channel = supabase
      .channel("colour-mix-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "decisions" }, () => load())
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [filterRange]);

  // Filtered decisions
  const filteredDecisions = useMemo(() => {
    if (!search) return decisions;
    const lower = search.toLowerCase();
    return decisions.filter(d =>
      d.component_name.toLowerCase().includes(lower) ||
      d.business_area.toLowerCase().includes(lower) ||
      d.id.toLowerCase().includes(lower) ||
      (d.colour_code && d.colour_code.toLowerCase().includes(lower)) ||
      (d.material_reference && d.material_reference.toLowerCase().includes(lower))
    );
  }, [decisions, search]);

  // Group by business area
  const groups = useMemo(() => {
    const byArea: Record<string, Decision[]> = {};
    for (const d of filteredDecisions) {
      if (!d.business_area) continue;
      (byArea[d.business_area] ??= []).push(d);
    }
    return byArea;
  }, [filteredDecisions]);

  const kw = getCurrentWeek();
  const dateStr = new Date().toLocaleDateString("en-GB");

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportColourMixChart(filteredDecisions);
      showToast("success", "Colour-Mix-Chart exported to PDF");
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
          background: "linear-gradient(135deg, #1a1a2e, #0f3460)",
          borderRadius: "var(--r-lg)",
          padding: "1.5rem 2rem",
          marginBottom: "1.5rem",
          border: "1px solid rgba(255,255,255,0.06)",
          display: "flex", justifyContent: "space-between", alignItems: "flex-end",
          flexWrap: "wrap", gap: "1rem"
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.375rem" }}>
              <Palette size={20} style={{ color: "#34d399" }} />
              <h1 style={{ margin: 0, color: "#fff", fontSize: "1.375rem" }}>Colour-Mix-Chart</h1>
              <span style={{
                fontSize: "0.625rem", fontWeight: 700, color: "#34d399",
                background: "rgba(52, 211, 153, 0.12)", padding: "2px 8px",
                borderRadius: "var(--r-full)", letterSpacing: "0.05em"
              }}>
                KW {kw} · {new Date().getFullYear()}
              </span>
            </div>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.8125rem", margin: 0 }}>
              Visual colour distribution matrix · Generated {dateStr} · {filteredDecisions.length} decisions
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            {/* View toggle */}
            <div style={{
              display: "flex", background: "rgba(255,255,255,0.08)", borderRadius: "var(--r-sm)",
              overflow: "hidden"
            }}>
              <button onClick={() => setViewMode("matrix")} style={{
                padding: "0.375rem 0.625rem", border: "none", cursor: "pointer",
                background: viewMode === "matrix" ? "rgba(255,255,255,0.15)" : "transparent",
                color: "#fff", fontSize: "0.6875rem", fontWeight: viewMode === "matrix" ? 600 : 400
              }}><Grid3X3 size={12} /></button>
              <button onClick={() => setViewMode("cards")} style={{
                padding: "0.375rem 0.625rem", border: "none", cursor: "pointer",
                background: viewMode === "cards" ? "rgba(255,255,255,0.15)" : "transparent",
                color: "#fff", fontSize: "0.6875rem", fontWeight: viewMode === "cards" ? 600 : 400
              }}><Palette size={12} /></button>
            </div>
            <button className="btn btn-accent" onClick={handleExport}
              disabled={exporting || filteredDecisions.length === 0}>
              {exporting ? <Loader2 size={13} className="spin" /> : <Download size={13} />}
              {exporting ? "Exporting..." : "Export PDF"}
            </button>
          </div>
        </div>

        {/* ── Search & Legend ── */}
        <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap", alignItems: "center" }}>
          <input
            className="input"
            placeholder="Search by component, area, colour code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ minWidth: 260, maxWidth: 420 }}
          />
          <div style={{
            display: "flex", gap: "1rem",
            flexWrap: "wrap", alignItems: "center",
            padding: "0.5rem 0.75rem", background: "var(--bg-1)",
            borderRadius: "var(--r-sm)", border: "1px solid var(--border)"
          }}>
            <span style={{ fontSize: "0.6875rem", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Legend:
            </span>
            {Object.entries(STATUS_COLORS).map(([status, colors]) => (
              <div key={status} style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                <div style={{
                  width: 10, height: 10, borderRadius: 2,
                  background: colors.bg, border: `1px solid ${colors.border}`
                }} />
                <span style={{ fontSize: "0.625rem", color: "var(--text-2)", textTransform: "capitalize" }}>
                  {status.replace("_", " ")}
                </span>
              </div>
            ))}
            <div style={{ width: 1, height: 16, background: "var(--border)", margin: "0 0.5rem" }} />
            <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
              <AlertTriangle size={12} style={{ color: "var(--amber)" }} />
              <span style={{ fontSize: "0.625rem", color: "var(--text-2)" }}>Conflict</span>
            </div>
          </div>
        </div>

        {loading && <p style={{ color: "var(--text-2)" }}>Loading...</p>}

        {!loading && Object.keys(groups).length === 0 && (
          <div className="card" style={{ textAlign: "center", padding: "3rem", color: "var(--text-2)" }}>
            No decisions match this filter.
          </div>
        )}

        {/* ── Matrix View ── */}
        {viewMode === "matrix" && !loading && Object.entries(groups).map(([area, areaDecisions]) => {
          const areaCodes = [...new Set(areaDecisions.map(d => d.colour_code).filter(Boolean))] as string[];
          areaCodes.sort();

          return (
            <div key={area} className="card" style={{ marginBottom: "1rem", padding: 0, overflow: "hidden" }}>
              {/* Area header */}
              <div style={{
                padding: "0.875rem 1.25rem",
                borderBottom: "1px solid var(--border)",
                display: "flex", justifyContent: "space-between", alignItems: "center"
              }}>
                <h2 style={{ margin: 0, fontSize: "0.9375rem" }}>{area}</h2>
                <span style={{ fontSize: "0.6875rem", color: "var(--text-3)" }}>
                  {areaDecisions.length} decisions · {areaCodes.length} colours
                </span>
              </div>

              {/* Matrix table */}
              <div style={{ overflowX: "auto" }}>
                <table style={{
                  width: "100%", borderCollapse: "collapse",
                  fontSize: "0.75rem"
                }}>
                  <thead>
                    <tr>
                      <th style={{
                        padding: "0.625rem 0.75rem", textAlign: "left",
                        borderBottom: "1px solid var(--border)",
                        color: "var(--text-2)", fontWeight: 600,
                        fontSize: "0.6875rem", textTransform: "uppercase",
                        letterSpacing: "0.04em", position: "sticky", left: 0,
                        background: "var(--bg-1)", zIndex: 1, minWidth: 160
                      }}>
                        Component
                      </th>
                      {areaCodes.map(code => {
                        const c = colourMap.get(code);
                        return (
                          <th key={code} style={{
                            padding: "0.5rem", textAlign: "center",
                            borderBottom: "1px solid var(--border)",
                            minWidth: 80
                          }}>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.25rem" }}>
                              {c?.hex_preview && (
                                <div style={{
                                  width: 20, height: 20, borderRadius: 4,
                                  background: c.hex_preview,
                                  border: "1px solid rgba(255,255,255,0.2)",
                                  boxShadow: `0 0 8px ${c.hex_preview}30`
                                }} />
                              )}
                              <span style={{
                                fontFamily: "ui-monospace, monospace",
                                fontSize: "0.5625rem", color: "var(--text-2)",
                                fontWeight: 600
                              }}>
                                {code}
                              </span>
                              {c?.name && (
                                <span style={{ fontSize: "0.5rem", color: "var(--text-3)", maxWidth: 70, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {c.name}
                                </span>
                              )}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {areaDecisions.map((d, idx) => {
                      const material = d.material_reference ? materialMap.get(d.material_reference) : null;
                      const hasConflict = d.rc6_conflict === "red" || d.ai_rating === "red";
                      const isDeprecated = material?.lifecycle_status === "deprecated";

                      return (
                        <tr key={d.id} style={{ background: idx % 2 === 0 ? "transparent" : "rgba(77, 166, 255, 0.015)" }}>
                          <td style={{
                            padding: "0.5rem 0.75rem",
                            borderBottom: "1px solid var(--border)",
                            color: "var(--text-0)", fontWeight: 500,
                            position: "sticky", left: 0,
                            background: idx % 2 === 0 ? "var(--bg-0)" : "var(--bg-1)",
                            zIndex: 1, fontSize: "0.75rem"
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                              {d.component_name}
                              {hasConflict && <span title="Conflict detected" style={{ display: "flex", alignItems: "center" }}><AlertTriangle size={12} style={{ color: "var(--amber)" }} /></span>}
                            </div>
                            <div style={{ fontSize: "0.5625rem", color: isDeprecated ? "var(--red)" : "var(--text-3)", display: "flex", gap: "0.375rem" }}>
                              {d.material_reference ?? "-"}
                              {isDeprecated && <span style={{ background: "rgba(239, 68, 68, 0.15)", padding: "1px 4px", borderRadius: 2 }}>DEPRECATED</span>}
                            </div>
                          </td>
                          {areaCodes.map(code => {
                            const isMatch = d.colour_code === code;
                            if (!isMatch) {
                              return (
                                <td key={code} style={{
                                  padding: "0.5rem", textAlign: "center",
                                  borderBottom: "1px solid var(--border)"
                                }}>
                                  <span style={{ color: "var(--text-3)", fontSize: "0.625rem" }}>-</span>
                                </td>
                              );
                            }

                            const statusStyle = STATUS_COLORS[d.status] || STATUS_COLORS.draft;
                            const approvals = approvalsMap.get(d.id) ?? [];

                            return (
                              <td key={code} style={{
                                padding: "0.375rem", textAlign: "center",
                                borderBottom: "1px solid var(--border)"
                              }}>
                                <div style={{
                                  background: statusStyle.bg,
                                  border: `1px solid ${hasConflict ? "var(--amber)" : statusStyle.border}`,
                                  borderRadius: "var(--r-sm)",
                                  padding: "0.375rem",
                                  minHeight: 36,
                                  display: "flex", flexDirection: "column",
                                  alignItems: "center", justifyContent: "center",
                                  gap: "0.25rem",
                                  transition: "all 200ms var(--ease)"
                                }}>
                                  <span style={{
                                    fontSize: "0.5625rem", fontWeight: 600,
                                    color: statusStyle.text, textTransform: "uppercase",
                                    letterSpacing: "0.03em"
                                  }}>
                                    {d.status.replace("_", " ")}
                                  </span>
                                  {/* Mini approval dots */}
                                  <div style={{ display: "flex", gap: "2px" }}>
                                    {(["design", "engineering", "procurement", "quality"] as Team[]).map(t => {
                                      const a = approvals.find(ap => ap.team === t);
                                      const s = a?.status ?? "pending";
                                      return (
                                        <div key={t} title={`${TEAM_LABELS[t]}: ${s}`} style={{
                                          width: 5, height: 5, borderRadius: "50%",
                                          background: s === "approved" ? "var(--green)" : s === "rejected" ? "var(--red)" : "transparent",
                                          border: s === "pending" ? "1px solid var(--text-3)" : "none",
                                        }} />
                                      );
                                    })}
                                  </div>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        {/* ── Card View (alternate) ── */}
        {viewMode === "cards" && !loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {Object.entries(groups).map(([area, list]) => {
              const codes = Array.from(new Set(list.map((d) => d.colour_code).filter(Boolean)));
              return (
                <div key={area} className="card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                    <h2>{area}</h2>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-2)" }}>
                      {list.length} decisions · {codes.length} colours
                    </span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "0.75rem" }}>
                    {list.map((d) => {
                      const colour = d.colour_code ? colourMap.get(d.colour_code) : null;
                      const statusStyle = STATUS_COLORS[d.status] || STATUS_COLORS.draft;
                      const approvals = approvalsMap.get(d.id) ?? [];
                      const material = d.material_reference ? materialMap.get(d.material_reference) : null;
                      const hasConflict = d.rc6_conflict === "red" || d.ai_rating === "red";
                      const isDeprecated = material?.lifecycle_status === "deprecated";

                      return (
                        <div
                          key={d.id}
                          style={{
                            background: "var(--bg-0)",
                            border: `1px solid ${hasConflict ? "var(--amber)" : statusStyle.border}`,
                            borderRadius: "var(--r-md)",
                            overflow: "hidden",
                            transition: "all 200ms var(--ease)"
                          }}
                        >
                          {/* Colour swatch header */}
                          <div
                            style={{
                              height: 48,
                              background: colour?.hex_preview || "var(--bg-3)",
                              borderBottom: `2px solid ${statusStyle.border}`,
                              display: "flex", alignItems: "flex-end", justifyContent: "space-between",
                              padding: "0.25rem 0.5rem"
                            }}
                          >
                            <div>{hasConflict && <AlertTriangle size={14} style={{ color: "var(--amber)" }} />}</div>
                            <span style={{
                              fontSize: "0.5rem", fontWeight: 700,
                              color: statusStyle.text, textTransform: "uppercase",
                              background: statusStyle.bg,
                              padding: "1px 6px", borderRadius: "var(--r-sm)",
                              letterSpacing: "0.04em"
                            }}>
                              {d.status.replace("_", " ")}
                            </span>
                          </div>
                          <div style={{ padding: "0.625rem 0.75rem" }}>
                            <div style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--text-0)", marginBottom: "0.25rem" }}>
                              {d.component_name}
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div>
                                <div style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.6875rem", color: "var(--text-2)" }}>
                                  {d.colour_code || "-"}
                                </div>
                                {colour?.name && (
                                  <div style={{ fontSize: "0.5625rem", color: "var(--text-3)" }}>
                                    {colour.name} · {colour.finish}
                                  </div>
                                )}
                              </div>
                              {/* Mini approval dots */}
                              <div style={{ display: "flex", gap: "2px" }}>
                                {(["design", "engineering", "procurement", "quality"] as Team[]).map(t => {
                                  const a = approvals.find(ap => ap.team === t);
                                  const s = a?.status ?? "pending";
                                  return (
                                    <div key={t} title={`${TEAM_LABELS[t]}: ${s}`} style={{
                                      width: 5, height: 5, borderRadius: "50%",
                                      background: s === "approved" ? "var(--green)" : s === "rejected" ? "var(--red)" : "transparent",
                                      border: s === "pending" ? "1px solid var(--text-3)" : "none",
                                    }} />
                                  );
                                })}
                              </div>
                            </div>
                            <div style={{ fontSize: "0.5625rem", color: isDeprecated ? "var(--red)" : "var(--text-3)", marginTop: "0.25rem", display: "flex", gap: "0.375rem" }}>
                              {d.material_reference || "-"}
                              {isDeprecated && <span style={{ background: "rgba(239, 68, 68, 0.15)", padding: "1px 4px", borderRadius: 2 }}>DEPRECATED</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Enterprise AI Deep Analysis ── */}
        <EnterpriseReportView 
          reportType="colour_mix"
          title="CMF Harmony & Visual Clash"
          decisions={filteredDecisions}
          approvals={flatApprovals}
          conflicts={conflicts}
        />

      </div>
    </PermissionGate>
  );
}
