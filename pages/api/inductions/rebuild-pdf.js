// POST { id } (Admin — dashboard login) — rebuild the PDF of a signed-off induction (e.g. if it failed at sign-off).
import { fail } from "../../../lib/reviewServer";
import { requireDashboard, assertSamePharmacy } from "../../../lib/adminAuth";
import { loadBundle, renderAndStorePdf } from "../../../lib/inductionSignoff";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const auth = await requireDashboard(req);
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "id required" });
    const bundle = await loadBundle(id);
    assertSamePharmacy(auth, bundle.induction.pharmacy_id);
    if (bundle.induction.status !== "signed_off") return res.status(409).json({ error: "Only signed-off inductions have a PDF." });
    const { warnings } = await renderAndStorePdf(bundle);
    res.status(200).json({ ok: true, warnings });
  } catch (err) {
    fail(res, err);
  }
}
