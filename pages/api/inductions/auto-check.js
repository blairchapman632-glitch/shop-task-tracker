// POST { id } (Authorization: Bearer <Supabase access token>) — run the Stage 4 auto-checks for one induction.
// /me calls this in the background after showing the saved lines (detail route), then merges the changed lines.
// -> { changed: [lines as /me gets them], done } (done = the induction's new "x of y" count, all lines)
// Same access rules as detail (signer flag, same pharmacy, not their own, in progress).
import { fail } from "../../../lib/reviewServer";
import supabaseAdmin from "../../../lib/supabaseAdmin";
import { signerFromRequest, loadInductionFor, loadItems, itemForMe, ME_SECTIONS } from "../../../lib/inductionServer";
import { syncInductionAuto } from "../../../lib/inductionAuto";
import { inductionProgress } from "../../../lib/induction";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const signer = await signerFromRequest(req);
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "id required" });
    const ind = await loadInductionFor(signer, id);
    const { items, changed } = await syncInductionAuto(supabaseAdmin(), ind, await loadItems([ind.id]));
    res.status(200).json({
      // Auto lines never carry a staff signer, so no name lookup is needed
      changed: changed.filter((i) => ME_SECTIONS.includes(i.section)).map((i) => itemForMe(signer, i, () => "")),
      done: inductionProgress(items).done,
    });
  } catch (err) {
    fail(res, err);
  }
}
