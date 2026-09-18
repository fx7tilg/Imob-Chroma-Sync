// @ts-nocheck
// Supabase Edge Function - scheduled conflict detection.
// Runs every 30 min via pg_cron. Fetches all active decisions per business area
// and asks the FastAPI /conflicts endpoint to identify mismatches.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const AI_URL = Deno.env.get("AI_SERVICE_URL") ?? "http://host.docker.internal:8000";

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: decisions } = await supabase
    .from("decisions")
    .select("*")
    .in("status", ["submitted", "under_review", "approved"]);

  if (!decisions?.length) return json({ ok: true, checked: 0 });

  const byArea = new Map<string, typeof decisions>();
  for (const d of decisions) {
    const list = byArea.get(d.business_area) ?? [];
    list.push(d);
    byArea.set(d.business_area, list);
  }

  let inserted = 0;
  let skipped = 0;
  for (const [area, ds] of byArea.entries()) {
    if (ds.length < 2) continue;

    const maxUpdatedAt = ds.reduce(
      (max, d) => (d.updated_at > max ? d.updated_at : max),
      ds[0].updated_at
    );
    const { data: scanState } = await supabase
      .from("conflict_scan_state")
      .select("last_scanned_at")
      .eq("business_area", area)
      .maybeSingle();

    // Fail-open: no state row yet (first run) still triggers the LLM call.
    if (scanState && scanState.last_scanned_at >= maxUpdatedAt) {
      skipped++;
      continue;
    }

    try {
      const res = await fetch(`${AI_URL}/conflicts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ business_area: area, decisions: ds })
      });
      // Advance the watermark only once the call has actually been made,
      // so a mid-scan change never gets masked by a later skip.
      await supabase
        .from("conflict_scan_state")
        .upsert({ business_area: area, last_scanned_at: new Date().toISOString() });
      if (!res.ok) continue;
      const { conflicts } = (await res.json()) as {
        conflicts: {
          decision_a_id: string;
          decision_b_id: string;
          conflict_type: string;
          explanation: string;
        }[];
      };
      for (const c of conflicts) {
        const { data: existing } = await supabase
          .from("conflicts")
          .select("id")
          .or(
            `and(decision_a_id.eq.${c.decision_a_id},decision_b_id.eq.${c.decision_b_id}),and(decision_a_id.eq.${c.decision_b_id},decision_b_id.eq.${c.decision_a_id})`
          )
          .eq("resolved", false)
          .maybeSingle();
        if (existing) continue;
        await supabase.from("conflicts").insert(c);
        inserted++;
      }
    } catch {
      // fall through
    }
  }

  return json({ ok: true, inserted, skipped });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
