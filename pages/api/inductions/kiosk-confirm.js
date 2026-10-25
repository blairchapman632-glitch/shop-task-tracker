// POST { id } (kiosk — dashboard login, lib/adminAuth.js)
// The new starter's "These were explained to me and I understand them": only when the induction is ready
// and they're rostered on today. Saves employee_confirmed_at + via "kiosk".
import supabaseAdmin from "../../../lib/supabaseAdmin";
import { fail } from "../../../lib/reviewServer";
import { requireDashboard, assertSamePharmacy } from "../../../lib/adminAuth";
import { loadBundle, rosteredToday } from "../../../lib/inductionSignoff";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const auth = await requireDashboard(req);
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "id required" });
    const bundle = await loadBundle(id);
    const { induction, readiness } = bundle;
    assertSamePharmacy(auth, induction.pharmacy_id);
    if (induction.status !== "in_progress") return res.status(409).json({ error: "This induction is already signed off." });
    if (induction.employee_confirmed_at) return res.status(409).json({ error: "Already confirmed." });
    if (!readiness.ready) return res.status(409).json({ error: `Not ready yet: ${readiness.missing.join("; ")}.` });
    if (!(await rosteredToday(induction.staff_id))) return res.status(409).json({ error: "They need to be rostered on today to confirm." });

    const { data, error } = await supabaseAdmin().from("staff_inductions")
      .update({ employee_confirmed_at: new Date().toISOString(), employee_confirmed_via: "kiosk", updated_at: new Date().toISOString() })
      .eq("id", induction.id).eq("status", "in_progress").is("employee_confirmed_at", null).select("id");
    if (error) throw error;
    if (!data?.length) return res.status(409).json({ error: "Already confirmed." });
    res.status(200).json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
}
