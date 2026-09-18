import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../auth/AuthContext";
import type { Decision, DecisionStatus } from "../../types/db";
import RatingBadge from "../../components/RatingBadge";

const STATUS_BADGE: Record<DecisionStatus, string> = {
  draft: "badge-purple",
  submitted: "badge-blue",
  under_review: "badge-amber",
  approved: "badge-green",
  rejected: "badge-red"
};

export default function MySubmissions() {
  const { session } = useAuth();
  const nav = useNavigate();
  const [rows, setRows] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!session?.user?.id) return;
      
      const { data } = await supabase
        .from("decisions")
        .select("*")
        .eq("created_by", session.user.id)
        .order("created_at", { ascending: false });
        
      if (!cancelled) {
        setRows((data ?? []) as Decision[]);
        setLoading(false);
      }
    }
    
    load();

    const channel = supabase
      .channel("my-decisions")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "decisions", filter: `created_by=eq.${session?.user?.id}` },
        () => load()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [session]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "1.5rem" }}>
        <div>
          <h1>My Submissions</h1>
          <p>Decisions you have created or that are currently on your desk.</p>
        </div>
        <Link to="/decisions/new" className="btn btn-accent" style={{ textDecoration: "none" }}>
          <Plus size={13} /> New Decision
        </Link>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Component</th>
              <th>Business Area</th>
              <th>Colour</th>
              <th>Status</th>
              <th>AI Review</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", color: "var(--text-2)", padding: "2rem" }}>
                  Loading...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", color: "var(--text-2)", padding: "2rem" }}>
                  You haven't submitted any decisions yet.
                </td>
              </tr>
            ) : (
              rows.map((d) => (
                <tr key={d.id} onClick={() => nav(`/decisions/${d.id}`)} style={{ cursor: "pointer" }}>
                  <td>
                    <span style={{ color: "var(--text-0)", fontWeight: 500 }}>
                      {d.component_name}
                    </span>
                  </td>
                  <td style={{ color: "var(--text-2)" }}>{d.business_area}</td>
                  <td style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.75rem" }}>{d.colour_code ?? "-"}</td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[d.status]}`}>{d.status.replace("_", " ")}</span>
                  </td>
                  <td>
                    <RatingBadge rating={d.ai_rating} reason={d.ai_reason} />
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

