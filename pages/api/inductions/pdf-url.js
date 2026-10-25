// GET ?id= (Admin — dashboard login) -> { url } (10-minute signed URL for the induction checklist PDF, private bucket)
import supabaseAdmin from "../../../lib/supabaseAdmin";
import { fail } from "../../../lib/reviewServer";
import { requireDashboard, assertSamePharmacy } from "../../../lib/adminAuth";
import { signedPdfUrl } from "../../../lib/inductionSignoff";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const auth = await requireDashboard(req);
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: "id required" });
    const { data: ind, error } = await supabaseAdmin().from("staff_inductions").select("id, pharmacy_id, pdf_path").eq("id", String(id)).maybeSingle();
    if (error) throw error;
    if (!ind) return res.status(404).json({ error: "Induction not found" });
    assertSamePharmacy(auth, ind.pharmacy_id);
    if (!ind.pdf_path) return res.status(404).json({ error: "No PDF for this induction yet" });
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ url: await signedPdfUrl(ind.pdf_path) });
  } catch (err) {
    fail(res, err);
  }
}
