import { createClient } from '@supabase/supabase-js';

// Local developer scratch script. Credentials come from the environment -
// never commit a project URL or key here.
const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY } = process.env;
if (!VITE_SUPABASE_URL || !VITE_SUPABASE_ANON_KEY) {
  throw new Error("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the environment");
}

const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase.from('decisions').select('id, component_name, status, ai_rating, created_at').order('created_at', { ascending: true });
  console.log(JSON.stringify(data, null, 2));
}

check();
