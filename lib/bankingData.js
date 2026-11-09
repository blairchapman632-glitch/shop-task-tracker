// Daily Banking — loading and arranging days for the owner screens (Month, Insights, export), the kiosk Till count
// card and the weekly email. Works with any Supabase client (browser or server). Money rules stay in lib/banking.js.
// Dates are Perth calendar dates as "YYYY-MM-DD" strings, stepped as strings (never toISOString).
// Till for a day = cash takings + ALL tenders (incl. Loyalty and imported Amex / Cheque / Life Club / Other).
import { round2 } from "./banking";
import { addDaysStr } from "./performanceReview";

const pad = (n) => String(n).padStart(2, "0");
const parts = (s) => String(s).slice(0, 10).split("-").map(Number);
export const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MON_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const weekdayOf = (s) => { const [y, m, d] = parts(s); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }; // 0 = Sun
export const dayLabel = (s) => { const [, m, d] = parts(s); return `${WD[weekdayOf(s)]} ${d} ${MON[m - 1]}`; };
export const ddmmyyyy = (s) => { const [y, m, d] = parts(s); return `${pad(d)}/${pad(m)}/${y}`; };
export const monthStart = (ym) => `${ym}-01`;
export const monthEnd = (ym) => { const [y, m] = parts(`${ym}-01`); return `${ym}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`; };
export const addMonthsYm = (ym, n) => { const [y, m] = parts(`${ym}-01`); const t = y * 12 + (m - 1) + n; return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`; };
export const mondayOf = (s) => addDaysStr(s, -((weekdayOf(s) + 6) % 7));
// Financial year (Jul–Jun) a date is in: 2026-11-08 -> { start: "2026-07-01", end: "2027-06-30", label: "2026-27" }
export const fyOf = (s) => {
  const [y, m] = parts(s);
  const a = m >= 7 ? y : y - 1;
  return { start: `${a}-07-01`, end: `${a + 1}-06-30`, label: `${a}-${String(a + 1).slice(2)}`, startYear: a };
};
// Every date from a to b (inclusive)
export const datesBetween = (a, b) => { const out = []; for (let d = a; d <= b; d = addDaysStr(d, 1)) out.push(d); return out; };
// Mon–Sun weeks overlapping a month: [{ start, days: ["YYYY-MM-DD" in the month] }]
export function weeksOfMonth(ym) {
  const first = monthStart(ym);
  const last = monthEnd(ym);
  const out = [];
  for (let wk = mondayOf(first); wk <= last; wk = addDaysStr(wk, 7)) {
    out.push({ start: wk, end: addDaysStr(wk, 6), days: datesBetween(wk, addDaysStr(wk, 6)).filter((d) => d >= first && d <= last) });
  }
  return out;
}

// Page through a query past Supabase's 1,000-row cap. make = () => fresh query builder (with an .order()).
export async function fetchAll(make, size = 1000) {
  const out = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await make().range(from, from + size - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < size) return out;
  }
}

// Banking is tracked from pharmacy_settings.banking_start_date (docs/sql/daily_banking_start_date.sql): days before it
// were banked under the old spreadsheet and never show as waiting. null when not set (or the column isn't added yet).
export async function bankingStartDate(supabase, pharmacyId) {
  const { data, error } = await supabase.from("pharmacy_settings").select("banking_start_date").eq("pharmacy_id", pharmacyId).maybeSingle();
  return !error && data?.banking_start_date ? String(data.banking_start_date).slice(0, 10) : null;
}

// Cash not yet banked: confirmed days with cash and no deposit, on or after the banking start date — any source (app or
// import). With no start date, only days counted in the app (so the imported history never floods the list).
export function unbankedQuery(supabase, pharmacyId, select, startDate) {
  const q = supabase.from("daily_takings").select(select).eq("pharmacy_id", pharmacyId)
    .eq("status", "confirmed").is("bank_deposit_id", null).gt("cash_takings", 0);
  return startDate ? q.gte("takings_date", startDate) : q.eq("source", "app");
}

// The most recent Right till EFTPOS reading (eftpos_t1) before a date: the latest earlier day that isn't closed or
// missing and has a right till amount above $0 (app or imported days). Looks back 31 days. -> { date, amount } | null
export async function previousRightTill(supabase, pharmacyId, beforeDate) {
  const { data: type, error: e0 } = await supabase.from("banking_payment_types").select("id").eq("pharmacy_id", pharmacyId).eq("key", "eftpos_t1").maybeSingle();
  if (e0) throw e0;
  if (!type) return null;
  const { data: days, error: e1 } = await supabase.from("daily_takings").select("id, takings_date")
    .eq("pharmacy_id", pharmacyId).in("status", ["confirmed", "open"]).lt("takings_date", beforeDate).gte("takings_date", addDaysStr(beforeDate, -31))
    .order("takings_date", { ascending: false });
  if (e1) throw e1;
  if (!days?.length) return null;
  const { data: tt, error: e2 } = await supabase.from("daily_takings_tenders").select("daily_takings_id, amount")
    .eq("payment_type_id", type.id).in("daily_takings_id", days.map((d) => d.id));
  if (e2) throw e2;
  const amt = Object.fromEntries((tt || []).map((t) => [t.daily_takings_id, Number(t.amount) || 0]));
  const hit = days.find((d) => amt[d.id] > 0);
  return hit ? { date: String(hit.takings_date).slice(0, 10), amount: amt[hit.id] } : null;
}

export async function loadPaymentTypes(supabase, pharmacyId) {
  const { data, error } = await supabase.from("banking_payment_types").select("*").eq("pharmacy_id", pharmacyId).order("sort_order");
  if (error) throw error;
  return data || [];
}

// Days in [from, to] with their tenders ({ [payment_type_id]: amount }) and the deposits recorded in the range
export async function loadPeriod(supabase, pharmacyId, from, to, { deposits = true } = {}) {
  const days = await fetchAll(() => supabase.from("daily_takings").select("*")
    .eq("pharmacy_id", pharmacyId).gte("takings_date", from).lte("takings_date", to).order("takings_date"));
  const ids = days.map((d) => d.id);
  const tenders = [];
  for (let i = 0; i < ids.length; i += 200) { // .in() lists kept short
    const chunk = ids.slice(i, i + 200);
    tenders.push(...await fetchAll(() => supabase.from("daily_takings_tenders").select("daily_takings_id, payment_type_id, amount")
      .eq("pharmacy_id", pharmacyId).in("daily_takings_id", chunk).order("id")));
  }
  const byDay = {};
  for (const t of tenders) (byDay[t.daily_takings_id] = byDay[t.daily_takings_id] || {})[t.payment_type_id] = Number(t.amount) || 0;
  const out = days.map((d) => ({ ...d, takings_date: String(d.takings_date).slice(0, 10), tenders: byDay[d.id] || {} }));
  let deps = [];
  if (deposits) {
    deps = await fetchAll(() => supabase.from("bank_deposits").select("*").eq("pharmacy_id", pharmacyId)
      .gte("deposit_date", from).lte("deposit_date", to).order("deposit_date"));
    deps = deps.map((x) => ({ ...x, deposit_date: String(x.deposit_date).slice(0, 10) }));
  }
  return { days: out, deposits: deps };
}

// The figures for one day (null figures = nothing entered)
export function dayFigures(day, types) {
  const typeById = Object.fromEntries((types || []).map((t) => [t.id, t]));
  const tenderSum = Object.values(day.tenders || {}).reduce((s, a) => s + Number(a || 0), 0);
  const cash = Number(day.cash_takings || 0);
  const bendigo = Object.entries(day.tenders || {}).reduce((s, [id, a]) => s + (typeById[id]?.counts_to_bendigo ? Number(a || 0) : 0), 0);
  const eftpos = Object.entries(day.tenders || {}).reduce((s, [id, a]) => s + (typeById[id]?.kind === "eftpos" ? Number(a || 0) : 0), 0);
  return {
    till: round2(cash + tenderSum), cash: round2(cash), eftpos: round2(eftpos), other: round2(tenderSum - eftpos), bendigo: round2(bendigo),
    gst: day.gst_sales === null || day.gst_sales === undefined ? null : Number(day.gst_sales),
    customers: day.customers === null || day.customers === undefined ? null : Number(day.customers),
    hasFigures: cash !== 0 || tenderSum !== 0 || Number(day.customers || 0) > 0,
  };
}
// A day that counts in totals and averages (has figures; not closed / missing)
export const countsInTotals = (day) => !!day && !["closed", "missing"].includes(day.status);

// Payment types to show as columns for a set of days: active, or with an amount on one of the days (sort order)
export const columnTypes = (types, days) => {
  const used = new Set(days.flatMap((d) => Object.entries(d.tenders || {}).filter(([, a]) => Number(a)).map(([id]) => id)));
  return types.filter((t) => t.active !== false || used.has(t.id));
};

// ── Trading days and missed counts (Banking banner, kiosk card, weekly email) ──
const DOW_KEYS = ["hours_sunday", "hours_monday", "hours_tuesday", "hours_wednesday", "hours_thursday", "hours_friday", "hours_saturday"];
// Open that weekday? Empty or "Closed" = closed; anything else (even if it can't be read) = open
export const openOnWeekday = (settings, dow) => {
  const v = String(settings?.[DOW_KEYS[dow]] ?? "").trim();
  return v !== "" && !/^closed$/i.test(v);
};
// Perth "now" parts: { date: "YYYY-MM-DD", hour }
export const perthNow = () => {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Perth", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false });
  const p = Object.fromEntries(f.formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24 };
};
// Trading days in the last 7 days with no confirmed count. A day only counts from 10am the next day.
// -> ["YYYY-MM-DD", …] oldest first
export async function missedCounts(supabase, pharmacyId) {
  const now = perthNow();
  const lastDue = now.hour >= 10 ? addDaysStr(now.date, -1) : addDaysStr(now.date, -2);
  const first = addDaysStr(now.date, -7);
  if (lastDue < first) return [];
  const [{ data: settings }, { data: hols }, { data: rows }] = await Promise.all([
    supabase.from("pharmacy_settings").select(DOW_KEYS.join(", ")).eq("pharmacy_id", pharmacyId).maybeSingle(),
    supabase.from("public_holidays").select("date").eq("pharmacy_id", pharmacyId).gte("date", first).lte("date", lastDue),
    supabase.from("daily_takings").select("takings_date, status").eq("pharmacy_id", pharmacyId).gte("takings_date", first).lte("takings_date", lastDue),
  ]);
  const holidays = new Set((hols || []).map((h) => String(h.date).slice(0, 10)));
  const status = Object.fromEntries((rows || []).map((r) => [String(r.takings_date).slice(0, 10), r.status]));
  return datesBetween(first, lastDue).filter((d) =>
    !holidays.has(d) && openOnWeekday(settings, weekdayOf(d)) && status[d] !== "closed" && status[d] !== "confirmed");
}
