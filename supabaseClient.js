import { createClient } from "@supabase/supabase-js";

// ── Supabase client ──────────────────────────────────────────────────────────
// Reads connection info from Vite env vars set in Vercel (Environments tab).
// The anon/publishable key is safe to expose client-side — Row Level Security
// on the database is what actually enforces access control, not this key.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.error(
    "Missing Supabase env vars — check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel → Project → Environments."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
