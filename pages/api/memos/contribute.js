// Staff memos — the asked person writing THEIR OWN section ("Add your section to the …"). No manager PIN.
// Who they are:
//   /me    — the staff login (Authorization: Bearer <access token>, lib/reviewServer.js staffFromRequest)
//   kiosk  — { via: "kiosk", staff_id, pin } with the kiosk's dashboard login (lib/adminAuth.js) AND that person's own
//            4-digit staff PIN, checked here on every request (kiosk-jobs needs no PIN: ids + titles only)
// They only ever reach their own slot, only while the memo is a draft — never other sections or the rest of the memo.
//   POST { action, ... }
//     kiosk-jobs  { via: "kiosk", staff_ids }        -> { jobs: [{ section_id, staff_id, memo_title }] }  open asks only
//     mine        { }                                -> { asks: [{ section_id, memo_title, heading, written, note }] } (draft memos,
//                                                       not "Nothing this month")
//     get         { section_id }                     -> { section, memo_title, note, asked_by } (the manager's note + their first name)
//     save        { section_id, base, patch }        heading / text / images / PDF attachments. Version-checked like the manager's saves:
//                                                     409 + { conflict, section } if someone saved since `base`
//     nothing     { section_id }                     "Nothing this month": clears their text / images, marks the slot
//                                                     declined (the manager sees it; the job clears)
//     upload-url  { section_id, kind: "image" | "pdf", ext } -> { path, token, url } — a file for THEIR section only
//                                                     (named <memoId>/s-<sectionId>-…; a save only accepts new files
//                                                     with that name, so nobody can attach another section's files)
import { staffFromRequest } from "../../../lib/reviewServer";
import { requireDashboard, assertSamePharmacy } from "../../../lib/adminAuth";
import { CONTRIBUTOR_FIELDS, sectionHasContent } from "../../../lib/memos";
import {
  supabaseAdmin, PHARMACY_ID, httpError, pick, now, sendError, loadDraft, loadSection,
  removeFiles, filePaths, uploadTicket, cleanSectionPatch, saveSectionChecked, touchMemo, openAsks, contributorFileTag,
} from "../../../lib/memosServer";

async function whoIs(req, db, b) {
  if (b.via === "kiosk") {
    const auth = await requireDashboard(req);
    assertSamePharmacy(auth, PHARMACY_ID);
    if (b.action === "kiosk-jobs") return { kiosk: true, staff: null };
    // Their own 4-digit staff PIN on every kiosk request (same rule as Messages → Chats)
    const { data: s, error } = await db.from("staff").select("id, name, active, pharmacy_id, pin").eq("id", Number(b.staff_id)).maybeSingle();
    if (error) throw error;
    if (!s || s.active === false || String(s.pharmacy_id) !== PHARMACY_ID || !s.pin
      || !/^\d{4}$/.test(String(b.pin || "")) || String(b.pin) !== String(s.pin)) throw httpError(401, "Incorrect PIN.");
    delete s.pin;
    return { kiosk: true, staff: s };
  }
  const s = await staffFromRequest(req);
  if (String(s.pharmacy_id) !== PHARMACY_ID) throw httpError(403, "Not your pharmacy.");
  return { kiosk: false, staff: s };
}

// Their own open slot on a draft memo
async function ownSlot(db, staff, sectionId) {
  const section = await loadSection(db, sectionId);
  if (Number(section.requested_staff_id) !== Number(staff.id)) throw httpError(403, "This isn't your section.");
  if (section.declined_at) throw httpError(409, "You said “Nothing this month” for this memo.");
  const memo = await loadDraft(db, section.memo_id);
  return { section, memo };
}

// Only what the asked person needs to see of their slot
const ownView = (s) => pick(s, ["id", "memo_id", "heading", "body", "images", "attachments", "signature_name", "signature_role", "updated_at", "submitted_at"]);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const db = supabaseAdmin();
    const b = req.body || {};
    const { staff } = await whoIs(req, db, b);
    res.setHeader("Cache-Control", "no-store");

    if (b.action === "kiosk-jobs") {
      if (b.via !== "kiosk") throw httpError(403, "Kiosk only.");
      const ids = (Array.isArray(b.staff_ids) ? b.staff_ids : []).map(Number).filter(Boolean);
      const jobs = (await openAsks(db, ids)).map(({ section_id, staff_id, memo_title }) => ({ section_id, staff_id, memo_title }));
      return res.status(200).json({ jobs });
    }

    if (b.action === "mine") {
      const { data: secs, error } = await db.from("staff_memo_sections").select("id, memo_id, heading, body, images, attachments, declined_at, request_note")
        .eq("pharmacy_id", PHARMACY_ID).eq("requested_staff_id", Number(staff.id)).is("declined_at", null);
      if (error) throw error;
      const memoIds = [...new Set((secs || []).map((s) => s.memo_id))];
      const { data: memos } = memoIds.length
        ? await db.from("staff_memos").select("id, title, status").in("id", memoIds).eq("status", "draft")
        : { data: [] };
      const titleOf = Object.fromEntries((memos || []).map((m) => [m.id, m.title]));
      const asks = (secs || []).filter((s) => titleOf[s.memo_id])
        .map((s) => ({ section_id: s.id, memo_title: titleOf[s.memo_id], heading: s.heading || "", written: sectionHasContent(s), note: s.request_note || null }));
      return res.status(200).json({ asks });
    }

    const { section, memo } = await ownSlot(db, staff, b.section_id);

    if (b.action === "get") {
      // The manager's note ("Blair asked: …") — shown to them only, never part of the memo
      let askedBy = null;
      if (section.request_note && section.requested_by_staff_id) {
        const { data: m } = await db.from("staff").select("name").eq("id", Number(section.requested_by_staff_id)).maybeSingle();
        askedBy = String(m?.name || "").split(" ")[0] || null;
      }
      return res.status(200).json({ section: ownView(section), memo_title: memo.title, note: section.request_note || null, asked_by: askedBy });
    }

    if (b.action === "upload-url") {
      return res.status(200).json(await uploadTicket(db, memo.id, b.kind === "pdf" ? "pdf" : "image", b.ext, contributorFileTag(section.id)));
    }

    if (b.action === "save") {
      const patch = cleanSectionPatch(db, section, pick(b.patch || {}, CONTRIBUTOR_FIELDS));
      // Files already in the section may stay / go; any NEW file must be one this person uploaded for this section
      const had = new Set(filePaths(section));
      const own = `${memo.id}/${contributorFileTag(section.id)}`;
      for (const f of [...(patch.images || []), ...(patch.attachments || [])]) {
        if (!had.has(f.path) && !f.path.startsWith(own)) throw httpError(403, "That file isn't from your section.");
      }
      const next = { ...section, ...patch };
      const extra = { author_staff_id: Number(staff.id), submitted_at: sectionHasContent(next) ? now() : null };
      try {
        const saved = await saveSectionChecked(db, section, patch, b.base, extra);
        return res.status(200).json({ section: ownView(saved) });
      } catch (err) {
        if (err.section) err.section = ownView(err.section);
        throw err;
      }
    }

    if (b.action === "nothing") {
      const { error } = await db.from("staff_memo_sections")
        .update({ declined_at: now(), body: "", images: [], attachments: [], submitted_at: null, updated_at: now() })
        .eq("id", section.id).eq("pharmacy_id", PHARMACY_ID);
      if (error) throw error;
      await removeFiles(db, filePaths(section));
      await touchMemo(db, memo.id);
      return res.status(200).json({ ok: true });
    }

    throw httpError(400, "Unknown action.");
  } catch (err) {
    return sendError(res, "[api/memos/contribute]", err);
  }
}
