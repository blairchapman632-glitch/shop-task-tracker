// Phone push notifications (web-push). SERVER-SIDE ONLY. Used by /api/push and /api/qspp/register.
// Only ever sends to ACTIVE staff; dead subscriptions (404 / 410) are removed.
import webpush from "web-push";

let ready = false;
function setup() {
  if (ready) return;
  webpush.setVapidDetails("mailto:admin@chalkboard.au", process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  ready = true;
}

// db: a Supabase client; staffIds: who to tell; message: { title, body, url } -> number of phones it reached
export async function sendPushToStaff(db, staffIds, { title, body, url }) {
  const ids = [...new Set((staffIds || []).map(Number).filter(Boolean))];
  if (!ids.length) return 0;
  setup();
  const { data: activeStaff, error: staffError } = await db.from("staff").select("id").in("id", ids).eq("active", true);
  if (staffError) throw staffError;
  const activeIds = (activeStaff || []).map((s) => s.id);
  if (!activeIds.length) return 0;
  const { data: subs, error } = await db.from("push_subscriptions").select("*").in("staff_id", activeIds);
  if (error) throw error;
  if (!subs?.length) return 0;
  const payload = JSON.stringify({ title, body, url });
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
      sent++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
    }
  }));
  return sent;
}
