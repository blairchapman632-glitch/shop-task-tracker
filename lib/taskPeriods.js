// Monthly On the List tasks with a "show from" day (Recurring tasks → Monthly → "Show from day").
// tasks.day_of_month on a monthly_anytime On the List task: 1–31, or 0 = last day of the month.
// Days 29–31 count as the last day in shorter months. No show-from day = shows from the 1st (unchanged).
// A missed month carries over into the next month as a red card; completing it counts for the month it belonged to
// (completions.period_start = "YYYY-MM-01" of that month). Used by the kiosk, Insights and the Tasks page.
// Strings only — no toISOString for dates (Perth).
import { perthDateOf } from "./performanceReview";

export const LAST_DAY = 0;

export const hasShowFrom = (t) =>
  !!t && t.task_type === "on_the_list" && t.frequency === "monthly_anytime" && t.day_of_month !== null && t.day_of_month !== undefined && t.day_of_month !== "";

const pad = (n) => String(n).padStart(2, "0");
const lastDayOf = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

// "2026-10" -> "2026-09"
export const prevMonthOf = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
};

// The date the task shows from in a month ("YYYY-MM-DD")
export const showFromDate = (task, ym) => {
  const last = lastDayOf(ym);
  const d = Number(task.day_of_month);
  return `${ym}-${pad(d === LAST_DAY || d >= last ? last : d)}`;
};

const ordinal = (n) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};
// "from 15th" / "last day"
export const showFromLabel = (day) => (Number(day) === LAST_DAY ? "last day" : `from ${ordinal(Number(day))}`);

// "2026-10" -> "Oct"
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthShort = (ym) => MONTHS[Number(String(ym).slice(5, 7)) - 1] || "";

// Month ("YYYY-MM") a completion counts for: its period_start if set (a carried-over month), else when it was done (Perth)
export const periodMonthOfCompletion = (c) =>
  (c?.period_start ? String(c.period_start).slice(0, 7) : String(perthDateOf(c.completed_at)).slice(0, 7));
