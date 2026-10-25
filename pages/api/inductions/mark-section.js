// POST (Authorization: Bearer <Supabase access token>) { inductionId, section: "start" }
// Getting started only: ticks every unanswered line the caller is allowed to answer as Done, signed by the caller via /me.
import supabaseAdmin from "../../../lib/supabaseAdmin";
import { fail } from "../../../lib/reviewServer";
import { signerFromRequest, loadInductionFor, answerBlock } from "../../../lib/inductionServer";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const signer = await signerFromRequest(req);
    const { inductionId, section } = req.body || {};
    if (!inductionId) return res.status(400).json({ error: "inductionId required" });
    if (section !== "start") return res.status(400).json({ error: "Only Getting started can be marked done in one go." });
    const ind = await loadInductionFor(signer, inductionId);

    const db = supabaseAdmin();
    const { data: rows, error } = await db.from("staff_induction_items").select("*")
      .eq("induction_id", ind.id).eq("section", "start").is("result", null);
    if (error) throw error;
    const ids = (rows || [])
      .filter((i) => !answerBlock(signer, i) && (i.allowed_answers || ["done"]).includes("done"))
      .map((i) => i.id);
    if (!ids.length) return res.status(200).json({ ok: true, count: 0 });

    const { data: updated, error: upErr } = await db.from("staff_induction_items")
      .update({ result: "done", signed_by_staff_id: Number(signer.id), signed_via: "me", signed_at: new Date().toISOString() })
      .in("id", ids).is("result", null).select("id");
    if (upErr) throw upErr;
    res.status(200).json({ ok: true, count: updated?.length || 0 });
  } catch (err) {
    fail(res, err);
  }
}
