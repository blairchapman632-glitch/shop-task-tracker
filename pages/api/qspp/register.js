// QSPP incidents & feedback — every save goes through here (no login: /qspp is used on the shop computers).
//   POST { action, kind: "incident" | "feedback", ... }
//     list                  { }                 the staff view: incidents (not hidden) WITHOUT the manager-only sections
//                                              (third parties, open disclosure, feedback to staff — lib/qspp.js staffViewOf)
//     report / log          { fields, pin? }   anyone; manager fields only with a valid manager PIN. The QSPP managers'
//                                              kiosk jobs are worked out live from the records (no push any more).
//     staff-update          { id, patch }       anyone: incident -> action taken / actioned by / follow-up, only while the
//                                              incident is open and not yet actioned; feedback -> response, date
//                                              responded, improvement, each only while still empty.
//     follow-up-done        { id, note, pin }   the person the follow-up is assigned to (their own PIN): a short note
//                                              (required) -> follow_up_done_note / _by / _at, then locked.
//     manager-update        { id, patch, pin }  QSPP manager mode: the review section, close / reopen, hide. Reassigning
//                                              the follow-up clears "Follow-up done"; recording feedback to staff sets
//                                              "Given by" to the person in manager mode.
//     manager-open          { id, pin }         first opened in manager mode -> manager_opened_at (clears Needs attention)
//     delete                { id, pin }
//   POST { action: "settings", pin, qspp_stale_days }   "Flag incidents open longer than X days" (null = off)
//   -> { row } / { settings }
// The manager PIN is re-checked here on every manager request (lib/adminPin.js checkQsppManagerPin: the person's own
// PIN, ticked "QSPP manager"). Replies to staff (no PIN) never include the manager-only sections.
// NOTE: while RLS is off on incidents / feedback the tables can still be read and written directly with the public key —
// closing that is part of the RLS pass (CLAUDE.md).
import supabaseAdmin from "../../../lib/supabaseAdmin";
import { checkQsppManagerPin } from "../../../lib/adminPin";
import {
  INCIDENT_REPORT_FIELDS, INCIDENT_STAFF_FIELDS, INCIDENT_MANAGER_FIELDS,
  FEEDBACK_LOG_FIELDS, FEEDBACK_STAFF_FIELDS, FEEDBACK_MANAGER_FIELDS, pick, staffViewOf, isOpen,
} from "../../../lib/qspp";

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";
const TABLE = { incident: "incidents", feedback: "feedback" };
const httpError = (status, message) => Object.assign(new Error(message), { status });

async function requireManager(db, pin) {
  const user = await checkQsppManagerPin(db, PHARMACY_ID, pin);
  if (!user) throw httpError(403, "QSPP manager PIN needed — unlock 🔒 Manager again.");
  return user;
}

async function loadRow(db, kind, id) {
  const { data, error } = await db.from(TABLE[kind]).select("*").eq("id", id).eq("pharmacy_id", PHARMACY_ID).maybeSingle();
  if (error) throw error;
  if (!data) throw httpError(404, `That ${kind} wasn't found.`);
  return data;
}

async function save(db, kind, id, patch) {
  const { data, error } = await db.from(TABLE[kind]).update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id).eq("pharmacy_id", PHARMACY_ID).select().single();
  if (error) throw error;
  return data;
}

// Lock rules for staff saves: only what's still allowed, or a clear message
function staffPatch(kind, row, patch) {
  const p = pick(patch, kind === "incident" ? INCIDENT_STAFF_FIELDS : FEEDBACK_STAFF_FIELDS);
  if (kind === "incident") {
    if (row.date_resolved) throw httpError(403, "This incident is resolved — only a manager can reopen it.");
    if (row.actioned_by_staff_id) throw httpError(403, "The action is already recorded — ask a manager to change it.");
    return p;
  }
  const out = {};
  if (!row.response) { if ("response" in p) out.response = p.response; if ("responded_date" in p) out.responded_date = p.responded_date; }
  if (!row.improvement && "improvement" in p) out.improvement = p.improvement;
  return out;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const db = supabaseAdmin();
    const b = req.body || {};

    if (b.action === "settings") {
      await requireManager(db, b.pin);
      const v = b.qspp_stale_days === null || b.qspp_stale_days === "" ? null : Math.max(1, Math.round(Number(b.qspp_stale_days)));
      if (v !== null && !Number.isFinite(v)) throw httpError(400, "Enter a number of days.");
      const { data, error } = await db.from("pharmacy_settings").update({ qspp_stale_days: v }).eq("pharmacy_id", PHARMACY_ID).select("qspp_stale_days").single();
      if (error) throw error;
      return res.status(200).json({ settings: data });
    }

    const kind = b.kind;
    if (!TABLE[kind]) throw httpError(400, "Unknown register.");

    // The staff view (no PIN): hidden entries left out, manager-only sections stripped
    if (b.action === "list") {
      const order = kind === "incident" ? "incident_date" : "received_date";
      const { data, error } = await db.from(TABLE[kind]).select("*").eq("pharmacy_id", PHARMACY_ID).eq("hidden", false).order(order, { ascending: false });
      if (error) throw error;
      return res.status(200).json({ rows: (data || []).map((r) => staffViewOf(kind, r)) });
    }

    if (b.action === "report" || b.action === "log") {
      const manager = b.pin ? await requireManager(db, b.pin) : null;
      const allowed = kind === "incident"
        ? (manager ? [...INCIDENT_REPORT_FIELDS, ...INCIDENT_MANAGER_FIELDS] : INCIDENT_REPORT_FIELDS)
        : (manager ? FEEDBACK_MANAGER_FIELDS : FEEDBACK_LOG_FIELDS);
      const fields = pick(b.fields || {}, allowed);
      if (kind === "incident" && (!fields.reporter_staff_id || !fields.incident_date || !String(fields.nature_of_incident || "").trim())) throw httpError(400, "Fill in your name, the date and what happened.");
      if (kind === "feedback" && (!fields.logged_by_staff_id || !fields.received_date || !String(fields.details || "").trim())) throw httpError(400, "Fill in the fields marked *.");
      const { data: row, error } = await db.from(TABLE[kind]).insert([{ ...fields, pharmacy_id: PHARMACY_ID }]).select().single();
      if (error) throw error;
      return res.status(200).json({ row: manager ? row : staffViewOf(kind, row) });
    }

    const row = await loadRow(db, kind, b.id);

    if (b.action === "staff-update") {
      const patch = staffPatch(kind, row, b.patch || {});
      if (!Object.keys(patch).length) return res.status(200).json({ row: staffViewOf(kind, row) });
      return res.status(200).json({ row: staffViewOf(kind, await save(db, kind, row.id, patch)) });
    }

    if (b.action === "follow-up-done") {
      if (!isOpen(kind, row)) throw httpError(403, `This ${kind} is already ${kind === "incident" ? "resolved" : "closed"}.`);
      if (!row.assigned_to_staff_id) throw httpError(403, "No follow-up is assigned.");
      if (row.follow_up_done_at) throw httpError(409, "Follow-up done has already been recorded.");
      const note = String(b.note || "").trim();
      if (!note) throw httpError(400, "Add a short note saying what was done.");
      // Only the assigned person, with their own PIN
      const { data: who } = await db.from("staff").select("id").eq("id", row.assigned_to_staff_id).eq("pharmacy_id", PHARMACY_ID)
        .eq("active", true).eq("pin", String(b.pin || "")).maybeSingle();
      if (!/^\d{4}$/.test(String(b.pin || "")) || !who) throw httpError(403, "Incorrect PIN — only the person the follow-up is assigned to can mark it done.");
      const { data, error } = await db.from(TABLE[kind]).update({
        follow_up_done_note: note, follow_up_done_by_staff_id: Number(who.id), follow_up_done_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("id", row.id).is("follow_up_done_at", null).select().maybeSingle();
      if (error) throw error;
      if (!data) throw httpError(409, "Follow-up done has already been recorded.");
      return res.status(200).json({ row: staffViewOf(kind, data) });
    }

    if (b.action === "manager-update") {
      const manager = await requireManager(db, b.pin);
      const patch = pick(b.patch || {}, kind === "incident" ? INCIDENT_MANAGER_FIELDS : FEEDBACK_MANAGER_FIELDS);
      // Reassigned -> the new person's job; any "Follow-up done" (and its ready-to-resolve job) is cleared
      if ("assigned_to_staff_id" in patch && Number(patch.assigned_to_staff_id || 0) !== Number(row.assigned_to_staff_id || 0)) {
        Object.assign(patch, { follow_up_done_note: null, follow_up_done_by_staff_id: null, follow_up_done_at: null });
      }
      // Feedback to staff: "Given by" = whoever is in manager mode when it's first recorded (or its date changes)
      if (kind === "incident" && "staff_feedback_date" in patch) {
        if (!patch.staff_feedback_date) patch.staff_feedback_by_staff_id = null;
        else if (patch.staff_feedback_date !== row.staff_feedback_date || !row.staff_feedback_by_staff_id) patch.staff_feedback_by_staff_id = Number(manager.id);
      }
      return res.status(200).json({ row: await save(db, kind, row.id, patch) });
    }

    if (b.action === "manager-open") {
      await requireManager(db, b.pin);
      if (row.manager_opened_at) return res.status(200).json({ row });
      const { data, error } = await db.from(TABLE[kind]).update({ manager_opened_at: new Date().toISOString() })
        .eq("id", row.id).is("manager_opened_at", null).select().maybeSingle();
      if (error) throw error;
      return res.status(200).json({ row: data || row });
    }

    if (b.action === "delete") {
      await requireManager(db, b.pin);
      const { error } = await db.from(TABLE[kind]).delete().eq("id", row.id).eq("pharmacy_id", PHARMACY_ID);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    throw httpError(400, "Unknown action.");
  } catch (err) {
    if (!err?.status) console.error("[qspp/register]", err);
    res.status(err?.status || 500).json({ error: err?.message || String(err) });
  }
}
