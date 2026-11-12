// QSPP incidents & feedback — shared rules (browser + server).
//   Which fields staff may set vs which need QSPP manager mode (enforced in pages/api/qspp/register.js), and the
//   Needs attention / open-count rules (Admin → Staff → Needs attention, the /qspp sidebar count, the /qspp list badges).
import { todayPerth, perthDateOf } from "./performanceReview";

// ── Incidents ──
// Reporting (anyone): the report itself + the staff part of the action
export const INCIDENT_REPORT_FIELDS = [
  "reporter_staff_id", "incident_date", "incident_time", "nature_of_incident",
  "person_name", "person_dob", "person_occupation", "person_address", "person_postcode",
  "person_phone_h", "person_phone_b", "person_phone_m", "witnesses",
  "action_needed", "actioned_by_staff_id", "follow_up_required",
];
// Staff, on an OPEN incident, while not yet actioned (locked once "actioned by" is saved)
export const INCIDENT_STAFF_FIELDS = ["action_needed", "actioned_by_staff_id", "follow_up_required"];
// QSPP manager mode only: the review section, closing / reopening, hiding
export const INCIDENT_MANAGER_FIELDS = [
  ...INCIDENT_STAFF_FIELDS,
  "quality_improvement", "clinical_type", "third_party_reports", "patient_harmed",
  "disclosure_date", "disclosure_by_staff_id", "disclosure_notes", "staff_feedback_date", "staff_feedback_how",
  "assigned_to_staff_id", "date_resolved", "hidden",
];

// ── Feedback ──
export const FEEDBACK_LOG_FIELDS = ["received_date", "logged_by_staff_id", "feedback_type", "category", "received_via", "details", "contact"];
// Staff follow-up notes (each part locked once filled)
export const FEEDBACK_STAFF_FIELDS = ["response", "responded_date", "improvement"];
// QSPP manager mode only: edit everything, close, hide
export const FEEDBACK_MANAGER_FIELDS = [...FEEDBACK_LOG_FIELDS, ...FEEDBACK_STAFF_FIELDS, "closed_date", "hidden"];

export const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj && Object.prototype.hasOwnProperty.call(obj, k)).map((k) => [k, obj[k]]));

export const isOpen = (kind, row) => (kind === "incident" ? !row.date_resolved : !row.closed_date);

// Whole days an entry has been open (from the day it was logged, Perth dates)
export function daysOpen(row, today = todayPerth()) {
  const from = perthDateOf(row.created_at) || row.incident_date || row.received_date;
  if (!from) return 0;
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = today.split("-").map(Number);
  return Math.max(0, Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000));
}

// One entry's status for managers -> { isNew, stale, days } (hidden or closed entries: nothing)
//   isNew: open and never opened in QSPP manager mode
//   stale: open longer than the "Flag incidents open longer than X days" setting (staleDays null/0 = off)
export function reviewStatus(kind, row, staleDays, today = todayPerth()) {
  if (row.hidden || !isOpen(kind, row)) return { isNew: false, stale: false, days: 0 };
  const days = daysOpen(row, today);
  return { isNew: !row.manager_opened_at, stale: !!staleDays && days > Number(staleDays), days };
}

// Needs attention items for incidents + feedback -> [{ key, kind, id, item, label, state, sort }]
export function qsppAttention({ incidents = [], feedback = [], staleDays = null, today = todayPerth() }) {
  const out = [];
  const add = (kind, row, what) => {
    const s = reviewStatus(kind, row, staleDays, today);
    if (!s.isNew && !s.stale) return;
    const logged = perthDateOf(row.created_at) || "";
    out.push({
      key: `${kind}-${row.id}`, kind, id: row.id,
      who: what,
      item: s.isNew ? `New ${kind} to review` : `${kind === "incident" ? "Incident" : "Feedback"} still open`,
      label: s.stale ? `Open ${s.days} day${s.days === 1 ? "" : "s"}` : `Logged ${logged.split("-").reverse().join("/")}`,
      state: s.stale ? "not_done" : "due",
      sort: logged,
    });
  };
  for (const i of incidents) add("incident", i, `Incident #${i.report_number}`);
  for (const f of feedback) add("feedback", f, `${f.feedback_type === "negative" ? "Negative" : "Positive"} feedback`);
  return out.sort((a, b) => a.sort.localeCompare(b.sort));
}

// Open incidents + open feedback (not hidden) — the /qspp sidebar count in manager mode
export const openCount = (incidents = [], feedback = []) =>
  incidents.filter((i) => !i.hidden && isOpen("incident", i)).length + feedback.filter((f) => !f.hidden && isOpen("feedback", f)).length;
