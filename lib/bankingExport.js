// Daily Banking → Excel for Arthur, in the old spreadsheet's layout: per week a header row (Date, Day, Till, Cash,
// EFPTOS 1, EFPTOS 2, Extra EFTPOS, MedAdvisor, Loyalty, [Square/Direct and any old types only if used], Total Bendigo,
// GST Sales, Customers), the day rows, "Total Weekly", "Cash Banking" (that week's deposits + notes); each month ends with
// "Monthly Total:". Numbers to 2 decimals, dates dd/mm/yyyy (real Excel dates). The spreadsheet's column names are kept.
import { round2 } from "./banking";
import { weeksOfMonth, dayFigures, countsInTotals, MON, weekdayOf } from "./bankingData";

// Arthur's column names and order, by payment type KEY — never by display name or sort order, so renaming or
// re-ordering the types on screen (Closing / Right till / Left till) never changes his file.
//   eftpos_t1 = right till -> "EFPTOS 1", eftpos_t2 = left till -> "EFPTOS 2", eftpos_t3 = closing -> "Extra EFTPOS"
const SHEET_NAME = { eftpos_t1: "EFPTOS 1", eftpos_t2: "EFPTOS 2", eftpos_t3: "Extra EFTPOS", medadvisor: "MedAdvisor", loyalty: "Loyalty", square_direct: "Square/Direct" };
const ALWAYS = ["eftpos_t1", "eftpos_t2", "eftpos_t3", "medadvisor", "loyalty"];
const sheetOrder = (t) => { const i = ALWAYS.indexOf(t.key); return i >= 0 ? i : ALWAYS.length + Number(t.sort_order || 0); };
const DAY_NAME = ["Sun", "Mon", "Tues", "Wed", "Thurs", "Fri", "Sat"]; // as the old sheets wrote them

const excelDate = (s) => { const [y, m, d] = s.split("-").map(Number); return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000; };
const num = (v) => ({ t: "n", v: round2(v), z: "0.00" });
const int = (v) => ({ t: "n", v: Number(v) });
const txt = (v) => ({ t: "s", v: String(v) });
const date = (s) => ({ t: "n", v: excelDate(s), z: "dd/mm/yyyy" });

// One month as rows of cells. month = { ym, days: [day with .tenders], deposits: [bank_deposits in its weeks] }
function monthRows({ ym, days, deposits }, types) {
  const byDate = Object.fromEntries(days.map((d) => [d.takings_date, d]));
  const used = new Set(days.flatMap((d) => Object.entries(d.tenders || {}).filter(([, a]) => Number(a)).map(([id]) => id)));
  const cols = types.filter((t) => ALWAYS.includes(t.key) || used.has(t.id)).sort((a, b) => sheetOrder(a) - sheetOrder(b));
  const header = ["Date", "Day", "Till", "Cash", ...cols.map((t) => SHEET_NAME[t.key] || t.name), "Total Bendigo", "GST Sales", "Customers"].map(txt);
  const rows = [];
  const monthSum = { till: 0, cash: 0, bendigo: 0, gst: 0, byType: {} };
  for (const wk of weeksOfMonth(ym)) {
    rows.push(header);
    let wkTill = 0;
    let wkGst = 0;
    for (const d of wk.days) {
      const day = byDate[d];
      const base = [date(d), txt(DAY_NAME[weekdayOf(d)])];
      if (!day || !countsInTotals(day)) {
        const label = !day ? "" : day.status === "closed" ? "Closed" : "Missing";
        rows.push([...base, label ? txt(label) : null]);
        continue;
      }
      const f = dayFigures(day, types);
      wkTill += f.till;
      wkGst += f.gst || 0;
      monthSum.till += f.till; monthSum.cash += f.cash; monthSum.bendigo += f.bendigo; monthSum.gst += f.gst || 0;
      for (const t of cols) monthSum.byType[t.id] = (monthSum.byType[t.id] || 0) + (Number(day.tenders?.[t.id]) || 0);
      rows.push([...base, num(f.till), num(f.cash), ...cols.map((t) => num(day.tenders?.[t.id] || 0)), num(f.bendigo),
        f.gst === null ? null : num(f.gst), f.customers === null ? null : int(f.customers)]);
    }
    // Total Weekly: Till and GST Sales
    const total = [txt("Total Weekly"), null, num(wkTill), null, ...cols.map(() => null), null, num(wkGst), null];
    rows.push(total);
    // Cash Banking: deposits recorded that week (amount under Cash; date + note after)
    const deps = deposits.filter((x) => x.deposit_date >= wk.start && x.deposit_date <= wk.end);
    rows.push([txt("Cash Banking"), null, null, deps.length ? num(deps.reduce((s, x) => s + Number(x.amount), 0)) : null,
      ...(deps.length ? [txt(deps.map((x) => `${x.deposit_date.split("-").reverse().join("/")} $${round2(x.amount).toFixed(2)}${x.note ? ` (${x.note})` : ""}`).join("; "))] : [])]);
    rows.push([]);
  }
  rows.push([txt("Monthly Total:"), null, num(monthSum.till), num(monthSum.cash), ...cols.map((t) => num(monthSum.byType[t.id] || 0)),
    num(monthSum.bendigo), num(monthSum.gst), null]);
  return rows;
}

// months = [{ ym, days, deposits }] -> an xlsx workbook (one sheet per month, named "Nov 2026")
export function buildBankingWorkbook(XLSX, months, types) {
  const wb = XLSX.utils.book_new();
  for (const m of months) {
    const rows = monthRows(m, types);
    const ws = {};
    let maxC = 0;
    rows.forEach((r, ri) => r.forEach((cell, ci) => {
      if (!cell) return;
      ws[XLSX.utils.encode_cell({ r: ri, c: ci })] = cell;
      maxC = Math.max(maxC, ci);
    }));
    ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, rows.length - 1), c: maxC } });
    ws["!cols"] = [{ wch: 12 }, { wch: 7 }, ...Array.from({ length: maxC - 1 }, () => ({ wch: 12 }))];
    const [y, mo] = m.ym.split("-").map(Number);
    XLSX.utils.book_append_sheet(wb, ws, `${MON[mo - 1]} ${y}`);
  }
  return wb;
}

export const exportFileName = (kind, ym, fyLabel) => {
  const [y, m] = ym.split("-").map(Number);
  return kind === "fy" ? `Daily Banking ${fyLabel}.xlsx` : `Daily Banking ${MON[m - 1]} ${y}.xlsx`;
};
