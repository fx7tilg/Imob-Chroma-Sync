import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('frontend/.env.local') });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function check() {
  const { data, error } = await supabase.from('approvals').select('*').eq('decision_id', '69c17ca9-9695-4161-9ff1-34a38fdcdbac');
  console.log(JSON.stringify(data, null, 2));
}

check();
