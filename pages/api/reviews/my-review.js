// GET (Authorization: Bearer <Supabase access token>) -> { mode: "prep"|"comment"|null, review }
// The logged-in staff member's own review, staff-facing fields only. Finished reviews are never returned.
import { staffFromRequest, myCurrentReview, fail } from "../../../lib/reviewServer";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const staff = await staffFromRequest(req);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(await myCurrentReview(staff.id));
  } catch (err) {
    fail(res, err);
  }
}
