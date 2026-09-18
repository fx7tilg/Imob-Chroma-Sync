import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { DecisionSnapshot, Profile } from "../types/db";

interface Props {
  decisionId: string;
  currentVersion: number;
}

const STATUS_ICON: Record<string, string> = {
  draft: "📝",
  submitted: "📤",
  under_review: "🔍",
  approved: "✅",
  rejected: "❌",
};

const STATUS_COLOUR: Record<string, string> = {
  draft: "var(--text-2)",
  submitted: "var(--blue)",
  under_review: "var(--amber)",
  approved: "var(--green)",
  rejected: "var(--red)",
};

export default function DecisionHistory({ decisionId, currentVersion }: Props) {
  const [snapshots, setSnapshots] = useState<DecisionSnapshot[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("decision_snapshots")
        .select("*")
        .eq("decision_id", decisionId)
        .order("created_at", { ascending: true });

      const snaps = (data ?? []) as DecisionSnapshot[];
      setSnapshots(snaps);

      // Resolve profile names
      const userIds = [...new Set(snaps.map((s) => s.created_by).filter(Boolean))] as string[];
      if (userIds.length > 0) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("*")
          .in("id", userIds);
        if (profileData) {
          const map = new Map<string, Profile>();
          (profileData as Profile[]).forEach((p) => map.set(p.id, p));
          setProfiles(map);
        }
      }

      setLoading(false);
    }
    load();
  }, [decisionId]);

  if (loading) {
    return (
      <div className="card" style={{ marginTop: "1rem" }}>
        <h3>Decision History</h3>
        <div style={{ color: "var(--text-3)", fontSize: "0.8125rem", padding: "1rem 0" }}>Loading timeline…</div>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginTop: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h3 style={{ margin: 0 }}>Decision History</h3>
        <span className="badge" style={{ background: "var(--bg-2)", color: "var(--text-1)", fontSize: "0.625rem" }}>
          v{currentVersion}
        </span>
      </div>

      {snapshots.length === 0 ? (
        <div style={{ color: "var(--text-3)", fontSize: "0.8125rem", fontStyle: "italic" }}>
          No status transitions recorded yet. History will appear as the decision moves through workflow stages.
        </div>
      ) : (
        <div style={{ position: "relative", paddingLeft: "1.5rem" }}>
          {/* Timeline vertical line */}
          <div
            style={{
              position: "absolute",
              left: "0.5rem",
              top: 4,
              bottom: 4,
              width: 2,
              background: "var(--border)",
            }}
          />

          {snapshots.map((snap, i) => {
            const profile = snap.created_by ? profiles.get(snap.created_by) : null;
            const statusLabel = snap.status.replace(/_/g, " ");
            const icon = STATUS_ICON[snap.status] || "•";
            const colour = STATUS_COLOUR[snap.status] || "var(--text-2)";
            const snapshotData = snap.snapshot as Record<string, unknown>;

            return (
              <div key={snap.id} style={{ position: "relative", marginBottom: i < snapshots.length - 1 ? "1rem" : 0 }}>
                {/* Dot on timeline */}
                <div
                  style={{
                    position: "absolute",
                    left: "-1.25rem",
                    top: 3,
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: colour,
                    border: "2px solid var(--bg-1)",
                    zIndex: 1,
                  }}
                />

                <div
                  style={{
                    background: "var(--bg-0)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--r-sm)",
                    padding: "0.625rem 0.75rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                      <span>{icon}</span>
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: "0.8125rem",
                          color: colour,
                          textTransform: "capitalize",
                        }}
                      >
                        {statusLabel}
                      </span>
                      <span
                        className="badge"
                        style={{ fontSize: "0.5625rem", background: "var(--bg-2)", color: "var(--text-2)" }}
                      >
                        v{snap.version}
                      </span>
                    </div>
                    <span style={{ fontSize: "0.6875rem", color: "var(--text-3)" }}>
                      {new Date(snap.created_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>

                  {profile && (
                    <div style={{ fontSize: "0.6875rem", color: "var(--text-2)", marginTop: "0.25rem" }}>
                      by {profile.full_name}
                      {profile.team && (
                        <span style={{ color: "var(--text-3)" }}> ({profile.team})</span>
                      )}
                    </div>
                  )}

                  {/* Show key field values at that snapshot */}
                  <div
                    style={{
                      display: "flex",
                      gap: "0.5rem",
                      marginTop: "0.375rem",
                      flexWrap: "wrap",
                    }}
                  >
                    {snap.version === currentVersion ? (
                      <span className="badge badge-accent" style={{ fontSize: "0.5625rem" }}>
                        Current
                      </span>
                    ) : snap.version < currentVersion ? (
                      <span className="badge" style={{ fontSize: "0.5625rem", background: "var(--bg-2)", color: "var(--text-3)" }}>
                        Superseded
                      </span>
                    ) : null}
                    {snapshotData.colour_code ? (
                      <span className="badge" style={{ fontSize: "0.5625rem", background: "var(--bg-2)" }}>
                        colour: {String(snapshotData.colour_code)}
                      </span>
                    ) : null}
                    {snapshotData.material_reference ? (
                      <span className="badge" style={{ fontSize: "0.5625rem", background: "var(--bg-2)" }}>
                        material: {String(snapshotData.material_reference)}
                      </span>
                    ) : null}
                    {snapshotData.finish_surface ? (
                      <span className="badge" style={{ fontSize: "0.5625rem", background: "var(--bg-2)" }}>
                        finish: {String(snapshotData.finish_surface)}
                      </span>
                    ) : null}
                    {snapshotData.engineering_decision ? (
                      <span className="badge" style={{ fontSize: "0.5625rem", background: "var(--bg-2)" }}>
                        eng: {String(snapshotData.engineering_decision)}
                      </span>
                    ) : null}
                    {snapshotData.supplier ? (
                      <span className="badge" style={{ fontSize: "0.5625rem", background: "var(--bg-2)" }}>
                        supplier: {String(snapshotData.supplier)}
                      </span>
                    ) : null}
                    {snapshotData.ai_rating ? (
                      <span className="badge" style={{ fontSize: "0.5625rem", background: "var(--bg-2)" }}>
                        AI: {String(snapshotData.ai_rating)}
                      </span>
                    ) : null}
                  </div>

                  {/* What Changed? Diff between this snapshot and the previous one */}
                  {i > 0 && snap.version > snapshots[i - 1].version && (() => {
                    const prevData = snapshots[i - 1].snapshot as Record<string, unknown>;
                    const diffFields = [
                      "colour_code", "material_reference", "finish_surface",
                      "engineering_part_number", "feasibility_status", "engineering_decision",
                      "supplier", "price_per_unit_cents", "procurement_decision",
                      "quality_status", "quality_decision", "pass_fail"
                    ];
                    const changes = diffFields.filter(f => 
                      JSON.stringify(snapshotData[f]) !== JSON.stringify(prevData[f]) &&
                      (snapshotData[f] != null || prevData[f] != null)
                    );
                    if (changes.length === 0) return null;
                    return (
                      <details style={{ marginTop: "0.375rem" }}>
                        <summary style={{
                          fontSize: "0.6875rem", color: "var(--accent)", cursor: "pointer",
                          fontWeight: 600
                        }}>
                          What changed? ({changes.length} field{changes.length > 1 ? "s" : ""})
                        </summary>
                        <div style={{
                          marginTop: "0.25rem", padding: "0.375rem 0.5rem",
                          background: "var(--bg-0)", borderRadius: "var(--r-sm)",
                          border: "1px solid var(--border)", fontSize: "0.6875rem"
                        }}>
                          {changes.map(field => (
                            <div key={field} style={{ marginBottom: "0.125rem", display: "flex", gap: "0.5rem" }}>
                              <span style={{ color: "var(--text-2)", fontWeight: 600, minWidth: 120 }}>
                                {field.replace(/_/g, " ")}:
                              </span>
                              <span style={{ color: "var(--red)", textDecoration: "line-through" }}>
                                {String(prevData[field] ?? "-")}
                              </span>
                              <span>→</span>
                              <span style={{ color: "var(--green)" }}>
                                {String(snapshotData[field] ?? "-")}
                              </span>
                            </div>
                          ))}
                        </div>
                      </details>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
