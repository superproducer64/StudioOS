import { createClient } from '@supabase/supabase-js';
export function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Configure .env.local before connecting Supabase.');
  return createClient(url, key);
}
