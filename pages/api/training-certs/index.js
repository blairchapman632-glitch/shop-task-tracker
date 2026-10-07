// Training record certificates (Admin → Staff → Training). Files are private (lib/staffFilesServer.js).
// The record itself is still inserted from the browser; a certificate is attached to it afterwards.
//   POST   { action: "upload-url", record_id, ext }         -> { path, token }  (browser then uploadToSignedUrl)
//   POST   { action: "attach", record_id, path, filename }  -> { record }  (replaces and removes any older certificate)
//   GET    ?id=                                             -> { url }     (10-minute signed URL)
//   DELETE ?id=                                             -> { ok }      (removes the certificate file + the record)
// Dashboard login required (lib/adminAuth.js); per-person admin rights are the #11 auth pass.
import supabaseAdmin from "../../../lib/supabaseAdmin";
import { requireDashboard, assertSamePharmacy } from "../../../lib/adminAuth";
import { CERT_BUCKET, certPath, loadRecord, newCertPath, attachCert, signedLink, uploadTicket, fail } from "../../../lib/staffFilesServer";

export default async function handler(req, res) {
  try {
    const auth = await requireDashboard(req);
    const id = req.method === "POST" ? req.body?.record_id : req.query.id;
    const rec = await loadRecord(id);
    assertSamePharmacy(auth, rec.pharmacy_id);

    if (req.method === "POST" && req.body?.action === "upload-url") {
      return res.status(200).json(await uploadTicket(CERT_BUCKET, newCertPath(rec.staff_id, req.body.ext)));
    }
    if (req.method === "POST" && req.body?.action === "attach") {
      return res.status(200).json({ record: await attachCert(rec, req.body.path, req.body.filename) });
    }
    if (req.method === "GET") {
      const path = certPath(rec);
      if (!path) return res.status(404).json({ error: "No certificate for that record" });
      return res.status(200).json({ url: await signedLink(CERT_BUCKET, path) });
    }
    if (req.method === "DELETE") {
      const db = supabaseAdmin();
      const path = certPath(rec);
      if (path) {
        const { error: rmErr } = await db.storage.from(CERT_BUCKET).remove([path]);
        if (rmErr) throw rmErr;
      }
      const { error } = await db.from("training_records").delete().eq("id", rec.id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }
    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    fail(res, err);
  }
}
