// POST (Authorization: Bearer <Supabase access token>) { itemId, result: "done"|"na"|"declined"|null, note? }
// Sets (or clears, result null) one line of someone else's in-progress induction, signed by the caller via /me.
// All rules are checked here (lib/inductionServer answerBlock): no Office use, no Section 3, pharmacist-only lines need a
// Pharmacist, and an answered line can only be changed by whoever answered it from /me (Admin can change anything).
import supabaseAdmin from "../../../lib/supabaseAdmin";
import { fail } from "../../../lib/reviewServer";
import { signerFromRequest, loadInductionFor, answerBlock, itemForMe, forbidden, notFound, conflict } from "../../../lib/inductionServer";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const signer = await signerFromRequest(req);
    const { itemId, result = null, note } = req.body || {};
    if (!itemId) return res.status(400).json({ error: "itemId required" });
    if (result !== null && !["done", "na", "declined"].includes(result)) return res.status(400).json({ error: "Invalid answer" });
    if (note !== undefined && note !== null && typeof note !== "string") return res.status(400).json({ error: "Invalid note" });

    const db = supabaseAdmin();
    const { data: item, error } = await db.from("staff_induction_items").select("*").eq("id", String(itemId)).maybeSingle();
    if (error) throw error;
    if (!item) throw notFound("Line not found");
    await loadInductionFor(signer, item.induction_id); // same pharmacy, not their own, still in progress

    const block = answerBlock(signer, item);
    if (block) throw forbidden(block);
    if (result && !(item.allowed_answers || ["done", "na"]).includes(result)) return res.status(400).json({ error: "That answer isn't allowed on this line." });

    const patch = result
      ? { result, signed_by_staff_id: Number(signer.id), signed_via: "me", signed_at: new Date().toISOString() }
      : { result: null, signed_by_staff_id: null, signed_via: null, signed_at: null };
    if (note !== undefined) patch.note = String(note || "").trim().slice(0, 500) || null;

    // Only write if the line is still as we checked it (unanswered, or answered by this caller)
    let q = db.from("staff_induction_items").update(patch).eq("id", item.id);
    q = item.result ? q.eq("signed_via", "me").eq("signed_by_staff_id", Number(signer.id)) : q.is("result", null);
    const { data: updated, error: upErr } = await q.select("*");
    if (upErr) throw upErr;
    if (!updated?.length) throw conflict("This line was just changed by someone else — refresh and try again.");

    // The saved line, so /me updates just this line (no full reload)
    res.status(200).json({ ok: true, item: itemForMe(signer, updated[0], () => signer.name) });
  } catch (err) {
    fail(res, err);
  }
}
