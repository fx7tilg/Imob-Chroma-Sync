import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { ApprovalEvent, Profile, Team } from "../types/db";

interface Props {
  decisionId: string;
  currentVersion: number;
}

const TEAM_LABEL: Record<Team, string> = {
  design: "Design",
  engineering: "Engineering",
  procurement: "Procurement",
  quality: "Quality",
};

const ACTION_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  approved: { color: "var(--green)", bg: "rgba(34, 197, 94, 0.08)", label: "Approved" },
  rejected: { color: "var(--red)", bg: "rgba(239, 68, 68, 0.08)", label: "Rejected" },
  pending: { color: "var(--text-3)", bg: "var(--bg-0)", label: "Pending" },
  submitted: { color: "var(--blue)", bg: "rgba(59, 130, 246, 0.08)", label: "Submitted" },
};

export default function ApprovalHistory({ decisionId, currentVersion }: Props) {
  const [events, setEvents] = useState<ApprovalEvent[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("approval_events")
        .select("*")
        .eq("decision_id", decisionId)
        .order("created_at", { ascending: true });

      const evts = (data ?? []) as ApprovalEvent[];
      setEvents(evts);

      // Resolve actor profiles
      const actorIds = [...new Set(evts.map(e => e.actor_id).filter(Boolean))] as string[];
      if (actorIds.length > 0) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("*")
          .in("id", actorIds);
        if (profileData) {
          const map = new Map<string, Profile>();
          (profileData as Profile[]).forEach(p => map.set(p.id, p));
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
        <h3>Approval History</h3>
        <div style={{ color: "var(--text-3)", fontSize: "0.8125rem", padding: "1rem 0" }}>Loading…</div>
      </div>
    );
  }

  // Group events by version
  const byVersion = new Map<number, ApprovalEvent[]>();
  for (const evt of events) {
    const list = byVersion.get(evt.version) ?? [];
    list.push(evt);
    byVersion.set(evt.version, list);
  }

  const versions = [...byVersion.keys()].sort((a, b) => b - a); // newest first

  return (
    <div className="card" style={{ marginTop: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h3 style={{ margin: 0 }}>Approval History</h3>
        <span className="badge" style={{ background: "var(--bg-2)", color: "var(--text-1)", fontSize: "0.625rem" }}>
          {events.length} event{events.length !== 1 ? "s" : ""}
        </span>
      </div>

      {events.length === 0 ? (
        <div style={{ color: "var(--text-3)", fontSize: "0.8125rem", fontStyle: "italic" }}>
          No approval events recorded yet. Events will appear as teams review this decision.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {versions.map(version => {
            const versionEvents = byVersion.get(version) ?? [];
            const isCurrentVersion = version === currentVersion;
            const isSuperseded = version < currentVersion;

            return (
              <div key={version}>
                {/* Version header */}
                <div style={{
                  display: "flex", alignItems: "center", gap: "0.5rem",
                  marginBottom: "0.5rem", paddingBottom: "0.25rem",
                  borderBottom: "1px solid var(--border)"
                }}>
                  <span style={{
                    fontSize: "0.6875rem", fontWeight: 700,
                    color: isCurrentVersion ? "var(--accent)" : "var(--text-3)",
                    textTransform: "uppercase", letterSpacing: "0.04em"
                  }}>
                    Version {version}
                  </span>
                  {isCurrentVersion && (
                    <span className="badge badge-accent" style={{ fontSize: "0.5625rem" }}>Current</span>
                  )}
                  {isSuperseded && (
                    <span className="badge" style={{ fontSize: "0.5625rem", background: "var(--bg-2)", color: "var(--text-3)" }}>
                      Superseded
                    </span>
                  )}
                </div>

                {/* Events for this version */}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem", paddingLeft: "0.5rem" }}>
                  {versionEvents.map(evt => {
                    const style = ACTION_STYLE[evt.action] ?? ACTION_STYLE.pending;
                    const actor = evt.actor_id ? profiles.get(evt.actor_id) : null;
                    const teamLabel = TEAM_LABEL[evt.team] ?? evt.team;

                    return (
                      <div key={evt.id} style={{
                        display: "flex", alignItems: "flex-start", gap: "0.75rem",
                        padding: "0.5rem 0.75rem", borderRadius: "var(--r-sm)",
                        background: style.bg, border: "1px solid var(--border)",
                        opacity: isSuperseded ? 0.6 : 1,
                      }}>
                        {/* Team + action */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                            <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-0)" }}>
                              {teamLabel}
                            </span>
                            <span style={{
                              fontSize: "0.6875rem", fontWeight: 600,
                              color: style.color, textTransform: "capitalize"
                            }}>
                              - {style.label}
                            </span>
                            {isSuperseded && (
                              <span style={{ fontSize: "0.5625rem", color: "var(--text-3)", fontStyle: "italic" }}>
                                (v{version})
                              </span>
                            )}
                          </div>
                          {evt.notes && (
                            <div style={{
                              fontSize: "0.75rem", color: "var(--text-1)", marginTop: "0.125rem",
                              lineHeight: 1.4
                            }}>
                              "{evt.notes}"
                            </div>
                          )}
                          <div style={{ fontSize: "0.625rem", color: "var(--text-3)", marginTop: "0.125rem" }}>
                            {actor ? (
                              <>
                                by <strong style={{ color: "var(--text-2)" }}>{actor.full_name}</strong>
                                {actor.email && <span> &lt;{actor.email}&gt;</span>}
                              </>
                            ) : (
                              evt.action === "pending" ? "auto-reset" : "system"
                            )}
                            {" · "}
                            {new Date(evt.created_at).toLocaleDateString("en-GB", {
                              day: "numeric", month: "short", year: "numeric",
                              hour: "2-digit", minute: "2-digit"
                            })}
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
    </div>
  );
}
