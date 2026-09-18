import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Edit3, Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../auth/AuthContext";
import type { Decision, DecisionStatus } from "../../types/db";
import RatingBadge from "../../components/RatingBadge";
import SearchableSelect from "../../components/ui/SearchableSelect";
import MySummaryModal from "../../components/MySummaryModal";
import { Plus, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import LogoMark from "../../components/LogoMark";

const STATUS_BADGE: Record<string, string> = {
  draft: "badge-purple",
  submitted: "badge-blue",
  under_review: "badge-amber",
  approved: "badge-green",
  rejected: "badge-red"
};



export default function MyHistory() {
  const { profile, hasPermission } = useAuth();
  const nav = useNavigate();
  
  const [submissions, setSubmissions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  


  // Filters for submissions
  const [area, setArea] = useState<string>("");
  const [status, setStatus] = useState<DecisionStatus | "">("");
  const [aiRating, setAiRating] = useState<"green" | "yellow" | "red" | "">("");
  const [tableSearch, setTableSearch] = useState("");

  const areas = useMemo(
    () => Array.from(new Set(submissions.map((r) => r.business_area))).sort(),
    [submissions]
  );

  const filteredSubmissions = useMemo(() => {
    return submissions.filter((r) => {
      const matchArea = area ? r.business_area === area : true;
      const matchStatus = status ? r.status === status : true;
      const matchAi = aiRating ? r.ai_rating === aiRating : true;
      let matchSearch = true;
      
      if (tableSearch) {
        const lowerSearch = tableSearch.toLowerCase();
        const created = new Date(r.created_at);
        const year = created.getFullYear().toString();
        const qtr = `q${Math.floor(created.getMonth() / 3) + 1}`;
        const searchStr = `${r.component_name || ""} ${r.colour_code || ""} ${r.material_reference || ""} ${r.business_area || ""} ${year} ${qtr}`.toLowerCase();
        matchSearch = searchStr.includes(lowerSearch);
      }

      return matchArea && matchStatus && matchAi && matchSearch;
    });
  }, [submissions, area, status, aiRating, tableSearch]);

  const userTeam = profile?.team ?? null;

  const canSubmit = hasPermission("decision.create");
  const canApprove = hasPermission("approval.submit");



  useEffect(() => {
    if (!profile) return;
    let cancelled = false;

    async function load() {
      let historyData: Decision[] = [];

      // Load submissions if they can submit (designers)
      if (canSubmit) {
        const { data } = await supabase
          .from("decisions")
          .select("*")
          .eq("created_by", profile!.id)
          .order("updated_at", { ascending: false });
        if (data) historyData = [...historyData, ...(data as Decision[])];
      }

      // Load approvals history for reviewers
      if (canApprove && userTeam) {
        const { data } = await supabase
          .from("decisions")
          .select("*, approvals!inner(*)")
          .eq("approvals.team", userTeam)
          .neq("approvals.status", "pending")
          .order("updated_at", { ascending: false });

        if (data) {
          // Filter to only include ones they explicitly took over
          const myApprovals = (data as Decision[]).filter(d => {
            if (userTeam === "engineering") return d.engineering_owner_id === profile!.id;
            if (userTeam === "procurement") return d.procurement_owner_id === profile!.id;
            if (userTeam === "quality") return d.quality_owner_id === profile!.id;
            return false;
          });
          
          // Merge and deduplicate
          for (const d of myApprovals) {
            if (!historyData.find(existing => existing.id === d.id)) {
              historyData.push(d);
            }
          }
        }
      }

      if (!cancelled) {
        setSubmissions(historyData);
        setLoading(false);
      }
    }

    load();

    const channel = supabase
      .channel("my-history-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "decisions" }, () => load())
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [profile, canSubmit, userTeam]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1>My Submissions</h1>
          <p>A complete history of all the decisions you have submitted.</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {canSubmit && (
            <Link to="/decisions/new" className="btn btn-accent" style={{ textDecoration: "none" }}>
              <Plus size={13} /> New decision
            </Link>
          )}
        </div>
      </div>

      {/* ── Submissions View ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          
          <MySummaryModal decisions={submissions} />
          
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-2)", marginBottom: "0.25rem" }}>
                Search Table
              </label>
              <input
                className="input"
                placeholder="Search by component, colour, year..."
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                style={{ minWidth: 240 }}
              />
            </div>
            <div style={{ minWidth: 180 }}>
              <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-2)", marginBottom: "0.25rem" }}>
                Business area
              </label>
              <SearchableSelect 
                value={area}
                onChange={setArea}
                options={[
                  { value: "", label: "All Areas" },
                  ...areas.map(a => ({ value: a, label: a }))
                ]}
              />
            </div>
            <div style={{ minWidth: 160 }}>
              <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-2)", marginBottom: "0.25rem" }}>
                Status
              </label>
              <SearchableSelect 
                value={status}
                onChange={(val) => setStatus(val as DecisionStatus | "")}
                options={[
                  { value: "", label: "All Statuses" },
                  { value: "draft", label: "Draft" },
                  { value: "submitted", label: "Submitted" },
                  { value: "under_review", label: "Under review" },
                  { value: "approved", label: "Approved" },
                  { value: "rejected", label: "Rejected" },
                ]}
              />
            </div>
            <div style={{ minWidth: 160 }}>
              <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-2)", marginBottom: "0.25rem" }}>
                AI Rating
              </label>
              <SearchableSelect 
                value={aiRating}
                onChange={(val) => setAiRating(val as any)}
                options={[
                  { value: "", label: "All Ratings" },
                  { value: "green", label: "Green (Ready)" },
                  { value: "yellow", label: "Yellow (Caution)" },
                  { value: "red", label: "Red (Blocked)" },
                ]}
              />
            </div>
          </div>

          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ maxHeight: "480px", overflowY: "auto" }}>
              <table className="data-table">
                <thead style={{ position: "sticky", top: 0, background: "var(--bg-0)", zIndex: 1 }}>
                  <tr>
                    <th>Component</th>
                    <th>Business area</th>
                    <th>Colour</th>
                    <th>Material</th>
                    <th>Status</th>
                    <th>AI</th>
                    <th>Date Added</th>
                    <th>Qtr</th>
                    <th>Year</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: "center", color: "var(--text-2)", padding: "2rem" }}>
                        <Loader2 size={14} className="spin" style={{ display: "inline-block", marginRight: "0.5rem" }} />
                        Loading...
                      </td>
                    </tr>
                  ) : filteredSubmissions.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: "center", padding: "3rem" }}>
                        <Edit3 size={32} style={{ color: "var(--text-3)", marginBottom: "0.75rem" }} />
                        <div style={{ color: "var(--text-2)", fontSize: "0.9375rem", fontWeight: 500 }}>
                          No submissions found matching criteria
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredSubmissions.map((r) => {
                      const created = new Date(r.created_at);
                      const qtr = `Q${Math.floor(created.getMonth() / 3) + 1}`;
                      return (
                        <tr key={r.id} onClick={() => nav(`/decisions/${r.id}`)} style={{ cursor: "pointer" }}>
                          <td>
                            <span style={{ color: "var(--text-0)", fontWeight: 500 }}>
                              {r.component_name}
                            </span>
                          </td>
                          <td>{r.business_area}</td>
                          <td style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.75rem" }}>
                            {r.colour_code ?? "-"}
                          </td>
                          <td>{r.material_reference ?? "-"}</td>
                          <td>
                            <span className={`badge ${STATUS_BADGE[r.status]}`}>{r.status.replace("_", " ")}</span>
                          </td>
                          <td>
                            <RatingBadge rating={r.ai_rating} reason={r.ai_reason} />
                          </td>
                          <td style={{ color: "var(--text-2)" }}>{created.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</td>
                          <td style={{ color: "var(--text-2)" }}>{qtr}</td>
                          <td style={{ color: "var(--text-2)" }}>{created.getFullYear()}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
      </div>
    </div>
  );
}
