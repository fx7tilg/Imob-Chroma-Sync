// @ts-nocheck
// Shared security helpers for Chroma Sync Edge Functions.
//
// Every function in this project runs with the service-role key, so an
// unauthenticated endpoint is effectively a public, RLS-free view of the
// database. These helpers make caller verification and CORS explicit rather
// than relying on the platform's default `verify_jwt` behaviour.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

/** Comma-separated allow-list, e.g. "https://chroma.vwgroup.com". */
function allowedOrigins(): string[] {
  const raw = Deno.env.get("ALLOWED_ORIGINS") ?? "";
  const list = raw.split(",").map((o) => o.trim()).filter(Boolean);
  return list.length ? list : ["http://localhost:5173", "http://127.0.0.1:5173"];
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowed = allowedOrigins();
  const headers: Record<string, string> = {
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    vary: "Origin"
  };
  if (allowed.includes(origin)) headers["access-control-allow-origin"] = origin;
  return headers;
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders(req) }
  });
}

export function preflight(req: Request): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

export function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

function bearer(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (!token || scheme.toLowerCase() !== "bearer") return null;
  return token;
}

/** Constant-time string compare, so secret checks do not leak via timing. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True when the caller presented the service-role key (pg_net / pg_cron). */
export function isServiceCaller(req: Request): boolean {
  const token = bearer(req);
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return !!token && !!key && timingSafeEqual(token, key);
}

/**
 * Resolve the signed-in user behind the request. Returns null for anonymous or
 * invalid tokens. Verification is delegated to GoTrue, so revoked and expired
 * tokens are rejected too.
 */
export async function requireUser(req: Request): Promise<{ id: string } | null> {
  const token = bearer(req);
  if (!token) return null;
  const anon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data, error } = await anon.auth.getUser();
  if (error || !data?.user) return null;
  return { id: data.user.id };
}

/** fetch() with a hard timeout - an unresponsive AI service must not hang. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 30_000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Authorization header for calls into the FastAPI AI service. */
export function aiAuthHeaders(): Record<string, string> {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}`
  };
}
