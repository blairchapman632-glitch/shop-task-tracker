import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

webpush.setVapidDetails(
  "mailto:admin@chalkboard.au",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";

export default async function handler(req, res) {
  // Vercel cron sends GET; protect against random hits
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Get payroll anchor
    const { data: settings } = await supabase
      .from("pharmacy_settings")
      .select("payroll_start_date")
      .eq("pharmacy_id", PHARMACY_ID)
      .single();

    if (!settings?.payroll_start_date) {
      return res.status(200).json({ skipped: "no payroll start date" });
    }

    // Find current period
    const anchor = new Date(settings.payroll_start_date + "T00:00:00");
    const today = new Date();
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const todayISO = iso(today);

    let cur = new Date(anchor);
    while (cur.getTime() + 14 * 86400000 <= today.getTime()) {
      cur.setDate(cur.getDate() + 14);
    }

    // Deadline = Monday (day 12 of the period, 0-indexed)
    const deadline = new Date(cur);
    deadline.setDate(deadline.getDate() + 12);
    const deadlineISO = iso(deadline);

    // Only run on deadline day
    if (todayISO !== deadlineISO) {
      return res.status(200).json({ skipped: `not deadline day (deadline: ${deadlineISO}, today: ${todayISO})` });
    }

    const periodStartISO = iso(cur);
    const periodEnd = new Date(cur);
    periodEnd.setDate(periodEnd.getDate() + 13);
    const periodEndISO = iso(periodEnd);

    // Get all staff (exclude salary — they don't confirm)
    const { data: allStaff } = await supabase
      .from("staff")
      .select("id, employment_type")
      .eq("pharmacy_id", PHARMACY_ID)
      .eq("active", true)
      .neq("role", "Locum");

    const salaryIds = new Set((allStaff || []).filter((s) => s.employment_type === "Salary").map((s) => s.id));

    // Who has already confirmed?
    const { data: approved } = await supabase
      .from("wage_approvals")
      .select("staff_id")
      .eq("pharmacy_id", PHARMACY_ID)
      .eq("period_start", periodStartISO);

    const approvedIds = new Set((approved || []).map((a) => a.staff_id));

    // Who has shifts this period?
    const { data: shifts } = await supabase
      .from("roster_shifts")
      .select("staff_id")
      .gte("shift_date", periodStartISO)
      .lte("shift_date", periodEndISO)
      .not("staff_id", "is", null);

    const staffWithShifts = new Set((shifts || []).map((s) => s.staff_id));

    // Unconfirmed = has shifts + not salary + not approved
    const unconfirmed = [...staffWithShifts].filter(
      (id) => !salaryIds.has(id) && !approvedIds.has(id)
    );

    if (!unconfirmed.length) {
      return res.status(200).json({ sent: 0, message: "Everyone confirmed" });
    }

    // Send pushes
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("*")
      .in("staff_id", unconfirmed);

    let sent = 0;
    await Promise.all((subs || []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({
            title: "Hours confirmation reminder",
            body: "Please confirm your hours for this pay period in Chalkboard Pocket.",
            url: "/me?p=byford",
          })
        );
        sent++;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        }
      }
    }));

    return res.status(200).json({ sent, unconfirmed: unconfirmed.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}