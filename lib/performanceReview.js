// Performance reviews — form structure + "who is due" helper. Shared by Admin, the PDF generator and (Part 2) /me.
// Paper form: QSPP-4.9-PERF-FORM v1.0 (QSPP 2.4.1.3(d)).

export const FORM_VERSION = "QSPP-4.9-PERF-FORM v1.0";
export const FORM_DOC_ID = "QSPP-4.9-PERF-FORM";
export const FORM_VERSION_NUMBER = "1.0";
export const FORM_QSPP_REF = "QSPP 2.4.1.3(d)";
export const FORM_TITLE = "Performance Review";

// ── Form wording ────────────────────────────────────────────────────────────
// Exact wording from the paper form QSPP-4.9-PERF-FORM v1.0. If the paper form changes, update here + FORM_VERSION.

export const RATING_OPTIONS = [
  { key: "needs_work", label: "Needs work" },
  { key: "meets", label: "Meets" },
  { key: "strength", label: "Strength" },
];
export const ratingLabel = (key) => RATING_OPTIONS.find((o) => o.key === key)?.label || "";

export const ALL_STAFF_AREAS = [
  { key: "policies", label: "Policies and procedures", description: "follows the pharmacy's policies and procedures for their role" },
  { key: "safety_quality", label: "Safety and quality", description: "reports incidents, near misses and complaints; suggests improvements" },
  { key: "patient_care", label: "Patient and customer care", description: "friendly and respectful; protects privacy; refers to the pharmacist when needed" },
  { key: "accuracy", label: "Accuracy", description: "careful work; checks before acting" },
  { key: "product_knowledge", label: "Product and service knowledge", description: "knows the products and services for their role; follows S2/S3 protocols" },
  { key: "teamwork", label: "Teamwork and communication", description: "works well with others; passes on information; uses Chalkboard" },
  { key: "reliability", label: "Reliability", description: "on time; works rostered shifts; gives notice of absences" },
];

export const DISPENSARY_HEADING = "Pharmacists, interns, students and dispensary technicians";
export const DISPENSARY_AREAS = [
  { key: "dispensing", label: "Dispensing", description: "accurate dispensing, clinical checks and counselling" },
  { key: "professional_services", label: "Professional services", description: "vaccination, DAA, MedsCheck and other services done to procedure, with complete records" },
  { key: "supervision_scope", label: "Supervision and scope", description: "supervises assistants and students; works within scope of practice" },
];

export const areasFor = (includeDispensary) => (includeDispensary ? [...ALL_STAFF_AREAS, ...DISPENSARY_AREAS] : ALL_STAFF_AREAS);

export const PREP_QUESTIONS = [
  { key: "gone_well", label: "What has gone well for you since your last review?" },
  { key: "difficult", label: "What has been difficult, and what would help?" },
  { key: "training", label: "What training or support would you like?" },
  { key: "workplace", label: "Is there anything about your workload, the roster or the workplace you would like to raise?" },
  { key: "anything_else", label: "Anything else you would like to discuss?" },
];

export const SECTIONS = [
  "1. Review details",
  "2. Staff member's preparation",
  "3. Performance",
  "4. Goals and training for the next 12 months",
  "5. Staff member's comments on the review",
  "6. Sign-off",
];

export const LABELS = {
  goalsProgress: "Progress on goals from the last review",
  overallSummary: "Overall summary",
  staffComments: "Staff member's comments on the review",
  goal: "Goal or training need",
  actions: "Actions and support",
  targetDate: "Target date",
  trainingAdded: "Training needs added to the staff member's Training & Development Plan",
};

export const REVIEW_TYPE_LABEL = { probation: "Probation", annual: "Annual" };

// ── Date maths (strings only — no toISOString, see Perth UTC+8 gotcha) ────────

export const todayPerth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Perth" }).format(new Date());

// Timestamp (ISO) -> Perth calendar date "YYYY-MM-DD"
export const perthDateOf = (iso) =>
  iso ? new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Perth" }).format(new Date(iso)) : null;

const pad = (n) => String(n).padStart(2, "0");

// "2026-11-30" + 3 months -> "2027-02-28" (day clamped to the end of the target month)
export const addMonthsStr = (dateStr, months) => {
  const [y, m, d] = String(dateStr).slice(0, 10).split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ty = Math.floor(total / 12);
  const tm = total % 12; // 0-based
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return `${ty}-${pad(tm + 1)}-${pad(Math.min(d, lastDay))}`;
};

export const addDaysStr = (dateStr, n) => {
  const [y, m, d] = String(dateStr).slice(0, 10).split("-").map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + n));
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
};

// ── Who is due ──────────────────────────────────────────────────────────────

export const PROBATION_MONTHS = 3;
export const ANNUAL_MONTHS = 12;

export const isReviewable = (s) =>
  !!s && s.role !== "Locum" && s.active !== false && s.exclude_from_reviews !== true;

// Latest signed review (by signed_at) from a list for one staff member
export const latestSigned = (reviews) =>
  (reviews || []).filter((r) => r.status === "signed" && r.signed_at)
    .sort((a, b) => String(b.signed_at).localeCompare(String(a.signed_at)))[0] || null;

// Suggested type for a NEW review: Probation if there's no signed review and the 3-month mark is still
// in the future or within the last 3 months; otherwise Annual.
export const suggestedReviewType = (staff, reviews, today = todayPerth()) => {
  if (latestSigned(reviews) || !staff?.start_date) return "annual";
  const probationDate = addMonthsStr(staff.start_date, PROBATION_MONTHS);
  return probationDate >= addMonthsStr(today, -PROBATION_MONTHS) ? "probation" : "annual";
};

// When is this staff member's next review due?
// Returns null if they're not reviewable, otherwise
//   { type: 'probation'|'annual', dueDate: "YYYY-MM-DD", dueNow: bool }  or  { noStartDate: true }
// dueNow = due date is today or earlier. "No review and past probation" uses today as the due date.
export const reviewDue = (staff, reviews, today = todayPerth()) => {
  if (!isReviewable(staff)) return null;
  const last = latestSigned(reviews);
  if (last) {
    const dueDate = addMonthsStr(perthDateOf(last.signed_at), ANNUAL_MONTHS);
    return { type: "annual", dueDate, dueNow: dueDate <= today };
  }
  if (!staff.start_date) return { noStartDate: true };
  const probationDate = addMonthsStr(staff.start_date, PROBATION_MONTHS);
  if (probationDate > today) return { type: "probation", dueDate: probationDate, dueNow: false };
  const type = suggestedReviewType(staff, reviews, today);
  return { type, dueDate: type === "probation" ? probationDate : today, dueNow: true };
};

// Next review due after a signed review (signed date + 12 months)
export const nextDueAfter = (review) => (review?.signed_at ? addMonthsStr(perthDateOf(review.signed_at), ANNUAL_MONTHS) : null);

// "2026-11-02" -> "2 Nov 2026"
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDateShort = (s) => {
  if (!s) return "";
  const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return String(s);
  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
};
