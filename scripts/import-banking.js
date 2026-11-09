#!/usr/bin/env node
// Daily Banking — import the old "Daily Banking YYYY YY.xlsx" spreadsheets (2014 → go-live) into daily_takings.
//
//   node scripts/import-banking.js            DRY RUN (default): reads every file in data/banking-import/, writes
//                                             data/banking-import/report.md, changes nothing
//   node scripts/import-banking.js --commit   writes to the database (run docs/sql/daily_banking_stage5_7.sql first)
//
// data/banking-import/ is git-ignored — private financial data, never committed.
// Password-protected files (2014–2020) are decrypted in memory with BANKING_IMPORT_PASSWORD from .env.local.
// Rules (APPROVED PLAN, Stage 5):
//   - Header rows start with "Date"; day rows have a date in column A. Total / Banking / Total Weekly / Cash Banking /
//     Monthly Total / Month rows and anything right of the Customers column are skipped. Cell values (cached results),
//     never formulas.
//   - Dates drift (formulas chain day+1): each row must fit its Day column AND the sheet's month — a sheet's first and
//     last weeks run into the months either side (e.g. "Aug" starting Fri 29 Jul), so up to 7 days either side of the
//     month counts. A whole sheet off by the same amount (any number of days, or years) is corrected (reported);
//     otherwise a mismatched row goes to REVIEW. Duplicate dates: neither copy is imported, both go to REVIEW.
//     A sheet outside its file's financial year (e.g. 2025-26 "July26") is skipped.
//   - Columns are matched by heading name. Calculated columns (Till, Total Bendigo, Total Deb/Cred, Visa/Master) are
//     never imported. The sheet's Till is the truth: per header layout, the set of Cash + tender columns that adds up to
//     Till (±$0.05) on the most rows is used (needs ≥ 98%); columns outside it (e.g. Amex already inside EFPTOS) are
//     not imported. Rows that still don't add up go to REVIEW.
//   - Blank days: on a stored public holiday → 'closed'; before the last filled day → 'missing'; trailing empty rows at
//     the end of the latest file are skipped.
//   - Checks: each month's imported Till vs the sheet's own weekly Total rows (the "Monthly Total:" formula is shown
//     too, but some of those formulas skip a week or sit in the wrong columns, so the weekly totals are the real check).
//   - Writes: one daily_takings row per day (status 'confirmed', source 'import', cash_takings, customers, gst_sales —
//     no Z figures or variances) + a tenders row per non-zero amount. Dates that already have a row are never
//     touched (app days from go-live win). Inserts in batches of 500.
// Undo: delete from daily_takings where source = 'import' and pharmacy_id = '…';  (tenders cascade)
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const officeCrypto = require("officecrypto-tool"); // opens the password-protected files in memory (no unlocked copies saved)
const { createClient } = require("@supabase/supabase-js");

const ROOT = path.join(__dirname, "..");
const DIR = path.join(ROOT, "data", "banking-import");
const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";
const COMMIT = process.argv.includes("--commit");

// ── helpers ──
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/).filter((l) => l.includes("="))
  .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
// Password for the owner's protected 2014–2020 files — only ever in .env.local (git-ignored), never in code.
const PASSWORD = env.BANKING_IMPORT_PASSWORD || "";
const pad = (n) => String(n).padStart(2, "0");
const r2 = (n) => Math.round((Number(n) + Number.EPSILON * Math.sign(n)) * 100) / 100;
const serialToDate = (n) => { const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
const addDays = (s, n) => { const [y, m, d] = s.split("-").map(Number); const x = new Date(Date.UTC(y, m - 1, d + n)); return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`; };
const addMonths = (s, n) => {
  const [y, m, d] = s.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  const ny = Math.floor(t / 12), nm = (t % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${pad(nm)}-${pad(Math.min(d, last))}`;
};
const weekday = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const norm = (v) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  let s = String(v).trim().replace(/\$/g, "");
  if (/^-?\d+,\d{2}$/.test(s)) s = s.replace(",", "."); // typed with a decimal comma, e.g. "2132,75" = 2132.75
  s = s.replace(/,/g, "");
  return s !== "" && Number.isFinite(Number(s)) ? Number(s) : null;
};
const isBlank = (x) => !x.cash && !x.gst && !x.customers && !Object.values(x.tenders).some((v) => v);

// Hand fixes agreed with Blair (8 Nov 2026), keyed "file|sheet|row":
//   date/dayName — the row's real day (a moved row replaces an empty row already on that date in the sheet)
//   acceptTill   — import the individual figures even though the sheet's Till differs; noted on the day
const FIXES = {
  "Daily Banking 2014 15.xlsx|December|50": { date: "2014-12-24", dayName: "Wed", why: "figures typed on the 25 Dec row — they're Wed 24 Dec" },
  "Daily Banking 2014 15.xlsx|December|51": { dayName: "Fri", why: "Boxing Day, no Day name — imported as closed" },
  "Daily Banking 2014 15.xlsx|March|46": { acceptTill: true },
  "Daily Banking 2017 18.xlsx|August|18": { acceptTill: true },
  "Daily Banking 2024 25.xlsx|April|23": { acceptTill: true, why: "\"2132,75\" read as 2132.75 (the sheet's Till left it out)" },
};

// WA public holidays 2014–2025 — ONLY for marking blank imported days 'closed'. Never written to public_holidays
// (the app's own table starts in 2026).
const WA_KINGS_BIRTHDAY = { 2014: "2014-09-29", 2015: "2015-09-28", 2016: "2016-09-26", 2017: "2017-09-25", 2018: "2018-09-24", 2019: "2019-09-30", 2020: "2020-09-28", 2021: "2021-09-27", 2022: "2022-09-26", 2023: "2023-09-25", 2024: "2024-09-23", 2025: "2025-09-29" };
function waHolidays(fromYear, toYear) {
  const out = new Set();
  const ds = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const firstMon = (y, m) => ds(y, m, 1 + ((8 - weekday(ds(y, m, 1))) % 7));
  const easter = (y) => {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    return ds(y, Math.floor((h + l - 7 * m + 114) / 31), ((h + l - 7 * m + 114) % 31) + 1);
  };
  const withMonday = (d) => { out.add(d); const w = weekday(d); if (w === 6) out.add(addDays(d, 2)); if (w === 0) out.add(addDays(d, 1)); };
  for (let y = fromYear; y <= toYear; y++) {
    withMonday(ds(y, 1, 1));   // New Year's Day
    withMonday(ds(y, 1, 26));  // Australia Day
    out.add(firstMon(y, 3));   // Labour Day
    const e = easter(y);
    out.add(addDays(e, -2));   // Good Friday
    out.add(e);                // Easter Sunday (the pharmacy is closed)
    out.add(addDays(e, 1));    // Easter Monday
    withMonday(ds(y, 4, 25));  // Anzac Day
    out.add(firstMon(y, 6));   // WA Day
    if (WA_KINGS_BIRTHDAY[y]) out.add(WA_KINGS_BIRTHDAY[y]);
    // Christmas then Boxing Day: one on a weekend gets the next weekday that isn't already a holiday
    out.add(ds(y, 12, 25)); out.add(ds(y, 12, 26));
    for (const d of [ds(y, 12, 25), ds(y, 12, 26)]) {
      if ([0, 6].includes(weekday(d))) { let s = addDays(d, 1); while ([0, 6].includes(weekday(s)) || out.has(s)) s = addDays(s, 1); out.add(s); }
    }
  }
  return out;
}
// + 2026 holidays the app's public_holidays table is missing (Labour Day, Anzac Day substitute) — blank = closed
const WA_HOLIDAYS = new Set([...waHolidays(2014, 2025), "2026-03-02", "2026-04-27"]);
const DAY_NAMES = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 };
const MONTHS = { jan: 1, january: 1, janurary: 1,feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12 };
const SKIP_LABELS = /^(total|banking|totalweekly|cashbanking|monthlytotal|month)/;

// Column heading -> what it is (null = ignore). Tender keys match banking_payment_types.key.
function classify(h, allHeads) {
  const n = norm(h);
  if (!n) return null;
  if (n === "date") return { f: "date" };
  if (n === "day") return { f: "day" };
  if (n === "till") return { f: "till" };
  if (n === "cash") return { f: "cash" };
  if (["cust", "customers", "customer"].includes(n)) return { f: "customers" };
  if (["gstsales", "gstitems"].includes(n)) return { f: "gst" };
  if (n === "gst") return allHeads.some((x) => ["gstsales", "gstitems"].includes(norm(x))) ? null : { f: "gst" };
  if (["efptos1", "eftpos1"].includes(n)) return { f: "tender", key: "eftpos_t1" };
  if (["efptos2", "eftpos2"].includes(n)) return { f: "tender", key: "eftpos_t2" };
  if (["extraeftpos", "prevpmeftpos", "extraefptos", "prevpmefptos"].includes(n)) return { f: "tender", key: "eftpos_t3" };
  if (["efptos", "eftpos"].includes(n)) return { f: "tender", key: "eftpos_t1" };
  if (n === "medadvisor") return { f: "tender", key: "medadvisor" };
  if (["square", "squaredirect"].includes(n)) return { f: "tender", key: "square_direct" };
  if (n === "loyalty") return { f: "tender", key: "loyalty" };
  if (n === "amex") return { f: "tender", key: "amex" };
  if (n === "cheque") return { f: "tender", key: "cheque" };
  if (n === "lifeclub") return { f: "tender", key: "life_club" };
  if (n === "other") return { f: "tender", key: "other_legacy" };
  return null; // Total Bendigo, Total Deb/Cred, Visa/Master, Office Use, After 6pm … never imported
}

async function run() {
  // ── read every file ──
  const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => /\.xlsx$/i.test(f) && !f.startsWith("~$")).sort() : [];
  const report = { locked: [], decrypted: [], fixed: [], cashNull: [], skippedSheets: [], corrected: [], review: [], layouts: new Map(), monthChecks: [], blanks: [] };
  const rows = []; // every day row: { file, sheet, rowNo, date, dayName, ..., layout }
  const monthTotals = []; // { file, sheet, ym, till }  — the sheet's "Monthly Total:" Till
  const weekTotals = {};  // "file|sheet" -> sum of the sheet's weekly "Total" / "Total Weekly" Till figures
  const weekIssues = {};  // "file|sheet" -> [text] — weeks whose Total row doesn't add up its own day rows
  const addYears = (s, n) => { const [y, m, d] = s.split("-").map(Number); const last = new Date(Date.UTC(y + n, m, 0)).getUTCDate(); return `${y + n}-${pad(m)}-${pad(Math.min(d, last))}`; };
  let latestFile = null;
  // A sheet that's an exact copy of one already read from another file (e.g. the 2019-20 workbook still holds the
  // 2018-19 "July"…"June" sheets beside its own "July19"…"Jun 20") is skipped. Files are read oldest first.
  const seenSheets = new Map(); // content -> "file / sheet"

  for (const file of files) {
    const m = file.match(/(\d{4})\s*[-_ ]?\s*(\d{2})/);
    if (!m) { report.skippedSheets.push(`${file}: can't tell the financial year from the name`); continue; }
    const fyStart = Number(m[1]);
    let wb;
    try {
      let buf = fs.readFileSync(path.join(DIR, file));
      if (officeCrypto.isEncrypted(buf)) {
        if (!PASSWORD) throw new Error("password-protected — add BANKING_IMPORT_PASSWORD to .env.local");
        buf = await officeCrypto.decrypt(buf, { password: PASSWORD }); // in memory only — never written to disk
        report.decrypted.push(file);
      }
      wb = XLSX.read(buf, { type: "buffer" });
    } catch (e) { report.locked.push(`${file} — ${e.message}`); continue; }
    if (!latestFile || fyStart > latestFile.fyStart) latestFile = { file, fyStart };
    for (const sheet of wb.SheetNames) {
      const nm = norm(sheet).match(/^([a-z]+?)(\d{2,4})?$/);
      const mon = nm && MONTHS[nm[1]];
      if (!mon) { report.skippedSheets.push(`${file} / ${sheet}: not a month sheet`); continue; }
      let year = mon >= 7 ? fyStart : fyStart + 1;
      if (nm[2]) year = nm[2].length === 2 ? 2000 + Number(nm[2]) : Number(nm[2]);
      const ym = `${year}-${pad(mon)}`;
      const inFy = ym >= `${fyStart}-07` && ym <= `${fyStart + 1}-06`;
      if (!inFy) { report.skippedSheets.push(`${file} / ${sheet}: ${ym} is outside this file's year — taken from its own file`); continue; }

      const grid = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, raw: true, defval: null });
      const content = JSON.stringify(grid);
      const copyOf = seenSheets.get(content);
      if (copyOf && !copyOf.startsWith(`${file} /`)) { report.skippedSheets.push(`${file} / ${sheet}: an exact copy of ${copyOf} — skipped`); continue; }
      if (!copyOf) seenSheets.set(content, `${file} / ${sheet}`);
      let cols = null; // { index: classification }, set by the latest header row
      let blockSum = 0, blockDays = 0, blockFirst = null;
      const issue = (t) => { (weekIssues[`${file}|${sheet}`] = weekIssues[`${file}|${sheet}`] || []).push(t); };
      let layout = null;
      const sheetRows = [];
      grid.forEach((r, i) => {
        const a = r[0];
        if (norm(a) === "date") {
          const custIdx = r.findIndex((c, ci) => ci > 1 && ["cust", "customers", "customer"].includes(norm(c)));
          const heads = r.slice(0, custIdx >= 0 ? custIdx + 1 : r.length);
          cols = {};
          heads.forEach((h, ci) => { const c = classify(h, heads); if (c) cols[ci] = { ...c, head: String(h).trim() }; });
          layout = JSON.stringify(heads.map((h) => String(h ?? "").trim()));
          return;
        }
        const label = norm(a);
        if (label && SKIP_LABELS.test(label) && typeof a === "string") {
          if ((label === "total" || label === "totalweekly") && cols) {
            const tillIdx = Object.keys(cols).find((k) => cols[k].f === "till");
            if (tillIdx !== undefined && num(r[tillIdx]) !== null) weekTotals[`${file}|${sheet}`] = (weekTotals[`${file}|${sheet}`] || 0) + num(r[tillIdx]);
            const tot = tillIdx === undefined ? null : num(r[tillIdx]);
            if (blockDays && (tot === null || Math.abs(r2(blockSum) - r2(tot)) > 0.05)) {
              const cell = wb.Sheets[sheet][XLSX.utils.encode_cell({ r: i, c: Number(tillIdx) })];
              issue(`rows ${blockFirst}–${i}: ${blockDays} days add up to $${r2(blockSum).toFixed(2)}, its Total row says $${r2(tot || 0).toFixed(2)}${cell && cell.f ? ` (formula ${cell.f})` : ""}`);
            }
            blockSum = 0; blockDays = 0; blockFirst = null;
          }
          if (label.startsWith("monthlytotal") && cols) {
            const tillIdx = Object.keys(cols).find((k) => cols[k].f === "till");
            if (tillIdx !== undefined && num(r[tillIdx]) !== null) monthTotals.push({ file, sheet, ym, till: num(r[tillIdx]) });
          }
          return;
        }
        if (!cols) return;
        let date = null;
        if (typeof a === "number" && a > 30000 && a < 60000) date = serialToDate(a);
        else if (typeof a === "string" && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(a.trim())) { const [d, mo, y] = a.trim().split("/").map(Number); date = `${y}-${pad(mo)}-${pad(d)}`; }
        if (!date) return;
        if (blockFirst === null) blockFirst = i + 1;
        blockDays += 1;
        blockSum += num(r[Object.keys(cols).find((k) => cols[k].f === "till")]) || 0;
        const rec = { file, sheet, rowNo: i + 1, ym, rawDate: date, layout, tenders: {} };
        for (const [ci, c] of Object.entries(cols)) {
          const v = r[ci];
          if (c.f === "day") rec.dayName = String(v ?? "").trim();
          else if (c.f === "till") rec.till = num(v);
          else if (c.f === "cash") rec.cash = num(v);
          else if (c.f === "gst") rec.gst = num(v);
          else if (c.f === "customers") rec.customers = num(v);
          else if (c.f === "tender") { const x = num(v); if (x !== null) rec.tenders[c.key] = r2((rec.tenders[c.key] || 0) + x); }
        }
        sheetRows.push(rec);
      });

      if (blockDays) issue(`rows ${blockFirst}–end: ${blockDays} days ($${r2(blockSum).toFixed(2)}) have no Total row after them`);
      // Dates: every row must fit its Day name and the sheet's month. A whole sheet shifted the same way is corrected.
      const lo = addDays(`${ym}-01`, -7);
      const hi = addDays(`${ym}-${pad(new Date(Date.UTC(year, mon, 0)).getUTCDate())}`, 7);
      const fits = (d, rec) => d >= lo && d <= hi && DAY_NAMES[norm(rec.dayName)] === weekday(d);
      if (sheetRows.length && !sheetRows.every((x) => fits(x.rawDate, x))) {
        // Shift every row by the same number of days (incl. whole years, counted in days so 29 Feb is handled).
        // Of the shifts that make every row fit, take the one putting the most rows inside the sheet's own month
        // (then the smallest) — the week either side would otherwise let a part-shift through.
        const ms = `${ym}-01`;
        const me = `${ym}-${pad(new Date(Date.UTC(year, mon, 0)).getUTCDate())}`;
        const first = sheetRows[0].rawDate;
        const dayDiff = (a, b) => { const [y1, m1, d1] = a.split("-").map(Number); const [y2, m2, d2] = b.split("-").map(Number); return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000); };
        const totals = new Set();
        for (const yy of [0, -1, 1, -2, 2]) { const base = dayDiff(first, addYears(first, yy)); for (let dd = -31; dd <= 31; dd++) if (base + dd) totals.add(base + dd); }
        const shifts = [...totals].map((t) => ({ t, label: `${t > 0 ? "+" : ""}${t} days`, fn: (d) => addDays(d, t) }))
          .filter((sh) => sheetRows.every((x) => fits(sh.fn(x.rawDate), x)))
          .map((sh) => ({ ...sh, inMonth: sheetRows.filter((x) => { const d = sh.fn(x.rawDate); return d >= ms && d <= me; }).length }))
          .sort((a, b) => b.inMonth - a.inMonth || Math.abs(a.t) - Math.abs(b.t));
        const ok = shifts[0];
        if (ok) {
          report.corrected.push(`${file} / ${sheet}: every date was out by ${ok.label} (first row ${sheetRows[0].rawDate} → ${ok.fn(sheetRows[0].rawDate)}) — corrected`);
          sheetRows.forEach((x) => { x.date = ok.fn(x.rawDate); });
        }
      }
      for (const x of sheetRows) {
        if (!x.date) x.date = x.rawDate;
        const fix = FIXES[`${file}|${sheet}|${x.rowNo}`];
        if (!fix) continue;
        const was = `${x.date} (${x.dayName || "no day"})`;
        if (fix.date) { x.date = fix.date; x.fixedDate = true; }
        if (fix.dayName) x.dayName = fix.dayName;
        if (fix.acceptTill) x.acceptTill = true;
        report.fixed.push(`${file} / ${sheet} row ${x.rowNo}: ${was}${fix.date || fix.dayName ? ` → ${x.date} (${x.dayName})` : ""}${fix.why ? ` — ${fix.why}` : ""}${fix.acceptTill ? " — figures imported, Till difference noted" : ""}`);
      }
      const movedTo = new Set(sheetRows.filter((x) => x.fixedDate).map((x) => x.date));
      for (const x of sheetRows) {
        if (!x.fixedDate && movedTo.has(x.date) && isBlank(x)) { report.fixed.push(`${file} / ${sheet} row ${x.rowNo}: empty ${x.date} row dropped — the moved row above is that day`); continue; }
        if (!fits(x.date, x)) x.reviewReason = `date ${x.date} (${x.dayName || "no day"}) doesn't fit the ${sheet} sheet / its Day column`;
        rows.push(x);
      }
    }
  }

  // ── blank days, duplicates, Till composition ──
  const filled = rows.filter((x) => !x.reviewReason && !isBlank(x));
  const lastFilled = filled.reduce((a, x) => (x.date > a ? x.date : a), "");

  const byDate = new Map();
  for (const x of rows.filter((r) => !r.reviewReason)) (byDate.get(x.date) || byDate.set(x.date, []).get(x.date)).push(x);
  for (const [d, list] of byDate) if (list.length > 1) list.forEach((x) => { x.reviewReason = `duplicate date ${d} (${list.map((y) => `${y.file} / ${y.sheet} row ${y.rowNo}`).join(" and ")})`; });

  // Which columns make up Till, per header layout: the subset matching on the most rows
  for (const [lay, list] of rows.reduce((m, x) => m.set(x.layout, [...(m.get(x.layout) || []), x]), new Map())) {
    const sample = list.filter((x) => !x.reviewReason && !isBlank(x) && x.till !== null && x.till !== undefined);
    const keys = [...new Set(list.flatMap((x) => Object.keys(x.tenders)))];
    let best = { set: keys, hits: -1 };
    for (let mask = (1 << keys.length) - 1; mask >= 0; mask--) {
      const set = keys.filter((_, i) => mask & (1 << i));
      const hits = sample.filter((x) => Math.abs(r2((x.cash || 0) + set.reduce((s, k) => s + (x.tenders[k] || 0), 0)) - r2(x.till)) <= 0.05).length;
      if (hits > best.hits) best = { set, hits }; // ties keep the bigger set (tried first)
    }
    const pct = sample.length ? (best.hits / sample.length) * 100 : 100;
    report.layouts.set(lay, { inTill: ["cash", ...best.set], notInTill: keys.filter((k) => !best.set.includes(k)), rows: list.length, sample: sample.length, pct, ok: pct >= 98, where: [...new Set(list.map((x) => `${x.file.replace(/^Daily Banking /, "").replace(/\.xlsx$/, "")} ${x.sheet}`))] });
    for (const x of list) {
      x.useKeys = best.set;
      if (x.reviewReason || isBlank(x)) continue;
      const sum = r2((x.cash || 0) + best.set.reduce((s, k) => s + (x.tenders[k] || 0), 0));
      if (x.till === null || x.till === undefined) x.reviewReason = "no Till figure";
      else if (Math.abs(sum - r2(x.till)) > 0.05 && x.acceptTill) x.note = `Till in spreadsheet differs by $${Math.abs(r2(sum - x.till)).toFixed(2)}`;
      else if (Math.abs(sum - r2(x.till)) > 0.05) x.reviewReason =`cash + tenders $${sum.toFixed(2)} ≠ Till $${r2(x.till).toFixed(2)}`;
    }
  }

  // ── decide each row ──
  async function main() {
    const [{ data: hols, error: hErr }, { data: types, error: tErr }] = await Promise.all([
      db.from("public_holidays").select("date").eq("pharmacy_id", PHARMACY_ID),
      db.from("banking_payment_types").select("id, key").eq("pharmacy_id", PHARMACY_ID),
    ]);
    if (hErr || tErr) throw hErr || tErr;
    const holidays = new Set([...(hols || []).map((h) => String(h.date).slice(0, 10)), ...WA_HOLIDAYS]);
    const typeId = Object.fromEntries((types || []).map((t) => [t.key, t.id]));
    const existing = new Set();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from("daily_takings").select("takings_date").eq("pharmacy_id", PHARMACY_ID).order("takings_date").range(from, from + 999);
      if (error) throw error;
      (data || []).forEach((d) => existing.add(String(d.takings_date).slice(0, 10)));
      if (!data || data.length < 1000) break;
    }

    const toImport = [];
    const skippedExisting = [];
    for (const x of rows) {
      if (x.reviewReason) { report.review.push(x); continue; }
      if (isBlank(x)) {
        if (holidays.has(x.date)) x.status = "closed";
        else if (x.date < lastFilled) x.status = "missing";
        else continue; // trailing pre-filled empty rows at the end of the latest file
        report.blanks.push(x);
      } else {
        x.status = "confirmed";
        // A trading day (customers / GST filled) with an empty Cash cell: cash wasn't recorded — stored as NULL (not $0)
        // with a note. Holiday rows with only an EFTPOS settlement and no customers stay as $0 cash.
        if (x.cash === null && (x.customers || x.gst)) { x.cashNull = true; x.note = [x.note, "Cash not recorded in spreadsheet"].filter(Boolean).join("; "); report.cashNull.push(x); }
      }
      if (existing.has(x.date)) { skippedExisting.push(x); continue; }
      toImport.push(x);
    }
    toImport.sort((a, b) => a.date.localeCompare(b.date));
    const missingTypes = [...new Set(toImport.flatMap((x) => x.useKeys.filter((k) => x.tenders[k])))].filter((k) => !typeId[k]);

    // Per month: imported Till vs the sheet's weekly Total rows (and its "Monthly Total:" for reference)
    const tillOf = (x) => r2((x.cash || 0) + x.useKeys.reduce((s, k) => s + (x.tenders[k] || 0), 0));
    const sheets = [...new Set(rows.map((x) => `${x.file}|${x.sheet}`))];
    for (const key of sheets) {
      const [file, sheet] = key.split("|");
      const mine = rows.filter((x) => x.file === file && x.sheet === sheet);
      const ours = r2(mine.filter((x) => !x.reviewReason && !isBlank(x)).reduce((s, x) => s + tillOf(x), 0));
      const reviewTill = r2(mine.filter((x) => x.reviewReason).reduce((s, x) => s + (Number(x.till) || 0), 0));
      const weekly = weekTotals[key] === undefined ? null : r2(weekTotals[key]);
      const mt = monthTotals.find((m) => m.file === file && m.sheet === sheet);
      const monthly = mt ? r2(mt.till) : null;
      // Passes if it matches either the sheet's weekly Total rows or its "Monthly Total:" (both have formula slips in places)
      const dW = weekly === null ? null : r2(ours + reviewTill - weekly);
      const dM = monthly === null ? null : r2(ours + reviewTill - monthly);
      const passes = [dW, dM].some((d) => d !== null && Math.abs(d) <= 1) || (dW === null && dM === null);
      report.monthChecks.push({ file, sheet, ym: mine[0].ym, ours, reviewTill, weekly, monthly, dW, dM, diff: passes ? 0 : (dW ?? dM) });
    }

    // ── report ──
    const L = [];
    L.push(`# Daily Banking import — ${COMMIT ? "COMMIT RUN" : "dry run"} (${new Date().toLocaleString("en-AU", { timeZone: "Australia/Perth" })})`, "");
    L.push(`Files read: ${files.length - report.locked.length} of ${files.length}. Days to import: **${toImport.length}** (${toImport.filter((x) => x.status === "confirmed").length} with figures, ${toImport.filter((x) => x.status === "closed").length} closed, ${toImport.filter((x) => x.status === "missing").length} missing). Review: **${report.review.length}**. Already in the app (skipped): ${skippedExisting.length}.`, "");
    if (report.decrypted.length) L.push(`Password-protected files opened in memory (password from .env.local): ${report.decrypted.length}.`, "");
    if (report.locked.length) L.push("## Files that couldn't be opened", ...report.locked.map((x) => `- ${x}`), "");
    if (missingTypes.length) L.push("## ⚠ Payment types not in the database yet", `- ${missingTypes.join(", ")} — run docs/sql/daily_banking_stage5_7.sql before --commit`, "");
    L.push("## Days imported per financial year");
    const perYear = {};
    for (const x of toImport) { const [y, mo] = x.date.split("-").map(Number); const fy = mo >= 7 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`; perYear[fy] = (perYear[fy] || 0) + 1; }
    Object.entries(perYear).sort().forEach(([fy, n]) => L.push(`- ${fy}: ${n}`));
    L.push("", "## Layouts found (which columns make up Till)");
    for (const [lay, v] of report.layouts) {
      L.push(`- ${JSON.parse(lay).filter(Boolean).join(" | ")}`);
      L.push(`  - Till = ${v.inTill.join(" + ")}${v.notInTill.length ? ` · not in Till, not imported: ${v.notInTill.join(", ")}` : ""} · matches ${v.pct.toFixed(1)}% of ${v.sample} rows ${v.ok ? "✓" : "✗ BELOW 98%"}`);
      L.push(`  - used on: ${v.where.slice(0, 6).join(", ")}${v.where.length > 6 ? ` (+${v.where.length - 6} more)` : ""}`);
    }
    L.push("", "## Hand fixes (agreed 8 Nov 2026)", ...(report.fixed.length ? report.fixed.map((x) => `- ${x}`) : ["- none"]));
    L.push("", `## Cash not recorded — imported with cash blank (NULL) and a note (${report.cashNull.length})`, ...report.cashNull.map((x) => `- ${x.date} ${x.dayName || ""} — ${x.file} / ${x.sheet} row ${x.rowNo}`));
    const noted = toImport.filter((x) => x.note && !x.cashNull);
    L.push("", `## Days imported with a note (${noted.length})`, ...noted.map((x) => `- ${x.date}: ${x.note}`));
    L.push("", "## Sheets corrected for date drift", ...(report.corrected.length ? report.corrected.map((x) => `- ${x}`) : ["- none"]));
    L.push("", "## Sheets skipped", ...(report.skippedSheets.length ? report.skippedSheets.map((x) => `- ${x}`) : ["- none"]));
    const badMonths = report.monthChecks.filter((x) => Math.abs(x.diff) > 1);
    L.push("", `## Months: imported Till (+ Till of rows sent to review) vs the sheet's weekly Total rows or its Monthly Total — ${report.monthChecks.length} sheets, ${badMonths.length} matching neither (±$1)`);
    badMonths.forEach((x) => {
      L.push(`- ⚠ ${x.file} / ${x.sheet} (${x.ym}): imported $${x.ours.toFixed(2)} + review $${x.reviewTill.toFixed(2)} · weekly totals $${(x.weekly ?? 0).toFixed(2)} · Monthly Total $${(x.monthly ?? 0).toFixed(2)}`);
      (weekIssues[`${x.file}|${x.sheet}`] || []).forEach((t) => L.push(`  - spreadsheet: ${t}`));
      if (!(weekIssues[`${x.file}|${x.sheet}`] || []).length) L.push("  - every week's Total matches its days — check this month by hand");
    });
    const mtOff = report.monthChecks.filter((x) => x.diff === 0 && x.monthly !== null && Math.abs(x.dM) > 1);
    L.push("", `### For reference: months that match their weekly totals but whose "Monthly Total:" doesn't (${mtOff.length}) — a spreadsheet formula slip, not an import problem`);
    mtOff.forEach((x) => L.push(`- ${x.file} / ${x.sheet}: Monthly Total $${x.monthly.toFixed(2)} vs the days $${r2(x.ours + x.reviewTill).toFixed(2)}`));
    L.push("", `## Closed / missing days (${report.blanks.length})`);
    report.blanks.forEach((x) => L.push(`- ${x.date} ${x.dayName}: ${x.status}${x.status === "missing" ? "" : " (public holiday)"} — ${x.file} / ${x.sheet}`));
    L.push("", `## Review list — NOT imported (${report.review.length})`);
    report.review.sort((a, b) => (a.date || a.rawDate).localeCompare(b.date || b.rawDate)).forEach((x) => L.push(`- ${x.file} / ${x.sheet} row ${x.rowNo}: ${x.reviewReason}`));
    if (skippedExisting.length) L.push("", "## Already in the app (left alone)", ...skippedExisting.map((x) => `- ${x.date}`));
    fs.writeFileSync(path.join(DIR, "report.md"), L.join("\n") + "\n");
    console.log(`Report: data/banking-import/report.md`);
    console.log(`Import ${toImport.length} days · review ${report.review.length} · locked files ${report.locked.length} · months out by >$1: ${badMonths.length} · layouts below 98%: ${[...report.layouts.values()].filter((v) => !v.ok).length}`);

    if (!COMMIT) { console.log("Dry run — nothing written. Run with --commit to import."); return; }
    if (missingTypes.length) { console.log(`Not committing: payment types missing (${missingTypes.join(", ")}). Run docs/sql/daily_banking_stage5_7.sql first.`); process.exit(1); }

    // ── commit: days in batches of 500, then their tenders ──
    let days = 0, tenders = 0;
    for (let i = 0; i < toImport.length; i += 500) {
      const batch = toImport.slice(i, i + 500);
      const { data, error } = await db.from("daily_takings").insert(batch.map((x) => ({
        pharmacy_id: PHARMACY_ID, takings_date: x.date, status: x.status, source: "import",
        cash_takings: x.status === "confirmed" && !x.cashNull ? r2(x.cash || 0) : null,
        notes: x.note || null,
        customers: x.status === "confirmed" && x.customers !== null && x.customers !== undefined ? Math.round(x.customers) : null,
        gst_sales: x.status === "confirmed" && x.gst !== null && x.gst !== undefined ? r2(x.gst) : null,
      }))).select("id, takings_date");
      if (error) throw error;
      days += data.length;
      const idOf = Object.fromEntries(data.map((d) => [String(d.takings_date).slice(0, 10), d.id]));
      const trows = batch.filter((x) => x.status === "confirmed").flatMap((x) => x.useKeys.filter((k) => x.tenders[k]).map((k) => ({
        pharmacy_id: PHARMACY_ID, daily_takings_id: idOf[x.date], payment_type_id: typeId[k], amount: r2(x.tenders[k]),
      })));
      for (let j = 0; j < trows.length; j += 500) {
        const { error: e2 } = await db.from("daily_takings_tenders").insert(trows.slice(j, j + 500));
        if (e2) throw e2;
        tenders += Math.min(500, trows.length - j);
      }
      console.log(`  … ${days} days, ${tenders} tender rows`);
    }
    console.log(`Imported ${days} days and ${tenders} tender rows.`);
  }

  await main();
}

run().catch((e) => { console.error("Import failed:", e?.message || e); process.exit(1); });
