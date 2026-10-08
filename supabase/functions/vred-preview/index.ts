// @ts-nocheck
// Supabase Edge Function - VRED mock preview URL by material code.
// Requires a signed-in user (reads run with the service-role key).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { json, preflight, requireUser, serviceClient } from "../_shared/security.ts";

const CODE_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json(req, { error: "method not allowed" }, 405);

  try {
    if (!(await requireUser(req))) return json(req, { error: "unauthorized" }, 401);

    const body = await req.json().catch(() => null);
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!CODE_PATTERN.test(code)) return json(req, { error: "invalid code" }, 400);

    const { data, error } = await serviceClient()
      .from("materials")
      .select("code, vred_render_url")
      .eq("code", code)
      .maybeSingle();

    if (error) {
      console.error("vred-preview query failed", error.message);
      return json(req, { error: "lookup failed" }, 500);
    }
    if (!data) return json(req, { error: "not found" }, 404);
    return json(req, { code: data.code, render_url: data.vred_render_url });
  } catch (e) {
    console.error("vred-preview error", e);
    return json(req, { error: "internal error" }, 500);
  }
});
