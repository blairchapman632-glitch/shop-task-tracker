// POST { id, signed_name } -> signs an in-progress review: generates + stores the PDF, then sets status 'signed',
// signed_at, signed_by_staff_id (the reviewer), comment_window_ends (signed date + pharmacy setting) and pdf_path.
// The client saves the manager fields first; this route signs whatever is saved.
// TODO(#11 auth pass): Admin routes have no server-side auth yet (same as contracts).
import supabaseAdmin from "../../../lib/supabaseAdmin";
import { loadReview, renderAndStoreReviewPdf, fail } from "../../../lib/reviewServer";
import { FORM_VERSION, perthDateOf, addDaysStr } from "../../../lib/performanceReview";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { id, signed_name } = req.body || {};
    const name = String(signed_name || "").trim();
    if (!id || !name) return res.status(400).json({ error: "id and signed_name required" });

    const review = await loadReview(id);
    if (review.status !== "in_progress") return res.status(409).json({ error: "This review has already been signed." });
    if (!review.reviewer_staff_id) return res.status(400).json({ error: "Choose a reviewer before signing." });

    const db = supabaseAdmin();
    const { data: settings } = await db.from("pharmacy_settings")
      .select("review_comment_window_days").eq("pharmacy_id", String(review.pharmacy_id)).maybeSingle();
    const windowDays = Number.isFinite(Number(settings?.review_comment_window_days)) ? Number(settings.review_comment_window_days) : 14;

    const nowIso = new Date().toISOString();
    const signedFields = {
      status: "signed",
      signed_by_staff_id: review.reviewer_staff_id,
      signed_name: name,
      signed_at: nowIso,
      comment_window_ends: addDaysStr(perthDateOf(nowIso), windowDays),
      form_version: review.form_version || FORM_VERSION,
      updated_at: nowIso,
    };

    // PDF first, so a failed render/upload leaves the review in progress
    const { path, warnings } = await renderAndStoreReviewPdf({ ...review, ...signedFields });

    const { data: updated, error } = await db.from("performance_reviews")
      .update({ ...signedFields, pdf_path: path })
      .eq("id", review.id)
      .eq("status", "in_progress")
      .select("id");
    if (error) throw error;
    if (!updated?.length) return res.status(409).json({ error: "This review was signed by someone else just now." });

    res.status(200).json({ ok: true, warnings });
  } catch (err) {
    fail(res, err);
  }
}
