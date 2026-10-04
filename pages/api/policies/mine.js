// GET (Authorization: Bearer <Supabase access token>) -> { outstanding: [...], read: [...] }
// The logged-in staff member's own policy read requests only (cancelled ones are left out).
import supabaseAdmin from "../../../lib/supabaseAdmin";
import { staffFromRequest, fail } from "../../../lib/reviewServer";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const staff = await staffFromRequest(req);
    const { data, error } = await supabaseAdmin().from("policy_read_requests")
      .select("id, status, requested_at, read_at, read_via, read_file_name, document:document_id(id, title, file_url, active)")
      .eq("staff_id", Number(staff.id))
      .in("status", ["outstanding", "read"])
      .order("requested_at", { ascending: false });
    if (error) throw error;
    const rows = data || [];
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      outstanding: rows
        .filter((r) => r.status === "outstanding" && r.document && r.document.active !== false)
        .map((r) => ({ id: r.id, title: r.document.title, file_url: r.document.file_url, requested_at: r.requested_at })),
      read: rows
        .filter((r) => r.status === "read")
        .sort((a, b) => String(b.read_at || "").localeCompare(String(a.read_at || "")))
        .map((r) => ({ id: r.id, title: r.document?.title || r.read_file_name || "Policy", read_at: r.read_at, read_via: r.read_via })),
    });
  } catch (err) {
    fail(res, err);
  }
}
