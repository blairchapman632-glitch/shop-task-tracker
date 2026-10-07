// Training record certificates on the kiosk (pages/training.js). The person's PIN is checked here on the server;
// the kiosk page's own name + PIN screen is unchanged (moving to the #11 auth pass). A person only reaches their
// own records. POST only, so the PIN never sits in a URL.
//   { action: "upload-url", staff_id, pin, record_id, ext }        -> { path, token }
//   { action: "attach",     staff_id, pin, record_id, path, filename } -> { record }  (replaces any older certificate)
//   { action: "url",        staff_id, pin, record_id }             -> { url }    (10-minute signed URL)
import supabaseAdmin from "../../../lib/supabaseAdmin";
import { CERT_BUCKET, certPath, loadRecord, newCertPath, attachCert, signedLink, uploadTicket, httpError, fail } from "../../../lib/staffFilesServer";

// Same rule as the kiosk screen: active, not a Locum, has a PIN, PIN matches
async function checkPin(staffId, pin) {
  const { data: s, error } = await supabaseAdmin().from("staff")
    .select("id, pin, active, role").eq("id", Number(staffId)).maybeSingle();
  if (error) throw error;
  if (!s || s.active === false || s.role === "Locum" || !s.pin || String(pin || "") !== String(s.pin)) {
    throw httpError(401, "Incorrect PIN — please log out and back in.");
  }
  return s;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { action, staff_id, pin, record_id } = req.body || {};
    const staff = await checkPin(staff_id, pin);
    const rec = await loadRecord(record_id);
    if (Number(rec.staff_id) !== Number(staff.id)) throw httpError(404, "Training record not found");

    if (action === "upload-url") return res.status(200).json(await uploadTicket(CERT_BUCKET, newCertPath(staff.id, req.body.ext)));
    if (action === "attach") return res.status(200).json({ record: await attachCert(rec, req.body.path, req.body.filename) });
    if (action === "url") {
      const path = certPath(rec);
      if (!path) return res.status(404).json({ error: "No certificate for that record" });
      return res.status(200).json({ url: await signedLink(CERT_BUCKET, path) });
    }
    res.status(400).json({ error: "Unknown action" });
  } catch (err) {
    fail(res, err);
  }
}
