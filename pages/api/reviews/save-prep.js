// POST (Authorization: Bearer <Supabase access token>) { id, answers: { questionKey: text } }
// Saves the staff member's Section 2 answers on their own in-progress review. Rejected once signed.
import supabaseAdmin from "../../../lib/supabaseAdmin";
import { staffFromRequest, myCurrentReview, fail } from "../../../lib/reviewServer";
import { PREP_QUESTIONS } from "../../../lib/performanceReview";

const MAX_LEN = 4000;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const staff = await staffFromRequest(req);
    const { id, answers } = req.body || {};
    const current = await myCurrentReview(staff.id);
    if (current.mode !== "prep" || String(current.review.id) !== String(id)) {
      return res.status(409).json({ error: "This review can no longer be changed." });
    }

    // Only the known questions, as trimmed text
    const staff_prep = {};
    for (const q of PREP_QUESTIONS) staff_prep[q.key] = String(answers?.[q.key] ?? "").trim().slice(0, MAX_LEN);

    const nowIso = new Date().toISOString();
    const { data, error } = await supabaseAdmin().from("performance_reviews")
      .update({ staff_prep, staff_prep_updated_at: nowIso, updated_at: nowIso })
      .eq("id", String(id)).eq("staff_id", Number(staff.id)).eq("status", "in_progress")
      .select("id");
    if (error) throw error;
    if (!data?.length) return res.status(409).json({ error: "This review can no longer be changed." });

    res.status(200).json(await myCurrentReview(staff.id));
  } catch (err) {
    fail(res, err);
  }
}
