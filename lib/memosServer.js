// SERVER-SIDE ONLY. Staff memo helpers shared by /api/memos (QSPP managers) and /api/memos/contribute (asked staff).
// Section saves are version-checked: the browser sends `base` (the section's updated_at when it last loaded or saved);
// if someone else has saved since, nothing is written and a 409 comes back with their version, so neither the manager's
// autosave nor the asked person's Save can overwrite the other's text.
import supabaseAdmin from "./supabaseAdmin";
import { sendPushToStaff } from "./pushServer";
import { MEMO_BUCKET, IMAGE_EXTS, ATTACHMENT_EXTS, sectionHasContent, defaultAskHeading, sectionShown } from "./memos";

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
// per person); askerId: the manager asking.
// -> { sections, asked: [{ staff_id, section_id }] } — asked = the people newly asked or asked again this time (they get
//    the push); anyone already asked and still open isn't in it
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
  const newlyAsked = [];
  for (const p of asked) {
    const slot = existing.find((s) => Number(s.requested_staff_id) === Number(p.id));
    if (slot) {
      if (slot.declined_at) {
        const { error: e } = await db.from("staff_memo_sections")
          .update({ declined_at: null, requested_at: now(), requested_by_staff_id: askerId, updated_at: now(), ...noteFor(p.id) })
          .eq("id", slot.id);
        if (e) throw e;
        newlyAsked.push({ staff_id: Number(p.id), section_id: slot.id });
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
    const { data: inserted, error: e } = await db.from("staff_memo_sections").insert(rows).select("id, requested_staff_id");
    if (e) throw e;
    for (const r of inserted || []) newlyAsked.push({ staff_id: Number(r.requested_staff_id), section_id: r.id });
  }
  await touchMemo(db, memoId);
  return { sections: await loadSections(db, [memoId]), asked: newlyAsked };
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

// ── Stage 4: policies to read + dates ─────────────────────────────────────────
// Policies: staff_memo_policies -> QSPP library documents. Dates: staff_memo_dates (calendar events made on Send).

// -> [{ id, memo_id, document_id, sort_order, title, version, pdf_url, active }]
export async function loadMemoPolicies(db, memoIds) {
  if (!memoIds.length) return [];
  const { data, error } = await db.from("staff_memo_policies").select("id, memo_id, document_id, sort_order")
    .eq("pharmacy_id", PHARMACY_ID).in("memo_id", memoIds).order("sort_order");
  if (error) throw error;
  const docIds = [...new Set((data || []).map((p) => p.document_id))];
  const { data: docs, error: dErr } = docIds.length
    ? await db.from("pharmacy_documents").select("id, title, version, pdf_url, active").in("id", docIds)
    : { data: [] };
  if (dErr) throw dErr;
  const docOf = Object.fromEntries((docs || []).map((d) => [d.id, d]));
  return (data || []).map((p) => ({
    ...p, title: docOf[p.document_id]?.title || "Policy", version: docOf[p.document_id]?.version || "",
    pdf_url: docOf[p.document_id]?.pdf_url || null, active: docOf[p.document_id]?.active !== false,
  }));
}

// -> [{ id, memo_id, title, start_date, end_date, category_id, category_name, category_colour, event_id }] (by date)
export async function loadMemoDates(db, memoIds) {
  if (!memoIds.length) return [];
  const { data, error } = await db.from("staff_memo_dates").select("id, memo_id, title, start_date, end_date, category_id, sort_order, event_id")
    .eq("pharmacy_id", PHARMACY_ID).in("memo_id", memoIds).order("start_date").order("sort_order");
  if (error) throw error;
  const catIds = [...new Set((data || []).map((d) => d.category_id).filter(Boolean))];
  const { data: cats } = catIds.length ? await db.from("calendar_categories").select("id, name, colour").in("id", catIds) : { data: [] };
  const catOf = Object.fromEntries((cats || []).map((c) => [c.id, c]));
  return (data || []).map((d) => ({ ...d, category_name: catOf[d.category_id]?.name || null, category_colour: catOf[d.category_id]?.colour || null }));
}

// Current (not retired) library documents for "Add a policy to read" -> [{ id, title, version, folder }]
export async function policyOptions(db) {
  const [{ data: docs, error }, { data: folders }] = await Promise.all([
    db.from("pharmacy_documents").select("id, title, version, folder_id, active").eq("pharmacy_id", PHARMACY_ID).eq("active", true).order("title"),
    db.from("document_folders").select("id, name").eq("pharmacy_id", PHARMACY_ID),
  ]);
  if (error) throw error;
  const folderOf = Object.fromEntries((folders || []).map((f) => [f.id, f.name]));
  return (docs || []).map((d) => ({ id: d.id, title: d.title, version: d.version || "", folder: folderOf[d.folder_id] || "" }));
}

// On Send: normal policy read requests (lib/policyReads.js system) for each recipient × current policy, skipping anyone
// who already has an outstanding request for it. -> number created
export async function requestMemoPolicies(db, memo, recipientIds, managerId) {
  const policies = (await loadMemoPolicies(db, [memo.id])).filter((p) => p.active);
  if (!policies.length || !recipientIds.length) return 0;
  const docIds = policies.map((p) => p.document_id);
  const { data: open, error } = await db.from("policy_read_requests").select("document_id, staff_id")
    .eq("pharmacy_id", PHARMACY_ID).eq("status", "outstanding").in("document_id", docIds).in("staff_id", recipientIds);
  if (error) throw error;
  const have = new Set((open || []).map((r) => `${r.document_id}:${Number(r.staff_id)}`));
  const at = now();
  const rows = [];
  for (const p of policies) {
    for (const sid of recipientIds) {
      if (have.has(`${p.document_id}:${Number(sid)}`)) continue;
      rows.push({ pharmacy_id: PHARMACY_ID, document_id: p.document_id, staff_id: Number(sid), requested_by: managerId, requested_at: at, status: "outstanding" });
    }
  }
  if (!rows.length) return 0;
  const { error: iErr } = await db.from("policy_read_requests").insert(rows);
  if (iErr) throw iErr;
  return rows.length;
}

// On Send: a What's on event per memo date, linked to the memo (calendar_events.memo_id) -> number created
export async function createMemoEvents(db, memo, managerId) {
  const dates = await loadMemoDates(db, [memo.id]);
  let made = 0;
  for (const d of dates) {
    if (d.event_id) continue;
    const { data: ev, error } = await db.from("calendar_events").insert([{
      pharmacy_id: PHARMACY_ID, title: d.title, category_id: d.category_id || null, start_date: d.start_date,
      end_date: d.end_date && d.end_date !== d.start_date ? d.end_date : null, repeats_yearly: false, memo_id: memo.id,
      created_by_staff_id: managerId, updated_by_staff_id: managerId,
    }]).select("id").single();
    if (error) throw error;
    await db.from("staff_memo_dates").update({ event_id: ev.id }).eq("id", d.id);
    made += 1;
  }
  return made;
}

// ── Stage 3: sending and reading ──────────────────────────────────────────────

// Who a memo goes to: active staff (not locums) — everyone, only these roles, or only these people -> [staff ids]
//   mode "all" | "roles" (roles) | "people" (staffIds)
export async function memoRecipientIds(db, roles, mode = null, staffIds = []) {
  const { data, error } = await db.from("staff").select("id, role, active")
    .eq("pharmacy_id", PHARMACY_ID).eq("active", true).or("role.is.null,role.neq.Locum");
  if (error) throw error;
  const m = mode || (Array.isArray(roles) && roles.length ? "roles" : "all");
  if (m === "people") {
    const want = new Set((staffIds || []).map(Number));
    return (data || []).filter((s) => want.has(Number(s.id))).map((s) => Number(s.id));
  }
  const want = m === "roles" ? new Set((roles || []).map(String)) : null;
  return (data || []).filter((s) => !want || want.has(String(s.role || ""))).map((s) => Number(s.id));
}

// Sent to roles / chosen people = private: only its recipients (and managers in manager mode) can see it. Imported
// memos and memos sent to all staff are for everyone.
export const isPrivateMemo = (memo) => !!memo && !memo.imported && memo.send_to && memo.send_to !== "all";

// Can this person read the memo? (non-managers; managers are checked with their PIN by the caller)
export async function canStaffRead(db, memo, staffId) {
  if (memo.status !== "sent") return false;
  if (!isPrivateMemo(memo)) return true;
  return staffId ? isRecipient(db, memo.id, staffId) : false;
}

// A sent memo as staff see it -> { memo (+ sent_by_name), sections, policies, dates, updates }
export async function sentMemoPayload(db, memo) {
  const [sections, policies, dates, updates, { data: sender }] = await Promise.all([
    loadSections(db, [memo.id]).then((rows) => rows.filter(sectionShown).map(memoOnly)),
    loadMemoPolicies(db, [memo.id]), loadMemoDates(db, [memo.id]), loadMemoUpdates(db, [memo.id]),
    memo.sent_by_staff_id ? db.from("staff").select("name").eq("id", Number(memo.sent_by_staff_id)).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return { memo: { ...memo, sent_by_name: sender?.name || null }, sections, policies, dates, updates };
}

// Recipients of a memo -> [staff ids]
export async function recipientIdsOf(db, memoId) {
  const { data, error } = await db.from("staff_memo_recipients").select("staff_id").eq("pharmacy_id", PHARMACY_ID).eq("memo_id", memoId);
  if (error) throw error;
  return (data || []).map((r) => Number(r.staff_id));
}

// Delete is offered on a sent memo only when its one recipient is the manager who sent it
export async function onlySentToSender(db, memo) {
  if (memo.status !== "sent" || memo.imported || !memo.sent_by_staff_id) return false;
  const ids = await recipientIdsOf(db, memo.id);
  return ids.length === 1 && ids[0] === Number(memo.sent_by_staff_id);
}

// Remove everything a sent memo created: policy read requests from its Send (the sender's own requests for its
// policies, made within 2 minutes of sending), calendar events, any old Wall post, files, then the memo (sections,
// recipients, seen, policies, dates, replies, updates — cascade). Only after onlySentToSender.
export async function deleteSentMemo(db, memo) {
  const sender = Number(memo.sent_by_staff_id);
  const [sections, policies] = await Promise.all([loadSections(db, [memo.id]), loadMemoPolicies(db, [memo.id])]);
  if (policies.length && memo.sent_at) {
    const until = new Date(new Date(memo.sent_at).getTime() + 2 * 60 * 1000).toISOString();
    const { error } = await db.from("policy_read_requests").delete()
      .eq("pharmacy_id", PHARMACY_ID).eq("staff_id", sender).eq("requested_by", sender)
      .in("document_id", policies.map((p) => p.document_id)).gte("requested_at", memo.sent_at).lte("requested_at", until);
    if (error) throw error;
  }
  const { error: eErr } = await db.from("calendar_events").delete().eq("pharmacy_id", PHARMACY_ID).eq("memo_id", memo.id);
  if (eErr) throw eErr;
  const { error: nErr } = await db.from("kiosk_notes").delete().eq("pharmacy_id", PHARMACY_ID).eq("memo_id", memo.id);
  if (nErr) throw nErr;
  // Every file in the memo's folder (also catches images taken out of a section before Send)
  const { data: files } = await db.storage.from(MEMO_BUCKET).list(memo.id, { limit: 1000 });
  await removeFiles(db, [...new Set([...sections.flatMap(filePaths), ...(files || []).map((f) => `${memo.id}/${f.name}`)])]);
  const { error } = await db.from("staff_memos").delete().eq("id", memo.id).eq("pharmacy_id", PHARMACY_ID).eq("status", "sent").eq("imported", false);
  if (error) throw error;
}

// Is this person one of the memo's recipients?
export async function isRecipient(db, memoId, staffId) {
  const { data, error } = await db.from("staff_memo_recipients").select("id")
    .eq("pharmacy_id", PHARMACY_ID).eq("memo_id", memoId).eq("staff_id", Number(staffId)).maybeSingle();
  if (error) throw error;
  return !!data;
}

// Seen = opened. First time only (the first open is the one that counts). via: "kiosk" | "phone".
// Only for recipients of a sent memo; anyone else opening it records nothing. -> true when recorded / already seen
export async function markSeen(db, memoId, staffId, via) {
  const memo = await loadMemo(db, memoId);
  if (memo.status !== "sent" || memo.imported) return false;
  if (!(await isRecipient(db, memo.id, staffId))) return false;
  const { error } = await db.from("staff_memo_seen").upsert(
    [{ pharmacy_id: PHARMACY_ID, memo_id: memo.id, staff_id: Number(staffId), seen_via: via === "kiosk" ? "kiosk" : "phone", seen_at: now() }],
    { onConflict: "memo_id,staff_id", ignoreDuplicates: true },
  );
  if (error) throw error;
  return true;
}

// Seen-by for sent memos (managers only): { [memoId]: [{ staff_id, name, seen_at, seen_via }] }
export async function seenByFor(db, memoIds) {
  if (!memoIds.length) return {};
  const [{ data: recs, error: rErr }, { data: seen, error: sErr }] = await Promise.all([
    db.from("staff_memo_recipients").select("memo_id, staff_id").eq("pharmacy_id", PHARMACY_ID).in("memo_id", memoIds),
    db.from("staff_memo_seen").select("memo_id, staff_id, seen_at, seen_via").eq("pharmacy_id", PHARMACY_ID).in("memo_id", memoIds),
  ]);
  if (rErr) throw rErr;
  if (sErr) throw sErr;
  const ids = [...new Set((recs || []).map((r) => Number(r.staff_id)))];
  const { data: people } = ids.length ? await db.from("staff").select("id, name").in("id", ids) : { data: [] };
  const nameOf = Object.fromEntries((people || []).map((p) => [Number(p.id), p.name]));
  const seenOf = Object.fromEntries((seen || []).map((s) => [`${s.memo_id}:${Number(s.staff_id)}`, s]));
  const out = {};
  for (const r of recs || []) {
    const s = seenOf[`${r.memo_id}:${Number(r.staff_id)}`];
    (out[r.memo_id] ||= []).push({ staff_id: Number(r.staff_id), name: nameOf[Number(r.staff_id)] || "Former staff", seen_at: s?.seen_at || null, seen_via: s?.seen_via || null });
  }
  for (const list of Object.values(out)) list.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

// ── Replies: one PRIVATE thread per staff member per memo (staff_memo_replies) ───────────────────────────────
// A staff member sees only their own thread; QSPP managers (manager mode) see every thread and answer in it. Not a
// group chat — nobody else's replies are ever returned to staff. read_at: on a staff message = a manager opened the
// thread; on a manager's answer = the staff member has read it.
const cleanReply = (body) => {
  const text = String(body || "").replace(/\r\n?/g, "\n").trim().slice(0, 2000);
  if (!text) throw httpError(400, "Write something first.");
  return text;
};
const firstName = (name) => String(name || "").split(" ")[0] || "Someone";

async function namesOf(db, ids) {
  const want = [...new Set(ids.filter(Boolean).map(Number))];
  if (!want.length) return {};
  const { data } = await db.from("staff").select("id, name").in("id", want);
  return Object.fromEntries((data || []).map((p) => [Number(p.id), p.name]));
}

// One person's thread on a memo -> [{ id, from_manager, author_name, body, created_at, read_at }] (oldest first)
export async function threadOf(db, memoId, staffId) {
  const { data, error } = await db.from("staff_memo_replies").select("id, staff_id, author_staff_id, from_manager, body, created_at, read_at")
    .eq("pharmacy_id", PHARMACY_ID).eq("memo_id", memoId).eq("staff_id", Number(staffId)).order("created_at", { ascending: true });
  if (error) throw error;
  const names = await namesOf(db, (data || []).map((r) => r.author_staff_id));
  return (data || []).map((r) => ({
    id: r.id, from_manager: r.from_manager, author_name: names[Number(r.author_staff_id)] || (r.from_manager ? "Manager" : "Someone"),
    body: r.body, created_at: r.created_at, read_at: r.read_at,
  }));
}

// The staff member opened their thread: managers' answers are now read (the memo stops showing as unread in /me)
export async function markAnswersRead(db, memoId, staffId) {
  const { error } = await db.from("staff_memo_replies").update({ read_at: now() })
    .eq("pharmacy_id", PHARMACY_ID).eq("memo_id", memoId).eq("staff_id", Number(staffId)).eq("from_manager", true).is("read_at", null);
  if (error) throw error;
}

// A staff member replies on a memo they can read -> their thread. Push to the manager who sent the memo.
export async function addStaffReply(db, memo, staff, body) {
  const text = cleanReply(body);
  const { error } = await db.from("staff_memo_replies").insert([{
    pharmacy_id: PHARMACY_ID, memo_id: memo.id, staff_id: Number(staff.id), author_staff_id: Number(staff.id), from_manager: false, body: text,
  }]);
  if (error) throw error;
  if (memo.sent_by_staff_id) {
    try {
      await sendPushToStaff(db, [memo.sent_by_staff_id], {
        title: `${firstName(staff.name)} replied to the ${memo.title}`,
        body: text.length > 120 ? `${text.slice(0, 120)}…` : text,
        url: `/messages?tab=memos&memo=${memo.id}`,
      });
    } catch (e) { console.error("[memos] reply push failed", e); }
  }
  return threadOf(db, memo.id, staff.id);
}

// Managers: every thread on a memo, newest activity first -> [{ staff_id, name, messages, unread, last_at }]
export async function managerThreads(db, memoId) {
  const { data, error } = await db.from("staff_memo_replies").select("id, staff_id, author_staff_id, from_manager, body, created_at, read_at")
    .eq("pharmacy_id", PHARMACY_ID).eq("memo_id", memoId).order("created_at", { ascending: true });
  if (error) throw error;
  const names = await namesOf(db, (data || []).flatMap((r) => [r.staff_id, r.author_staff_id]));
  const byStaff = new Map();
  for (const r of data || []) {
    const sid = Number(r.staff_id);
    if (!byStaff.has(sid)) byStaff.set(sid, { staff_id: sid, name: names[sid] || "Former staff", messages: [], unread: 0, last_at: r.created_at });
    const t = byStaff.get(sid);
    t.messages.push({ id: r.id, from_manager: r.from_manager, author_name: names[Number(r.author_staff_id)] || "Someone", body: r.body, created_at: r.created_at, read_at: r.read_at });
    if (!r.from_manager && !r.read_at) t.unread += 1;
    t.last_at = r.created_at;
  }
  return [...byStaff.values()].sort((a, b) => String(b.last_at).localeCompare(String(a.last_at)));
}

// Managers opened a thread: its staff messages are read
export async function markThreadRead(db, memoId, staffId) {
  const { error } = await db.from("staff_memo_replies").update({ read_at: now() })
    .eq("pharmacy_id", PHARMACY_ID).eq("memo_id", memoId).eq("staff_id", Number(staffId)).eq("from_manager", false).is("read_at", null);
  if (error) throw error;
}

// A manager answers in one person's thread (only that person sees it). Push to them; the memo shows unread in /me.
export async function addManagerAnswer(db, memo, staffId, manager, body) {
  const text = cleanReply(body);
  const { count, error: cErr } = await db.from("staff_memo_replies").select("id", { count: "exact", head: true })
    .eq("pharmacy_id", PHARMACY_ID).eq("memo_id", memo.id).eq("staff_id", Number(staffId));
  if (cErr) throw cErr;
  if (!count) throw httpError(404, "That person hasn't replied to this memo.");
  const { error } = await db.from("staff_memo_replies").insert([{
    pharmacy_id: PHARMACY_ID, memo_id: memo.id, staff_id: Number(staffId), author_staff_id: Number(manager.id), from_manager: true, body: text,
  }]);
  if (error) throw error;
  await markThreadRead(db, memo.id, staffId);
  try {
    await sendPushToStaff(db, [staffId], {
      title: `${firstName(manager.name)} answered your reply to the ${memo.title}`,
      body: text.length > 120 ? `${text.slice(0, 120)}…` : text,
      url: `/me?p=byford&tab=messages&memo=${memo.id}`,
    });
  } catch (e) { console.error("[memos] answer push failed", e); }
  return managerThreads(db, memo.id);
}

// Managers: replies per memo for the Staff memos list -> { [memoId]: { total, unread } } (staff messages only)
export async function replySummary(db) {
  const { data, error } = await db.from("staff_memo_replies").select("memo_id, read_at").eq("pharmacy_id", PHARMACY_ID).eq("from_manager", false);
  if (error) throw error;
  const out = {};
  for (const r of data || []) {
    const s = (out[r.memo_id] ||= { total: 0, unread: 0 });
    s.total += 1;
    if (!r.read_at) s.unread += 1;
  }
  return out;
}

// ── Updates: a manager's update / correction on a sent memo (staff_memo_updates) — shown under the memo to everyone
//    who can see it, and in the PDF ──
// -> [{ id, memo_id, body, created_at, author_name }] oldest first
export async function loadMemoUpdates(db, memoIds) {
  if (!memoIds.length) return [];
  const { data, error } = await db.from("staff_memo_updates").select("id, memo_id, author_staff_id, body, created_at")
    .eq("pharmacy_id", PHARMACY_ID).in("memo_id", memoIds).order("created_at", { ascending: true });
  if (error) throw error;
  const names = await namesOf(db, (data || []).map((u) => u.author_staff_id));
  return (data || []).map((u) => ({ id: u.id, memo_id: u.memo_id, body: u.body, created_at: u.created_at, author_name: names[Number(u.author_staff_id)] || "Manager" }));
}

// Add an update (managers). notify = push to the memo's recipients. -> the memo's updates
export async function addMemoUpdate(db, memo, manager, body, notify) {
  if (memo.status !== "sent") throw httpError(409, "Updates are only for sent memos.");
  const text = cleanReply(body);
  const { error } = await db.from("staff_memo_updates").insert([{ pharmacy_id: PHARMACY_ID, memo_id: memo.id, author_staff_id: Number(manager.id), body: text }]);
  if (error) throw error;
  if (notify && !memo.imported) {
    try {
      await sendPushToStaff(db, await recipientIdsOf(db, memo.id), {
        title: `Update to the ${memo.title}`,
        body: text.length > 120 ? `${text.slice(0, 120)}…` : text,
        url: `/me?p=byford&tab=messages&memo=${memo.id}`,
      });
    } catch (e) { console.error("[memos] update push failed", e); }
  }
  return loadMemoUpdates(db, [memo.id]);
}

// Sent memos this person received, newest first -> [{ id, title, sent_at, topics, seen, new_answer, unread }]
//   unread = not opened yet, or a manager has answered their reply since they last looked
export async function myMemos(db, staffId) {
  const { data: recs, error } = await db.from("staff_memo_recipients").select("memo_id")
    .eq("pharmacy_id", PHARMACY_ID).eq("staff_id", Number(staffId));
  if (error) throw error;
  const ids = (recs || []).map((r) => r.memo_id);
  if (!ids.length) return [];
  const [{ data: memos, error: mErr }, { data: seen, error: sErr }, { data: answers, error: aErr }] = await Promise.all([
    db.from("staff_memos").select("id, title, sent_at, topics").in("id", ids).eq("status", "sent").order("sent_at", { ascending: false }),
    db.from("staff_memo_seen").select("memo_id").eq("pharmacy_id", PHARMACY_ID).eq("staff_id", Number(staffId)).in("memo_id", ids),
    db.from("staff_memo_replies").select("memo_id").eq("pharmacy_id", PHARMACY_ID).eq("staff_id", Number(staffId))
      .eq("from_manager", true).is("read_at", null).in("memo_id", ids),
  ]);
  if (mErr) throw mErr;
  if (sErr) throw sErr;
  if (aErr) throw aErr;
  const seenIds = new Set((seen || []).map((s) => s.memo_id));
  const answered = new Set((answers || []).map((a) => a.memo_id));
  return (memos || []).map((m) => {
    const isSeen = seenIds.has(m.id);
    const newAnswer = answered.has(m.id);
    return { ...m, seen: isSeen && !newAnswer, opened: isSeen, new_answer: newAnswer };
  });
}

// Kiosk "Read the [title]" jobs: recipients (of these staff) who haven't opened it -> [{ memo_id, staff_id, memo_title }]
export async function unseenMemoJobs(db, staffIds) {
  const ids = (staffIds || []).map(Number).filter(Boolean);
  if (!ids.length) return [];
  const { data: recs, error } = await db.from("staff_memo_recipients").select("memo_id, staff_id")
    .eq("pharmacy_id", PHARMACY_ID).in("staff_id", ids);
  if (error) throw error;
  const memoIds = [...new Set((recs || []).map((r) => r.memo_id))];
  if (!memoIds.length) return [];
  const [{ data: memos, error: mErr }, { data: seen, error: sErr }] = await Promise.all([
    db.from("staff_memos").select("id, title, sent_at, imported").in("id", memoIds).eq("status", "sent").eq("imported", false),
    db.from("staff_memo_seen").select("memo_id, staff_id").eq("pharmacy_id", PHARMACY_ID).in("memo_id", memoIds).in("staff_id", ids),
  ]);
  if (mErr) throw mErr;
  if (sErr) throw sErr;
  const memoOf = Object.fromEntries((memos || []).map((m) => [m.id, m]));
  const seenSet = new Set((seen || []).map((s) => `${s.memo_id}:${Number(s.staff_id)}`));
  return (recs || []).filter((r) => memoOf[r.memo_id] && !seenSet.has(`${r.memo_id}:${Number(r.staff_id)}`))
    .sort((a, b) => String(memoOf[b.memo_id].sent_at).localeCompare(String(memoOf[a.memo_id].sent_at)))
    .map((r) => ({ memo_id: r.memo_id, staff_id: Number(r.staff_id), memo_title: memoOf[r.memo_id].title }));
}

export { supabaseAdmin };
