// Documents files on the onboarding pages (pages/staff-onboard.js, pages/locum.js), gated by the person's
// onboarding token. A token only ever reaches its own person's documents. Same actions as ./index.js:
//   POST   { action: "upload-url", token, type, ext }       -> { path, token: uploadToken }
//   POST   { action: "save", token, path, filename, type, service_certificate_id?, completion_date?, expiry_date?, title? }
//                                                           -> { doc }
//   POST   { action: "url", token, id }                     -> { url }   (10-minute signed URL)
//   POST   { action: "delete", token, id }                  -> { ok }
// POST only, so the onboarding token never sits in a URL.
import supabaseAdmin from "../../../lib/supabaseAdmin";
import { DOC_BUCKET, docFile, loadDoc, newDocPath, saveDoc, deleteDoc, signedLink, uploadTicket, httpError, fail } from "../../../lib/staffFilesServer";

async function staffFromToken(token) {
  if (!token) throw httpError(401, "This link isn't valid.");
  const { data, error } = await supabaseAdmin().from("staff")
    .select("id, pharmacy_id, role").eq("onboarding_token", String(token)).maybeSingle();
  if (error) throw error;
  if (!data) throw httpError(401, "This link isn't valid.");
  return data;
}

async function ownDoc(staff, id) {
  const doc = await loadDoc(id);
  if (Number(doc.staff_id) !== Number(staff.id) || doc.type === "signed_contract") throw httpError(404, "Document not found");
  return doc;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { action, token } = req.body || {};
    const staff = await staffFromToken(token);

    if (action === "upload-url") {
      const out = await uploadTicket(DOC_BUCKET, newDocPath(staff.id, req.body.type, req.body.ext));
      return res.status(200).json({ path: out.path, uploadToken: out.token });
    }
    if (action === "save") {
      if (req.body.type === "signed_contract") throw httpError(400, "Not allowed");
      return res.status(200).json({ doc: await saveDoc(staff, req.body.path, req.body) });
    }
    if (action === "url") {
      const file = docFile(await ownDoc(staff, req.body.id));
      if (!file) return res.status(404).json({ error: "No file for that document" });
      return res.status(200).json({ url: await signedLink(file.bucket, file.path) });
    }
    if (action === "delete") {
      await deleteDoc(await ownDoc(staff, req.body.id));
      return res.status(200).json({ ok: true });
    }
    res.status(400).json({ error: "Unknown action" });
  } catch (err) {
    fail(res, err);
  }
}
