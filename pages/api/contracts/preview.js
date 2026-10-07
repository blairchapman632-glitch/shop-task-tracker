// POST { staff_id, template_id, values } -> the filled contract PDF. Nothing is stored.
// Dashboard login required (lib/adminAuth.js); per-person admin rights are the #11 auth pass.
import { loadTemplate, loadStaff, renderContract, fail } from "../../../lib/contractServer";
import { perthNow } from "../../../lib/contractPdf";
import { requireDashboard, assertSamePharmacy } from "../../../lib/adminAuth";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const auth = await requireDashboard(req);
    const { staff_id, template_id, values } = req.body || {};
    if (!staff_id || !template_id) return res.status(400).json({ error: "staff_id and template_id required" });
    const staff = await loadStaff(staff_id);
    assertSamePharmacy(auth, staff.pharmacy_id);
    const template = await loadTemplate(template_id);
    assertSamePharmacy(auth, template.pharmacy_id);
    // Show the employer sign date as it would be if issued today
    const { bytes, warnings } = await renderContract(template, { ...values, employer_sign_date: perthNow().date });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=contract-preview.pdf");
    res.setHeader("X-Contract-Warnings", encodeURIComponent(JSON.stringify(warnings)));
    res.status(200).send(Buffer.from(bytes));
  } catch (err) {
    fail(res, err);
  }
}
