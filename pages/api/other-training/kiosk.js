// Other training attachments on /training (kiosk). The person's PIN is checked here on the server, and they only reach
// records they attended. POST only, so the PIN never sits in a URL.
//   { action: "upload-url", staff_id, pin, id, ext }          -> { path, token }
//   { action: "attach",     staff_id, pin, id, path, filename } -> { record }
//   { action: "url",        staff_id, pin, id }               -> { url }    (10-minute signed URL)
import supabaseAdmin from "../../../lib/supabaseAdmin";
import { CERT_BUCKET, signedLink, uploadTicket, httpError, fail } from "../../../lib/staffFilesServer";
import { loadTraining, newAttachmentPath, attachFile } from "../../../lib/otherTrainingServer";

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
    const { action, staff_id, pin, id } = req.body || {};
    const staff = await checkPin(staff_id, pin);
    const rec = await loadTraining(id);
    const { data: att, error } = await supabaseAdmin().from("other_training_attendees")
      .select("staff_id").eq("training_id", rec.id).eq("staff_id", Number(staff.id)).maybeSingle();
    if (error) throw error;
    if (!att) throw httpError(404, "Training record not found");

    if (action === "upload-url") return res.status(200).json(await uploadTicket(CERT_BUCKET, newAttachmentPath(rec.id, req.body.ext)));
    if (action === "attach") return res.status(200).json({ record: await attachFile(rec, req.body.path, req.body.filename) });
    if (action === "url") {
      if (!rec.attachment_path) throw httpError(404, "No attachment on that record");
      return res.status(200).json({ url: await signedLink(CERT_BUCKET, rec.attachment_path) });
    }
    res.status(400).json({ error: "Unknown action" });
  } catch (err) {
    fail(res, err);
  }
}
