// @ts-nocheck
// Supabase Edge Function - PKI demo auth.
//
// SECURITY: this endpoint trades a short numeric PIN for a profile row read
// with the service-role key. Demo PINs are 4 digits, so the whole keyspace is
// brute-forceable in seconds. It is therefore DISABLED unless
// ENABLE_PKI_DEMO_AUTH is explicitly "true", rate limited per client, and it
// never returns privilege fields (role / is_project_lead).
//
// The frontend does not call this function; real sign-in goes through GoTrue.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { json, preflight, serviceClient } from "../_shared/security.ts";

const ENABLED = (Deno.env.get("ENABLE_PKI_DEMO_AUTH") ?? "false").toLowerCase() === "true";
const PIN_PATTERN = /^\d{4,12}$/;
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000;

const attempts = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  attempts.set(key, recent);
  if (recent.length >= MAX_ATTEMPTS) return true;
  recent.push(now);
  return false;
}

serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (!ENABLED) return json(req, { error: "not available" }, 404);
  if (req.method !== "POST") return json(req, { error: "method not allowed" }, 405);

  const clientKey = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (rateLimited(clientKey)) return json(req, { error: "too many attempts" }, 429);

  try {
    const body = await req.json().catch(() => null);
    const pin = typeof body?.pin === "string" ? body.pin.trim() : "";
    if (!PIN_PATTERN.test(pin)) return json(req, { error: "invalid pin" }, 401);

    // Demo PINs live in demo_pki_pins (RLS-locked, service_role only), never
    // in the world-readable profiles table.
    const { data, error } = await serviceClient()
      .from("demo_pki_pins")
      .select("profile_id, profiles(id, full_name, team)")
      .eq("pin", pin)
      .maybeSingle();

    if (error) {
      console.error("pki-auth query failed", error.message);
      return json(req, { error: "lookup failed" }, 500);
    }
    // Identical response for "no match" and "malformed pin" - no oracle.
    if (!data?.profiles) return json(req, { error: "invalid pin" }, 401);

    return json(req, { profile: data.profiles });
  } catch (e) {
    console.error("pki-auth error", e);
    return json(req, { error: "internal error" }, 500);
  }
});
