// Browser side of the staff memo routes.
//   memoCall        -> /api/memos (QSPP managers; manager = { id, name, pin } while manager mode is unlocked in Staff
//                      memos — the PIN is held in memory only and re-checked by the server)
//   contributeCall  -> /api/memos/contribute (the asked person's own section: /me staff login, or the kiosk's dashboard
//                      login + that person's staff id and own PIN)
// A version clash on a section save throws an Error with .conflict = true and .section = the version someone else saved.
import supabase from "./supabaseClient";
import { adminFetch } from "./adminFetch";
import { MEMO_BUCKET, IMAGE_EXTS, ATTACHMENT_EXTS, MAX_IMAGE_MB, MAX_PDF_MB } from "./memoFiles";

async function parse(res) {
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(out.error || `Something went wrong (${res.status})`), { status: res.status, conflict: !!out.conflict, section: out.section || null });
  return out;
}

// opts.keepalive: the save carries on even if the page is closing (locking / leaving the page). Browsers cap these at
// 64 KB, so a very long section is sent normally instead.
export async function memoCall(body, opts = {}) {
  const json = JSON.stringify(body);
  const keepalive = !!opts.keepalive && json.length < 60000;
  return parse(await fetch("/api/memos", { method: "POST", headers: { "Content-Type": "application/json" }, body: json, keepalive }));
}

// kiosk: { staffId, pin } on the kiosk (the job's person and their own PIN, re-checked by the server); leave out on /me
export async function contributeCall(body, kiosk = null) {
  const payload = kiosk ? { ...body, via: "kiosk", staff_id: Number(kiosk.staffId), pin: String(kiosk.pin || "") } : body;
  return parse(await adminFetch("/api/memos/contribute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }));
}

// Upload one image / PDF straight to storage with a one-time token -> { path, url, name }
//   getTicket(ext) -> { path, token, url } from the right route
export async function uploadMemoFile({ getTicket, kind, file }) {
  const ext = (String(file?.name || "").split(".").pop() || "").toLowerCase();
  const pdf = kind === "pdf";
  if (!(pdf ? ATTACHMENT_EXTS : IMAGE_EXTS).includes(ext)) throw new Error(pdf ? `${file.name}: attachments must be PDFs.` : `${file.name}: please choose a JPG, PNG, WebP or GIF image.`);
  const maxMb = pdf ? MAX_PDF_MB : MAX_IMAGE_MB;
  if (file.size > maxMb * 1024 * 1024) throw new Error(`${file.name} is too big (max ${maxMb} MB).`);
  const { path, token, url } = await getTicket(ext);
  const { error } = await supabase.storage.from(MEMO_BUCKET).uploadToSignedUrl(path, token, file, { contentType: file.type || (pdf ? "application/pdf" : undefined) });
  if (error) throw error;
  return { path, url, name: file.name };
}
