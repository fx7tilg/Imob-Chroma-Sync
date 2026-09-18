import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/db";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local."
  );
}

export const supabase = createClient<Database>(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true }
});

export const AI_SERVICE_URL =
  import.meta.env.VITE_AI_SERVICE_URL ?? "http://localhost:8000";
