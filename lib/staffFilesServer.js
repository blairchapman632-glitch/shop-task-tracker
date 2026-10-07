// Staff files in private storage. SERVER-SIDE ONLY.
//   locum-documents        locum_documents rows (staff + locum Documents, service certificates). Path in storage_path;
//                          older rows only have the old public url, so the path is worked out from it.
//                          Paper contracts (type signed_contract with storage_path) live in employment-contracts.
//   training-certificates  training_records.certificate_path (older rows: worked out from certificate_url)
// Browsers never touch these buckets directly: they ask a route for a one-time upload URL and get 10-minute signed
// links to open files. Routes: pages/api/staff-docs/{index,onboard}.js, pages/api/training-certs/{index,kiosk}.js
import supabaseAdmin from "./supabaseAdmin";
import { CONTRACT_BUCKET } from "./contractServer";

export const DOC_BUCKET = "locum-documents";
export const CERT_BUCKET = "training-certificates";
export const SIGNED_URL_SECONDS = 600; // 10 minutes
export const FILE_EXTS = ["pdf", "jpg", "jpeg", "png"];

export const httpError = (status, message) => Object.assign(new Error(message), { status });

export const cleanExt = (ext) => {
  const e = String(ext || "").toLowerCase().replace(/^\./, "");
  if (!FILE_EXTS.includes(e)) throw httpError(400, "Please choose a PDF, JPG or PNG file.");
  return e === "jpeg" ? "jpg" : e;
};

// Path inside a bucket from an old public URL (…/object/public/<bucket>/<path>)
export const pathFromPublicUrl = (url, bucket) => {
  const marker = `/${bucket}/`;
  const i = String(url || "").indexOf(marker);
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
};

// ── locum_documents ─────────────────────────────────────────────────────────

// -> { bucket, path } | null
export function docFile(doc) {
  if (!doc) return null;
  if (doc.storage_path) return { bucket: doc.type === "signed_contract" ? CONTRACT_BUCKET : DOC_BUCKET, path: doc.storage_path };
  const path = pathFromPublicUrl(doc.url, DOC_BUCKET);
  return path ? { bucket: DOC_BUCKET, path } : null;
}

export async function loadDoc(id) {
  const { data, error } = await supabaseAdmin().from("locum_documents").select("*").eq("id", Number(id)).maybeSingle();
  if (error) throw error;
  if (!data) throw httpError(404, "Document not found");
  return data;
}

// New file paths: <staff_id>/<type>_<timestamp>.<ext>
export const newDocPath = (staffId, type, ext) =>
  `${Number(staffId)}/${String(type || "other").replace(/[^a-z0-9_]/gi, "") || "other"}_${Date.now()}.${cleanExt(ext)}`;

// Insert a locum_documents row for a file already uploaded to DOC_BUCKET (removes the file if the insert fails)
export async function saveDoc(staff, path, f) {
  if (!String(path || "").startsWith(`${Number(staff.id)}/`)) throw httpError(400, "Invalid file path");
  const db = supabaseAdmin();
  const { data, error } = await db.from("locum_documents").insert([{
    staff_id: staff.id,
    pharmacy_id: staff.pharmacy_id,
    type: String(f.type || "other"),
    url: null,
    storage_path: path,
    filename: String(f.filename || "").slice(0, 255) || null,
    service_certificate_id: f.service_certificate_id || null,
    completion_date: f.completion_date || null,
    expiry_date: f.expiry_date || null,
    title: f.title ? String(f.title).slice(0, 255) : null,
  }]).select().single();
  if (error) {
    await db.storage.from(DOC_BUCKET).remove([path]);
    throw error;
  }
  return data;
}

// Remove a document's file (if any) and its row
export async function deleteDoc(doc) {
  const db = supabaseAdmin();
  const file = docFile(doc);
  if (file) {
    const { error: rmErr } = await db.storage.from(file.bucket).remove([file.path]);
    if (rmErr) throw rmErr;
  }
  const { error } = await db.from("locum_documents").delete().eq("id", doc.id);
  if (error) throw error;
}

// ── training_records ────────────────────────────────────────────────────────

export const certPath = (rec) => rec?.certificate_path || pathFromPublicUrl(rec?.certificate_url, CERT_BUCKET);

export async function loadRecord(id) {
  const { data, error } = await supabaseAdmin().from("training_records").select("*").eq("id", String(id)).maybeSingle();
  if (error) throw error;
  if (!data) throw httpError(404, "Training record not found");
  return data;
}

export const newCertPath = (staffId, ext) => `${Number(staffId)}/${Date.now()}.${cleanExt(ext)}`;

// Point a record at a newly uploaded certificate; the old certificate file (if any) is removed afterwards
export async function attachCert(rec, path, filename) {
  if (!String(path || "").startsWith(`${Number(rec.staff_id)}/`)) throw httpError(400, "Invalid file path");
  const db = supabaseAdmin();
  const oldPath = certPath(rec);
  const { data, error } = await db.from("training_records").update({
    certificate_path: path,
    certificate_url: null,
    certificate_filename: String(filename || "").slice(0, 255) || null,
  }).eq("id", rec.id).select().single();
  if (error) {
    await db.storage.from(CERT_BUCKET).remove([path]);
    throw error;
  }
  if (oldPath && oldPath !== path) await db.storage.from(CERT_BUCKET).remove([oldPath]); // replaced file
  return data;
}

// ── shared ──────────────────────────────────────────────────────────────────

export async function signedLink(bucket, path) {
  const { data, error } = await supabaseAdmin().storage.from(bucket).createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error) throw error;
  return data.signedUrl;
}

// -> { path, token } for the browser's uploadToSignedUrl (avoids Vercel's 4.5 MB request limit)
export async function uploadTicket(bucket, path) {
  const { data, error } = await supabaseAdmin().storage.from(bucket).createSignedUploadUrl(path);
  if (error) throw error;
  return { path: data.path || path, token: data.token };
}

export const fail = (res, err) => {
  console.error("[staff-files]", err);
  res.status(err?.status || 500).json({ error: err?.message || String(err) });
};
