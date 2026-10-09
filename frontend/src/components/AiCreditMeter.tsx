import { Zap } from "lucide-react";
import { useAiCredits } from "../hooks/useAiCredits";
import { formatTokens, timeUntilReset, usedFraction } from "../lib/aiCredits";

/**
 * Shows how much of today's AI allowance is left.
 *
 * The figures are read from the database and refreshed from the credit headers
 * the AI service returns, so this reflects enforced state rather than a local
 * guess the user could reset.
 */
export default function AiCreditMeter() {
  const { credits, loading } = useAiCredits();

  if (loading && !credits) return null;
  if (!credits || credits.tokenLimit === 0) return null;

  const fraction = usedFraction(credits);
  const low = credits.tokensRemaining <= credits.tokenLimit * 0.15;
  const colour = credits.exhausted ? "var(--red)" : low ? "var(--amber)" : "var(--accent)";

  return (
    <div
      title={
        credits.exhausted
          ? `AI allowance used up. Resets in ${timeUntilReset(credits)}.`
          : `${credits.tokensRemaining.toLocaleString()} of ${credits.tokenLimit.toLocaleString()} AI tokens left today (${credits.requestsRemaining} requests). Resets in ${timeUntilReset(credits)}.`
      }
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.25rem 0.625rem",
        borderRadius: "999px",
        border: `1px solid ${colour}33`,
        background: `${colour}0f`,
        cursor: "default"
      }}
    >
      <Zap size={12} color={colour} />
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 68 }}>
        <span style={{ fontSize: "0.625rem", fontWeight: 700, color: "var(--text-1)", lineHeight: 1 }}>
          {formatTokens(credits.tokensRemaining)} / {formatTokens(credits.tokenLimit)}
        </span>
        <div
          aria-hidden
          style={{ height: 3, borderRadius: 2, background: "var(--surface-3, rgba(255,255,255,0.08))" }}
        >
          <div
            style={{
              height: "100%",
              width: `${Math.round((1 - fraction) * 100)}%`,
              borderRadius: 2,
              background: colour,
              transition: "width 200ms ease"
            }}
          />
        </div>
      </div>
      <span className="sr-only">
        {credits.tokensRemaining} of {credits.tokenLimit} AI tokens remaining today
      </span>
    </div>
  );
}
