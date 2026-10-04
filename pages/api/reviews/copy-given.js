// POST { id, copy_given, copy_given_date } -> records that a copy was given to the staff member (signed reviews
// only) and regenerates the stored PDF so its office-use block matches.
// TODO(#11 auth pass): Admin routes have no server-side auth yet (same as contracts).
import supabaseAdmin from "../../../lib/supabaseAdmin";
import { loadReview, renderAndStoreReviewPdf, fail } from "../../../lib/reviewServer";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { id, copy_given, copy_given_date } = req.body || {};
    if (!id) return res.status(400).json({ error: "id required" });
    const review = await loadReview(id);
    if (review.status !== "signed") return res.status(409).json({ error: "Only signed reviews can be marked as copy given." });

    const fields = {
      copy_given: !!copy_given,
      copy_given_date: copy_given ? (copy_given_date || null) : null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabaseAdmin().from("performance_reviews").update(fields).eq("id", review.id);
    if (error) throw error;

    // Saved first: if the PDF refresh fails, the tick is still recorded and the next refresh will include it
    let warnings = [];
    try {
      const out = await renderAndStoreReviewPdf({ ...review, ...fields });
      warnings = out.warnings;
      if (out.path !== review.pdf_path) await supabaseAdmin().from("performance_reviews").update({ pdf_path: out.path }).eq("id", review.id);
    } catch (pdfErr) {
      console.error("[reviews] PDF refresh failed", pdfErr);
      warnings.push("Saved, but the PDF couldn't be refreshed: " + (pdfErr?.message || String(pdfErr)));
    }
    res.status(200).json({ ok: true, warnings });
  } catch (err) {
    fail(res, err);
  }
}
