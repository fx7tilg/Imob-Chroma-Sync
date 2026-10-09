import { AI_SERVICE_URL, supabase } from "./supabase";
import { creditsFromHeaders, mergeAiCredits, refreshAiCredits } from "./aiCredits";

// The AI service authenticates callers by verifying the Supabase-signed HS256
// access token (see ai-service/app/security.py). Every browser -> AI request
// must therefore carry the current session's access token, and every request
// must be bounded so a hung service cannot leave the UI spinning forever.

const DEFAULT_TIMEOUT_MS = 30_000;

export class AiServiceError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "AiServiceError";
    this.status = status;
  }
}

/**
 * The caller's daily AI allowance is spent.
 *
 * Distinct from a transient 429: this is a spend cap, so retrying before
 * `resetsAt` cannot succeed and callers must not back off and retry.
 */
export class AiQuotaError extends AiServiceError {
  readonly resetsAt: string | null;
  constructor(message: string, resetsAt: string | null) {
    super(429, message);
    this.name = "AiQuotaError";
    this.resetsAt = resetsAt;
  }
}

/**
 * POST a JSON body to the AI service with the caller's Supabase access token
 * attached and an abort-based timeout applied.
 *
 * @throws AiQuotaError when the daily AI allowance is exhausted.
 * @throws AiServiceError on any other non-2xx response, or
 *         Error("AI request timed out") when the request exceeds `timeoutMs`.
 */
export async function aiPost<T>(
  path: string,
  body: unknown,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new AiServiceError(401, "Not signed in");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${AI_SERVICE_URL}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    // Headers carry the post-call balance even on an error response.
    mergeAiCredits(creditsFromHeaders(res.headers));

    if (res.status === 429) {
      // A spend cap sends no Retry-After; a transient rate limit does.
      const retryAfter = res.headers.get("retry-after");
      if (retryAfter) {
        throw new AiServiceError(429, "AI service is busy. Try again in a moment.");
      }
      const resetsAt = res.headers.get("x-ai-credits-reset");
      void refreshAiCredits();
      throw new AiQuotaError(
        "You've used your AI allowance for today.",
        resetsAt
      );
    }
    if (!res.ok) {
      // Never surface the raw response body: it may echo request content.
      throw new AiServiceError(res.status, `AI service returned ${res.status}`);
    }
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error("AI request timed out");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Debug logging that is stripped from production builds. */
export function aiDebug(...args: unknown[]): void {
  if (import.meta.env.DEV) console.debug("[ai]", ...args);
}
