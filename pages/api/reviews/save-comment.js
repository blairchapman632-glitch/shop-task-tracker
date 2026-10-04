// POST (Authorization: Bearer <Supabase access token>) { id, comment }
// Saves the staff member's comments on their own signed review, only inside the comment window, then
// regenerates the stored PDF so it includes the comment. A blank comment clears it.
import supabaseAdmin from "../../../lib/supabaseAdmin";
import { staffFromRequest, myCurrentReview, loadReview, renderAndStoreReviewPdf, fail } from "../../../lib/reviewServer";

const MAX_LEN = 4000;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const staff = await staffFromRequest(req);
    const { id, comment } = req.body || {};
    const current = await myCurrentReview(staff.id);
    if (current.mode !== "comment" || String(current.review.id) !== String(id)) {
      return res.status(409).json({ error: "Comments can't be added to this review." });
    }

    const text = String(comment ?? "").trim().slice(0, MAX_LEN);
    const nowIso = new Date().toISOString();
    const fields = text
      ? { staff_comments: text, staff_comments_at: nowIso, staff_comments_seen: false, updated_at: nowIso }
      : { staff_comments: null, staff_comments_at: null, staff_comments_seen: true, updated_at: nowIso };

    const db = supabaseAdmin();
    const { data, error } = await db.from("performance_reviews")
      .update(fields)
      .eq("id", String(id)).eq("staff_id", Number(staff.id)).eq("status", "signed")
      .select("id");
    if (error) throw error;
    if (!data?.length) return res.status(409).json({ error: "Comments can't be added to this review." });

    // Saved first: if the PDF refresh fails the comment is still recorded (next refresh will include it)
    let pdfOk = true;
    try {
      const review = await loadReview(id);
      const { path } = await renderAndStoreReviewPdf(review);
      if (path !== review.pdf_path) await db.from("performance_reviews").update({ pdf_path: path }).eq("id", review.id);
    } catch (pdfErr) {
      pdfOk = false;
      console.error("[reviews] PDF refresh after staff comment failed", pdfErr);
    }

    res.status(200).json({ ...(await myCurrentReview(staff.id)), pdfOk });
  } catch (err) {
    fail(res, err);
  }
}
