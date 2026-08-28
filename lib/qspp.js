// Shared QSPP training-cycle logic.
// Rule: 3 hours per year, 3-year cycle = 9 hours required per cycle.
// Only applies to Pharmacy Assistants. Cycle anchored to a fixed date in pharmacy_settings.

const HOURS_PER_YEAR = 3;
const CYCLE_YEARS = 3;
export const QSPP_HOURS_REQUIRED = HOURS_PER_YEAR * CYCLE_YEARS; // 9

// Does QSPP apply to this staff member's role?
export function qsppApplies(role) {
  return role === "Pharmacy Assistant";
}

// Given the cycle anchor date and "today", return the current 3-year window.
// Cycles repeat every 3 years from the anchor. Returns { start, end } as Date objects,
// or null if no anchor is set. `end` is the last day of the cycle (inclusive).
export function getCurrentCycle(anchorDateStr, today = new Date()) {
  if (!anchorDateStr) return null;
  const anchor = new Date(anchorDateStr + "T00:00:00");
  if (isNaN(anchor.getTime())) return null;

  // Walk forward in 3-year blocks until the block contains `today`.
  let start = new Date(anchor);
  // If today is before the anchor, just use the first cycle.
  while (true) {
    const end = new Date(start);
    end.setFullYear(end.getFullYear() + CYCLE_YEARS);
    end.setDate(end.getDate() - 1); // inclusive last day
    if (today <= end) return { start: new Date(start), end };
    start.setFullYear(start.getFullYear() + CYCLE_YEARS);
  }
}

// Sum training hours that fall within the current cycle.
// records: array of { training_date, hours }
export function hoursInCycle(records, cycle) {
  if (!cycle) return 0;
  const startStr = cycle.start.toISOString().slice(0, 10);
  const endStr = cycle.end.toISOString().slice(0, 10);
  return (records || [])
    .filter((r) => r.training_date >= startStr && r.training_date <= endStr)
    .reduce((sum, r) => sum + Number(r.hours || 0), 0);
}

// Format a cycle for display, e.g. "1 Jan 2025 – 31 Dec 2027".
export function formatCycle(cycle) {
  if (!cycle) return "";
  const opts = { day: "numeric", month: "short", year: "numeric" };
  return `${cycle.start.toLocaleDateString("en-AU", opts)} – ${cycle.end.toLocaleDateString("en-AU", opts)}`;
}