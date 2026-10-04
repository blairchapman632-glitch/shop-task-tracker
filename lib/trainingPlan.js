// Training & Development Plan (QSPP 2.4.1.5) — shared rules. Used by Admin (QSPP → Training, staff Training tab)
// and later /me. All dates are "YYYY-MM-DD" strings; maths via lib/performanceReview helpers (UTC, no toISOString).
//
// Plan = Pharmacy Assistant / DAA Coordinator (configurable): S2/S3 certificate (from Documents) + training hours
// (from training records) per training year and per 3-year QSPP cycle. Certificates' expiry lives on Documents.
import { addMonthsStr, addDaysStr, todayPerth, fmtDateShort } from "./performanceReview";

export const PLAN_ROLES = ["Pharmacist", "Intern Pharmacist", "Pharmacy Assistant", "DAA Coordinator", "Retail Manager"];
export const CYCLE_YEARS = 3;
export const S2S3_GRACE_MONTHS = 3;   // S2/S3 is "Due by" start + 3 months, then "Not done"
export const WARN_DAYS = 60;          // year/cycle shortfalls and certificate expiry flagged this far ahead

// Staff Documents tab file types (locum_documents.type) — labels for the settings dropdown and certificate alerts
export const DOC_TYPE_LABELS = {
  resume: "Resume",
  first_aid_cert: "First Aid Certificate",
  cpr_cert: "CPR Certificate",
  induction_checklist: "Induction Checklist",
  confidentiality_policy: "Signed Confidentiality Policy",
  ahpra_cert: "AHPRA Certificate",
  indemnity_cert: "Professional Indemnity Certificate",
  vaccination_accreditation: "Vaccination Accreditation",
  s2_s3_cert: "S2/S3 Certificate",
  signed_contract: "Employment contract",
  other: "Other document",
};
export const docTypeLabel = (t) => DOC_TYPE_LABELS[t] || t || "Document";

// ── Config (pharmacy_settings) ──────────────────────────────────────────────

export const DEFAULT_CONFIG = { hoursPerYear: 3, s2s3Type: "s2_s3_cert", planRoles: ["Pharmacy Assistant", "DAA Coordinator"] };
export const configFrom = (settings) => ({
  hoursPerYear: settings?.training_hours_per_year != null ? Number(settings.training_hours_per_year) : DEFAULT_CONFIG.hoursPerYear,
  s2s3Type: settings?.training_s2s3_doc_type || DEFAULT_CONFIG.s2s3Type,
  planRoles: Array.isArray(settings?.training_plan_roles) ? settings.training_plan_roles : DEFAULT_CONFIG.planRoles,
});
export const SETTINGS_COLUMNS = "name, address, phone, qspp_cycle_start_date, training_hours_per_year, training_s2s3_doc_type, training_plan_roles";

// Who has a plan (S2/S3 + hours): plan roles only, active, never Locums
export const hasPlan = (s, cfg) => !!s && s.role !== "Locum" && s.active !== false && (cfg?.planRoles || []).includes(s.role);
// Manual goals: everyone except Locums
export const hasGoals = (s) => !!s && s.role !== "Locum";

// ── Training year + QSPP cycle ──────────────────────────────────────────────

const yearsFrom = (anchor, n) => addMonthsStr(anchor, n * 12); // Feb 29 anchors clamp to Feb 28

// Training year containing `date`: anniversary on/before it to the day before the next. -> { start, end, next } | null
export function trainingYear(anchor, date = todayPerth()) {
  if (!anchor) return null;
  const a = String(anchor).slice(0, 10);
  const ay = Number(a.slice(0, 4));
  let n = Number(date.slice(0, 4)) - ay;
  if (yearsFrom(a, n) > date) n -= 1;
  const next = yearsFrom(a, n + 1);
  return { start: yearsFrom(a, n), end: addDaysStr(next, -1), next, index: n };
}

// QSPP cycle (3 training years from the anchor) containing `date`. -> { start, end, next, years: [3 × {start, end}] } | null
export function qsppCycle(anchor, date = todayPerth()) {
  const ty = trainingYear(anchor, date);
  if (!ty) return null;
  const a = String(anchor).slice(0, 10);
  const first = Math.floor(ty.index / CYCLE_YEARS) * CYCLE_YEARS;
  const years = [0, 1, 2].map((i) => ({ start: yearsFrom(a, first + i), end: addDaysStr(yearsFrom(a, first + i + 1), -1) }));
  const next = yearsFrom(a, first + CYCLE_YEARS);
  return { start: years[0].start, end: addDaysStr(next, -1), next, years };
}

// Whole days from a to b inclusive
export const daysInclusive = (a, b) => {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000) + 1;
};

// Round up to the nearest 0.5 (tiny tolerance so 1.5000000001 from float maths doesn't become 2)
export const roundUpHalf = (x) => Math.ceil(x * 2 - 1e-9) / 2 || 0;

// Hours required in one training year: full in years after they started, pro-rata (rounded up to 0.5) in the year
// they start, 0 before they started or when marked "not required". No start date = full requirement.
export function yearRequirement(staff, year, cfg, exempt = false) {
  const full = Number(cfg?.hoursPerYear) || 0;
  if (exempt) return 0;
  const start = staff?.start_date ? String(staff.start_date).slice(0, 10) : null;
  if (!start || start <= year.start) return full;
  if (start > year.end) return 0;
  return roundUpHalf(full * daysInclusive(start, year.end) / daysInclusive(year.start, year.end));
}

const round2 = (n) => Math.round(n * 100) / 100;
export const hoursBetween = (records, start, end) =>
  round2((records || []).filter((r) => r.training_date && r.training_date >= start && r.training_date <= end)
    .reduce((sum, r) => sum + (Number(r.hours) || 0), 0));

// Hours for this training year + this cycle.
//   records: this person's training records; exemptions: this person's staff_training_exemptions rows
// -> { year, cycle, yearDone, yearReq, cycleDone, cycleReq, exemption, yearShort, cycleShort } | null without an anchor
export function hoursStatus(staff, records, exemptions, anchor, cfg, today = todayPerth()) {
  const year = trainingYear(anchor, today);
  const cycle = qsppCycle(anchor, today);
  if (!year || !cycle) return null;
  const exemptFor = (start) => (exemptions || []).find((e) => String(e.training_year_start).slice(0, 10) === start) || null;
  const exemption = exemptFor(year.start);
  const yearReq = yearRequirement(staff, year, cfg, !!exemption);
  const cycleReq = round2(cycle.years.reduce((sum, y) => sum + yearRequirement(staff, y, cfg, !!exemptFor(y.start)), 0));
  const yearDone = hoursBetween(records, year.start, year.end);
  const cycleDone = hoursBetween(records, cycle.start, cycle.end);
  return { year, cycle, yearDone, yearReq, cycleDone, cycleReq, exemption, yearShort: yearDone < yearReq, cycleShort: cycleDone < cycleReq };
}

// ── Documents ───────────────────────────────────────────────────────────────

const byNewest = (a, b) => String(b.uploaded_at || "").localeCompare(String(a.uploaded_at || "")) || Number(b.id) - Number(a.id);

// Newest file of each type per person (only these count for S2/S3 and expiry)
export function latestDocsByType(docs) {
  const out = new Map();
  for (const d of [...(docs || [])].sort(byNewest)) {
    const key = `${d.staff_id}|${d.type}`;
    if (!out.has(key)) out.set(key, d);
  }
  return [...out.values()];
}

// S2/S3: Done (newest Documents file of the configured type), else Due by start + 3 months, else Not done
// -> { state: "done" | "due" | "not_done", label, doc? }
export function s2s3Status(staff, docs, cfg, today = todayPerth()) {
  const doc = [...(docs || [])].filter((d) => d.type === cfg.s2s3Type && Number(d.staff_id) === Number(staff.id)).sort(byNewest)[0];
  if (doc) return { state: "done", label: "Done", doc };
  if (staff?.start_date) {
    const dueBy = addMonthsStr(String(staff.start_date).slice(0, 10), S2S3_GRACE_MONTHS);
    if (today <= dueBy) return { state: "due", label: `Due by ${fmtDateShort(dueBy)}` };
  }
  return { state: "not_done", label: "Not done" };
}

// Certificate expiry for a (newest-of-type) document -> { state: "expired" | "expiring", label } | null
export function certExpiry(doc, today = todayPerth()) {
  const exp = doc?.expiry_date ? String(doc.expiry_date).slice(0, 10) : null;
  if (!exp) return null;
  if (exp < today) return { state: "expired", label: `Expired ${fmtDateShort(exp)}`, date: exp };
  if (exp <= addDaysStr(today, WARN_DAYS)) return { state: "expiring", label: `Expires ${fmtDateShort(exp)}`, date: exp };
  return null;
}

export const STATE_STYLE = {
  done: "bg-green-50 text-green-700 border-green-200",
  due: "bg-amber-50 text-amber-700 border-amber-200",
  expiring: "bg-amber-50 text-amber-700 border-amber-200",
  short: "bg-amber-50 text-amber-700 border-amber-200",
  not_done: "bg-red-50 text-red-600 border-red-200",
  expired: "bg-red-50 text-red-600 border-red-200",
  neutral: "bg-gray-50 text-gray-600 border-gray-200",
};

// Fetch every row of a query past Supabase's silent 1,000-row cap. makeQuery() must return a fresh builder.
export async function fetchAllRows(makeQuery, pageSize = 1000) {
  const out = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < pageSize) return out;
  }
}
