import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

interface AuditEntry {
  id: string;
  when: string;
  action: string;
  module: string;
  recordId: string;
  actor: string;
  details: string;
}

const ACTION_BADGE: Record<string, string> = {
  INSERT: "badge-green",
  UPDATE: "badge-amber",
  DELETE: "badge-red",
  APPROVAL_SUBMITTED: "badge-blue",
  APPROVAL_APPROVED: "badge-green",
  APPROVAL_REJECTED: "badge-red",
  AI_READINESS_CHECK: "badge-accent",
  AI_CONFLICT_DETECTED: "badge-red",
  REPORT_GENERATED: "badge-blue",
  ROLE_CHANGE: "badge-purple"
};

const FILTERS = ["ALL", "INSERT", "UPDATE", "DELETE", "DOWNLOAD", "ROLE_CHANGE"];

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

export default function AuditLogs() {
  const [filter, setFilter] = useState<string>("ALL");
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadLogs() {
    setLoading(true);
    // Fetch profiles map
    const { data: profileData } = await supabase.from("profiles").select("id, full_name, team");
    const profiles = new Map((profileData || []).map(p => [p.id, p]));

    const { data } = await supabase.from("audit_log").select("*").order("changed_at", { ascending: false }).limit(200);
    
    if (data) {
      const mapped: AuditEntry[] = data.map(r => {
        const p = r.changed_by ? profiles.get(r.changed_by) : null;
        let actor = p ? `${p.full_name} (${p.team || 'system'})` : (r.changed_by || 'system');
        
        let details = "";
        if (r.action === "UPDATE") {
          // crude diff
          const changes = [];
          for (const key in r.new_values) {
            if (r.old_values && r.old_values[key] !== r.new_values[key] && key !== "updated_at") {
              changes.push(`${key} changed`);
            }
          }
          details = changes.join(", ") || "Row updated";
        } else if (r.action === "INSERT") {
          details = "Row created";
        } else if (r.action === "DELETE") {
          details = "Row deleted";
        } else if (r.action === "DOWNLOAD") {
          details = `Downloaded ${r.new_values?.report || "Report"} (${r.new_values?.count || 0} rows)`;
        } else if (r.action === "ROLE_CHANGE") {
          details = `Changed role from ${r.old_values?.role || "unknown"} to ${r.new_values?.role || "unknown"}`;
        }

        return {
          id: r.id.toString(),
          when: r.changed_at,
          action: r.action,
          module: r.table_name,
          recordId: r.row_id,
          actor,
          details
        };
      });
      setLogs(mapped);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadLogs();
    
    const channel = supabase.channel("audit-logs-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "audit_log" }, () => loadLogs())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const rows = useMemo(
    () => (filter === "ALL" ? logs : logs.filter((r) => r.action === filter)),
    [filter, logs]
  );

  const stats = useMemo(() => {
    const count = (a: string) => logs.filter((r) => r.action === a).length;
    return {
      total: logs.length,
      inserts: count("INSERT"),
      updates: count("UPDATE"),
      deletes: count("DELETE")
    };
  }, [logs]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
        <div>
          <h1>Activity Log</h1>
          <p>Every change, every actor, every timestamp - end-to-end audit trail.</p>
        </div>
        <button className="btn btn-ghost" onClick={loadLogs} disabled={loading}>Refresh</button>
      </div>

      <div className="grid4" style={{ marginBottom: "1.5rem" }}>
        <div className="card"><div className="stat-label">Total Events</div><div className="stat-value">{stats.total}</div></div>
        <div className="card"><div className="stat-label">Inserts</div><div className="stat-value" style={{ color: "var(--green)" }}>{stats.inserts}</div></div>
        <div className="card"><div className="stat-label">Updates</div><div className="stat-value" style={{ color: "var(--amber)" }}>{stats.updates}</div></div>
        <div className="card"><div className="stat-label">Deletes</div><div className="stat-value" style={{ color: "var(--red)" }}>{stats.deletes}</div></div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem", marginBottom: "1rem" }}>
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: "0.25rem 0.625rem",
              borderRadius: "var(--r-sm)",
              fontSize: "0.6875rem",
              fontWeight: 500,
              border: filter === f ? "1px solid var(--accent)" : "1px solid var(--border)",
              background: filter === f ? "var(--accent-muted)" : "var(--bg-0)",
              color: filter === f ? "var(--accent)" : "var(--text-2)",
              cursor: "pointer",
              fontFamily: "inherit"
            }}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ maxHeight: "480px", overflowY: "auto" }}>
          <table className="data-table">
            <thead style={{ position: "sticky", top: 0, background: "var(--bg-0)", zIndex: 1 }}>
              <tr>
                <th style={{ width: 110 }}>When</th>
                <th style={{ width: 170 }}>Action</th>
                <th style={{ width: 110 }}>Module</th>
                <th>Record ID</th>
                <th>Actor</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {loading && logs.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "2rem", color: "var(--text-2)" }}>Loading...</td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "2rem", color: "var(--text-2)" }}>No activity found.</td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ color: "var(--text-2)" }}>{timeAgo(r.when)}</td>
                  <td>
                    <span className={`badge ${ACTION_BADGE[r.action] ?? "badge-blue"}`}>{r.action}</span>
                  </td>
                  <td style={{ color: "var(--text-1)" }}>{r.module}</td>
                  <td style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: "0.75rem", color: "var(--text-2)" }}>
                    {r.recordId.substring(0, 13)}...
                  </td>
                  <td style={{ color: "var(--text-1)" }}>{r.actor}</td>
                  <td style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.details}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
