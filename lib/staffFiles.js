// Browser side of private staff files (server: lib/staffFilesServer.js).
//   Documents (locum_documents):   Admin -> /api/staff-docs (dashboard login);  onboarding -> /api/staff-docs/onboard (token)
//   Training certificates:         Admin -> /api/training-certs (dashboard login); kiosk -> /api/training-certs/kiosk (PIN)
// Uploads go straight from the browser to storage with a one-time upload token (no Vercel 4.5 MB limit).
import supabase from "./supabaseClient";
import { adminFetch } from "./adminFetch";

const DOC_BUCKET = "locum-documents";
const CERT_BUCKET = "training-certificates";

const extOf = (file) => (String(file?.name || "").split(".").pop() || "").toLowerCase();

async function call(url, { method = "GET", body, admin = false } = {}) {
  const opts = body ? { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { method };
  const res = await (admin ? adminFetch(url, opts) : fetch(url, opts));
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || `Something went wrong (${res.status})`);
  return out;
}

async function putFile(bucket, path, token, file) {
  const { error } = await supabase.storage.from(bucket).uploadToSignedUrl(path, token, file);
  if (error) throw error;
}

// Open a file from a function that returns a signed URL. The tab opens straight away, while we still have
// the click (popup blockers / iPhone), then goes to the file.
export async function openSignedUrl(getUrl) {
  const win = window.open("", "_blank");
  try {
    const url = await getUrl();
    if (win) win.location.href = url; else window.location.href = url;
  } catch (err) {
    if (win) win.close();
    alert("Couldn't open the file: " + (err?.message || String(err)));
  }
}

// Does this row have a file (old public url or new private path)?
export const docHasFile = (doc) => !!(doc?.storage_path || doc?.url);
export const recordHasCert = (rec) => !!(rec?.certificate_path || rec?.certificate_url);

// ── Documents ───────────────────────────────────────────────────────────────
// onboardToken: the onboarding page's token; omit for Admin.
// fields: { type, service_certificate_id?, completion_date?, expiry_date?, title? } -> the new locum_documents row
export async function uploadStaffDoc({ staffId, file, fields, onboardToken = null }) {
  const ext = extOf(file);
  if (onboardToken) {
    const t = await call("/api/staff-docs/onboard", { method: "POST", body: { action: "upload-url", token: onboardToken, type: fields.type, ext } });
    await putFile(DOC_BUCKET, t.path, t.uploadToken, file);
    return (await call("/api/staff-docs/onboard", { method: "POST", body: { ...fields, action: "save", token: onboardToken, path: t.path, filename: file.name } })).doc;
  }
  const t = await call("/api/staff-docs", { method: "POST", admin: true, body: { action: "upload-url", staff_id: staffId, type: fields.type, ext } });
  await putFile(DOC_BUCKET, t.path, t.token, file);
  return (await call("/api/staff-docs", { method: "POST", admin: true, body: { ...fields, action: "save", staff_id: staffId, path: t.path, filename: file.name } })).doc;
}

export const openStaffDoc = (doc, onboardToken = null) => openSignedUrl(async () => (onboardToken
  ? await call("/api/staff-docs/onboard", { method: "POST", body: { action: "url", token: onboardToken, id: doc.id } })
  : await call(`/api/staff-docs?id=${encodeURIComponent(doc.id)}`, { admin: true })).url);

export async function removeStaffDoc(doc, onboardToken = null) {
  if (onboardToken) await call("/api/staff-docs/onboard", { method: "POST", body: { action: "delete", token: onboardToken, id: doc.id } });
  else await call(`/api/staff-docs?id=${encodeURIComponent(doc.id)}`, { method: "DELETE", admin: true });
}

// ── Training certificates ───────────────────────────────────────────────────
// kiosk: { staffId, pin } on the kiosk /training page; omit for Admin. -> the updated training_records row
export async function attachTrainingCert(record, file, kiosk = null) {
  const ext = extOf(file);
  if (kiosk) {
    const base = { staff_id: kiosk.staffId, pin: kiosk.pin, record_id: record.id };
    const t = await call("/api/training-certs/kiosk", { method: "POST", body: { ...base, action: "upload-url", ext } });
    await putFile(CERT_BUCKET, t.path, t.token, file);
    return (await call("/api/training-certs/kiosk", { method: "POST", body: { ...base, action: "attach", path: t.path, filename: file.name } })).record;
  }
  const t = await call("/api/training-certs", { method: "POST", admin: true, body: { action: "upload-url", record_id: record.id, ext } });
  await putFile(CERT_BUCKET, t.path, t.token, file);
  return (await call("/api/training-certs", { method: "POST", admin: true, body: { action: "attach", record_id: record.id, path: t.path, filename: file.name } })).record;
}

export const openTrainingCert = (record, kiosk = null) => openSignedUrl(async () => (kiosk
  ? await call("/api/training-certs/kiosk", { method: "POST", body: { action: "url", staff_id: kiosk.staffId, pin: kiosk.pin, record_id: record.id } })
  : await call(`/api/training-certs?id=${encodeURIComponent(record.id)}`, { admin: true })).url);

// Admin: delete a training record and its certificate file
export const deleteTrainingRecord = (record) =>
  call(`/api/training-certs?id=${encodeURIComponent(record.id)}`, { method: "DELETE", admin: true });
