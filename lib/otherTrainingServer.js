// Other training attachments (server side) — private training-certificates bucket, under other/<training id>/.
// Routes: pages/api/other-training/index.js (dashboard login — /qspp manager mode, Admin) and
// pages/api/other-training/kiosk.js (the person's PIN — /training, own records only).
import supabaseAdmin from "./supabaseAdmin";
import { CERT_BUCKET, cleanExt, httpError } from "./staffFilesServer";

export async function loadTraining(id) {
  if (!id) throw httpError(400, "id required");
  const { data, error } = await supabaseAdmin().from("other_training").select("*").eq("id", String(id)).maybeSingle();
  if (error) throw error;
  if (!data) throw httpError(404, "Training record not found");
  return data;
}

export const newAttachmentPath = (trainingId, ext) => `other/${trainingId}/${Date.now()}.${cleanExt(ext)}`;

// Save the uploaded file on the record (it must be this record's folder); removes any older attachment. -> record
export async function attachFile(rec, path, filename) {
  if (!String(path || "").startsWith(`other/${rec.id}/`)) throw httpError(400, "That file doesn't belong to this record");
  const db = supabaseAdmin();
  const { data, error } = await db.from("other_training")
    .update({ attachment_path: path, attachment_name: String(filename || "").slice(0, 200) || null, updated_at: new Date().toISOString() })
    .eq("id", rec.id).select("*").single();
  if (error) throw error;
  if (rec.attachment_path && rec.attachment_path !== path) await db.storage.from(CERT_BUCKET).remove([rec.attachment_path]);
  return data;
}

// Remove the record (attendees cascade) and its file
export async function deleteTraining(rec) {
  const db = supabaseAdmin();
  if (rec.attachment_path) {
    const { error: rmErr } = await db.storage.from(CERT_BUCKET).remove([rec.attachment_path]);
    if (rmErr) throw rmErr;
  }
  const { error } = await db.from("other_training").delete().eq("id", rec.id);
  if (error) throw error;
}

// Remove just the attachment
export async function removeAttachment(rec) {
  const db = supabaseAdmin();
  if (rec.attachment_path) await db.storage.from(CERT_BUCKET).remove([rec.attachment_path]);
  const { data, error } = await db.from("other_training")
    .update({ attachment_path: null, attachment_name: null, updated_at: new Date().toISOString() }).eq("id", rec.id).select("*").single();
  if (error) throw error;
  return data;
}
