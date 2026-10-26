import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

// Server-side Supabase client (uses anon key — fine for this lookup).
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

webpush.setVapidDetails(
  "mailto:admin@chalkboard.au",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { staff_ids, title, body, url } = req.body || {};
  if (!Array.isArray(staff_ids) || staff_ids.length === 0) {
    return res.status(400).json({ error: "staff_ids required" });
  }

  // Never send to inactive staff: keep only staff rows that are active.
  const { data: activeStaff, error: staffError } = await supabase
    .from("staff")
    .select("id")
    .in("id", staff_ids)
    .eq("active", true);

  if (staffError) return res.status(500).json({ error: staffError.message });
  const activeIds = (activeStaff || []).map((s) => s.id);
  if (activeIds.length === 0) return res.status(200).json({ sent: 0 });

  // Look up all subscriptions for these staff members.
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("*")
    .in("staff_id", activeIds);

  if (error) return res.status(500).json({ error: error.message });
  if (!subs || subs.length === 0) return res.status(200).json({ sent: 0 });

  const payload = JSON.stringify({ title, body, url });

  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      const subscription = {
        endpoint: s.endpoint,
        keys: { p256dh: s.p256dh, auth: s.auth },
      };
      try {
        await webpush.sendNotification(subscription, payload);
        sent++;
      } catch (err) {
        // 404/410 = subscription dead (uninstalled/expired) → clean it up.
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        }
      }
    })
  );

  return res.status(200).json({ sent });
}