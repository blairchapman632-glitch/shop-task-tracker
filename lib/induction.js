// Staff induction (QSPP-4.9-induction-checklist v2.1) — new starters only.
// Tables: induction_template_items (seeded), staff_inductions (one per person), staff_induction_items (snapshot + results).
// Used by components/InductionTab.js (Admin → New starter) and components/StaffNeedsAttention.js.
import { addMonthsStr, addDaysStr, todayPerth } from "./performanceReview";

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

// Section 1 is the header and Section 6 comes from the probation review (later stage).
// "Getting started" is practical, not a QSPP requirement (pdfLabel for the Stage 5 PDF); markAll = "Mark section done" button.
export const SECTIONS = [
  { key: "start", title: "Getting started", sub: "", pdfLabel: "Practical — not a QSPP requirement", markAll: true },
  { key: "2", title: "2. First week", sub: "Shown or explained by your supervisor" },
  { key: "3", title: "3. First month", sub: "Policies to read" },
  { key: "4", title: "4. Within 3 months", sub: "Procedures for your role", otherHeading: "Other procedures for your role" },
  { key: "5", title: "5. Your training", sub: "", otherHeading: "Other items" },
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

// Needs attention state for an in-progress induction: red overdue, amber within 14 days, otherwise neutral
export const inductionState = (dueDate, today = todayPerth()) =>
  !dueDate ? "neutral" : dueDate < today ? "not_done" : dueDate <= addDaysStr(today, DUE_SOON_DAYS) ? "due" : "neutral";
