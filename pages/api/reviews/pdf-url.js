// GET ?id= -> { url } (10-minute signed URL for a signed review's PDF)
// Dashboard login required (lib/adminAuth.js); per-person admin rights are the #11 auth pass.
import { loadReview, signedUrl, fail } from "../../../lib/reviewServer";
import { requireDashboard, assertSamePharmacy } from "../../../lib/adminAuth";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const auth = await requireDashboard(req);
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: "id required" });
    const review = await loadReview(id);
    assertSamePharmacy(auth, review.pharmacy_id);
    if (!review.pdf_path) return res.status(404).json({ error: "No PDF for this review yet" });
    res.status(200).json({ url: await signedUrl(review.pdf_path) });
  } catch (err) {
    fail(res, err);
  }
}
