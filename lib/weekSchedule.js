// Shared regular-schedule helpers (Admin weekly_schedule / week_ab_schedule).
// Used by lib/leaveCover.js and the roster's copy-previous-month.

// Day-of-week key used by the Admin schedule objects
export const DOW_KEY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// Whole days from one "YYYY-MM-DD" to another, via UTC so DST can't skew it
const daysBetween = (fromStr, toStr) => {
  const [fy, fm, fd] = fromStr.split("-").map(Number);
  const [ty, tm, td] = toStr.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
};

// Determine Week A or Week B for a date, anchored to the payroll start date.
// Week A = even week-index from the payroll anchor; Week B = odd.
// (Verified: payroll_start 2026-05-27, Sat 2026-08-29 = Week B.)
export const weekAB = (dateStr, payrollStart) => {
  if (!payrollStart) return "a";
  const weekIndex = Math.floor(daysBetween(String(payrollStart).slice(0, 10), dateStr) / 7);
  return weekIndex % 2 === 0 ? "a" : "b";
};

// Add whole days to a "YYYY-MM-DD" string, via UTC so the result can't drift a day in Perth
const addDaysStr = (dateStr, n) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + n));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}-${String(x.getUTCDate()).padStart(2, "0")}`;
};

// The fortnightly pay period (Wed–Tue) containing a date, anchored to the payroll start date.
// Returns { start, end } as "YYYY-MM-DD" strings (end inclusive), or null with no anchor.
// Same periods as the Wages page's getPeriod.
export const payPeriodFor = (dateStr, payrollStart) => {
  if (!payrollStart || !dateStr) return null;
  const anchor = String(payrollStart).slice(0, 10);
  const idx = Math.floor(daysBetween(anchor, String(dateStr).slice(0, 10)) / 14);
  const start = addDaysStr(anchor, idx * 14);
  return { start, end: addDaysStr(start, 13) };
};

// Given a staff member and a date, return their normal shift that day
// ({ start, end }) or null if they don't normally work it.
export const normalShiftFor = (staff, dateStr, payrollStart) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const key = DOW_KEY[new Date(y, m - 1, d).getDay()];

  if (staff.schedule_type === "alternating" && staff.week_ab_schedule) {
    const wk = weekAB(dateStr, payrollStart);
    const grid = staff.week_ab_schedule[wk];
    const day = grid?.[key];
    if (day?.active && day.start && day.end) return { start: day.start, end: day.end };
    return null;
  }

  if (staff.schedule_type === "weekly" && staff.weekly_schedule) {
    const day = staff.weekly_schedule[key];
    if (day?.active && day.start && day.end) return { start: day.start, end: day.end };
    return null;
  }

  return null;
};
