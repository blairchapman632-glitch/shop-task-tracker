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
//                                                  note each ({ [staffId]: "…" }) and who asked (lib/memosServer askForSections).
//                                                  Each person newly asked / asked again gets one push.
//     update-note     { pin, id, note }            change the note on an asked slot (not section content — no version bump)
//     update-section  { pin, id, base, patch }     heading / text / images / attachments / author / signature. Version-
//                                                  checked: 409 + { conflict, section } if someone saved since `base`
//     move-section    { pin, id, dir: -1 | 1 }     ▲▼
//     delete-section  { pin, id }                  also "Remove the ask" on an asked slot (their job clears)
//     upload-url      { pin, memo_id, kind: "image" | "pdf", ext }  -> { path, token, url } (browser uploadToSignedUrl)
//     send            { pin, id, roles }           Stage 3 — roles: null / [] = all active staff, else only those roles.
//                                                  Waiting + "Nothing this month" slots are dropped, request notes cleared,
//                                                  recipients stored, one push to each recipient (no Wall post).
//     seen-by         { pin, ids? }                -> { seenBy: { [memoId]: [{ staff_id, name, seen_at, seen_via }] } }
//     reply-summary   { pin }                      -> { summary: { [memoId]: { total, unread } } }  staff replies
//     threads         { pin, id }                  -> { threads }  every person's private reply thread on the memo
//     thread-read     { pin, id, staff_id }        a manager opened that thread (its replies are read)
//     answer          { pin, id, staff_id, body }  answer in that person's thread (only they see it; push to them)
//     add-update      { pin, id, body, notify }    an update shown under the memo to everyone who can see it (+ PDF);
//                                                  notify = push to its recipients
//     send-to (Stage 3 addition): send { pin, id, to: { mode: "all" | "roles" | "people", roles, staff_ids } }. Roles /
//                     people = private: list / get show it only with a manager PIN (recipients read it
//                     through /api/memos/read), no What's on dates.
//     delete-sent     { pin, id }                  a sent memo whose only recipient is the manager who sent it
//     delete-imported { pin, id }                 Stage 5: delete a memo imported from email (never a Chalkboard-sent one)
//     titles          { ids }                    anyone: sent memo titles -> { titles: { [id]: title } }
//     policy-options  { pin }                      current (not retired) library documents
//     add-policies    { pin, memo_id, document_ids }   remove-policy { pin, id }   move-policy { pin, id, dir }
//     add-date        { pin, memo_id, date: { title, start_date, end_date?, category_id? } }   remove-date { pin, id }
//                     (Stage 4 — Send creates the policy read requests and the What's on events)
// list / get also return the memo's policies and dates.
// Sent memos are read-only here (corrections go as a reply or a new memo).
// The PIN is re-checked on every manager request (lib/adminPin.js checkQsppManagerPin — "QSPP manager" in Admin).
// NOTE: while RLS is off, staff_memos / staff_memo_sections can still be read directly with the public key — closing that
// (drafts readable only through here) is part of the RLS pass.
import { checkQsppManagerPin } from "../../../lib/adminPin";
import { MEMO_FIELDS, SECTION_FIELDS, MEMO_TOPICS, sectionShown, isAsked, sectionHasContent } from "../../../lib/memos";
import {
  supabaseAdmin, PHARMACY_ID, httpError, pick, now, sendError, loadMemo, loadDraft, loadSections, loadSection,
  removeFiles, filePaths, uploadTicket, cleanSectionPatch, saveSectionChecked, touchMemo, askForSections, cleanNote, memoOnly,
  memoRecipientIds, seenByFor, isPrivateMemo, onlySentToSender, deleteSentMemo,
  managerThreads, markThreadRead, addManagerAnswer, replySummary, loadMemoUpdates, addMemoUpdate,
  loadMemoPolicies, loadMemoDates, policyOptions, requestMemoPolicies, createMemoEvents,
} from "../../../lib/memosServer";
import { sendPushToStaff } from "../../../lib/pushServer";

// Send a draft (see the header). The status change is claimed first, so two managers pressing Send at once can't
// both send it. -> { memo, recipients }
// to: { mode: "all" | "roles" | "people", roles, staff_ids }. Roles / people = private (see lib/memosServer isPrivateMemo):
// its dates aren't put on What's on.
async function sendMemo(db, memoId, to, manager) {
  const memo = await loadDraft(db, memoId);
  const mode = ["all", "roles", "people"].includes(to?.mode) ? to.mode : (Array.isArray(to?.roles) && to.roles.length ? "roles" : "all");
  const roleList = mode === "roles" && Array.isArray(to?.roles) ? [...new Set(to.roles.map((r) => String(r || "").trim()).filter(Boolean))] : [];
  const ids = await memoRecipientIds(db, roleList, mode, mode === "people" ? to?.staff_ids : []);
  if (!ids.length) throw httpError(400, mode === "people" ? "Tick at least one person." : "Nobody would get this memo — choose at least one role with active staff.");
  const isPrivate = mode !== "all";
  const all = await loadSections(db, [memo.id]);
  const dropped = all.filter((s) => s.declined_at || (isAsked(s) && !sectionHasContent(s))); // waiting / "Nothing this month"
  const [policies, dates] = await Promise.all([loadMemoPolicies(db, [memo.id]), loadMemoDates(db, [memo.id])]);
  if (!all.filter((s) => !dropped.includes(s)).some(sectionShown) && !policies.length && !dates.length) {
    throw httpError(400, "There's nothing in this memo to send yet.");
  }

  const sentAt = now();
  const { data: claimed, error: cErr } = await db.from("staff_memos")
    .update({ status: "sent", sent_at: sentAt, sent_by_staff_id: manager.id, send_to: mode, send_to_roles: roleList.length ? roleList : null, updated_at: sentAt })
    .eq("id", memo.id).eq("pharmacy_id", PHARMACY_ID).eq("status", "draft").select().single();
  if (cErr || !claimed) throw httpError(409, "This memo has already been sent.");

  // Drop waiting / "Nothing this month" slots (their jobs go with them); notes to asked people are never kept
  if (dropped.length) {
    const { error } = await db.from("staff_memo_sections").delete().in("id", dropped.map((s) => s.id)).eq("pharmacy_id", PHARMACY_ID);
    if (error) throw error;
    await removeFiles(db, dropped.flatMap(filePaths));
  }
  const { error: nErr } = await db.from("staff_memo_sections").update({ request_note: null })
    .eq("memo_id", memo.id).eq("pharmacy_id", PHARMACY_ID).not("request_note", "is", null);
  if (nErr) throw nErr;

  const { error: rErr } = await db.from("staff_memo_recipients")
    .insert(ids.map((staffId) => ({ pharmacy_id: PHARMACY_ID, memo_id: memo.id, staff_id: staffId })));
  if (rErr) throw rErr;

  // No Wall post — staff get the push, their own kiosk "Read the …" card, /me → Messages → Memos and the archive.
  // Replies are private threads on the memo itself (staff_memo_replies).

  // Stage 4: policy read requests (the existing system — no duplicates of outstanding ones) and What's on events.
  // The memo is already sent by now, so a failure here is reported back rather than undoing the Send.
  const warnings = [];
  let policyRequests = 0;
  let events = 0;
  try { policyRequests = await requestMemoPolicies(db, claimed, ids, manager.id); } catch (e) {
    console.error("[api/memos] policy requests failed", e);
    warnings.push(`The policy read requests couldn't all be created (${e.message}) — ask staff to read them from the QSPP library.`);
  }
  // What's on is for everyone — only a memo sent to all staff puts its dates there
  if (!isPrivate) try { events = await createMemoEvents(db, claimed, manager.id); } catch (e) {
    console.error("[api/memos] calendar events failed", e);
    warnings.push(`The What's on dates couldn't all be added (${e.message}) — add them on the kiosk calendar.`);
  }

  // One push to each recipient — never fails the Send
  try {
    await sendPushToStaff(db, ids, { title: `New staff memo: ${claimed.title}`, body: "Tap to read it.", url: `/me?p=byford&tab=messages&memo=${memo.id}` });
  } catch (e) {
    console.error("[api/memos] push failed", e);
  }
  return { memo: claimed, recipients: ids.length, policyRequests, events, warnings };
}

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

    // ── Anyone (private memos — sent to roles / people — only with a manager PIN; recipients read them through
    //    /api/memos/read) ──
    if (b.action === "list") {
      const asManager = b.pin ? await requireManager(db, b.pin) : null;
      let q = db.from("staff_memos").select("*").eq("pharmacy_id", PHARMACY_ID).eq("status", "sent");
      if (!asManager) q = q.or("send_to.eq.all,imported.eq.true");
      const { data, error } = await q.order("sent_at", { ascending: false });
      if (error) throw error;
      const memos = data || [];
      const ids = memos.map((m) => m.id);
      const [sections, policies, dates, updates] = await Promise.all([
        loadSections(db, ids).then((rows) => rows.filter(sectionShown).map(memoOnly)), loadMemoPolicies(db, ids), loadMemoDates(db, ids),
        loadMemoUpdates(db, ids),
      ]);
      const names = await staffNames(db, memos.flatMap((m) => [m.created_by_staff_id, m.sent_by_staff_id]));
      return res.status(200).json({ memos: withNames(memos, names), sections, policies, dates, updates });
    }

    if (b.action === "get") {
      const memo = await loadMemo(db, b.id);
      if (memo.status !== "sent" || isPrivateMemo(memo)) await requireManager(db, b.pin);
      let sections = await loadSections(db, [memo.id]);
      if (memo.status === "sent") sections = sections.filter(sectionShown).map(memoOnly);
      const [policies, dates, updates] = await Promise.all([loadMemoPolicies(db, [memo.id]), loadMemoDates(db, [memo.id]), loadMemoUpdates(db, [memo.id])]);
      const names = await staffNames(db, [memo.created_by_staff_id, memo.sent_by_staff_id]);
      return res.status(200).json({ memo: withNames([memo], names)[0], sections, policies, dates, updates });
    }

    // Titles of sent memos (the kiosk calendar's "From the [memo title]" line)
    if (b.action === "titles") {
      const ids = (Array.isArray(b.ids) ? b.ids : []).map(String).slice(0, 200);
      if (!ids.length) return res.status(200).json({ titles: {} });
      const { data, error } = await db.from("staff_memos").select("id, title").eq("pharmacy_id", PHARMACY_ID).eq("status", "sent")
        .or("send_to.eq.all,imported.eq.true").in("id", ids);
      if (error) throw error;
      return res.status(200).json({ titles: Object.fromEntries((data || []).map((m) => [m.id, m.title])) });
    }

    // ── QSPP managers ──
    const manager = await requireManager(db, b.pin);

    if (b.action === "send") return res.status(200).json(await sendMemo(db, b.id, b.to || { roles: b.roles }, manager));

    // A sent memo whose only recipient is the manager who sent it (a test): remove everything it created
    if (b.action === "delete-sent") {
      const memo = await loadMemo(db, b.id);
      if (!(await onlySentToSender(db, memo))) throw httpError(403, "Only a memo sent just to the manager who sent it can be deleted.");
      await deleteSentMemo(db, memo);
      return res.status(200).json({ ok: true });
    }

    if (b.action === "seen-by") {
      let ids = Array.isArray(b.ids) ? b.ids.map(String) : null;
      if (!ids) {
        const { data, error } = await db.from("staff_memos").select("id").eq("pharmacy_id", PHARMACY_ID).eq("status", "sent");
        if (error) throw error;
        ids = (data || []).map((m) => m.id);
      }
      return res.status(200).json({ seenBy: await seenByFor(db, ids) });
    }

    // Private reply threads (managers see every thread; each staff member only their own, via /api/memos/read)
    if (b.action === "reply-summary") return res.status(200).json({ summary: await replySummary(db) });
    if (["threads", "thread-read", "answer", "add-update"].includes(b.action)) {
      const memo = await loadMemo(db, b.id);
      if (memo.status !== "sent") throw httpError(404, "That memo wasn't found.");
      if (b.action === "threads") return res.status(200).json({ threads: await managerThreads(db, memo.id) });
      if (b.action === "thread-read") {
        await markThreadRead(db, memo.id, b.staff_id);
        return res.status(200).json({ threads: await managerThreads(db, memo.id) });
      }
      if (b.action === "answer") return res.status(200).json({ threads: await addManagerAnswer(db, memo, Number(b.staff_id), manager, b.body) });
      return res.status(200).json({ updates: await addMemoUpdate(db, memo, manager, b.body, !!b.notify) });
    }

    // Stage 5: delete an IMPORTED memo completely (its sections go with it — cascade). Never a memo sent from Chalkboard.
    if (b.action === "delete-imported") {
      const memo = await loadMemo(db, b.id);
      if (!memo.imported) throw httpError(403, "Only memos imported from email can be deleted.");
      const sections = await loadSections(db, [memo.id]);
      const { error } = await db.from("staff_memos").delete().eq("id", memo.id).eq("pharmacy_id", PHARMACY_ID).eq("imported", true);
      if (error) throw error;
      await removeFiles(db, sections.flatMap(filePaths)); // none for email imports, but tidy if any were added
      return res.status(200).json({ ok: true });
    }

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
      const { sections, asked } = await askForSections(db, memo.id, b.staff_ids, b.notes || {}, manager.id);
      // One push per person newly asked (or asked again after "Nothing this month") — never on a note edit or removal,
      // and it never fails the ask. Tapping opens their section in /me → To do.
      const first = String(manager.name || "").split(" ")[0] || "A manager";
      await Promise.all(asked.map((a) => sendPushToStaff(db, [a.staff_id], {
        title: `${first} asked you for a section in the ${memo.title}`,
        body: "Tap to write it.",
        url: `/me?p=byford&tab=todo&section=${a.section_id}`,
      }).catch((e) => console.error("[api/memos] ask push failed", e))));
      return res.status(200).json({ sections });
    }

    if (b.action === "upload-url") {
      const memo = await loadDraft(db, b.memo_id);
      return res.status(200).json(await uploadTicket(db, memo.id, b.kind === "pdf" ? "pdf" : "image", b.ext));
    }

    // ── Stage 4: policies to read (current library documents) ──
    if (b.action === "policy-options") return res.status(200).json({ documents: await policyOptions(db) });

    if (b.action === "add-policies") {
      const memo = await loadDraft(db, b.memo_id);
      const wanted = [...new Set((Array.isArray(b.document_ids) ? b.document_ids : []).map(String))];
      const current = new Set((await policyOptions(db)).map((d) => d.id));
      const existing = await loadMemoPolicies(db, [memo.id]);
      const have = new Set(existing.map((p) => String(p.document_id)));
      let order = existing.reduce((m, p) => Math.max(m, Number(p.sort_order) || 0), -1);
      const rows = wanted.filter((id) => current.has(id) && !have.has(id))
        .map((id) => ({ pharmacy_id: PHARMACY_ID, memo_id: memo.id, document_id: id, sort_order: (order += 1) }));
      if (rows.length) {
        const { error } = await db.from("staff_memo_policies").insert(rows);
        if (error) throw error;
        await touchMemo(db, memo.id);
      }
      return res.status(200).json({ policies: await loadMemoPolicies(db, [memo.id]) });
    }

    if (b.action === "remove-policy" || b.action === "move-policy") {
      const { data: row, error } = await db.from("staff_memo_policies").select("*").eq("id", String(b.id)).eq("pharmacy_id", PHARMACY_ID).maybeSingle();
      if (error) throw error;
      if (!row) throw httpError(404, "That policy wasn't found — it may have been removed.");
      const memo = await loadDraft(db, row.memo_id);
      if (b.action === "remove-policy") {
        const { error: dErr } = await db.from("staff_memo_policies").delete().eq("id", row.id);
        if (dErr) throw dErr;
      } else {
        const rows = await loadMemoPolicies(db, [memo.id]);
        const i = rows.findIndex((r) => r.id === row.id);
        const j = i + (Number(b.dir) < 0 ? -1 : 1);
        if (i >= 0 && j >= 0 && j < rows.length) {
          [rows[i], rows[j]] = [rows[j], rows[i]];
          await Promise.all(rows.map((r, k) => db.from("staff_memo_policies").update({ sort_order: k }).eq("id", r.id)));
        }
      }
      await touchMemo(db, memo.id);
      return res.status(200).json({ policies: await loadMemoPolicies(db, [memo.id]) });
    }

    // ── Stage 4: dates (What's on events are created only on Send) ──
    if (b.action === "add-date") {
      const memo = await loadDraft(db, b.memo_id);
      const d = b.date || {};
      const title = String(d.title || "").trim().slice(0, 200);
      const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
      if (!title) throw httpError(400, "Give the date a title.");
      if (!isDate(d.start_date)) throw httpError(400, "Choose a date.");
      const end = isDate(d.end_date) && d.end_date > d.start_date ? d.end_date : null;
      if (isDate(d.end_date) && d.end_date < d.start_date) throw httpError(400, "The end date is before the start date.");
      let categoryId = null;
      if (d.category_id) {
        const { data: cat } = await db.from("calendar_categories").select("id").eq("id", String(d.category_id)).eq("pharmacy_id", PHARMACY_ID).maybeSingle();
        if (!cat) throw httpError(400, "That calendar category wasn't found.");
        categoryId = cat.id;
      }
      const existing = await loadMemoDates(db, [memo.id]);
      const { error } = await db.from("staff_memo_dates").insert([{
        pharmacy_id: PHARMACY_ID, memo_id: memo.id, title, start_date: d.start_date, end_date: end, category_id: categoryId,
        sort_order: existing.length,
      }]);
      if (error) throw error;
      await touchMemo(db, memo.id);
      return res.status(200).json({ dates: await loadMemoDates(db, [memo.id]) });
    }

    if (b.action === "remove-date") {
      const { data: row, error } = await db.from("staff_memo_dates").select("*").eq("id", String(b.id)).eq("pharmacy_id", PHARMACY_ID).maybeSingle();
      if (error) throw error;
      if (!row) throw httpError(404, "That date wasn't found — it may have been removed.");
      const memo = await loadDraft(db, row.memo_id);
      const { error: dErr } = await db.from("staff_memo_dates").delete().eq("id", row.id);
      if (dErr) throw dErr;
      await touchMemo(db, memo.id);
      return res.status(200).json({ dates: await loadMemoDates(db, [memo.id]) });
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
