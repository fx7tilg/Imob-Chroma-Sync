import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('frontend/.env.local') });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function check() {
  const { data, error } = await supabase.from('approval_events').select('*').order('created_at', { ascending: false }).limit(20);
  console.log("Approval Events:");
  console.log(JSON.stringify(data, null, 2));

  const { data: d2 } = await supabase.from('decisions').select('id, status, ai_rating, created_at, updated_at').order('created_at', { ascending: true });
  console.log("Decisions:");
  console.log(JSON.stringify(d2, null, 2));
}

check();
