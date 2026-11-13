// Staff memos — reading and replying (staff side). Seen = opened; there's no "I've read this" button.
// Who:
//   /me    — the staff login (Authorization: Bearer <access token>, lib/reviewServer.js staffFromRequest). No PIN.
//   kiosk  — { via: "kiosk", staff_id } with the kiosk's dashboard login (lib/adminAuth.js). Reading needs no PIN (the
//            person taps their own photo, like policy read cards); their reply thread needs their OWN 4-digit staff
//            PIN on every request (same check as writing a memo section).
// A memo sent to roles / chosen people is private (lib/memosServer isPrivateMemo): only its recipients can open it here.
// Replies are private: each person only ever gets their OWN thread (managers see all threads through /api/memos).
// Staff never see anyone else's replies or read status.
//   POST { action, ... }
//     mine        (/me)                   -> { memos: [{ id, title, sent_at, topics, seen, opened, new_answer }], unread }
//     get         { memo_id }             -> { memo, sections, policies, dates, updates }  (kiosk: staff_id, if any)
//     seen        { memo_id }             records the first open (phone on /me, kiosk) — recipients only
//     thread      { memo_id }             -> { thread }  my own replies + managers' answers (marks the answers read)
//     reply       { memo_id, body }       -> { thread }  (push to the manager who sent the memo)
//     kiosk-jobs  { via: "kiosk", staff_ids } -> { jobs: [{ memo_id, staff_id, memo_title }] }  not opened yet
import { staffFromRequest } from "../../../lib/reviewServer";
import { requireDashboard, assertSamePharmacy } from "../../../lib/adminAuth";
import {
  supabaseAdmin, PHARMACY_ID, httpError, sendError, loadMemo, markSeen, myMemos, unseenMemoJobs, canStaffRead, sentMemoPayload,
  threadOf, markAnswersRead, addStaffReply,
} from "../../../lib/memosServer";

// The memo, if this reader may open it (404 otherwise — never says a private memo exists)
async function readable(db, memoId, staffId) {
  const memo = await loadMemo(db, String(memoId));
  if (!(await canStaffRead(db, memo, staffId))) throw httpError(404, "That memo wasn't found.");
  return memo;
}

async function thread(db, memo, staff, b) {
  if (b.action === "thread") {
    await markAnswersRead(db, memo.id, staff.id);
    return { thread: await threadOf(db, memo.id, staff.id) };
  }
  return { thread: await addStaffReply(db, memo, staff, b.body) };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  res.setHeader("Cache-Control", "no-store");
  try {
    const db = supabaseAdmin();
    const b = req.body || {};

    if (b.via === "kiosk") {
      const auth = await requireDashboard(req);
      assertSamePharmacy(auth, PHARMACY_ID);
      if (b.action === "kiosk-jobs") {
        const ids = (Array.isArray(b.staff_ids) ? b.staff_ids : []).map(Number).filter(Boolean);
        return res.status(200).json({ jobs: await unseenMemoJobs(db, ids) });
      }
      let staff = null;
      if (b.staff_id) {
        const { data: s, error } = await db.from("staff").select("id, name, active, pharmacy_id, pin").eq("id", Number(b.staff_id)).maybeSingle();
        if (error) throw error;
        if (!s || s.active === false || String(s.pharmacy_id) !== PHARMACY_ID) throw httpError(404, "Staff member not found.");
        staff = s;
      }
      if (b.action === "get") return res.status(200).json(await sentMemoPayload(db, await readable(db, b.memo_id, staff?.id || null)));
      if (b.action === "seen") {
        if (!staff) throw httpError(400, "Who read it?");
        return res.status(200).json({ ok: await markSeen(db, String(b.memo_id), staff.id, "kiosk") });
      }
      if (b.action === "thread" || b.action === "reply") {
        // Their own PIN, checked on every request — nothing of the thread is returned without it
        if (!staff || !staff.pin || !/^\d{4}$/.test(String(b.pin || "")) || String(b.pin) !== String(staff.pin)) throw httpError(401, "Incorrect PIN.");
        const memo = await readable(db, b.memo_id, staff.id);
        return res.status(200).json(await thread(db, memo, { id: Number(staff.id), name: staff.name }, b));
      }
      throw httpError(400, "Unknown action.");
    }

    const staff = await staffFromRequest(req);
    if (String(staff.pharmacy_id) !== PHARMACY_ID) throw httpError(403, "Not your pharmacy.");

    if (b.action === "mine") {
      const memos = await myMemos(db, staff.id);
      return res.status(200).json({ memos, unread: memos.filter((m) => !m.seen).length });
    }
    if (b.action === "get") return res.status(200).json(await sentMemoPayload(db, await readable(db, b.memo_id, staff.id)));
    if (b.action === "seen") return res.status(200).json({ ok: await markSeen(db, String(b.memo_id), staff.id, "phone") });
    if (b.action === "thread" || b.action === "reply") {
      const memo = await readable(db, b.memo_id, staff.id);
      return res.status(200).json(await thread(db, memo, staff, b));
    }

    throw httpError(400, "Unknown action.");
  } catch (err) {
    return sendError(res, "[api/memos/read]", err);
  }
}
