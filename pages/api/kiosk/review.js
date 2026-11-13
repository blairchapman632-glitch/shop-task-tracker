// Performance review Section 2 on the shop computer (kiosk "Answer your review questions" job).
// Every request needs the kiosk's dashboard login AND { staff_id, pin } — that person's own 4-digit staff PIN, checked
// here on EVERY call (open, draft and send), not only the first. Only ever acts on that person's own current
// in-progress review and returns the same staff-facing fields as /api/reviews/my-review — never ratings, reviewer
// notes or other sections. The kiosk's own login is untouched (no staff login on the shop computer).
// POST only, so the PIN never sits in a URL.
//   { action: "open",  staff_id, pin }               -> { review } (null when nothing is waiting)
//   { action: "draft", staff_id, pin, id, answers }  -> { review }  unsent answers (answers: null clears them)
//   { action: "send",  staff_id, pin, id, answers }  -> { review }  sends to the reviewer, clears the draft
// The optional comment after sign-off stays phone-only.
import { kioskStaffFromRequest, myCurrentReview, sendPrep, saveDraftPrep, fail } from "../../../lib/reviewServer";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  res.setHeader("Cache-Control", "no-store");
  try {
    const { action, staff_id, pin, id, answers } = req.body || {};
    const staff = await kioskStaffFromRequest(req, staff_id, pin);

    if (action === "open") {
      const current = await myCurrentReview(staff.id);
      return res.status(200).json({ review: current.mode === "prep" ? current.review : null });
    }
    if (action === "draft" || action === "send") {
      const out = action === "send"
        ? await sendPrep(staff.id, id, answers)
        : await saveDraftPrep(staff.id, id, answers || null);
      return res.status(200).json({ review: out.mode === "prep" ? out.review : null });
    }
    res.status(400).json({ error: "Unknown action" });
  } catch (err) {
    fail(res, err);
  }
}
