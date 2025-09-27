import { createClient } from "@supabase/supabase-js";

// Use the public env vars (Vercel → Settings → Environment Variables)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Create a single client for the browser
const supabase = createClient(supabaseUrl, supabaseKey);

export default supabase;
