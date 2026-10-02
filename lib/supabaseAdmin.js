// SERVER-SIDE ONLY. Supabase client with the service role key (bypasses RLS and private-bucket rules).
// Never import this from a page or component — only from pages/api/*.
import { createClient } from "@supabase/supabase-js";

let client = null;

export default function supabaseAdmin() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  if (!client) {
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
