// QSPP library — document actions for /qspp manager mode (same rules as the old Admin → QSPP → Documents tab).
// Browser client (RLS off). Bucket pharmacy-documents. Every document has a MASTER (file_url / file_name — admin only)
// and a STAFF PDF (pdf_url / pdf_file_name); a PDF master is its own staff PDF (lib/docFolders).
// active = false means retired (archived): hidden from staff and the main library; read records are kept.
import { isPdfName, storageSafeName, titleFromFileName } from "./docFolders";

export const DOC_BUCKET = "pharmacy-documents";
export const slugify = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "folder";

export const storagePathFromUrl = (url) => {
  if (!url) return null;
  const marker = `/${DOC_BUCKET}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
};

// Upload new documents into a folder (one row + "First version" history each). -> new rows
export async function uploadDocuments(supabase, { pharmacyId, folder, files, staffId }) {
  const rows = [];
  const slug = slugify(folder.name);
  for (const file of files) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const path = `${slug}/${Date.now()}_${safeName}`;
    const { error: upErr } = await supabase.storage.from(DOC_BUCKET).upload(path, file, { upsert: true });
    if (upErr) throw upErr;
    const { data: urlData } = supabase.storage.from(DOC_BUCKET).getPublicUrl(path);
    const now = new Date().toISOString();
    const who = Number(staffId);
    // A PDF master is its own staff PDF; Word / Excel need a PDF uploaded (Replace files) before staff can open them
    const pdf = isPdfName(file.name)
      ? { pdf_url: urlData.publicUrl, pdf_file_name: path, pdf_updated_at: now, pdf_updated_by_staff_id: who }
      : {};
    const { data: row, error: insErr } = await supabase.from("pharmacy_documents").insert([{
      pharmacy_id: pharmacyId, folder_id: folder.id, title: titleFromFileName(file.name),
      file_url: urlData.publicUrl, file_name: path, version: "1.0",
      uploaded_by: who, updated_by_staff_id: who, updated_at: now, ...pdf,
    }]).select().single();
    if (insErr) throw insErr;
    rows.push(row);
    const { error: verErr } = await supabase.from("document_versions").insert([{
      pharmacy_id: pharmacyId, document_id: row.id, version: "1.0", file_name: path, file_url: urlData.publicUrl,
      pdf_file_name: pdf.pdf_file_name || null, pdf_url: pdf.pdf_url || null,
      updated_by_staff_id: who, change_note: "First version", created_at: now,
    }]);
    if (verErr) throw verErr;
  }
  return rows;
}

// Replace the master, the staff PDF, or both. New storage path every time; old files are never deleted.
// A PDF master with no separate PDF becomes the staff PDF too. A new Word / Excel master with no new PDF keeps the old
// PDF (flagged "older than the master"). Read requests are never reset. -> the changed fields
export async function replaceFiles(supabase, { pharmacyId, doc, folderName, masterFile, pdfFile, version, staffId, note }) {
  const dir = (doc.file_name || "").includes("/")
    ? doc.file_name.slice(0, doc.file_name.lastIndexOf("/"))
    : slugify(folderName || "folder");
  const put = async (file) => {
    const path = `${dir}/${Date.now()} - ${storageSafeName(file.name)}`;
    const { error: upErr } = await supabase.storage.from(DOC_BUCKET).upload(path, file, { upsert: false });
    if (upErr) throw upErr;
    return { path, url: supabase.storage.from(DOC_BUCKET).getPublicUrl(path).data.publicUrl };
  };
  const now = new Date().toISOString();
  const who = Number(staffId);
  const changes = {};
  if (masterFile) {
    const m = await put(masterFile);
    Object.assign(changes, { file_url: m.url, file_name: m.path, version, updated_by_staff_id: who, updated_at: now });
    if (!pdfFile && isPdfName(masterFile.name)) {
      Object.assign(changes, { pdf_url: m.url, pdf_file_name: m.path, pdf_updated_at: now, pdf_updated_by_staff_id: who });
    }
  }
  if (pdfFile) {
    const p = await put(pdfFile);
    Object.assign(changes, { pdf_url: p.url, pdf_file_name: p.path, pdf_updated_at: now, pdf_updated_by_staff_id: who });
  }
  const { error: updErr } = await supabase.from("pharmacy_documents").update(changes).eq("id", doc.id);
  if (updErr) throw updErr;
  const after = { ...doc, ...changes };
  const { error: verErr } = await supabase.from("document_versions").insert([{
    pharmacy_id: pharmacyId, document_id: doc.id, version: after.version || "1.0",
    file_name: after.file_name, file_url: after.file_url, pdf_file_name: after.pdf_file_name || null, pdf_url: after.pdf_url || null,
    updated_by_staff_id: who, change_note: String(note || "").trim() || (masterFile ? null : "Staff PDF updated"), created_at: now,
  }]);
  if (verErr) throw new Error("Files saved, but the history entry failed: " + verErr.message);
  return changes;
}

export async function loadHistory(supabase, docId) {
  const { data, error } = await supabase.from("document_versions").select("*").eq("document_id", docId).order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

// Simple field changes (title, folder_id, review_date)
export async function updateDoc(supabase, docId, changes) {
  const { error } = await supabase.from("pharmacy_documents").update(changes).eq("id", docId);
  if (error) throw error;
  return changes;
}

// Retire = archive: hidden from staff and the main library, outstanding read requests cancelled, read records kept.
// -> { changes, warning }
export async function retireDoc(supabase, { doc, staffId, reason }) {
  const now = new Date().toISOString();
  const who = staffId ? Number(staffId) : null;
  const changes = { active: false, retired_at: now, retired_by_staff_id: who, retired_reason: String(reason || "").trim().slice(0, 300) || null };
  const { error } = await supabase.from("pharmacy_documents").update(changes).eq("id", doc.id);
  if (error) throw error;
  const { error: cErr } = await supabase.from("policy_read_requests")
    .update({ status: "cancelled", cancelled_by: who, cancelled_at: now })
    .eq("document_id", doc.id).eq("status", "outstanding");
  return { changes, warning: cErr ? "Retired, but its outstanding read requests couldn't be cancelled: " + cErr.message : "" };
}

// Restore = back in its folder for staff. Cancelled requests stay cancelled (send a new one with "Ask staff to read").
export async function restoreDoc(supabase, doc) {
  const changes = { active: true, retired_at: null, retired_by_staff_id: null, retired_reason: null };
  const { error } = await supabase.from("pharmacy_documents").update(changes).eq("id", doc.id);
  if (error) throw error;
  return changes;
}

// Delete (mistakes only): the row, its versions (cascade) and every file — masters and staff PDFs. -> warning text or ""
export async function deleteDoc(supabase, doc) {
  const { data: versions, error: vErr } = await supabase.from("document_versions")
    .select("file_name, file_url, pdf_file_name, pdf_url").eq("document_id", doc.id);
  if (vErr) throw vErr;
  const paths = new Set();
  for (const v of [...(versions || []), doc]) {
    const p = v.file_name || storagePathFromUrl(v.file_url);
    if (p) paths.add(p);
    const q = v.pdf_file_name || storagePathFromUrl(v.pdf_url);
    if (q) paths.add(q);
  }
  const { error: delErr } = await supabase.from("pharmacy_documents").delete().eq("id", doc.id);
  if (delErr) throw delErr;
  if (paths.size) {
    const { error: rmErr } = await supabase.storage.from(DOC_BUCKET).remove([...paths]);
    if (rmErr) return "Document deleted, but some files couldn't be removed from storage: " + rmErr.message;
  }
  return "";
}

// ── Folders ──
export async function addFolder(supabase, { pharmacyId, name, group, sortOrder }) {
  const { data, error } = await supabase.from("document_folders")
    .insert([{ pharmacy_id: pharmacyId, name: name.trim(), group_name: String(group || "").trim() || null, sort_order: sortOrder }])
    .select().single();
  if (error) throw error;
  return data;
}
export async function renameFolder(supabase, id, { name, group }) {
  const changes = { name: name.trim(), group_name: String(group || "").trim() || null };
  const { error } = await supabase.from("document_folders").update(changes).eq("id", id);
  if (error) throw error;
  return changes;
}
export async function deleteFolder(supabase, id) {
  const { error } = await supabase.from("document_folders").delete().eq("id", id);
  if (error) throw error;
}
