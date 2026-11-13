// SERVER-SIDE ONLY. Staff memo helpers shared by /api/memos (QSPP managers) and /api/memos/contribute (asked staff).
// Section saves are version-checked: the browser sends `base` (the section's updated_at when it last loaded or saved);
// if someone else has saved since, nothing is written and a 409 comes back with their version, so neither the manager's
// autosave nor the asked person's Save can overwrite the other's text.
import supabaseAdmin from "./supabaseAdmin";
import { MEMO_BUCKET, IMAGE_EXTS, ATTACHMENT_EXTS, sectionHasContent, defaultAskHeading } from "./memos";

export const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";
export const httpError = (status, message, extra) => Object.assign(new Error(message), { status }, extra || {});
export const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj && Object.prototype.hasOwnProperty.call(obj, k)).map((k) => [k, obj[k]]));
export const now = () => new Date().toISOString();

export const sendError = (res, tag, err) => {
  if (!err?.status || err.status >= 500) console.error(tag, err);
  res.status(err?.status || 500).json({ error: err?.message || "Something went wrong", ...(err?.section ? { conflict: true, section: err.section } : {}) });
};

export async function loadMemo(db, id) {
  const { data, error } = await db.from("staff_memos").select("*").eq("id", id).eq("pharmacy_id", PHARMACY_ID).maybeSingle();
  if (error) throw error;
  if (!data) throw httpError(404, "That memo wasn't found.");
  return data;
}

export async function loadDraft(db, id) {
  const memo = await loadMemo(db, id);
  if (memo.status !== "draft") throw httpError(409, "This memo has been sent — it can't be changed now.");
  return memo;
}

export async function loadSections(db, memoIds) {
  if (!memoIds.length) return [];
  const { data, error } = await db.from("staff_memo_sections").select("*").eq("pharmacy_id", PHARMACY_ID).in("memo_id", memoIds).order("sort_order");
  if (error) throw error;
  return data || [];
}

export async function loadSection(db, id) {
  const { data, error } = await db.from("staff_memo_sections").select("*").eq("id", id).eq("pharmacy_id", PHARMACY_ID).maybeSingle();
  if (error) throw error;
  if (!data) throw httpError(404, "That section wasn't found — it may have been removed.");
  return data;
}

export const publicUrl = (db, path) => db.storage.from(MEMO_BUCKET).getPublicUrl(path).data.publicUrl;

// Images / PDFs from the browser: only files in this memo's folder, url always worked out here
export function cleanFiles(db, list, memoId, exts) {
  if (!Array.isArray(list)) throw httpError(400, "Bad file list.");
  return list.map((f) => {
    const path = String(f?.path || "");
    const ext = path.split(".").pop().toLowerCase();
    if (!path.startsWith(`${memoId}/`) || path.includes("..") || !exts.includes(ext)) throw httpError(400, "Bad file.");
    return { path, url: publicUrl(db, path), name: String(f?.name || path.split("/").pop()).slice(0, 200) };
  });
}

export async function removeFiles(db, paths) {
  const list = paths.filter(Boolean);
  if (list.length) await db.storage.from(MEMO_BUCKET).remove(list); // best effort — a stray file is harmless
}
export const filePaths = (s) => [...(s.images || []), ...(s.attachments || [])].map((f) => f.path);

// One-time upload token for an image / PDF in this memo's folder -> { path, token, url }
export async function uploadTicket(db, memoId, kind, ext) {
  const e = String(ext || "").toLowerCase();
  const exts = kind === "pdf" ? ATTACHMENT_EXTS : IMAGE_EXTS;
  if (!exts.includes(e)) throw httpError(400, kind === "pdf" ? "Attachments must be PDFs." : "Please choose a JPG, PNG, WebP or GIF image.");
  const path = `${memoId}/${kind === "pdf" ? "pdf" : "img"}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${e}`;
  const { data, error } = await db.storage.from(MEMO_BUCKET).createSignedUploadUrl(path);
  if (error) throw error;
  const p = data.path || path;
  return { path: p, token: data.token, url: publicUrl(db, p) };
}

// Tidy a section patch (heading / body / signature / author / files)
export function cleanSectionPatch(db, section, patch) {
  const p = { ...patch };
  if ("heading" in p) p.heading = String(p.heading || "").slice(0, 300);
  if ("body" in p) p.body = String(p.body || "").slice(0, 50000);
  if ("signature_name" in p) p.signature_name = String(p.signature_name || "").slice(0, 200) || null;
  if ("signature_role" in p) p.signature_role = String(p.signature_role || "").slice(0, 200) || null;
  if ("author_staff_id" in p) p.author_staff_id = p.author_staff_id ? Number(p.author_staff_id) : null;
  if ("images" in p) p.images = cleanFiles(db, p.images, section.memo_id, IMAGE_EXTS);
  if ("attachments" in p) p.attachments = cleanFiles(db, p.attachments, section.memo_id, ATTACHMENT_EXTS);
  return p;
}

// Save a section only if nobody else has saved since `base`; removes files taken out of it. -> the saved section
export async function saveSectionChecked(db, section, patch, base, extra = {}) {
  if (!base) throw httpError(400, "Please reload — this page is out of date.");
  const { data, error } = await db.from("staff_memo_sections").update({ ...patch, ...extra, updated_at: now() })
    .eq("id", section.id).eq("pharmacy_id", PHARMACY_ID).eq("updated_at", base).select();
  if (error) throw error;
  if (!data?.length) {
    const current = await loadSection(db, section.id);
    throw httpError(409, "Someone else saved this section while you were editing.", { section: current });
  }
  const saved = data[0];
  const kept = new Set(filePaths(saved));
  await removeFiles(db, filePaths(section).filter((p) => !kept.has(p)));
  await touchMemo(db, section.memo_id);
  return saved;
}

export const touchMemo = (db, memoId) => db.from("staff_memos").update({ updated_at: now() }).eq("id", memoId).eq("pharmacy_id", PHARMACY_ID);

// Each person's last heading when they were asked (newest first) -> { [staffId]: heading }
export async function lastAskHeadings(db, staffIds) {
  if (!staffIds.length) return {};
  const { data, error } = await db.from("staff_memo_sections").select("requested_staff_id, heading, requested_at")
    .eq("pharmacy_id", PHARMACY_ID).in("requested_staff_id", staffIds).not("requested_at", "is", null)
    .order("requested_at", { ascending: false }).limit(500);
  if (error) throw error;
  const out = {};
  for (const r of data || []) {
    const id = Number(r.requested_staff_id);
    if (!(id in out) && String(r.heading || "").trim()) out[id] = r.heading.trim();
  }
  return out;
}

// The manager's note to an asked person: plain text, trimmed, max 1000 characters (null = no note)
export const cleanNote = (v) => String(v ?? "").replace(/\r\n?/g, "\n").trim().slice(0, 1000) || null;

// "Ask for a section from…": a slot for each person not already asked on this memo (someone who said "Nothing this
// month" is asked again — their old note is kept unless a new one is given). notes: { [staffId]: "note" } (optional,
// per person); askerId: the manager asking. -> the memo's sections
export async function askForSections(db, memoId, staffIds, notes = {}, askerId = null) {
  const ids = [...new Set((staffIds || []).map(Number).filter(Boolean))];
  if (!ids.length) throw httpError(400, "Tick at least one person.");
  const { data: people, error } = await db.from("staff").select("id, name, role, active")
    .eq("pharmacy_id", PHARMACY_ID).in("id", ids);
  if (error) throw error;
  const asked = (people || []).filter((p) => p.active !== false && p.role !== "Locum");
  const existing = await loadSections(db, [memoId]);
  const headings = await lastAskHeadings(db, asked.map((p) => Number(p.id)));
  const noteFor = (id) => (notes && Object.prototype.hasOwnProperty.call(notes, id) ? { request_note: cleanNote(notes[id]) } : {});
  let order = existing.reduce((m, s) => Math.max(m, Number(s.sort_order) || 0), -1);
  const rows = [];
  for (const p of asked) {
    const slot = existing.find((s) => Number(s.requested_staff_id) === Number(p.id));
    if (slot) {
      if (slot.declined_at) {
        const { error: e } = await db.from("staff_memo_sections")
          .update({ declined_at: null, requested_at: now(), requested_by_staff_id: askerId, updated_at: now(), ...noteFor(p.id) })
          .eq("id", slot.id);
        if (e) throw e;
      }
      continue;
    }
    order += 1;
    rows.push({
      pharmacy_id: PHARMACY_ID, memo_id: memoId, sort_order: order,
      heading: headings[Number(p.id)] || defaultAskHeading(p.name), body: "",
      author_staff_id: Number(p.id), signature_name: p.name, signature_role: p.role || null,
      requested_staff_id: Number(p.id), requested_at: now(), requested_by_staff_id: askerId,
      request_note: null, ...noteFor(p.id),
    });
  }
  if (rows.length) {
    const { error: e } = await db.from("staff_memo_sections").insert(rows);
    if (e) throw e;
  }
  await touchMemo(db, memoId);
  return loadSections(db, [memoId]);
}

// Never part of the memo itself (sent memos, Preview, PDF): the manager's note and who asked
export const memoOnly = (s) => {
  const { request_note, requested_by_staff_id, ...rest } = s; // eslint-disable-line no-unused-vars
  return rest;
};

// Open asks for these people (draft memos, not declined, not written yet) -> [{ section_id, staff_id, memo_id, memo_title }]
export async function openAsks(db, staffIds) {
  if (!staffIds.length) return [];
  const { data: secs, error } = await db.from("staff_memo_sections").select("id, memo_id, requested_staff_id, declined_at, body, images, attachments")
    .eq("pharmacy_id", PHARMACY_ID).in("requested_staff_id", staffIds.map(Number)).is("declined_at", null);
  if (error) throw error;
  const memoIds = [...new Set((secs || []).map((s) => s.memo_id))];
  if (!memoIds.length) return [];
  const { data: memos, error: mErr } = await db.from("staff_memos").select("id, title, status").in("id", memoIds).eq("status", "draft");
  if (mErr) throw mErr;
  const titleOf = Object.fromEntries((memos || []).map((m) => [m.id, m.title]));
  return (secs || []).filter((s) => titleOf[s.memo_id] && !sectionHasContent(s))
    .map((s) => ({ section_id: s.id, staff_id: Number(s.requested_staff_id), memo_id: s.memo_id, memo_title: titleOf[s.memo_id] }));
}

export { supabaseAdmin };
