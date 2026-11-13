// Staff memos — every read of drafts and every manager save goes through here (no login: Messages → Staff memos is used
// on the shop computers). Asked staff write their own section through /api/memos/contribute instead.
//   POST { action, ... }
//     list            { }                          anyone: sent memos (newest first) with their sections
//     get             { id, pin? }                 a sent memo (anyone) or a draft (QSPP manager PIN)
//     drafts          { pin }                      the drafts (title, updated, created by)
//     create          { pin, title }               new draft, created by the person whose PIN it is -> { memo, sections }
//     update-memo     { pin, id, patch }           title / topics (drafts only)
//     delete          { pin, id }                  delete a draft (its sections, images and PDFs go too)
//     add-section     { pin, memo_id }             new empty section at the end, signed by the manager
//     ask             { pin, memo_id, staff_ids, notes? }  "Ask for a section from…" — a slot per person, with an optional
//                                                  note each ({ [staffId]: "…" }) and who asked (lib/memosServer askForSections)
//     update-note     { pin, id, note }            change the note on an asked slot (not section content — no version bump)
//     update-section  { pin, id, base, patch }     heading / text / images / attachments / author / signature. Version-
//                                                  checked: 409 + { conflict, section } if someone saved since `base`
//     move-section    { pin, id, dir: -1 | 1 }     ▲▼
//     delete-section  { pin, id }                  also "Remove the ask" on an asked slot (their job clears)
//     upload-url      { pin, memo_id, kind: "image" | "pdf", ext }  -> { path, token, url } (browser uploadToSignedUrl)
// Sent memos are read-only here (corrections go as a reply or a new memo). Sending is Stage 3.
// The PIN is re-checked on every manager request (lib/adminPin.js checkQsppManagerPin — "QSPP manager" in Admin).
// NOTE: while RLS is off, staff_memos / staff_memo_sections can still be read directly with the public key — closing that
// (drafts readable only through here) is part of the RLS pass.
import { checkQsppManagerPin } from "../../../lib/adminPin";
import { MEMO_FIELDS, SECTION_FIELDS, MEMO_TOPICS, sectionShown } from "../../../lib/memos";
import {
  supabaseAdmin, PHARMACY_ID, httpError, pick, now, sendError, loadMemo, loadDraft, loadSections, loadSection,
  removeFiles, filePaths, uploadTicket, cleanSectionPatch, saveSectionChecked, touchMemo, askForSections, cleanNote, memoOnly,
} from "../../../lib/memosServer";

async function requireManager(db, pin) {
  const user = await checkQsppManagerPin(db, PHARMACY_ID, pin);
  if (!user) throw httpError(403, "QSPP manager PIN needed — unlock 🔒 Manager again.");
  return user;
}

// staff id -> name, for "created by" / "sent by"
async function staffNames(db, ids) {
  const want = [...new Set(ids.filter(Boolean).map(Number))];
  if (!want.length) return {};
  const { data } = await db.from("staff").select("id, name").in("id", want);
  return Object.fromEntries((data || []).map((s) => [Number(s.id), s.name]));
}
const withNames = (memos, names) => memos.map((m) => ({
  ...m,
  created_by_name: names[Number(m.created_by_staff_id)] || null,
  sent_by_name: names[Number(m.sent_by_staff_id)] || null,
}));

// Sections back in 0..n order
async function renumber(db, memoId) {
  const rows = await loadSections(db, [memoId]);
  await Promise.all(rows.map((r, i) => (r.sort_order === i ? null : db.from("staff_memo_sections").update({ sort_order: i }).eq("id", r.id))));
}

async function newSection(db, memoId, manager) {
  const { data: me } = await db.from("staff").select("name, role").eq("id", manager.id).maybeSingle();
  const { data: last } = await db.from("staff_memo_sections").select("sort_order").eq("memo_id", memoId).order("sort_order", { ascending: false }).limit(1);
  const { data, error } = await db.from("staff_memo_sections").insert([{
    pharmacy_id: PHARMACY_ID,
    memo_id: memoId,
    sort_order: last?.length ? Number(last[0].sort_order) + 1 : 0,
    heading: "",
    body: "",
    author_staff_id: manager.id,
    signature_name: me?.name || manager.name,
    signature_role: me?.role || null,
  }]).select().single();
  if (error) throw error;
  return data;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const db = supabaseAdmin();
    const b = req.body || {};

    // ── Anyone ──
    if (b.action === "list") {
      const { data, error } = await db.from("staff_memos").select("*").eq("pharmacy_id", PHARMACY_ID).eq("status", "sent")
        .order("sent_at", { ascending: false });
      if (error) throw error;
      const memos = data || [];
      const sections = (await loadSections(db, memos.map((m) => m.id))).filter(sectionShown).map(memoOnly);
      const names = await staffNames(db, memos.flatMap((m) => [m.created_by_staff_id, m.sent_by_staff_id]));
      return res.status(200).json({ memos: withNames(memos, names), sections });
    }

    if (b.action === "get") {
      const memo = await loadMemo(db, b.id);
      if (memo.status !== "sent") await requireManager(db, b.pin);
      let sections = await loadSections(db, [memo.id]);
      if (memo.status === "sent") sections = sections.filter(sectionShown).map(memoOnly);
      const names = await staffNames(db, [memo.created_by_staff_id, memo.sent_by_staff_id]);
      return res.status(200).json({ memo: withNames([memo], names)[0], sections });
    }

    // ── QSPP managers ──
    const manager = await requireManager(db, b.pin);

    if (b.action === "drafts") {
      const { data, error } = await db.from("staff_memos").select("*").eq("pharmacy_id", PHARMACY_ID).eq("status", "draft")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      const names = await staffNames(db, (data || []).map((m) => m.created_by_staff_id));
      return res.status(200).json({ memos: withNames(data || [], names) });
    }

    if (b.action === "create") {
      const title = String(b.title || "").trim().slice(0, 200);
      if (!title) throw httpError(400, "Give the memo a title.");
      const { data: memo, error } = await db.from("staff_memos").insert([{
        pharmacy_id: PHARMACY_ID, title, status: "draft", created_by_staff_id: manager.id,
      }]).select().single();
      if (error) throw error;
      const section = await newSection(db, memo.id, manager);
      return res.status(200).json({ memo: withNames([memo], { [manager.id]: manager.name })[0], sections: [section] });
    }

    if (b.action === "update-memo") {
      const memo = await loadDraft(db, b.id);
      const patch = pick(b.patch || {}, MEMO_FIELDS);
      if ("title" in patch) {
        patch.title = String(patch.title || "").trim().slice(0, 200);
        if (!patch.title) throw httpError(400, "The title can't be empty.");
      }
      if ("topics" in patch) patch.topics = (Array.isArray(patch.topics) ? patch.topics : []).filter((t) => MEMO_TOPICS.includes(t));
      const { data, error } = await db.from("staff_memos").update({ ...patch, updated_at: now() })
        .eq("id", memo.id).eq("pharmacy_id", PHARMACY_ID).select().single();
      if (error) throw error;
      return res.status(200).json({ memo: data });
    }

    if (b.action === "delete") {
      const memo = await loadDraft(db, b.id);
      const sections = await loadSections(db, [memo.id]);
      const { error } = await db.from("staff_memos").delete().eq("id", memo.id).eq("pharmacy_id", PHARMACY_ID).eq("status", "draft");
      if (error) throw error;
      await removeFiles(db, sections.flatMap(filePaths));
      return res.status(200).json({ ok: true });
    }

    if (b.action === "add-section") {
      const memo = await loadDraft(db, b.memo_id);
      const section = await newSection(db, memo.id, manager);
      await touchMemo(db, memo.id);
      return res.status(200).json({ section });
    }

    if (b.action === "ask") {
      const memo = await loadDraft(db, b.memo_id);
      return res.status(200).json({ sections: await askForSections(db, memo.id, b.staff_ids, b.notes || {}, manager.id) });
    }

    if (b.action === "upload-url") {
      const memo = await loadDraft(db, b.memo_id);
      return res.status(200).json(await uploadTicket(db, memo.id, b.kind === "pdf" ? "pdf" : "image", b.ext));
    }

    // Section actions
    const section = await loadSection(db, b.id);
    await loadDraft(db, section.memo_id);

    if (b.action === "update-section") {
      const patch = cleanSectionPatch(db, section, pick(b.patch || {}, SECTION_FIELDS));
      const saved = await saveSectionChecked(db, section, patch, b.base);
      return res.status(200).json({ section: saved });
    }

    // The note isn't section content: changing it doesn't touch updated_at, so it never clashes with the person writing
    if (b.action === "update-note") {
      if (!section.requested_staff_id) throw httpError(400, "Only sections asked of someone have a note.");
      const { data, error } = await db.from("staff_memo_sections").update({ request_note: cleanNote(b.note) })
        .eq("id", section.id).eq("pharmacy_id", PHARMACY_ID).select().single();
      if (error) throw error;
      return res.status(200).json({ section: data });
    }

    if (b.action === "move-section") {
      const rows = await loadSections(db, [section.memo_id]);
      const i = rows.findIndex((r) => r.id === section.id);
      const j = i + (Number(b.dir) < 0 ? -1 : 1);
      if (i >= 0 && j >= 0 && j < rows.length) {
        [rows[i], rows[j]] = [rows[j], rows[i]];
        await Promise.all(rows.map((r, k) => db.from("staff_memo_sections").update({ sort_order: k }).eq("id", r.id)));
        await touchMemo(db, section.memo_id);
      }
      return res.status(200).json({ sections: await loadSections(db, [section.memo_id]) });
    }

    if (b.action === "delete-section") {
      const { error } = await db.from("staff_memo_sections").delete().eq("id", section.id).eq("pharmacy_id", PHARMACY_ID);
      if (error) throw error;
      await removeFiles(db, filePaths(section));
      await renumber(db, section.memo_id);
      await touchMemo(db, section.memo_id);
      return res.status(200).json({ sections: await loadSections(db, [section.memo_id]) });
    }

    throw httpError(400, "Unknown action.");
  } catch (err) {
    return sendError(res, "[api/memos]", err);
  }
}
