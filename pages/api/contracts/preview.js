// POST { staff_id, template_id, values } -> the filled contract PDF. Nothing is stored.
// TODO(#11 auth pass): Admin routes have no server-side auth yet (same as the rest of Admin).
import { loadTemplate, loadStaff, renderContract, fail } from "../../../lib/contractServer";
import { perthNow } from "../../../lib/contractPdf";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { staff_id, template_id, values } = req.body || {};
    if (!staff_id || !template_id) return res.status(400).json({ error: "staff_id and template_id required" });
    await loadStaff(staff_id);
    const template = await loadTemplate(template_id);
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
