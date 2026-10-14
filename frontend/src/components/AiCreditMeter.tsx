import { Zap } from "lucide-react";
import { useAiCredits } from "../hooks/useAiCredits";
import { formatTokens, timeUntilReset, usedFraction } from "../lib/aiCredits";

/**
 * Today's AI allowance as a compact card for the dashboard's top-right corner.
 *
 * Figures come from the database and are refreshed from the credit headers the
 * AI service returns, so this reflects enforced state rather than a local guess.
 */
export default function AiCreditMeter() {
  const { credits, loading } = useAiCredits();

  if (loading && !credits) return null;
  if (!credits || credits.tokenLimit === 0) return null;

  const remaining = Math.round((1 - usedFraction(credits)) * 100);
  const low = credits.tokensRemaining <= credits.tokenLimit * 0.15;
  const colour = credits.exhausted ? "var(--red)" : low ? "var(--amber)" : "var(--accent)";
  const label = credits.exhausted ? "Allowance used up" : "AI allowance today";

  return (
    <div
      role="group"
      aria-label={`${credits.tokensRemaining} of ${credits.tokenLimit} AI tokens remaining today`}
      title={`${credits.tokensRemaining.toLocaleString()} of ${credits.tokenLimit.toLocaleString()} AI tokens left today. Resets in ${timeUntilReset(credits)}.`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        minWidth: 232,
        padding: "0.75rem 1rem",
        borderRadius: 14,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        boxShadow: "0 1px 2px rgba(0, 39, 51, 0.04), 0 4px 14px rgba(0, 39, 51, 0.05)",
        cursor: "default"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span
          aria-hidden
          style={{
            display: "grid",
            placeItems: "center",
            width: 22,
            height: 22,
            borderRadius: 7,
            background: `color-mix(in srgb, ${colour} 14%, transparent)`
          }}
        >
          <Zap size={12} color={colour} />
        </span>
        <span
          style={{
            flex: 1,
            fontSize: "0.625rem",
            fontWeight: 700,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            color: "var(--text-2)"
          }}
        >
          {label}
        </span>
        <span style={{ fontSize: "0.625rem", fontWeight: 600, color: "var(--text-3)" }}>
          {remaining}% left
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: "0.375rem" }}>
        <span style={{ fontSize: "1.25rem", fontWeight: 700, lineHeight: 1, color: "var(--text-0)" }}>
          {formatTokens(credits.tokensRemaining)}
        </span>
        <span style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>
          / {formatTokens(credits.tokenLimit)} tokens
        </span>
      </div>

      <div
        aria-hidden
        style={{ height: 5, borderRadius: 3, background: "var(--surface-2)", overflow: "hidden" }}
      >
        <div
          style={{
            height: "100%",
            width: `${remaining}%`,
            borderRadius: 3,
            background: colour,
            transition: "width 200ms ease"
          }}
        />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.625rem", color: "var(--text-3)" }}>
        <span>{credits.requestsRemaining} requests left</span>
        <span>Resets in {timeUntilReset(credits)}</span>
      </div>
    </div>
  );
}
