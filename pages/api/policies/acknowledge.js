// POST (Authorization: Bearer <Supabase access token>) { id }  — called by /me (components/MyPolicies.js)
// Records "I have read and understood" on the logged-in staff member's own outstanding request:
// read_at, read_via = 'phone', and a snapshot of the staff PDF (name + URL) they read. Same record as the kiosk, so it
// clears everywhere (kiosk card, Admin results, Training tab, Needs attention, induction line).
import supabaseAdmin from "../../../lib/supabaseAdmin";
import { staffFromRequest, fail } from "../../../lib/reviewServer";
import { tickInductionLine } from "../../../lib/policyReads";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const staff = await staffFromRequest(req);
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "id required" });
    const db = supabaseAdmin();

    const { data: request, error } = await db.from("policy_read_requests")
      .select("id, staff_id, status, document:document_id(title, pdf_file_name, pdf_url)")
      .eq("id", String(id)).maybeSingle();
    if (error) throw error;
    // Someone else's request looks the same as a missing one
    if (!request || Number(request.staff_id) !== Number(staff.id)) return res.status(404).json({ error: "Policy not found" });
    if (request.status !== "outstanding") return res.status(409).json({ error: "This policy is no longer waiting to be read." });
    // Same as the kiosk: can't confirm reading a policy that has no staff PDF to open yet
    if (!request.document?.pdf_url) return res.status(409).json({ error: "This policy isn't available to read yet." });

    const { data: updated, error: upErr } = await db.from("policy_read_requests").update({
      status: "read",
      read_at: new Date().toISOString(),
      read_via: "phone",
      read_file_name: request.document?.title || request.document?.pdf_file_name || null,
      read_file_url: request.document?.pdf_url || null, // the staff PDF (never the master)
    }).eq("id", request.id).eq("staff_id", Number(staff.id)).eq("status", "outstanding").select("id, document_id, induction_id, read_at, read_via");
    if (upErr) throw upErr;
    if (!updated?.length) return res.status(409).json({ error: "This policy is no longer waiting to be read." });
    await tickInductionLine(db, updated[0]); // induction requests tick their Section 3 line

    res.status(200).json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
}
