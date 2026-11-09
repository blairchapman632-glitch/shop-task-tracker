// WA public holidays for years before the app's own public_holidays table (which starts in 2026). Used by Banking →
// Insights only (to flag / separate public holidays in old imported days) — never written to public_holidays, and the
// roster / wages keep using that table. Same rules as scripts/import-banking.js:
// New Year's Day, Australia Day, Anzac Day (+ the Monday when on a weekend), Labour Day (1st Mon Mar), Good Friday,
// Easter Sunday, Easter Monday, WA Day (1st Mon Jun), King's / Queen's Birthday (WA date), Christmas and Boxing Day
// (+ the next free weekday when either is on a weekend).
const pad = (n) => String(n).padStart(2, "0");
const ds = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const weekday = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const addDays = (s, n) => { const [y, m, d] = s.split("-").map(Number); const x = new Date(Date.UTC(y, m - 1, d + n)); return ds(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate()); };
const firstMon = (y, m) => ds(y, m, 1 + ((8 - weekday(ds(y, m, 1))) % 7));
// Easter Sunday (anonymous Gregorian algorithm)
const easter = (y) => {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  return ds(y, Math.floor((h + l - 7 * m + 114) / 31), ((h + l - 7 * m + 114) % 31) + 1);
};
const KINGS_BIRTHDAY = { 2014: "2014-09-29", 2015: "2015-09-28", 2016: "2016-09-26", 2017: "2017-09-25", 2018: "2018-09-24", 2019: "2019-09-30", 2020: "2020-09-28", 2021: "2021-09-27", 2022: "2022-09-26", 2023: "2023-09-25", 2024: "2024-09-23", 2025: "2025-09-29" };

// -> Set of "YYYY-MM-DD"
export function waHolidays(fromYear = 2014, toYear = 2025) {
  const out = new Set();
  const withMonday = (d) => { out.add(d); const w = weekday(d); if (w === 6) out.add(addDays(d, 2)); if (w === 0) out.add(addDays(d, 1)); };
  for (let y = fromYear; y <= toYear; y++) {
    withMonday(ds(y, 1, 1));
    withMonday(ds(y, 1, 26));
    out.add(firstMon(y, 3));
    const e = easter(y);
    out.add(addDays(e, -2)); out.add(e); out.add(addDays(e, 1));
    withMonday(ds(y, 4, 25));
    out.add(firstMon(y, 6));
    if (KINGS_BIRTHDAY[y]) out.add(KINGS_BIRTHDAY[y]);
    out.add(ds(y, 12, 25)); out.add(ds(y, 12, 26));
    for (const d of [ds(y, 12, 25), ds(y, 12, 26)]) {
      if ([0, 6].includes(weekday(d))) { let s = addDays(d, 1); while ([0, 6].includes(weekday(s)) || out.has(s)) s = addDays(s, 1); out.add(s); }
    }
  }
  return out;
}
