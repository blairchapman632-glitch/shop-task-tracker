// POST (Authorization: Bearer <Supabase access token>) { id, answers: { questionKey: text } }
// Sends the staff member's Section 2 answers on their own in-progress review (and clears any unsent draft from the
// kiosk). Rejected once signed. Same save as the kiosk's "send" (lib/reviewServer.js sendPrep).
import { staffFromRequest, sendPrep, fail } from "../../../lib/reviewServer";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const staff = await staffFromRequest(req);
    const { id, answers } = req.body || {};
    res.status(200).json(await sendPrep(staff.id, id, answers));
  } catch (err) {
    fail(res, err);
  }
}
