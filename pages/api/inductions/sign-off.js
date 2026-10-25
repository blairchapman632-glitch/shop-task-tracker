// POST { id, as: "admin" | "me" } — supervisor sign-off, closes the induction (status signed_off) and builds the PDF.
//   as "admin": dashboard login (lib/adminAuth.js); signed as the induction's supervisor, via "admin".
//   as "me":    staff /me login with can_sign_inductions, and the caller must BE the named supervisor; via "me".
// Only after the employee has confirmed on the kiosk, and only when ready (lib/inductionSignoff assertCanSignOff).
import { fail } from "../../../lib/reviewServer";
import { requireDashboard, assertSamePharmacy } from "../../../lib/adminAuth";
import { signerFromRequest } from "../../../lib/inductionServer";
import { loadBundle, assertCanSignOff, signOff } from "../../../lib/inductionSignoff";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { id, as } = req.body || {};
    if (!id) return res.status(400).json({ error: "id required" });
    if (as !== "admin" && as !== "me") return res.status(400).json({ error: "as must be admin or me" });

    let signer = null;
    let auth = null;
    if (as === "admin") auth = await requireDashboard(req);
    else signer = await signerFromRequest(req);

    const bundle = await loadBundle(id);
    const { induction } = bundle;
    if (auth) assertSamePharmacy(auth, induction.pharmacy_id);
    if (signer) {
      if (String(signer.pharmacy_id) !== String(induction.pharmacy_id)) return res.status(404).json({ error: "Induction not found" });
      if (Number(signer.id) !== Number(induction.supervisor_staff_id)) return res.status(403).json({ error: "Only the named supervisor can sign this off." });
    }
    assertCanSignOff(bundle);
    const { pdfError } = await signOff(bundle, as);
    res.status(200).json({ ok: true, pdfError });
  } catch (err) {
    fail(res, err);
  }
}
