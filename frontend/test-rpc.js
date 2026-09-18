import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: "c:/Users/ADITYA RAJ/Downloads/Chroma-Sync/frontend/.env.local" });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function main() {
  const { data: user, error: authError } = await supabase.auth.signInWithPassword({
    email: "designer1@chroma.com",
    password: "password123"
  });
  if (authError) {
    console.error("Auth error:", authError);
    return;
  }

  // Create a draft decision
  const { data: dec, error: insertError } = await supabase.from("decisions").insert({
    component_name: "Test RPC",
    business_area: "INT › Cockpit",
    status: "draft",
    owner_team: "design",
    created_by: user.session.user.id
  }).select("id").single();

  if (insertError) {
    console.error("Insert error:", insertError);
    return;
  }

  console.log("Decision created:", dec.id);

  // Call the RPC
  const { data, error: rpcError } = await supabase.rpc("set_ai_readiness", {
    p_decision_id: dec.id,
    p_rating: "yellow",
    p_reason: "AI service unavailable",
    p_flags: [{ flag: "ai_unavailable" }]
  });

  if (rpcError) {
    console.error("RPC Error:", rpcError);
  } else {
    console.log("RPC Success:", data);
  }

  // clean up
  await supabase.from("decisions").delete().eq("id", dec.id);
}

main();
