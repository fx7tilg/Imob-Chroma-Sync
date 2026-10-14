import { fetchAiCredits, timeUntilReset } from "./aiCredits";

export interface CreditCheckResult {
  allowed: boolean;
  /** Requests left today, or null when the balance could not be read. */
  remaining: number | null;
  /** Ready-to-display reason when `allowed` is false. */
  message: string | null;
}

/**
 * Pre-flight check against the user's daily AI allowance.
 *
 * Advisory only - it exists so a button can explain itself before firing a
 * request. The authoritative check is server-side: the AI service reserves
 * tokens via `ai_reserve_credits` before calling a model and settles the real
 * cost afterwards, which `aiPost` surfaces as an AiQuotaError.
 *
 * There is deliberately no second per-feature counter. An earlier design also
 * spent a `use_ai_credit` credit here, giving every feature its own hidden
 * 3-per-day limit that the header meter knew nothing about, so the meter could
 * read "full" while the button refused to run.
 */
export async function checkAiAllowance(): Promise<CreditCheckResult> {
  const credits = await fetchAiCredits();

  // Balance unreadable - let it through and let the server decide.
  if (!credits) return { allowed: true, remaining: null, message: null };

  if (credits.exhausted) {
    return {
      allowed: false,
      remaining: 0,
      message:
        `Your daily AI allowance is spent (${credits.requestsUsed} of ` +
        `${credits.requestLimit} requests, ${credits.tokensUsed} of ` +
        `${credits.tokenLimit} tokens used). It resets in ${timeUntilReset(credits)}.`
    };
  }

  return { allowed: true, remaining: credits.requestsRemaining, message: null };
}
