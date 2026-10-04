// POST (Authorization: Bearer <Supabase access token>) { id }
// Records "I have read and understood" on the logged-in staff member's own outstanding request:
// read_at, read_via = 'phone', and a snapshot of the file version (name + URL) they read.
import supabaseAdmin from "../../../lib/supabaseAdmin";
import { staffFromRequest, fail } from "../../../lib/reviewServer";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const staff = await staffFromRequest(req);
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "id required" });
    const db = supabaseAdmin();

    const { data: request, error } = await db.from("policy_read_requests")
      .select("id, staff_id, status, document:document_id(title, file_name, file_url)")
      .eq("id", String(id)).maybeSingle();
    if (error) throw error;
    // Someone else's request looks the same as a missing one
    if (!request || Number(request.staff_id) !== Number(staff.id)) return res.status(404).json({ error: "Policy not found" });
    if (request.status !== "outstanding") return res.status(409).json({ error: "This policy is no longer waiting to be read." });

    const { data: updated, error: upErr } = await db.from("policy_read_requests").update({
      status: "read",
      read_at: new Date().toISOString(),
      read_via: "phone",
      read_file_name: request.document?.title || request.document?.file_name || null,
      read_file_url: request.document?.file_url || null,
    }).eq("id", request.id).eq("staff_id", Number(staff.id)).eq("status", "outstanding").select("id");
    if (upErr) throw upErr;
    if (!updated?.length) return res.status(409).json({ error: "This policy is no longer waiting to be read." });

    res.status(200).json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
}
