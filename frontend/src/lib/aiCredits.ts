import { supabase } from "./supabase";

/**
 * Per-user AI allowance.
 *
 * This replaces the old localStorage counter, which was advisory only - it
 * reset when site data was cleared and the backend never consulted it. The
 * numbers below come from the database (`ai_my_credits`) and are enforced
 * server-side before any model is called, so this module is purely a view
 * onto authoritative state. Never gate a request on it alone.
 */

export type AiCredits = {
  tokenLimit: number;
  tokensUsed: number;
  tokensRemaining: number;
  requestLimit: number;
  requestsUsed: number;
  requestsRemaining: number;
  plan: string;
  /** ISO timestamp of the next reset (midnight UTC). */
  resetsAt: string;
  exhausted: boolean;
};

type CreditsRow = {
  token_limit: number;
  tokens_used: number;
  tokens_remaining: number;
  request_limit: number;
  requests_used: number;
  requests_remaining: number;
  plan: string;
  resets_at: string;
  exhausted: boolean;
};

function normalise(row: CreditsRow): AiCredits {
  return {
    tokenLimit: Number(row.token_limit ?? 0),
    tokensUsed: Number(row.tokens_used ?? 0),
    tokensRemaining: Number(row.tokens_remaining ?? 0),
    requestLimit: Number(row.request_limit ?? 0),
    requestsUsed: Number(row.requests_used ?? 0),
    requestsRemaining: Number(row.requests_remaining ?? 0),
    plan: String(row.plan ?? "default"),
    resetsAt: String(row.resets_at ?? ""),
    exhausted: Boolean(row.exhausted)
  };
}

export async function fetchAiCredits(): Promise<AiCredits | null> {
  const { data, error } = await supabase.rpc("ai_my_credits");
  if (error || !data) return null;
  return normalise(data as unknown as CreditsRow);
}

/** Fraction of the daily token allowance already consumed, clamped to 0..1. */
export function usedFraction(c: AiCredits): number {
  if (!c.tokenLimit) return 0;
  return Math.min(1, Math.max(0, c.tokensUsed / c.tokenLimit));
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

/** Human-readable time until the allowance rolls over. */
export function timeUntilReset(c: AiCredits): string {
  const ms = new Date(c.resetsAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "soon";
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours >= 1) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Credit state changes as a side effect of AI calls anywhere in the app, so
 * the meter subscribes to this instead of polling.
 */
const listeners = new Set<() => void>();

export function onAiCreditsChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notifyAiCreditsChanged(): void {
  listeners.forEach((fn) => fn());
}

/**
 * The AI service echoes the post-call balance in response headers, the same way
 * commercial AI APIs do. Reading them avoids a second round-trip to refresh the
 * meter after every request.
 */
export function creditsFromHeaders(headers: Headers): Partial<AiCredits> | null {
  const limit = headers.get("x-ai-credits-limit");
  const remaining = headers.get("x-ai-credits-remaining");
  if (limit === null || remaining === null) return null;
  const used = headers.get("x-ai-credits-used");
  const requestsRemaining = headers.get("x-ai-requests-remaining");
  const resetsAt = headers.get("x-ai-credits-reset");
  return {
    tokenLimit: Number(limit),
    tokensRemaining: Number(remaining),
    ...(used !== null ? { tokensUsed: Number(used) } : {}),
    ...(requestsRemaining !== null ? { requestsRemaining: Number(requestsRemaining) } : {}),
    ...(resetsAt ? { resetsAt } : {}),
    exhausted: Number(remaining) <= 0
  };
}

let cached: AiCredits | null = null;

export function getCachedAiCredits(): AiCredits | null {
  return cached;
}

export function setAiCredits(next: AiCredits | null): void {
  cached = next;
  notifyAiCreditsChanged();
}

export function mergeAiCredits(patch: Partial<AiCredits> | null): void {
  if (!patch) return;
  cached = { ...(cached ?? EMPTY_CREDITS), ...patch };
  notifyAiCreditsChanged();
}

const EMPTY_CREDITS: AiCredits = {
  tokenLimit: 0,
  tokensUsed: 0,
  tokensRemaining: 0,
  requestLimit: 0,
  requestsUsed: 0,
  requestsRemaining: 0,
  plan: "default",
  resetsAt: "",
  exhausted: false
};

export async function refreshAiCredits(): Promise<AiCredits | null> {
  const next = await fetchAiCredits();
  if (next) setAiCredits(next);
  return next;
}
