// Other training (courses, in-house sessions, drills) — attachments + delete, for /qspp manager mode and Admin.
// The record itself is inserted / edited from the browser; files are private (lib/otherTrainingServer.js).
//   POST   { action: "upload-url", id, ext }          -> { path, token }  (browser then uploadToSignedUrl)
//   POST   { action: "attach", id, path, filename }   -> { record }  (replaces and removes any older attachment)
//   POST   { action: "remove-file", id }              -> { record }
//   GET    ?id=                                       -> { url }     (10-minute signed URL)
//   DELETE ?id=                                       -> { ok }      (removes the attachment + the record)
// Dashboard login required (lib/adminAuth.js).
import { requireDashboard, assertSamePharmacy } from "../../../lib/adminAuth";
import { CERT_BUCKET, signedLink, uploadTicket, fail, httpError } from "../../../lib/staffFilesServer";
import { loadTraining, newAttachmentPath, attachFile, deleteTraining, removeAttachment } from "../../../lib/otherTrainingServer";

export default async function handler(req, res) {
  try {
    const auth = await requireDashboard(req);
    const rec = await loadTraining(req.method === "POST" ? req.body?.id : req.query.id);
    assertSamePharmacy(auth, rec.pharmacy_id);

    if (req.method === "POST") {
      const { action } = req.body || {};
      if (action === "upload-url") return res.status(200).json(await uploadTicket(CERT_BUCKET, newAttachmentPath(rec.id, req.body.ext)));
      if (action === "attach") return res.status(200).json({ record: await attachFile(rec, req.body.path, req.body.filename) });
      if (action === "remove-file") return res.status(200).json({ record: await removeAttachment(rec) });
      throw httpError(400, "Unknown action");
    }
    if (req.method === "GET") {
      if (!rec.attachment_path) throw httpError(404, "No attachment on that record");
      return res.status(200).json({ url: await signedLink(CERT_BUCKET, rec.attachment_path) });
    }
    if (req.method === "DELETE") {
      await deleteTraining(rec);
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    fail(res, err);
  }
}
