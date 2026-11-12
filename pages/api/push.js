import { createClient } from "@supabase/supabase-js";
import { sendPushToStaff } from "../../lib/pushServer";

// Server-side Supabase client (uses anon key — fine for this lookup).
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// POST { staff_ids, title, body, url } — never sends to inactive staff (lib/pushServer.js)
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { staff_ids, title, body, url } = req.body || {};
  if (!Array.isArray(staff_ids) || staff_ids.length === 0) {
    return res.status(400).json({ error: "staff_ids required" });
  }

  try {
    const sent = await sendPushToStaff(supabase, staff_ids, { title, body, url });
    return res.status(200).json({ sent });
  } catch (err) {
    return res.status(500).json({ error: err?.message || String(err) });
  }
}
