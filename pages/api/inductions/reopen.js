// POST { id, reason } (Admin — dashboard login) — escape hatch for mistakes after sign-off.
// Back to in_progress; clears the employee confirmation and the supervisor sign-off; keeps every tick.
// The old PDF file stays in the bucket (overwritten at the next sign-off); pdf_path is cleared so it isn't shown as current.
import supabaseAdmin from "../../../lib/supabaseAdmin";
import { fail } from "../../../lib/reviewServer";
import { requireDashboard, assertSamePharmacy } from "../../../lib/adminAuth";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const auth = await requireDashboard(req);
    const { id } = req.body || {};
    const reason = String(req.body?.reason || "").trim().slice(0, 500);
    if (!id) return res.status(400).json({ error: "id required" });
    if (!reason) return res.status(400).json({ error: "A reason is required." });
    const db = supabaseAdmin();
    const { data: ind, error } = await db.from("staff_inductions").select("id, pharmacy_id, status").eq("id", String(id)).maybeSingle();
    if (error) throw error;
    if (!ind) return res.status(404).json({ error: "Induction not found" });
    assertSamePharmacy(auth, ind.pharmacy_id);
    if (ind.status !== "signed_off") return res.status(409).json({ error: "This induction isn't signed off." });

    const now = new Date().toISOString();
    const { data, error: uErr } = await db.from("staff_inductions").update({
      status: "in_progress",
      signed_off_by_staff_id: null, signed_off_at: null, signed_off_via: null,
      employee_confirmed_at: null, employee_confirmed_via: null,
      pdf_path: null,
      reopened_at: now, reopened_reason: reason, updated_at: now,
    }).eq("id", ind.id).eq("status", "signed_off").select("id");
    if (uErr) throw uErr;
    if (!data?.length) return res.status(409).json({ error: "This induction was just changed — refresh and try again." });
    res.status(200).json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
}
