import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

// Local developer scratch script. Reads credentials from frontend/.env.local;
// never hardcode them here.
dotenv.config({ path: new URL(".env.local", import.meta.url).pathname });

const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, TEST_USER_EMAIL, TEST_USER_PASSWORD } = process.env;
if (!VITE_SUPABASE_URL || !VITE_SUPABASE_ANON_KEY) {
  throw new Error("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.local");
}
if (!TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
  throw new Error("Set TEST_USER_EMAIL and TEST_USER_PASSWORD in the environment");
}

const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY);

async function main() {
  const { data: user, error: authError } = await supabase.auth.signInWithPassword({
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD
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
