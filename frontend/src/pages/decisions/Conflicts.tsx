import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Loader2, ArrowRight } from "lucide-react";
import { supabase } from "../../lib/supabase";

import type { Conflict, Team } from "../../types/db";
import PermissionGate from "../../components/auth/PermissionGate";

type JoinedDecision = {
  id: string;
  component_name: string;
  business_area: string;
  colour_code: string | null;
  created_by: string;
  submitted_by: string | null;
  status: string;
  submitted_at: string | null;
  created_at: string;
};

type JoinedConflict = Conflict & {
  decision_a: JoinedDecision;
  decision_b: JoinedDecision;
};

const TEAM_LABELS: Record<Team, string> = {
  design: "Design",
  engineering: "Engineering",
  procurement: "Procurement",
  quality: "Quality",
};

type FilterTab = "open" | "resolved";

export default function Conflicts() {

  const navigate = useNavigate();
  const [conflicts, setConflicts] = useState<JoinedConflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>("open");
  const [authorProfiles, setAuthorProfiles] = useState<Map<string, { full_name: string; team: string | null }>>(new Map());

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data, error } = await supabase
        .from("conflicts")
        .select(`
          *,
          decision_a:decision_a_id(id, component_name, business_area, colour_code, created_by, submitted_by, status, submitted_at, created_at),
          decision_b:decision_b_id(id, component_name, business_area, colour_code, created_by, submitted_by, status, submitted_at, created_at)
        `)
        .order("detected_at", { ascending: false });

      if (!cancelled) {
        if (error) console.error("Conflicts load error:", error);
        
        const rows = (data ?? []) as JoinedConflict[];
        
        const userIds = new Set<string>();
        rows.forEach(r => {
          if (r.decision_a?.created_by) userIds.add(r.decision_a.created_by);
          if (r.decision_a?.submitted_by) userIds.add(r.decision_a.submitted_by);
          if (r.decision_b?.created_by) userIds.add(r.decision_b.created_by);
          if (r.decision_b?.submitted_by) userIds.add(r.decision_b.submitted_by);
        });

        let profileMap = new Map();
        if (userIds.size > 0) {
          const { data: pData } = await supabase
            .from("profiles")
            .select("id, full_name, team")
            .in("id", Array.from(userIds));
          if (pData) {
            profileMap = new Map(pData.map(p => [p.id, p]));
          }
        }

        setAuthorProfiles(profileMap);
        setConflicts(rows);
        setLoading(false);
      }
    }

    load();

    const channel = supabase
      .channel("conflicts-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "conflicts" }, () => load())
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  // ── Group conflicts by decision pair (sorted A,B so order doesn't matter) ──
  type ConflictGroup = { key: string; conflicts: JoinedConflict[] };
  function groupByPair(list: JoinedConflict[]): ConflictGroup[] {
    const map = new Map<string, JoinedConflict[]>();
    for (const c of list) {
      const [a, b] = [c.decision_a_id, c.decision_b_id].sort();
      const key = `${a}::${b}`;
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    return Array.from(map.entries()).map(([key, conflicts]) => ({ key, conflicts }));
  }

  const open = conflicts.filter((c) => !c.resolved);
  const resolved = conflicts.filter((c) => c.resolved);

  const filteredRaw = activeTab === "open" ? open : resolved;
  const grouped = groupByPair(filteredRaw);

  const openGroups = groupByPair(open).length;
  const resolvedGroups = groupByPair(resolved).length;

  function timeAgo(dateStr: string) {
    const ms = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  // Determine who is the offender (newer decision) and who is the baseline (older decision)
  function determineRoles(decisionA: JoinedDecision, decisionB: JoinedDecision) {
    // 1. If one is approved and the other isn't, the approved one is the baseline
    if (decisionA.status === "approved" && decisionB.status !== "approved") return { baseline: decisionA, offender: decisionB };
    if (decisionB.status === "approved" && decisionA.status !== "approved") return { baseline: decisionB, offender: decisionA };
    
    // 2. If one is under_review and the other is draft/submitted, under_review is baseline
    if (decisionA.status === "under_review" && (decisionB.status === "draft" || decisionB.status === "submitted")) return { baseline: decisionA, offender: decisionB };
    if (decisionB.status === "under_review" && (decisionA.status === "draft" || decisionA.status === "submitted")) return { baseline: decisionB, offender: decisionA };

    // 3. Otherwise, compare submitted_at or created_at (newer is the offender)
    const timeA = new Date(decisionA.submitted_at ?? decisionA.created_at).getTime();
    const timeB = new Date(decisionB.submitted_at ?? decisionB.created_at).getTime();

    if (timeA > timeB) return { baseline: decisionB, offender: decisionA };
    return { baseline: decisionA, offender: decisionB };
  }

  return (
    <PermissionGate permission="decision.read">
      <div>
        <div style={{ marginBottom: "1.5rem" }}>
          <h1>Conflicts</h1>
          <p>Cross-decision clashes detected by the AI Gatekeeper. Each conflict must be resolved by updating the offending decision's data.</p>
        </div>

        {/* KPI Strip */}
        <div className="grid2" style={{ marginBottom: "1.5rem" }}>
          <div className="card" style={{ marginBottom: 0 }}>
            <div className="stat-label">Open Conflicts</div>
            <div className="stat-value" style={{ color: "var(--red)" }}>{openGroups}</div>
          </div>
          <div className="card" style={{ marginBottom: 0 }}>
            <div className="stat-label">Resolved</div>
            <div className="stat-value" style={{ color: "var(--green)" }}>{resolvedGroups}</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{
          display: "flex", gap: "0.25rem", marginBottom: "1rem",
          background: "var(--bg-1)", padding: "0.25rem", borderRadius: "var(--r-md)",
          border: "1px solid var(--border)"
        }}>
          {([
            { key: "open" as FilterTab, label: "Open Conflicts", count: openGroups },
            { key: "resolved" as FilterTab, label: "Resolved", count: resolvedGroups },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                flex: 1,
                padding: "0.5rem 0.75rem",
                borderRadius: "var(--r-sm)",
                border: "none",
                background: activeTab === tab.key ? "var(--bg-2)" : "transparent",
                color: activeTab === tab.key ? "var(--text-0)" : "var(--text-2)",
                fontWeight: activeTab === tab.key ? 600 : 400,
                fontSize: "0.8125rem",
                cursor: "pointer",
                transition: "all 200ms var(--ease)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "0.375rem"
              }}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`badge ${tab.key === "open" ? "badge-red" : "badge-green"}`}
                  style={{ fontSize: "0.625rem" }}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Conflict List - grouped by decision pair */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {loading && (
            <div className="card" style={{ textAlign: "center", padding: "2rem", color: "var(--text-2)" }}>
              <Loader2 size={16} className="spin" style={{ display: "inline-block", marginRight: "0.5rem" }} />
              Loading conflicts...
            </div>
          )}

          {!loading && grouped.length === 0 && (
            <div className="card" style={{ textAlign: "center", padding: "3rem", color: "var(--text-2)" }}>
              {activeTab === "open" && "No open conflicts. Excellent."}
              {activeTab === "resolved" && "No resolved conflicts yet."}
            </div>
          )}

          {grouped.map(({ key: groupKey, conflicts: groupConflicts }) => {
            const first = groupConflicts[0];
            const isAnyResolved = first.resolved;
            const { baseline, offender } = determineRoles(first.decision_a, first.decision_b);

            const offenderProfile = authorProfiles.get(offender.submitted_by ?? offender.created_by);
            const baselineProfile = authorProfiles.get(baseline.submitted_by ?? baseline.created_by);

            return (
              <div
                key={groupKey}
                className="card"
                style={{
                  borderColor: isAnyResolved ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.25)",
                  background: isAnyResolved ? "rgba(34, 197, 94, 0.02)" : "rgba(239, 68, 68, 0.04)",
                  marginBottom: 0
                }}
              >
                {/* Header row */}
                <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                  {isAnyResolved ? (
                    <CheckCircle2 size={16} style={{ color: "var(--green)", flexShrink: 0, marginTop: 2 }} />
                  ) : (
                    <AlertTriangle size={16} style={{ color: "var(--red)", flexShrink: 0, marginTop: 2 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* All conflict type badges for this pair */}
                    <div style={{ display: "flex", gap: "0.375rem", alignItems: "center", flexWrap: "wrap", marginBottom: "0.375rem" }}>
                      {groupConflicts.map((c) => (
                        <span key={c.id} className={`badge ${c.resolved ? "badge-green" : "badge-red"}`}>
                          {c.conflict_type.replace(/_/g, " ")}
                        </span>
                      ))}
                      <span style={{ fontSize: "0.75rem", color: "var(--text-2)" }}>
                        {baseline.business_area}
                      </span>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>·</span>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-2)" }}>
                        {timeAgo(first.detected_at)}
                      </span>
                    </div>

                    {/* Offending Decision Focus */}
                    <div style={{ marginBottom: "0.75rem" }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: "0.375rem" }}>
                        <Link to={`/decisions/${offender.id}`} style={{ color: "var(--text-0)", fontSize: "1rem", fontWeight: 600, textDecoration: "none" }}>
                          {offender.component_name}
                        </Link>
                        <span style={{ color: "var(--text-2)", fontSize: "0.875rem" }}>
                          ({offender.colour_code ?? "-"})
                        </span>
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-2)", marginTop: "0.25rem", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                        <span style={{ color: isAnyResolved ? "var(--green)" : "var(--red)", fontWeight: 600 }}>
                          Offending Decision {isAnyResolved ? "(Fixed)" : "(Needs Fix)"}
                        </span>
                        <span>•</span>
                        <span>by {offenderProfile?.full_name ?? "Unknown"}</span>
                        {offenderProfile?.team && <span className="badge" style={{ fontSize: "0.5625rem", padding: "1px 4px" }}>{TEAM_LABELS[offenderProfile.team as Team] ?? offenderProfile.team}</span>}
                      </div>
                    </div>

                    {/* All explanations for this pair */}
                    <div style={{ marginTop: "0.25rem", marginBottom: "0.75rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                      {groupConflicts.map((c) => (
                        <div key={c.id} style={{ fontSize: "0.8125rem", color: "var(--text-1)", lineHeight: 1.5, display: "flex", gap: "0.375rem", alignItems: "baseline" }}>
                          <span style={{ fontSize: "0.625rem", color: "var(--text-3)" }}>•</span>
                          {c.explanation}
                        </div>
                      ))}
                    </div>

                    {/* Baseline Reference */}
                    <div style={{ padding: "0.5rem 0.75rem", background: "rgba(59, 130, 246, 0.05)", borderRadius: "var(--r-sm)", border: "1px solid rgba(59, 130, 246, 0.2)", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "0.6875rem", color: "var(--blue)", fontWeight: 600, textTransform: "uppercase" }}>Compared Against Baseline:</span>
                      <Link to={`/decisions/${baseline.id}`} style={{ color: "var(--text-0)", fontSize: "0.8125rem", fontWeight: 500, textDecoration: "none" }}>
                        {baseline.component_name} <span style={{ color: "var(--text-2)", fontWeight: 400 }}>({baseline.colour_code ?? "-"})</span>
                      </Link>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-2)" }}>by {baselineProfile?.full_name ?? "Unknown"}</span>
                    </div>

                    {/* Action required note for unresolved */}
                    {!isAnyResolved && (
                      <div style={{ marginTop: "0.875rem", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-0)", padding: "0.625rem 0.875rem", borderRadius: "var(--r-md)", border: "1px solid var(--border)" }}>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-1)" }}>
                          <strong style={{ color: "var(--red)" }}>Action Required:</strong> The offending decision must be updated to align with the baseline.
                        </div>
                        <button 
                          className="btn btn-primary" 
                          onClick={() => navigate(`/decisions/${offender.id}`)}
                          style={{ padding: "0.375rem 0.75rem", fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "0.375rem" }}
                        >
                          Fix Decision <ArrowRight size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </PermissionGate>
  );
}
