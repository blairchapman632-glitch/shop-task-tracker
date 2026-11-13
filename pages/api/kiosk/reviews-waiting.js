// GET -> { staffIds: [..] } — staff with a performance review waiting for their Section 2 answers (the /me To do badge
// rule, lib/reviewServer.js reviewWaitingStaffIds). For the kiosk "Answer your review questions" job. Ids only — no
// review content, ratings, notes or review type. Dashboard login required (the kiosk's login, lib/adminAuth.js).
import { requireDashboard } from "../../../lib/adminAuth";
import { reviewWaitingStaffIds, fail } from "../../../lib/reviewServer";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const auth = await requireDashboard(req);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ staffIds: await reviewWaitingStaffIds(auth.pharmacyId) });
  } catch (err) {
    fail(res, err);
  }
}
