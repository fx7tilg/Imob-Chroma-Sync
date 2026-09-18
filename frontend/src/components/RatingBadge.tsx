import { useState } from "react";
import type { AiRating } from "../types/db";

const RATING_STYLE: Record<string, string> = {
  green: "badge-green",
  yellow: "badge-amber",
  red: "badge-red"
};

const RATING_LABEL: Record<string, string> = {
  green: "READY",
  yellow: "CAUTION",
  red: "BLOCKED"
};

const RC_ROWS: { key: string; label: string; weight: number }[] = [
  { key: "rc1_lifecycle",     label: "Material Lifecycle",        weight: 25 },
  { key: "rc2_compliance",    label: "Compliance",                weight: 20 },
  { key: "rc3_lead_time",     label: "Lead Time",                 weight: 10 },
  { key: "rc4_visual",        label: "Visual Readiness",          weight: 15 },
  { key: "rc5_approval_rbac", label: "Approval & Access Control", weight: 15 },
  { key: "rc6_conflict",      label: "Cross-Area Conflict",       weight: 15 }
];

interface Flag {
  flag: string;
  detail?: string;
}

interface Props {
  rating: AiRating | null;
  reason: string | null;
  flags?: Flag[] | unknown[];
  large?: boolean;
  // Per-criterion columns from `decisions`. When supplied, the badge expands
  // into a 6-row breakdown matching the organiser's Rating_Criteria sheet.
  perCriterion?: {
    rc1_lifecycle: AiRating | null;
    rc2_compliance: AiRating | null;
    rc3_lead_time: AiRating | null;
    rc4_visual: AiRating | null;
    rc5_approval_rbac: AiRating | null;
    rc6_conflict: AiRating | null;
  };
  rcFlags?: Record<string, { reason?: string; evidence?: Record<string, unknown> }>;
}

function ratingDot(r: AiRating | null | undefined) {
  const colour = r === "green" ? "var(--green)"
               : r === "yellow" ? "var(--amber)"
               : r === "red" ? "var(--red)"
               : "var(--bg-2)";
  return (
    <span style={{
      display: "inline-block", width: 10, height: 10, borderRadius: "50%",
      background: colour, flexShrink: 0
    }} />
  );
}

export default function RatingBadge({ rating, reason, flags, large, perCriterion, rcFlags }: Props) {
  const [expanded, setExpanded] = useState(false);

  const isUnavailable =
    rating === "yellow" &&
    Array.isArray(flags) &&
    flags.some((f: any) => f.flag === "ai_unavailable");

  const isFallback =
    Array.isArray(flags) &&
    flags.some((f: any) => f.flag === "ai_fallback");

  if (!rating) {
    return (
      <span className="badge" style={{ background: "var(--bg-2)", color: "var(--text-2)" }}>
        AI: pending
      </span>
    );
  }

  const displayFlags = (Array.isArray(flags) ? flags : [])
    .filter((f: any) => f.flag && f.flag !== "mock_llm")
    .map((f: any) => ({
      flag: (f.flag as string).replace(/_/g, " "),
      detail: f.detail as string | undefined,
    }));

  const colorVar = rating === "green" ? "green" : rating === "yellow" ? "amber" : "red";

  const hasPerCriterion = perCriterion
    && Object.values(perCriterion).some((v) => v !== null && v !== undefined);

  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        gap: "0.25rem",
        padding: large ? "0.625rem 0.875rem" : "0.5rem 0.75rem",
        borderRadius: "var(--r-md)",
        background: "var(--bg-0)",
        border: "1px solid var(--border)",
        borderLeft: `3px solid var(--${colorVar})`,
        maxWidth: 480
      }}
      title={reason || undefined}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", flexWrap: "wrap" }}>
        <span className={`badge ${RATING_STYLE[rating]}`} style={{ width: "fit-content" }}>
          AI · {RATING_LABEL[rating] || rating.toUpperCase()}
        </span>
        {isUnavailable && (
          <span className="badge" style={{
            background: "rgba(251, 191, 36, 0.1)", color: "var(--amber)",
            fontSize: "0.5625rem", padding: "1px 6px",
          }}>
            offline fallback
          </span>
        )}
        {isFallback && !isUnavailable && (
          <span className="badge" style={{
            background: "rgba(251, 191, 36, 0.1)", color: "var(--amber)",
            fontSize: "0.5625rem", padding: "1px 6px",
          }}>
            rule-based
          </span>
        )}
        {hasPerCriterion && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            style={{
              marginLeft: "auto", background: "transparent",
              border: "1px solid var(--border)", color: "var(--text-1)",
              borderRadius: "var(--r-sm)", padding: "1px 8px",
              fontSize: "0.6875rem", cursor: "pointer"
            }}
          >
            {expanded ? "Hide criteria" : "6 criteria"}
          </button>
        )}
      </div>
      {reason && (
        <span style={{ fontSize: "0.75rem", color: "var(--text-1)", lineHeight: 1.4 }}>
          {(!large && !hasPerCriterion) ? (
            reason.split(/\s+/).length > 3 ? (
              <>
                {reason.split(/\s+/).slice(0, 3).join(" ")}{" "}
                <span style={{ color: "var(--accent)", fontWeight: 500 }}>... see more</span>
              </>
            ) : reason
          ) : reason}
        </span>
      )}

      {expanded && hasPerCriterion && (
        <div style={{
          display: "grid", gap: "0.25rem", marginTop: "0.375rem",
          padding: "0.5rem", background: "var(--bg-1)",
          borderRadius: "var(--r-sm)", border: "1px solid var(--border)"
        }}>
          {RC_ROWS.map((row) => {
            const rc = (perCriterion as any)?.[row.key] as AiRating | null | undefined;
            const detail = rcFlags?.[row.key]?.reason;
            return (
              <div key={row.key} style={{
                display: "grid",
                gridTemplateColumns: "16px 1fr auto",
                gap: "0.5rem", alignItems: "start", fontSize: "0.75rem"
              }}>
                <span style={{ paddingTop: 4 }}>{ratingDot(rc)}</span>
                <span>
                  <span style={{ color: "var(--text-0)", fontWeight: 500 }}>{row.label}</span>
                  {detail && (
                    <span style={{ display: "block", color: "var(--text-2)", fontSize: "0.6875rem", lineHeight: 1.35 }}>
                      {detail}
                    </span>
                  )}
                </span>
                <span style={{ color: "var(--text-3)", fontSize: "0.625rem", fontVariantNumeric: "tabular-nums" }}>
                  {row.weight}%
                </span>
              </div>
            );
          })}
          <div style={{ fontSize: "0.625rem", color: "var(--text-3)", marginTop: "0.25rem" }}>
            Aggregate rule: worst colour across all six.
          </div>
        </div>
      )}

      {large && displayFlags.length > 0 && !expanded && (
        <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap", marginTop: "0.125rem" }}>
          {displayFlags.map((f, i) => (
            <span
              key={i}
              className="badge"
              title={f.detail || undefined}
              style={{
                fontSize: "0.5625rem", padding: "1px 6px",
                background: "var(--bg-2)", color: "var(--text-2)",
                cursor: f.detail ? "help" : "default",
              }}
            >
              {f.flag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
