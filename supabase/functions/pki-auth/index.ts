// @ts-nocheck
// Supabase Edge Function - PKI demo auth
// Validates a demo PIN against profiles.pki_pin and returns profile info.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization, content-type",
        "access-control-allow-methods": "POST, OPTIONS"
      }
    });
  }

  try {
    const body = await req.json();
    const { pin } = body as { pin?: string };
    if (!pin) return json({ error: "pin required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, team, role, is_project_lead")
      .eq("pki_pin", pin)
      .single();

    if (error || !data) return json({ error: "invalid pin" }, 401);

    // Return the profile payload so the frontend can create a demo session
    return json({ profile: data });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*"
    }
  });
}
