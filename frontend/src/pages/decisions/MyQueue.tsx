import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Inbox, Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../auth/AuthContext";
import type { Approval, Decision, Team } from "../../types/db";
import RatingBadge from "../../components/RatingBadge";

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

type QueueItem = Decision & {
  my_approval_status: string;
  approvals_summary: { team: string; status: string }[];
};

function timeAgo(iso: string | null | undefined) {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

export default function MyQueue() {
  const { profile } = useAuth();
  const nav = useNavigate();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  const userTeam = profile?.team ?? null;

  useEffect(() => {
    if (!userTeam) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      // Get all decisions that are in reviewable status
      const { data: decisions } = await supabase
        .from("decisions")
        .select("*")
        .in("status", ["submitted", "under_review"])
        .order("updated_at", { ascending: false });

      if (!decisions || cancelled) {
        if (!cancelled) setLoading(false);
        return;
      }

      const decisionIds = decisions.map(d => d.id);
      if (decisionIds.length === 0) {
        if (!cancelled) {
          setItems([]);
          setLoading(false);
        }
        return;
      }

      // Get all approvals for these decisions
      const { data: allApprovals } = await supabase
        .from("approvals")
        .select("*")
        .in("decision_id", decisionIds);

      const approvalsByDecision = new Map<string, Approval[]>();
      for (const a of (allApprovals ?? []) as Approval[]) {
        const list = approvalsByDecision.get(a.decision_id) ?? [];
        list.push(a);
        approvalsByDecision.set(a.decision_id, list);
      }

      const currentUserId = profile?.id;
      // Filter: only show decisions where MY team's approval is pending AND I own it
      const queue: QueueItem[] = [];
      for (const d of decisions as Decision[]) {
        const approvals = approvalsByDecision.get(d.id) ?? [];
        
        let ownerId = null;
        if (userTeam === "engineering") ownerId = d.engineering_owner_id;
        if (userTeam === "procurement") ownerId = d.procurement_owner_id;
        if (userTeam === "quality") ownerId = d.quality_owner_id;

        // Queue only contains items you have explicitly taken over
        if (ownerId !== currentUserId) continue;

        const myApproval = approvals.find(a => a.team === userTeam);

        if (!myApproval || myApproval.status !== "pending") continue;

        // Gate check: is my team allowed to act right now?
        const designApproved = approvals.find(a => a.team === "design")?.status === "approved";
        const engApproved = approvals.find(a => a.team === "engineering")?.status === "approved";
        const procApproved = approvals.find(a => a.team === "procurement")?.status === "approved";

        // Design auto-approves, never shows in queue
        if (userTeam === "design") continue;

        // Engineering/Procurement: need Design approved
        if ((userTeam === "engineering" || userTeam === "procurement") && !designApproved) continue;

        // Quality: need both Eng + Proc approved
        if (userTeam === "quality" && (!engApproved || !procApproved)) continue;

        queue.push({
          ...(d as Decision),
          my_approval_status: myApproval.status,
          approvals_summary: approvals.map(a => ({ team: a.team, status: a.status }))
        });
      }

      // Sort by urgency: Red AI first, then Yellow, then Green
      const ratingOrder = { red: 0, yellow: 1, green: 2 };
      queue.sort((a, b) => {
        const ra = a.ai_rating ? ratingOrder[a.ai_rating] ?? 3 : 3;
        const rb = b.ai_rating ? ratingOrder[b.ai_rating] ?? 3 : 3;
        return ra - rb;
      });

      if (!cancelled) {
        setItems(queue);
        setLoading(false);
      }
    }

    load();

    const channel = supabase
      .channel("my-queue-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "decisions" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "approvals" }, () => load())
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userTeam]);

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
        <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.25rem" }}>
          <h1 style={{ margin: 0 }}>My Queue</h1>
          {items.length > 0 && (
            <span className="badge badge-amber" style={{ fontSize: "0.6875rem" }}>{items.length} pending</span>
          )}
        </div>
        <p>Decisions waiting for <strong>{TEAM_LABEL[userTeam]}</strong>'s review. Click any row to act.</p>
      </div>

      {/* Queue stats */}
      <div className="grid3" style={{ marginBottom: "1.5rem" }}>
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="stat-label">Awaiting Your Review</div>
          <div className="stat-value" style={{ color: "var(--amber)" }}>{items.length}</div>
        </div>
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="stat-label">Urgent (AI Red)</div>
          <div className="stat-value" style={{ color: "var(--red)" }}>
            {items.filter(d => d.ai_rating === "red").length}
          </div>
        </div>
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="stat-label">Caution (AI Yellow)</div>
          <div className="stat-value" style={{ color: "var(--amber)" }}>
            {items.filter(d => d.ai_rating === "yellow").length}
          </div>
        </div>
      </div>

      {/* Queue table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Component</th>
              <th>Business Area</th>
              <th>Colour</th>
              <th>Status</th>
              <th>AI</th>
              <th>Approval Progress</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", color: "var(--text-2)", padding: "2rem" }}>
                  <Loader2 size={14} className="spin" style={{ display: "inline-block", marginRight: "0.5rem" }} />
                  Loading your queue...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: "3rem" }}>
                  <Inbox size={32} style={{ color: "var(--text-3)", marginBottom: "0.75rem" }} />
                  <div style={{ color: "var(--text-2)", fontSize: "0.9375rem", fontWeight: 500 }}>
                    Your queue is clear
                  </div>
                  <div style={{ color: "var(--text-3)", fontSize: "0.75rem", marginTop: "0.25rem" }}>
                    No decisions are waiting for {TEAM_LABEL[userTeam]}'s review right now.
                  </div>
                </td>
              </tr>
            ) : (
              items.map((d) => (
                <tr
                  key={d.id}
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
                  <td><RatingBadge rating={d.ai_rating} reason={d.ai_reason} /></td>
                  <td>
                    {/* 4-dot approval pipeline */}
                    <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                      {(["design", "engineering", "procurement", "quality"] as Team[]).map(t => {
                        const appr = d.approvals_summary.find(a => a.team === t);
                        const s = appr?.status ?? "pending";
                        const isMe = t === userTeam;
                        return (
                          <div key={t} title={`${TEAM_LABEL[t]}: ${s}`} style={{
                            width: isMe ? 10 : 7,
                            height: isMe ? 10 : 7,
                            borderRadius: "50%",
                            background: s === "approved" ? "var(--green)" : s === "rejected" ? "var(--red)" : "transparent",
                            border: s === "pending" ? `1.5px solid ${isMe ? "var(--accent)" : "var(--text-3)"}` : "none",
                            transition: "all 200ms var(--ease)"
                          }} />
                        );
                      })}
                    </div>
                  </td>
                  <td style={{ color: "var(--text-2)", fontSize: "0.75rem" }}>{timeAgo(d.updated_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
