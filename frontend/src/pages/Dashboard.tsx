import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Plus, FileText, BarChart3, Shield } from "lucide-react";
import { supabase } from "../lib/supabase";
import type { Decision, DecisionStatus, Approval, Conflict } from "../types/db";
import { useAuth } from "../auth/AuthContext";
import RatingBadge from "../components/RatingBadge";
import { exportMeldeliste, exportColourMixChart } from "../lib/reports";
import { useGlobalFilter } from "../contexts/FilterContext";
import SearchableSelect from "../components/ui/SearchableSelect";
import { runAudit, type AuditResult } from "../lib/auditSignals";

const STATUS_BADGE: Record<DecisionStatus, string> = {
  draft: "badge-purple",
  submitted: "badge-blue",
  under_review: "badge-amber",
  approved: "badge-green",
  rejected: "badge-red"
};

export default function Dashboard() {
  const { profile } = useAuth();
  const { filterRange } = useGlobalFilter();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [rows, setRows] = useState<Decision[]>([]);
  const [area, setArea] = useState<string>("");
  const [status, setStatus] = useState<DecisionStatus | "">((searchParams.get("status") as DecisionStatus) || "");
  const [aiRating, setAiRating] = useState<"green" | "yellow" | "red" | "">((searchParams.get("ai_rating") as any) || "");
  const [busy, setBusy] = useState(false);
  const [tableSearch, setTableSearch] = useState("");
  const [showRiskAssessment, setShowRiskAssessment] = useState(false);
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);

  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);

  useEffect(() => {
    if (rows.length > 0) {
      setAuditResult(runAudit(rows, approvals, conflicts));
    } else {
      setAuditResult(null);
    }
  }, [rows, approvals, conflicts]);
  
  // Specific IDs passed via URL (e.g. from Comprehensive Audit)
  const filterIds = useMemo(() => {
    const ids = searchParams.get("ids");
    return ids ? new Set(ids.split(",")) : null;
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      let decQuery = supabase.from("decisions").select("*").order("created_at", { ascending: false });
      let appQuery = supabase.from("approvals").select("*");
      let confQuery = supabase.from("conflicts").select("*").eq("resolved", false);

      if (filterRange) {
        decQuery = decQuery.gte("updated_at", filterRange.start).lte("updated_at", filterRange.end);
        confQuery = confQuery.gte("detected_at", filterRange.start).lte("detected_at", filterRange.end);
      }

      const [decRes, appRes, confRes] = await Promise.all([decQuery, appQuery, confQuery]);
      
      if (!cancelled) {
        if (decRes.data) setRows(decRes.data as Decision[]);
        if (appRes.data) setApprovals(appRes.data as Approval[]);
        if (confRes.data) setConflicts(confRes.data as Conflict[]);
      }
    }
    load();

    const channel = supabase
      .channel("decisions-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "decisions" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "approvals" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "conflicts" }, () => load())
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [filterRange]);

  const areas = useMemo(
    () => Array.from(new Set(rows.map((r) => r.business_area))).sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      // If explicit IDs were provided via URL, only show those
      if (filterIds) {
        return filterIds.has(r.id);
      }

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
  }, [rows, area, status, aiRating, tableSearch, filterIds]);

  const canCreate = profile?.team === "design" || profile?.is_project_lead;

  async function runMeldeliste() {
    setBusy(true);
    try {
      await exportMeldeliste(filtered.filter((r) => r.status === "approved"));
    } finally {
      setBusy(false);
    }
  }

  async function runColourMix() {
    setBusy(true);
    try {
      await exportColourMixChart(filtered);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1>Decisions</h1>
          <p>All colour and material decisions across every business area.</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {canCreate && (
            <Link to="/decisions/new" className="btn btn-accent" style={{ textDecoration: "none" }}>
              <Plus size={13} /> New decision
            </Link>
          )}
          <Link to="/reports/risk-assessment" className="btn btn-ghost" style={{ border: "1px solid var(--border)", textDecoration: "none" }}>
            <Shield size={13} style={{ color: "var(--accent)" }} /> Risk Assessment
          </Link>
          <button className="btn btn-ghost" onClick={runMeldeliste} disabled={busy}>
            <FileText size={13} /> Meldeliste
          </button>
          <button className="btn btn-ghost" onClick={runColourMix} disabled={busy}>
            <BarChart3 size={13} /> Colour-Mix-Chart
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}>
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

      {filterIds && (
        <div style={{ marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span className="badge badge-accent">Filtered by Audit</span>
          <Link to="/decisions" style={{ fontSize: "0.75rem", color: "var(--accent)" }}>Clear filter</Link>
        </div>
      )}

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
              {filtered.map((r) => {
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
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", color: "var(--text-2)", padding: "2rem" }}>
                    No decisions match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
