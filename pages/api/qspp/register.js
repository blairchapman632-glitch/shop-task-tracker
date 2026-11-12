// QSPP incidents & feedback — every save goes through here (no login: /qspp is used on the shop computers).
//   POST { action, kind: "incident" | "feedback", ... }
//     report / log          { fields, pin? }   anyone; manager fields only with a valid manager PIN. Pushes a phone alert
//                                              to every active QSPP manager (staff.is_qspp_manager) except whoever logged it.
//     staff-update          { id, patch }       anyone: incident -> action taken / actioned by / follow-up, only while the
//                                              incident is open and not yet actioned; feedback -> response, date
//                                              responded, improvement, each only while still empty.
//     manager-update        { id, patch, pin }  QSPP manager mode: the review section, close / reopen, hide.
//     manager-open          { id, pin }         first opened in manager mode -> manager_opened_at (clears Needs attention)
//     delete                { id, pin }
//   POST { action: "settings", pin, qspp_stale_days }   "Flag incidents open longer than X days" (null = off)
//   -> { row } / { settings }
// The manager PIN is re-checked here on every manager request (lib/adminPin.js: a staff PIN with can_access_admin).
// NOTE: while RLS is off on incidents / feedback the tables can still be written directly with the public key — closing
// that is part of the RLS pass (CLAUDE.md).
import supabaseAdmin from "../../../lib/supabaseAdmin";
import { checkAdminPin } from "../../../lib/adminPin";
import { sendPushToStaff } from "../../../lib/pushServer";
import {
  INCIDENT_REPORT_FIELDS, INCIDENT_STAFF_FIELDS, INCIDENT_MANAGER_FIELDS,
  FEEDBACK_LOG_FIELDS, FEEDBACK_STAFF_FIELDS, FEEDBACK_MANAGER_FIELDS, pick,
} from "../../../lib/qspp";

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";
const TABLE = { incident: "incidents", feedback: "feedback" };
const httpError = (status, message) => Object.assign(new Error(message), { status });

async function requireManager(db, pin) {
  const user = await checkAdminPin(db, PHARMACY_ID, pin);
  if (!user) throw httpError(403, "Manager PIN needed — unlock 🔒 Manager again.");
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

// Phone alert to the QSPP managers (never patient names or details)
async function alertManagers(db, kind, row) {
  const byId = kind === "incident" ? row.reporter_staff_id : row.logged_by_staff_id;
  const { data: managers, error } = await db.from("staff").select("id")
    .eq("pharmacy_id", PHARMACY_ID).eq("is_qspp_manager", true).eq("active", true);
  if (error) throw error;
  const ids = (managers || []).map((m) => m.id).filter((id) => Number(id) !== Number(byId));
  if (!ids.length) return 0;
  const { data: who } = await db.from("staff").select("name").eq("id", byId).maybeSingle();
  const first = String(who?.name || "").split(" ")[0] || "a staff member";
  return sendPushToStaff(db, ids, kind === "incident"
    ? { title: "QSPP", body: `New incident #${row.report_number} reported by ${first}`, url: `/qspp?tab=incidents&incident=${row.id}` }
    : { title: "QSPP", body: `New feedback logged by ${first}`, url: `/qspp?tab=feedback&feedback=${row.id}` });
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
      let alerted = 0;
      try { alerted = await alertManagers(db, kind, row); } catch (e) { console.error("[qspp] push failed", e); } // never lose the report over a push
      return res.status(200).json({ row, alerted });
    }

    const row = await loadRow(db, kind, b.id);

    if (b.action === "staff-update") {
      const patch = staffPatch(kind, row, b.patch || {});
      if (!Object.keys(patch).length) return res.status(200).json({ row });
      return res.status(200).json({ row: await save(db, kind, row.id, patch) });
    }

    if (b.action === "manager-update") {
      await requireManager(db, b.pin);
      const patch = pick(b.patch || {}, kind === "incident" ? INCIDENT_MANAGER_FIELDS : FEEDBACK_MANAGER_FIELDS);
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
