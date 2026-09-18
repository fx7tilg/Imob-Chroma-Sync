import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, XCircle, History, Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../auth/AuthContext";
import type { Approval, Decision, Team } from "../../types/db";

const STATUS_BADGE: Record<string, string> = {
  draft: "badge-purple",
  submitted: "badge-blue",
  under_review: "badge-amber",
  approved: "badge-green",
  rejected: "badge-red"
};

const TEAM_LABEL: Record<Team, string> = {
  design: "Design",
  engineering: "Engineering",
  procurement: "Procurement",
  quality: "Quality",
};

type ApprovalItem = Decision & {
  my_approval: Approval;
};

function timeAgo(iso: string | null | undefined) {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

export default function MyApprovals() {
  const { profile } = useAuth();
  const nav = useNavigate();
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "approved" | "rejected">("all");

  const userTeam = profile?.team ?? null;

  useEffect(() => {
    if (!userTeam) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      // Get approvals where my team has voted
      const { data: myApprovals } = await supabase
        .from("approvals")
        .select("*")
        .eq("team", userTeam!)
        .in("status", ["approved", "rejected"])
        .order("decided_at", { ascending: false });

      if (!myApprovals || cancelled) {
        if (!cancelled) setLoading(false);
        return;
      }

      const decisionIds = [...new Set((myApprovals as Approval[]).map(a => a.decision_id))];
      if (decisionIds.length === 0) {
        if (!cancelled) {
          setItems([]);
          setLoading(false);
        }
        return;
      }

      const { data: decisions } = await supabase
        .from("decisions")
        .select("*")
        .in("id", decisionIds);

      const decMap = new Map((decisions ?? []).map(d => [d.id, d]));

      const result: ApprovalItem[] = [];
      for (const a of myApprovals as Approval[]) {
        const d = decMap.get(a.decision_id);
        if (d) {
          result.push({ ...(d as Decision), my_approval: a });
        }
      }

      if (!cancelled) {
        setItems(result);
        setLoading(false);
      }
    }

    load();

    const channel = supabase
      .channel("my-approvals-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "approvals" }, () => load())
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userTeam]);

  const filtered = filter === "all" ? items :
    items.filter(i => i.my_approval.status === filter);

  const approvedCount = items.filter(i => i.my_approval.status === "approved").length;
  const rejectedCount = items.filter(i => i.my_approval.status === "rejected").length;

  if (!userTeam) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "3rem", color: "var(--text-2)" }}>
        No team assigned. Contact your project lead to set your team.
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: "1.5rem" }}>
        <h1>My Approvals</h1>
        <p>Decisions that <strong>{TEAM_LABEL[userTeam]}</strong> has already reviewed.</p>
      </div>

      {/* Stats */}
      <div className="grid3" style={{ marginBottom: "1.5rem" }}>
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="stat-label">Total Reviewed</div>
          <div className="stat-value">{items.length}</div>
        </div>
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="stat-label">Approved</div>
          <div className="stat-value" style={{ color: "var(--green)" }}>{approvedCount}</div>
        </div>
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="stat-label">Rejected</div>
          <div className="stat-value" style={{ color: "var(--red)" }}>{rejectedCount}</div>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{
        display: "flex", gap: "0.25rem", marginBottom: "1rem",
        background: "var(--bg-1)", padding: "0.25rem", borderRadius: "var(--r-md)",
        border: "1px solid var(--border)"
      }}>
        {([
          { key: "all" as const, label: "All", count: items.length },
          { key: "approved" as const, label: "Approved", count: approvedCount },
          { key: "rejected" as const, label: "Rejected", count: rejectedCount },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            style={{
              flex: 1, padding: "0.5rem 0.75rem", borderRadius: "var(--r-sm)",
              border: "none",
              background: filter === tab.key ? "var(--bg-2)" : "transparent",
              color: filter === tab.key ? "var(--text-0)" : "var(--text-2)",
              fontWeight: filter === tab.key ? 600 : 400,
              fontSize: "0.8125rem", cursor: "pointer",
              transition: "all 200ms var(--ease)"
            }}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Component</th>
              <th>Business Area</th>
              <th>Colour</th>
              <th>Decision Status</th>
              <th>Your Vote</th>
              <th>Notes</th>
              <th>Voted</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", color: "var(--text-2)", padding: "2rem" }}>
                  <Loader2 size={14} className="spin" style={{ display: "inline-block", marginRight: "0.5rem" }} />
                  Loading...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: "3rem" }}>
                  <History size={32} style={{ color: "var(--text-3)", marginBottom: "0.75rem" }} />
                  <div style={{ color: "var(--text-2)", fontSize: "0.9375rem", fontWeight: 500 }}>
                    No approvals yet
                  </div>
                  <div style={{ color: "var(--text-3)", fontSize: "0.75rem", marginTop: "0.25rem" }}>
                    Decisions you review will appear here.
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((d) => (
                <tr
                  key={`${d.id}-${d.my_approval.id}`}
                  onClick={() => nav(`/decisions/${d.id}`)}
                  style={{ cursor: "pointer", transition: "background 150ms" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(77,166,255,0.03)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={{ color: "var(--text-0)", fontWeight: 500 }}>{d.component_name}</td>
                  <td>{d.business_area}</td>
                  <td style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.75rem" }}>{d.colour_code ?? "-"}</td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[d.status] || "badge-neutral"}`}>
                      {d.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${d.my_approval.status === "approved" ? "badge-green" : "badge-red"}`}
                      style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                      {d.my_approval.status === "approved"
                        ? <><CheckCircle2 size={10} /> approved</>
                        : <><XCircle size={10} /> rejected</>
                      }
                    </span>
                  </td>
                  <td style={{ color: "var(--text-2)", fontSize: "0.75rem", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {d.my_approval.notes || <span style={{ color: "var(--text-3)", fontStyle: "italic" }}>-</span>}
                  </td>
                  <td style={{ color: "var(--text-2)", fontSize: "0.75rem" }}>
                    {d.my_approval.decided_at ? timeAgo(d.my_approval.decided_at) : "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
