// @ts-nocheck
// Supabase Edge Function - invoked by pg_net when a decision moves to 'submitted'.
// Fetches DiMa context, calls the FastAPI /readiness endpoint, and writes the
// result back to the decisions row.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  aiAuthHeaders,
  fetchWithTimeout,
  isServiceCaller,
  serviceClient
} from "../_shared/security.ts";

const AI_URL = Deno.env.get("AI_SERVICE_URL") ?? "http://host.docker.internal:8000";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  // Only pg_net (which carries the service-role key) may trigger a re-score.
  if (!isServiceCaller(req)) return json({ error: "unauthorized" }, 401);

  try {
    const payload = (await req.json().catch(() => null)) as { decision_id?: string } | null;
    const decisionId = payload?.decision_id ?? "";
    if (!UUID.test(decisionId)) return json({ error: "valid decision_id required" }, 400);

    const supabase = serviceClient();

    const { data: decision, error: dErr } = await supabase
      .from("decisions")
      .select("*")
      .eq("id", decisionId)
      .single();
    if (dErr || !decision) return json({ error: "not found" }, 404);

    let material = null;
    if (decision.material_reference) {
      const { data } = await supabase
        .from("materials")
        .select("*")
        .eq("code", decision.material_reference)
        .single();
      material = data ?? null;
    }

    const { data: approvals } = await supabase
      .from("approvals")
      .select("*")
      .eq("decision_id", decision.id);

    let res: Response;
    try {
      res = await fetchWithTimeout(
        `${AI_URL}/readiness`,
        {
          method: "POST",
          headers: aiAuthHeaders(),
          body: JSON.stringify({ decision, material, approvals: approvals ?? [] })
        },
        30_000
      );
    } catch (e) {
      console.error("readiness call failed", e);
      await markUnavailable(supabase, decision.id);
      return json({ ok: false, fallback: true });
    }

    if (!res.ok) {
      console.error("readiness returned", res.status);
      await markUnavailable(supabase, decision.id);
      return json({ ok: false, fallback: true });
    }

    const result = (await res.json()) as {
      rating: "green" | "yellow" | "red";
      reason: string;
      flags: unknown[];
    };

    await supabase
      .from("decisions")
      .update({
        ai_rating: result.rating,
        ai_reason: result.reason,
        ai_flags: result.flags,
        ai_last_checked_at: new Date().toISOString()
      })
      .eq("id", decision.id);

    return json({ ok: true });
  } catch (e) {
    console.error("on-decision-submitted error", e);
    return json({ error: "internal error" }, 500);
  }
});

async function markUnavailable(supabase: ReturnType<typeof serviceClient>, id: string) {
  await supabase
    .from("decisions")
    .update({
      ai_rating: "yellow",
      ai_reason: "AI service unavailable; falling back to human review.",
      ai_flags: [{ flag: "ai_unavailable" }],
      ai_last_checked_at: new Date().toISOString()
    })
    .eq("id", id);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
