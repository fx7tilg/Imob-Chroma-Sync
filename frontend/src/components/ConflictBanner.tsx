import { AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import type { Conflict } from "../types/db";

interface Props {
  conflict: Conflict;
  /** The current decision's ID so we can link to the *other* (baseline) one. */
  currentDecisionId?: string;
}

/**
 * This banner is ONLY rendered on the offending (newer) decision.
 * The baseline (original/older) decision never sees this banner.
 * The filtering happens in DecisionDetail.tsx before this component is mounted.
 */
export default function ConflictBanner({ conflict, currentDecisionId }: Props) {
  const baselineDecisionId =
    currentDecisionId === conflict.decision_a_id
      ? conflict.decision_b_id
      : conflict.decision_a_id;

  return (
    <div
      className="card"
      style={{
        borderColor: "rgba(239, 68, 68, 0.25)",
        background: "rgba(239, 68, 68, 0.04)",
        marginBottom: "1rem",
      }}
    >
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
        <AlertTriangle size={16} style={{ color: "var(--red)", flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.375rem", flexWrap: "wrap" }}>
            <span className="badge badge-red">{conflict.conflict_type.replace(/_/g, " ")}</span>
            <Link
              to={`/decisions/${baselineDecisionId}`}
              style={{
                fontSize: "0.6875rem",
                color: "var(--accent)",
                textDecoration: "none",
              }}
            >
              View baseline decision →
            </Link>
          </div>
          <div style={{ fontSize: "0.8125rem", color: "var(--text-1)", lineHeight: 1.5 }}>
            {conflict.explanation}
          </div>
          <div style={{ marginTop: "0.625rem", padding: "0.5rem 0.75rem", background: "var(--bg-0)", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", fontSize: "0.75rem", color: "var(--text-1)" }}>
            <strong style={{ color: "var(--red)" }}>Action Required:</strong> Update the conflicting field(s) above to align with the baseline decision, then re-submit. The conflict will auto-resolve when the AI confirms the data is consistent.
          </div>
        </div>
      </div>
    </div>
  );
}
