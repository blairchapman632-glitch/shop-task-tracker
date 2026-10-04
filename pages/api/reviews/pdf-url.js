// GET ?id= -> { url } (10-minute signed URL for a signed review's PDF)
// TODO(#11 auth pass): Admin routes have no server-side auth yet (same as contracts).
import { loadReview, signedUrl, fail } from "../../../lib/reviewServer";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: "id required" });
    const review = await loadReview(id);
    if (!review.pdf_path) return res.status(404).json({ error: "No PDF for this review yet" });
    res.status(200).json({ url: await signedUrl(review.pdf_path) });
  } catch (err) {
    fail(res, err);
  }
}
