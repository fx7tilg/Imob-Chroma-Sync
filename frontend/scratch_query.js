import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  "https://tzpzzrftujhoahjluvjk.supabase.co",
  "sb_publishable_r3z7JbuKszAzzhuou9MGqQ_0dbz3IvB"
);

async function check() {
  const { data, error } = await supabase.from('decisions').select('id, component_name, status, ai_rating, created_at').order('created_at', { ascending: true });
  console.log(JSON.stringify(data, null, 2));
}

check();
