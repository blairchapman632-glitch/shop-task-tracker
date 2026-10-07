// Staff + locum Documents files (Admin). Files are private (lib/staffFilesServer.js).
//   POST   { action: "upload-url", staff_id, type, ext }   -> { path, token }  (browser then uploadToSignedUrl)
//   POST   { action: "save", staff_id, path, filename, type, service_certificate_id?, completion_date?, expiry_date?, title? }
//                                                           -> { doc }
//   GET    ?id=                                             -> { url }   (10-minute signed URL)
//   DELETE ?id=                                             -> { ok }    (removes file + row)
// Date/title edits don't touch storage and stay in the browser (lib/staffDocuments.js updateStaffDocument).
// Dashboard login required (lib/adminAuth.js); per-person admin rights are the #11 auth pass.
import { loadStaff } from "../../../lib/contractServer";
import { requireDashboard, assertSamePharmacy } from "../../../lib/adminAuth";
import { DOC_BUCKET, docFile, loadDoc, newDocPath, saveDoc, deleteDoc, signedLink, uploadTicket, fail } from "../../../lib/staffFilesServer";

export default async function handler(req, res) {
  try {
    const auth = await requireDashboard(req);

    if (req.method === "POST" && req.body?.action === "upload-url") {
      const staff = await loadStaff(req.body.staff_id);
      assertSamePharmacy(auth, staff.pharmacy_id);
      return res.status(200).json(await uploadTicket(DOC_BUCKET, newDocPath(staff.id, req.body.type, req.body.ext)));
    }

    if (req.method === "POST" && req.body?.action === "save") {
      const staff = await loadStaff(req.body.staff_id);
      assertSamePharmacy(auth, staff.pharmacy_id);
      return res.status(200).json({ doc: await saveDoc(staff, req.body.path, req.body) });
    }

    if (req.method === "GET") {
      const doc = await loadDoc(req.query.id);
      assertSamePharmacy(auth, doc.pharmacy_id);
      const file = docFile(doc);
      if (!file) return res.status(404).json({ error: "No file for that document" });
      return res.status(200).json({ url: await signedLink(file.bucket, file.path) });
    }

    if (req.method === "DELETE") {
      const doc = await loadDoc(req.query.id);
      assertSamePharmacy(auth, doc.pharmacy_id);
      await deleteDoc(doc);
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    fail(res, err);
  }
}
