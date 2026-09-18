// @ts-nocheck
// Supabase Edge Function - invoked by pg_net when a decision moves to 'submitted'.
// Fetches DiMa context, calls the FastAPI /readiness endpoint, and writes the
// result back to the decisions row.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const AI_URL = Deno.env.get("AI_SERVICE_URL") ?? "http://host.docker.internal:8000";

serve(async (req) => {
  try {
    const payload = (await req.json()) as { decision_id: string };
    if (!payload?.decision_id) return json({ error: "decision_id required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: decision, error: dErr } = await supabase
      .from("decisions")
      .select("*")
      .eq("id", payload.decision_id)
      .single();
    if (dErr || !decision) return json({ error: dErr?.message ?? "not found" }, 404);

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

    const res = await fetch(`${AI_URL}/readiness`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision, material, approvals: approvals ?? [] })
    });

    if (!res.ok) {
      await supabase
        .from("decisions")
        .update({
          ai_rating: "yellow",
          ai_reason: "AI service unavailable; falling back to human review.",
          ai_flags: [{ flag: "ai_unavailable" }],
          ai_last_checked_at: new Date().toISOString()
        })
        .eq("id", decision.id);
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
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
