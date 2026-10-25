// Staff induction (QSPP-4.9-induction-checklist v2.1) — new starters only.
// Tables: induction_template_items (seeded), staff_inductions (one per person), staff_induction_items (snapshot + results).
// Used by components/InductionTab.js (Admin → New starter) and components/StaffNeedsAttention.js.
import { addMonthsStr, addDaysStr, todayPerth, perthDateOf, fmtDateShort } from "./performanceReview";

export const FORM_VERSION = "QSPP-4.9-induction-checklist v2.2";
export const TEMPLATE_VERSION = "v2.2";
export const DUE_MONTHS = 3;        // complete within 3 months of starting
export const DUE_SOON_DAYS = 14;    // amber in Needs attention from this many days before the due date
export const STUDENT_TEMPLATE_KEY = "casual_student"; // contract_templates.key → pre-tick "Pharmacy student"

// Staff role → checklist position. Locums never get an induction.
export const ROLE_POSITION = {
  "Pharmacist": "PH",
  "Intern Pharmacist": "INT",
  "Pharmacy Assistant": "PA",
  "DAA Coordinator": "DT",
  "Retail Manager": "PA",
};
export const positionForRole = (role) => ROLE_POSITION[role] || null;

// Section 1 is the header; the last numbered section (shown as "5. Probation review and sign-off") isn't a line section.
export const SIGNOFF_TITLE = "5. Probation review and sign-off";
// "Getting started" is practical, not a QSPP requirement (pdfLabel for the Stage 5 PDF); markAll = "Mark section done" button.
export const SECTIONS = [
  { key: "start", title: "Getting started", sub: "", pdfLabel: "Practical — not a QSPP requirement", markAll: true },
  { key: "2", title: "2. First week", sub: "Shown or explained by your supervisor" },
  { key: "3", title: "3. First month", sub: "Policies to read" },
  { key: "4", title: "4. Within 3 months", sub: "Procedures for your role", otherHeading: "Other procedures for your role" },
  // Retired in v2.2 (its lines moved to Getting started / Office use). Kept only so older inductions still show their
  // Section 5 lines; screens and the PDF hide it when it has no lines. Un-numbered: the sign-off section is now "5".
  { key: "5", title: "Your training", sub: "" },
  { key: "office", title: "Office use", sub: "" },
];

export const ANSWER_LABEL = { done: "Done", na: "N/A", declined: "Declined" };
export const answerLabel = (answer, section) => (answer === "done" && section === "4" ? "Competent" : ANSWER_LABEL[answer] || "");
export const VIA_LABEL = { admin: "Admin", me: "Phone", kiosk: "Kiosk", auto: "Auto" };

export const dueDateFor = (startDate) => (startDate ? addMonthsStr(startDate, DUE_MONTHS) : null);

// Template rows that apply to this person (position match; student-only lines only for students)
export const templateItemsFor = (templateItems, position, isStudent) =>
  (templateItems || []).filter((t) =>
    t.active !== false && (t.positions || []).includes(position) && (!t.student_only || isStudent));

// Snapshot a template row into a staff_induction_items insert
export const snapshotItem = (t, inductionId, pharmacyId) => ({
  pharmacy_id: pharmacyId,
  induction_id: inductionId,
  template_item_id: t.id,
  is_custom: false,
  section: t.section,
  group_heading: t.group_heading,
  wording: t.wording,
  sort_order: t.sort_order,
  pharmacist_only: t.pharmacist_only,
  student_only: t.student_only ?? false,
  allowed_answers: t.allowed_answers,
  kind: t.kind,
  auto_source: t.auto_source,
  document_id: t.document_id,
  note_hint: t.note_hint,
});

// "x of y": an item counts once it has any result (N/A and Declined included)
export const inductionProgress = (items) => ({
  done: (items || []).filter((i) => i.result).length,
  total: (items || []).length,
});

// ── Section 6 + sign-off (Stage 5) ──────────────────────────────────────────

// Header block of the paper form (PDF). Blank values print as "—".
export const FORM_META = {
  title: "Staff Induction Checklist",
  docId: "QSPP-4.9-induction-checklist",
  version: "2.2",
  effective: "October 2026",
  reviewDue: "October 2027",
  owner: "Blair Chapman, Pharmacist-in-Charge",
  qsppRefs: "2.4.1.1, 2.4.1.3 (a)–(c), 1.1.3.1, 1.1.3.4, 2.3.1.8, 2.4.1.5",
};

export const OUTCOMES = [
  { key: "confirmed", label: "Confirmed" },
  { key: "extended", label: "Extended" },
  { key: "not_confirmed", label: "Not confirmed" },
];
export const outcomeText = (ind) =>
  ind?.probation_outcome === "extended"
    ? `Extended to ${ind.probation_extended_to ? fmtDateShort(ind.probation_extended_to) : "—"}`
    : OUTCOMES.find((o) => o.key === ind?.probation_outcome)?.label || "";

// The person's probation review: newest signed one, else the newest unsigned one
export const pickProbationReview = (reviews) => {
  const prob = (reviews || []).filter((r) => r.review_type === "probation");
  const signed = prob.filter((r) => r.status === "signed" && r.signed_at).sort((a, b) => String(b.signed_at).localeCompare(String(a.signed_at)));
  return signed[0] || prob.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0] || null;
};
export const reviewDateOf = (review) => review?.meeting_date || perthDateOf(review?.signed_at) || null;

// Perth date of the latest answered line
export const lastAnsweredDate = (items) =>
  (items || []).filter((i) => i.result && i.signed_at).map((i) => perthDateOf(i.signed_at)).sort().pop() || null;

// -> { ready, missing: [text], allAnswered, late, lastDate }
// late: finished (or, while unfinished, today) after the due date — then a reason is required.
export function inductionReadiness(induction, items, review, today = todayPerth()) {
  const missing = [];
  const open = (items || []).filter((i) => !i.result).length;
  const allAnswered = open === 0 && (items || []).length > 0;
  const lastDate = allAnswered ? lastAnsweredDate(items) : null;
  const late = !!induction?.due_date && (allAnswered ? lastDate || today : today) > induction.due_date;
  if (open) missing.push(`${open} line${open === 1 ? "" : "s"} not answered`);
  if (!review) missing.push("No probation review yet");
  else if (review.status !== "signed") missing.push("Probation review not signed");
  if (!induction?.probation_outcome) missing.push("Probation outcome not recorded");
  else if (induction.probation_outcome === "extended" && !induction.probation_extended_to) missing.push("Extension date not set");
  if (late && !String(induction?.late_reason || "").trim()) missing.push("Reason for finishing after the 3 months");
  return { ready: missing.length === 0, missing, allAnswered, late, lastDate };
}

// Who answered a line, as printed / shown: name | "Admin" | "Auto" | "Read · kiosk"
export const signerLabel = (item, nameOf = () => "") => {
  if (!item?.result) return "";
  if (item.signed_via === "me") return nameOf(item.signed_by_staff_id) || "Staff";
  if (item.signed_via === "admin") return "Admin";
  if (item.signed_via === "auto") {
    if (item.section === "3") return `Read${/· (\w+)$/.test(item.note || "") ? ` · ${item.note.match(/· (\w+)$/)[1]}` : ""}`;
    return "Auto";
  }
  return VIA_LABEL[item.signed_via] || item.signed_via || "";
};

// Needs attention state for an in-progress induction: red overdue, amber within 14 days, otherwise neutral
export const inductionState = (dueDate, today = todayPerth()) =>
  !dueDate ? "neutral" : dueDate < today ? "not_done" : dueDate <= addDaysStr(today, DUE_SOON_DAYS) ? "due" : "neutral";
