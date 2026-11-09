// Banking → Insights (owner only, behind the admin PIN on pages/banking.js). Staff never see any of this.
// One subject at a time: five cards across the top (Takings · Customers · Average sale · Payment mix · Over/under) show
// the period's headline and ▲/▼ vs last year; clicking one shows only that subject's detail (last choice remembered).
//   Period: default "This year" (calendar, 1 Jan to the last day with figures); also last year, financial years,
//   months, weeks, custom. Trend charts draw one line per calendar year (Jan–Dec), or per financial year (Jul–Jun) when
//   a financial-year period is picked. Every "vs last year" is like-for-like — the same
//   dates shifted back 364 days (same weekdays). This week / month / FY run to date.
//   Takings: by month (this year / last year / change $ / change %, year-to-date row; a part month marked "to date"),
//     day-of-week averages vs last year, one trend chart.
//   Customers: by month, day-of-week averages, busiest / quietest 10 days (public holiday / day-after flagged —
//     lib/waHolidays.js covers 2014–2025, the app's table 2026 on), seasonal pattern by week of the year.
//   Average sale (Till ÷ customers, days with a customer figure): by month, one trend chart.
//   Payment mix: cash / EFTPOS / other $ and % by month, period total.
//   Over/under (till counts in the app): days past the limit (who counted, who was rostered), Staff table.
// Trend charts: one line per financial year — this FY blue + thick, last FY orange, older years their own fixed colour;
//   only this FY and last FY shown until "Show more years"; hover for month / year / value; the unfinished current
//   month is a dotted line to its projection (totals: so far ÷ trading days so far × trading days in the month;
//   average sale: the average so far).
// Data: every day + tender since 2014 is loaded ONCE (paginated past the 1,000-row cap) and reused by every card,
// table and chart. The roster is only loaded for the Over/under card. Closed / missing days are always left out.
import { useEffect, useMemo, useState } from "react";
import supabase from "../../lib/supabaseClient";
import { round2, fmtVariance } from "../../lib/banking";
import { todayPerth, addDaysStr } from "../../lib/performanceReview";
import {
  loadPaymentTypes, dayFigures, countsInTotals, fetchAll, fyOf, mondayOf, monthStart, monthEnd, addMonthsYm,
  dayLabel, weekdayOf, MON, openOnWeekday, datesBetween,
} from "../../lib/bankingData";
import { waHolidays } from "../../lib/waHolidays";

const WA_OLD_HOLIDAYS = waHolidays(2014, 2025); // the app's public_holidays table starts in 2026
const CARD_KEY = "banking.insights.card";
const CARDS = [
  { key: "takings", label: "Takings" },
  { key: "customers", label: "Customers" },
  { key: "avgSale", label: "Average sale" },
  { key: "mix", label: "Payment mix" },
  { key: "overunder", label: "Over/under" },
];

const $0 = (n) => `${Number(n) < 0 ? "-" : ""}$${Math.abs(Math.round(Number(n) || 0)).toLocaleString("en-AU")}`;
const $2 = (n) => `$${round2(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const int = (n) => Math.round(Number(n) || 0).toLocaleString("en-AU");
const pct1 = (part, total) => (total ? `${((part / total) * 100).toFixed(1)}%` : "—");
const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]; // display order (weekdayOf: 0 = Sun)
const dowIndex = (d) => (weekdayOf(d) + 6) % 7;
const HOURS_COLS = "hours_monday, hours_tuesday, hours_wednesday, hours_thursday, hours_friday, hours_saturday, hours_sunday";
const MIN_DAYS_FOR_PCT = 10; // a person's % past the limit only shows from this many counted days
const parts = (s) => String(s).slice(0, 10).split("-").map(Number);
// Week of the year, 0 = week 1 (1–7 Jan) … 51 = week 52 (days 365/366 fold into week 52)
const weekOfYear = (s) => { const [y, m, d] = parts(s); const doy = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000); return Math.min(51, Math.floor(doy / 7)); };

// "1–8 Nov 2026" / "1 Jul – 8 Nov 2026" / "28 Dec 2025 – 3 Jan 2026"
const fmtRange = (a, b) => {
  const [ya, ma, da] = parts(a);
  const [yb, mb, db] = parts(b);
  if (a === b) return `${da} ${MON[ma - 1]} ${ya}`;
  if (ya === yb && ma === mb) return `${da}–${db} ${MON[mb - 1]} ${yb}`;
  if (ya === yb) return `${da} ${MON[ma - 1]} – ${db} ${MON[mb - 1]} ${yb}`;
  return `${da} ${MON[ma - 1]} ${ya} – ${db} ${MON[mb - 1]} ${yb}`;
};

// The period's dates. This week / month / FY stop at the last day with figures (to date).
function periodFor(kind, today, custom, lastFig) {
  const toDate = (from, end) => { const cap = lastFig && lastFig < end ? lastFig : end; return { from, to: cap < from ? from : cap }; };
  if (kind === "this_year") { const y = today.slice(0, 4); return toDate(`${y}-01-01`, `${y}-12-31`); }
  if (kind === "last_year") { const y = Number(today.slice(0, 4)) - 1; return { from: `${y}-01-01`, to: `${y}-12-31` }; }
  if (kind === "this_week") { const s = mondayOf(today); return toDate(s, addDaysStr(s, 6)); }
  if (kind === "last_week") { const s = addDaysStr(mondayOf(today), -7); return { from: s, to: addDaysStr(s, 6) }; }
  if (kind === "this_month") { const ym = today.slice(0, 7); return toDate(monthStart(ym), monthEnd(ym)); }
  if (kind === "last_month") { const ym = addMonthsYm(today.slice(0, 7), -1); return { from: monthStart(ym), to: monthEnd(ym) }; }
  if (kind === "this_fy") { const fy = fyOf(today); return toDate(fy.start, fy.end); }
  if (kind === "last_fy") { const fy = fyOf(addDaysStr(fyOf(today).start, -1)); return { from: fy.start, to: fy.end }; }
  return { from: custom.from, to: custom.to };
}
// Last year's matching range: the same dates shifted back 364 days, so the weekdays line up
const shiftBack = (d) => addDaysStr(d, -364);
// The same day of the previous month (31 Mar -> 28/29 Feb)
const sameDayPrevMonth = (d) => { const ym = addMonthsYm(d.slice(0, 7), -1); const day = `${ym}-${d.slice(8, 10)}`; return day > monthEnd(ym) ? monthEnd(ym) : day; };

const PERIODS = [
  { key: "this_year", label: "This year" }, { key: "last_year", label: "Last year" },
  { key: "this_fy", label: "This financial year" }, { key: "last_fy", label: "Last financial year" },
  { key: "this_month", label: "This month" }, { key: "last_month", label: "Last month" },
  { key: "this_week", label: "This week" }, { key: "last_week", label: "Last week" },
  { key: "custom", label: "Custom" },
];

const emptyStats = () => ({ till: 0, n: 0, cust: 0, nc: 0, tillC: 0, cash: 0, eftpos: 0, other: 0 });
const addDay = (s, f) => {
  s.till += f.till; s.n += 1; s.cash += f.cash; s.eftpos += f.eftpos; s.other += f.other;
  if (f.customers > 0) { s.cust += f.customers; s.nc += 1; s.tillC += f.till; }
};
const avgSaleOf = (s) => (s.cust ? s.tillC / s.cust : null);
const changePct = (now, then) => (now !== null && now !== undefined && then ? ((now - then) / then) * 100 : null);

// ▲ 4.2% (green) / ▼ 3.1% (red) / —
function Pct({ now, then }) {
  const c = changePct(now, then);
  if (c === null || !Number.isFinite(c)) return <span className="text-gray-300">—</span>;
  return <span className={c >= 0 ? "text-green-700" : "text-red-600"}>{c >= 0 ? "▲" : "▼"} {Math.abs(c).toFixed(1)}%</span>;
}
// ▲ $1,234 (green) / ▼ $1,234 (red)
function Dollars({ now, then }) {
  if (!then && !now) return <span className="text-gray-300">—</span>;
  const d = Math.round(now - then);
  return <span className={d >= 0 ? "text-green-700" : "text-red-600"}>{d >= 0 ? "▲" : "▼"} {$0(Math.abs(d))}</span>;
}

// One table style for the whole tab: right-aligned numbers, light row lines, bold total row
const TH = "py-1.5 px-2 text-xs font-semibold text-gray-500 text-right first:text-left first:pl-0 last:pr-0";
const TD = "py-1.5 px-2 text-right tabular-nums first:text-left first:pl-0 last:pr-0";
function Table({ head, rows, total }) {
  return (
    <table className="w-full text-sm">
      <thead><tr className="border-b border-[#E7EAF0]">{head.map((h, i) => <th key={i} className={TH}>{h}</th>)}</tr></thead>
      <tbody>
        {rows.map((r, i) => <tr key={i} className="border-t border-[#F0F2F5]">{r.map((c, j) => <td key={j} className={TD}>{c}</td>)}</tr>)}
        {total && <tr className="border-t-2 border-[#E7EAF0] font-semibold">{total.map((c, j) => <td key={j} className={TD}>{c}</td>)}</tr>}
      </tbody>
    </table>
  );
}
const SubHead = ({ children }) => <div className="text-sm font-bold text-gray-900 mb-1">{children}</div>;

export default function InsightsTab({ pharmacyId, limit }) {
  const today = todayPerth();
  const [kind, setKind] = useState("this_year");
  const [custom, setCustom] = useState({ from: addDaysStr(today, -30), to: today });
  const [card, setCard] = useState("takings");
  const [types, setTypes] = useState([]);
  const [holidays, setHolidays] = useState(new Set(WA_OLD_HOLIDAYS));
  const [hours, setHours] = useState(null);       // pharmacy_settings opening hours (trading days, for projections)
  const [staffNames, setStaffNames] = useState({});
  const [allDays, setAllDays] = useState(null);   // every day since 2014: [{ date, row, f: dayFigures|null }] — loaded once
  const [rostered, setRostered] = useState(null); // date -> [staff ids] for the period (Over/under only)
  const [error, setError] = useState("");

  // Last card chosen, remembered on this computer
  useEffect(() => { try { const c = localStorage.getItem(CARD_KEY); if (CARDS.some((x) => x.key === c)) setCard(c); } catch { /* private window */ } }, []);
  const pickCard = (c) => { setCard(c); try { localStorage.setItem(CARD_KEY, c); } catch { /* ignore */ } };

  useEffect(() => {
    loadPaymentTypes(supabase, pharmacyId).then(setTypes).catch((e) => setError(e.message));
    fetchAll(() => supabase.from("public_holidays").select("date").eq("pharmacy_id", pharmacyId).order("date"))
      .then((h) => setHolidays(new Set([...WA_OLD_HOLIDAYS, ...h.map((x) => String(x.date).slice(0, 10))]))).catch(() => {});
    supabase.from("pharmacy_settings").select(HOURS_COLS).eq("pharmacy_id", pharmacyId).maybeSingle().then(({ data }) => setHours(data || {}));
    supabase.from("staff").select("id, name").or(`pharmacy_id.eq.${pharmacyId},pharmacy_id.is.null`) // locums included
      .then(({ data }) => setStaffNames(Object.fromEntries((data || []).map((s) => [String(s.id), s.name]))));
  }, [pharmacyId]);

  // Every day and every tender — ONE load (two paginated queries in parallel), reused by everything below
  useEffect(() => {
    if (!types.length) return;
    let cancelled = false;
    (async () => {
      try {
        const [days, tenders] = await Promise.all([
          fetchAll(() => supabase.from("daily_takings")
            .select("id, takings_date, status, source, cash_takings, customers, gst_sales, cash_variance, eftpos_variance, variance_reason, confirmed_by_1, confirmed_by_2")
            .eq("pharmacy_id", pharmacyId).lte("takings_date", today).order("takings_date")),
          fetchAll(() => supabase.from("daily_takings_tenders").select("daily_takings_id, payment_type_id, amount").eq("pharmacy_id", pharmacyId).order("id")),
        ]);
        const byDay = {};
        for (const t of tenders) (byDay[t.daily_takings_id] = byDay[t.daily_takings_id] || {})[t.payment_type_id] = Number(t.amount) || 0;
        const out = days.map((d) => {
          const row = { ...d, takings_date: String(d.takings_date).slice(0, 10), tenders: byDay[d.id] || {} };
          const f = countsInTotals(row) ? dayFigures(row, types) : null;
          return { date: row.takings_date, row, f: f && f.hasFigures ? f : null };
        });
        if (!cancelled) { setAllDays(out); setError(""); }
      } catch (e) {
        if (!cancelled) setError(e?.message || String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [pharmacyId, types, today]);

  const byDate = useMemo(() => Object.fromEntries((allDays || []).map((x) => [x.date, x])), [allDays]);
  const lastFig = useMemo(() => {
    if (!allDays) return undefined;
    for (let i = allDays.length - 1; i >= 0; i--) if (allDays[i].row.status === "confirmed") return allDays[i].date;
    return null;
  }, [allDays]);
  const period = lastFig === undefined ? null : periodFor(kind, today, custom, lastFig);
  const valid = period && period.from && period.to && period.from <= period.to;
  const ly = valid ? { from: shiftBack(period.from), to: shiftBack(period.to) } : null;
  // "This month" / "This week" are also compared with the same days of the previous month / week
  // (1–8 Nov vs 1–8 Oct; Mon–Sun so far vs the same weekdays last week). Other periods: no such columns.
  const prevShift = kind === "this_month" ? sameDayPrevMonth : kind === "this_week" ? (d) => addDaysStr(d, -7) : null;
  const pp = valid && prevShift
    ? { from: prevShift(period.from), to: prevShift(period.to), word: kind === "this_month" ? "last month" : "last week", col: kind === "this_month" ? "Last month" : "Last week" }
    : null;

  // Figures for a date range (trading days with figures only)
  const statsFor = (from, to) => {
    const s = emptyStats();
    for (const d of datesBetween(from, to)) { const x = byDate[d]; if (x?.f) addDay(s, x.f); }
    return s;
  };

  // The period, last year, and each month of the period (part months clipped to the period; same dates −364 days)
  const view = useMemo(() => {
    if (!allDays || !valid) return null;
    const now = statsFor(period.from, period.to);
    const then = statsFor(ly.from, ly.to);
    const months = [];
    for (let m = period.from.slice(0, 7); m <= period.to.slice(0, 7); m = addMonthsYm(m, 1)) {
      const a = period.from > monthStart(m) ? period.from : monthStart(m);
      const b = period.to < monthEnd(m) ? period.to : monthEnd(m);
      const [y, mo] = m.split("-").map(Number);
      const note = b < monthEnd(m) ? "to date" : a > monthStart(m) ? `from ${Number(a.slice(8))}` : "";
      months.push({ label: `${MON[mo - 1]} ${y}`, note, now: statsFor(a, b), then: statsFor(shiftBack(a), shiftBack(b)) });
    }
    // Day-of-week averages (public holidays on their own row)
    const dowOf = (from, to) => {
      const rows = WEEK.map(() => emptyStats());
      const ph = emptyStats();
      for (const d of datesBetween(from, to)) { const x = byDate[d]; if (x?.f) addDay(holidays.has(d) ? ph : rows[dowIndex(d)], x.f); }
      return { rows, ph };
    };
    // Busiest / quietest trading days by customers
    const ranked = datesBetween(period.from, period.to).map((d) => byDate[d]).filter((x) => x?.f && x.f.customers > 0)
      .sort((p, q) => q.f.customers - p.f.customers || p.date.localeCompare(q.date));
    const flag = (date) => (holidays.has(date) ? "Public holiday" : holidays.has(addDaysStr(date, -1)) ? "Day after a public holiday" : "");
    const pick = (list) => list.map((x) => ({ date: x.date, customers: x.f.customers, till: x.f.till, flag: flag(x.date) }));
    // Over/under: till counts in the app (imported days have no over/under figures)
    const counts = datesBetween(period.from, period.to).map((d) => byDate[d]?.row).filter((r) => r && r.source === "app" && r.status === "confirmed");
    const isPast = (r) => Math.abs(Number(r.cash_variance || 0)) > limit || Math.abs(Number(r.eftpos_variance || 0)) > limit;
    return {
      now, then, months,
      prev: pp ? statsFor(pp.from, pp.to) : null,
      dowNow: dowOf(period.from, period.to), dowThen: dowOf(ly.from, ly.to),
      dowPrev: pp ? dowOf(pp.from, pp.to) : null,
      busiest: pick(ranked.slice(0, 10)),
      quietest: ranked.length > 10 ? pick(ranked.slice(-10).reverse()) : [],
      ou: {
        counts, past: counts.filter(isPast), isPast,
        totalCash: round2(counts.reduce((s, r) => s + Number(r.cash_variance || 0), 0)),
        totalEftpos: round2(counts.reduce((s, r) => s + Number(r.eftpos_variance || 0), 0)),
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDays, byDate, holidays, period?.from, period?.to, limit, kind]);

  // Roster for the period — only needed by the Over/under card
  useEffect(() => {
    if (card !== "overunder" || !valid) return;
    let cancelled = false;
    setRostered(null);
    // many older shifts have no pharmacy_id — include those too
    fetchAll(() => supabase.from("roster_shifts").select("id, staff_id, shift_date")
      .or(`pharmacy_id.eq.${pharmacyId},pharmacy_id.is.null`).gte("shift_date", period.from).lte("shift_date", period.to).order("id"))
      .then((shifts) => {
        if (cancelled) return;
        const who = {};
        for (const s of shifts) if (s.staff_id != null) (who[String(s.shift_date).slice(0, 10)] = who[String(s.shift_date).slice(0, 10)] || new Set()).add(String(s.staff_id));
        setRostered(Object.fromEntries(Object.entries(who).map(([d, set]) => [d, [...set]])));
      })
      .catch((e) => { if (!cancelled) setError(e?.message || String(e)); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, pharmacyId, period?.from, period?.to]);

  const nameOf = (id) => staffNames[String(id)] || "—";
  const staffTable = useMemo(() => {
    if (!view || !rostered) return null;
    const per = {};
    for (const r of view.ou.counts) {
      for (const id of rostered[r.takings_date] || []) {
        const p = (per[id] = per[id] || { days: 0, past: 0, cash: 0 });
        p.days += 1;
        if (view.ou.isPast(r)) p.past += 1;
        p.cash += Number(r.cash_variance || 0);
      }
    }
    return Object.entries(per).map(([id, p]) => ({ id, ...p, cash: round2(p.cash), pct: p.days >= MIN_DAYS_FOR_PCT ? (p.past / p.days) * 100 : null }))
      .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || b.days - a.days || nameOf(a.id).localeCompare(nameOf(b.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, rostered, staffNames]);

  // Monthly series per financial year (takings, customers, average sale) + the seasonal pattern, from the same load.
  // The unfinished current month comes off the solid lines and is projected.
  // Lines per FINANCIAL year (Jul–Jun) when a financial-year period is picked; per CALENDAR year (Jan–Dec) otherwise
  const chartMode = kind === "this_fy" || kind === "last_fy" ? "fy" : "calendar";
  const trendSets = useMemo(() => {
    if (!allDays || !hours || lastFig === undefined) return null;
    const cal = chartMode === "calendar";
    // Which line a date is on, and its position along the line (0–11)
    const lineOf = (d) => (cal ? d.slice(0, 4) : fyOf(d).label);
    const idxOf = (d) => (cal ? Number(d.slice(5, 7)) - 1 : (Number(d.slice(5, 7)) + 5) % 12);
    const curLine = lineOf(today);
    const prevLine = cal ? String(Number(curLine) - 1) : fyOf(addDaysStr(fyOf(today).start, -1)).label;
    const fy = { label: curLine };
    const ym = today.slice(0, 7);
    const idxNow = idxOf(today);
    const acc = {}; // line label -> 12 × stats
    const curYear = Number(today.slice(0, 4));
    const wkAll = Array.from({ length: 52 }, () => ({ cust: 0, n: 0 })); // every earlier year
    const wkCur = Array.from({ length: 52 }, () => ({ cust: 0, n: 0 })); // this calendar year
    const years = new Set();
    for (const x of allDays) {
      if (!x.f) continue;
      const i = idxOf(x.date);
      const l = lineOf(x.date);
      addDay((acc[l] = acc[l] || Array.from({ length: 12 }, emptyStats))[i], x.f);
      if (x.f.customers > 0) {
        const y = Number(x.date.slice(0, 4));
        const b = y === curYear ? wkCur : wkAll;
        b[weekOfYear(x.date)].cust += x.f.customers; b[weekOfYear(x.date)].n += 1;
        if (y !== curYear) years.add(y);
      }
    }
    const series = (val) => Object.fromEntries(Object.entries(acc).map(([l, arr]) => [l, arr.map(val)]));
    const out = {
      mode: chartMode,
      curFy: curLine,
      prevFy: prevLine,
      takings: { trend: series((a) => (a.n ? round2(a.till) : null)), projection: null },
      avgSale: { trend: series((a) => (a.cust ? round2(a.tillC / a.cust) : null)), projection: null },
    };
    const end = monthEnd(ym);
    const cur = acc[fy.label]?.[idxNow];
    if ((!lastFig || lastFig < end) && cur) {
      for (const k of ["takings", "avgSale"]) out[k].trend[fy.label][idxNow] = null; // never a dip towards zero
      const trading = (d) => !holidays.has(d) && openOnWeekday(hours, weekdayOf(d)) && byDate[d]?.row.status !== "closed";
      const start = monthStart(ym);
      const tdSoFar = lastFig && lastFig >= start ? datesBetween(start, lastFig).filter(trading).length : 0;
      const tdMonth = datesBetween(start, end).filter(trading).length;
      const base = { fy: fy.label, idx: idxNow };
      if (cur.n && tdSoFar) out.takings.projection = { ...base, value: round2((cur.till / tdSoFar) * tdMonth), note: `${$0(cur.till)} so far over ${tdSoFar} of ${tdMonth} trading days` };
      if (cur.cust) out.avgSale.projection = { ...base, value: round2(cur.tillC / cur.cust), note: "the average so far this month" };
    }
    const ys = [...years].sort();
    out.season = {
      avg: wkAll.map((w) => (w.n ? w.cust / w.n : null)),
      cur: wkCur.map((w) => (w.n ? w.cust / w.n : null)),
      curYear,
      range: ys.length ? `${ys[0]}–${ys[ys.length - 1]}` : "",
    };
    return out;
  }, [allDays, byDate, hours, holidays, lastFig, today, chartMode]);

  const box ="bg-white rounded-2xl border border-[#E7EAF0] shadow-sm p-4";
  const varCls = (v) => (Math.abs(Number(v || 0)) > limit ? "text-red-600 font-semibold" : "text-gray-700");
  const totalLabel = kind === "this_fy" || kind === "this_year" ? "Year to date" : "Total";
  const yearWord = chartMode === "fy" ? "financial year" : "calendar year";

  // Card headlines — vs last year, or vs the same days of last month / week on "This month" / "This week"
  const headline = (k) => {
    const now = view.now;
    const then = pp ? view.prev : view.then;
    const word = pp ? pp.word : "last year";
    const vs = (a, b) => <><Pct now={a} then={b} /> <span className="font-normal text-gray-400">vs {word}</span></>;
    if (k === "takings") return { big: $0(now.till), sub: vs(now.till, then.till) };
    if (k === "customers") return { big: int(now.cust), sub: vs(now.cust, then.cust) };
    if (k === "avgSale") return { big: avgSaleOf(now) === null ? "—" : $2(avgSaleOf(now)), sub: vs(avgSaleOf(now), avgSaleOf(then)) };
    if (k === "mix") return {
      big: <span className="text-base">Cash {pct1(now.cash, now.till)} / EFTPOS {pct1(now.eftpos, now.till)} / Other {pct1(now.other, now.till)}</span>,
      sub: <span className="text-gray-500">{word} {pct1(then.cash, then.till)} / {pct1(then.eftpos, then.till)} / {pct1(then.other, then.till)}</span>,
    };
    return {
      big: <span className={varCls(view.ou.totalCash)}>{fmtVariance(view.ou.totalCash)}</span>,
      sub: <span className="text-gray-500">{view.ou.past.length} day{view.ou.past.length === 1 ? "" : "s"} past the limit</span>,
    };
  };

  // Month tables (vs last year). extra = { head: [...], cells: (now, then) => [...] } — more columns after the standard
  // ones (and on the total row).
  const monthTable = (val, money, extra) => {
    const cells = (label, now, then) => [
      label, money(val(now)), money(val(then)),
      ...(money === $0 || money === int ? [money === $0 ? <Dollars key="d" now={val(now)} then={val(then)} /> : <Diff key="d" now={val(now)} then={val(then)} />] : []),
      <Pct key="p" now={val(now)} then={val(then)} />,
      ...(extra ? extra.cells(now, then) : []),
    ];
    const rows = view.months.map((m) => cells(<span key="l">{m.label}{m.note && <span className="text-xs text-gray-400"> {m.note}</span>}</span>, m.now, m.then));
    const total = cells(totalLabel, view.now, view.then);
    const head = ["Month", "This year", "Last year", ...(money === $0 ? ["Change $"] : money === int ? ["Change"] : []), "Change %", ...(extra ? extra.head : [])];
    return <Table head={head} rows={rows} total={total} />;
  };
  // Average customers per trading day with a customer figure (closed / missing / no figure left out)
  const perDay = (s) => (s && s.nc ? s.cust / s.nc : null);
  const fmt1 = (v) => (v === null ? "—" : v.toLocaleString("en-AU", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
  const custPerDay = {
    head: ["Avg/day this year", "Avg/day last year", "Change %"],
    cells: (a, b) => [fmt1(perDay(a)), fmt1(perDay(b)), <Pct key="pd" now={perDay(a)} then={perDay(b)} />],
  };
  const dowTable = (label, val, money) => {
    const v = (s) => (s && s.n ? val(s) : null);
    const row = (name, a, b) => [name, v(a) === null ? "—" : money(v(a)), v(b) === null ? "—" : money(v(b)), <Pct key="p" now={v(a)} then={v(b)} />];
    const rows = WEEK.map((w, i) => row(w, view.dowNow.rows[i], view.dowThen.rows[i]));
    if (view.dowNow.ph.n || view.dowThen.ph.n) rows.push(row("Public holidays", view.dowNow.ph, view.dowThen.ph));
    return <Table head={["Day", label, "Last year", "Change %"]} rows={rows} />;
  };

  // "This month" / "This week": Customers and Average sale compare ONLY with the same days of last month / week
  const pl = pp && (() => {
    const isMonth = kind === "this_month";
    const partial = isMonth ? period.to < monthEnd(period.from.slice(0, 7)) : period.to < addDaysStr(period.from, 6);
    const [y, m] = parts(period.from);
    const [py, pm] = parts(pp.from);
    return {
      now: isMonth ? `${MON[m - 1]} ${y}${partial ? " (to date)" : ""}` : `This week${partial ? " (to date)" : ""}`,
      prev: isMonth ? `${MON[pm - 1]} ${py} (same days)` : "Last week (same days)",
      nowCol: isMonth ? "This month" : "This week",
      prevCol: isMonth ? "Last month (same days)" : "Last week (same days)",
    };
  })();
  // Summary: total customers, trading days (with a customer figure) and the average per day — this period vs previous
  const custSummary = () => {
    const a = view.now, b = view.prev;
    return (
      <Table
        head={["", "Total customers", "Trading days", "Avg customers/day"]}
        rows={[[pl.now, int(a.cust), a.nc, fmt1(perDay(a))], [pl.prev, int(b.cust), b.nc, fmt1(perDay(b))]]}
        total={["Change %", <Pct key="c" now={a.cust} then={b.cust} />, <Pct key="n" now={a.nc} then={b.nc} />, <Pct key="a" now={perDay(a)} then={perDay(b)} />]}
      />
    );
  };
  // By weekday (each vs the same weekday in the previous month / week); overall = the total row
  const prevDowTable = (nowHead, prevHead, val, money, overall) => {
    const cell = (v) => (v === null ? "—" : money(v));
    const row = (name, a, b) => [name, cell(val(a)), cell(val(b)), <Pct key="p" now={val(a)} then={val(b)} />];
    const rows = WEEK.map((w, i) => row(w, view.dowNow.rows[i], view.dowPrev.rows[i]));
    if (view.dowNow.ph.n || view.dowPrev.ph.n) rows.push(row("Public holidays", view.dowNow.ph, view.dowPrev.ph));
    return <Table head={["Day", nowHead, prevHead, "Change %"]} rows={rows} total={overall ? row("Overall", view.now, view.prev) : null} />;
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="h-10 rounded-lg border border-gray-300 px-3 text-sm bg-white">
            {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          {kind === "custom" && (
            <>
              <input type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="h-10 rounded-lg border border-gray-300 px-2 text-sm" />
              <span className="text-gray-400">–</span>
              <input type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="h-10 rounded-lg border border-gray-300 px-2 text-sm" />
            </>
          )}
        </div>
        {valid && (
          <p className="text-xs text-gray-500 mt-1.5">
            {fmtRange(period.from, period.to)}
            <span className="text-gray-400"> · vs last year </span>{fmtRange(ly.from, ly.to)}
            {pp && <><span className="text-gray-400"> · vs {pp.word} </span>{fmtRange(pp.from, pp.to)}</>}
          </p>
        )}
      </div>
      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{error}</div>}

      {!view ? <p className="text-sm text-gray-400">{allDays && !valid ? "Pick a start date before the end date." : "Loading…"}</p> : (
        <>
          {/* The five cards — one subject at a time */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3" role="tablist">
            {CARDS.map((c) => {
              const h = headline(c.key);
              const on = card === c.key;
              return (
                <button key={c.key} type="button" role="tab" aria-selected={on} onClick={() => pickCard(c.key)}
                  className={`text-left rounded-2xl border p-3.5 shadow-sm transition-colors min-w-0 ${on ? "bg-blue-50 border-blue-500 ring-1 ring-blue-500" : "bg-white border-[#E7EAF0] hover:border-blue-300"}`}>
                  <div className={`text-xs font-semibold ${on ? "text-blue-700" : "text-gray-500"}`}>{c.label}</div>
                  <div className="text-xl font-bold tabular-nums text-gray-900 truncate">{h.big}</div>
                  <div className="text-xs font-semibold">{h.sub}</div>
                </button>
              );
            })}
          </div>

          {card === "takings" && (
            <div className={`${box} space-y-5`}>
              <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6">
                <div><SubHead>Takings by month</SubHead>{monthTable((s) => s.till, $0)}</div>
                <div><SubHead>Average takings by day of week</SubHead>{dowTable("Avg takings", (s) => s.till / s.n, $0)}</div>
              </div>
              <div>
                <SubHead>Monthly takings by {yearWord}</SubHead>
                {!trendSets ? <p className="text-sm text-gray-400">Loading…</p>
                  : <TrendChart key={trendSets.mode} {...trendSets.takings} curFy={trendSets.curFy} prevFy={trendSets.prevFy} mode={trendSets.mode} fmt={$0} label={`Monthly takings by ${yearWord}`} />}
              </div>
            </div>
          )}

          {card === "customers" && (
            <div className={`${box} space-y-5`}>
              <p className="text-xs text-gray-400 -mb-2">Only days with a customer figure.</p>
              {pl ? (
                <>
                  <div className="max-w-2xl"><SubHead>Customers — {pl.now} vs {pl.prev}</SubHead>{custSummary()}</div>
                  <div className="max-w-2xl"><SubHead>Average customers by day of week</SubHead>{prevDowTable(`${pl.nowCol} avg customers`, `${pl.prevCol.replace(" (same days)", "")} avg customers`, perDay, fmt1)}</div>
                </>
              ) : (
                <>
                  <div><SubHead>Customers by month</SubHead>{monthTable((s) => s.cust, int, custPerDay)}</div>
                  <div className="max-w-xl"><SubHead>Average customers by day of week</SubHead>{dowTable("Avg customers", (s) => (s.nc ? s.cust / s.nc : 0), int)}</div>
                </>
              )}
              <div>
                <SubHead>Busiest and quietest days</SubHead>
                {!view.busiest.length ? <p className="text-sm text-gray-400">No customer figures in this period.</p> : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {[{ title: "Busiest 10", list: view.busiest }, { title: "Quietest 10", list: view.quietest }].filter((g) => g.list.length).map((g) => (
                      <div key={g.title}>
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{g.title}</div>
                        <Table head={["Date", "Customers", "Till"]} rows={g.list.map((r) => [
                          <span key="d">{dayLabel(r.date)} {r.date.slice(0, 4)}{r.flag && <span className={`ml-2 text-[11px] font-semibold ${r.flag === "Public holiday" ? "text-purple-700" : "text-amber-700"}`}>{r.flag}</span>}</span>,
                          int(r.customers), $0(r.till),
                        ])} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <SubHead>Seasonal pattern — customers per day by week of the year</SubHead>
                {!trendSets ? <p className="text-sm text-gray-400">Loading…</p> : <SeasonChart {...trendSets.season} />}
              </div>
            </div>
          )}

          {card === "avgSale" && (
            <div className={`${box} space-y-5`}>
              <p className="text-xs text-gray-400 -mb-2">Till ÷ customers, on days with a customer figure.</p>
              {pl ? (
                <div className="max-w-2xl"><SubHead>Average sale — {pl.now} vs {pl.prev}</SubHead>{prevDowTable(pl.nowCol, pl.prevCol, avgSaleOf, $2, true)}</div>
              ) : (
                <div className="max-w-2xl"><SubHead>Average sale by month</SubHead>{monthTable((s) => avgSaleOf(s), (v) => (v === null ? "—" : $2(v)))}</div>
              )}
              <div>
                <SubHead>Average sale by {yearWord}</SubHead>
                {!trendSets ? <p className="text-sm text-gray-400">Loading…</p>
                  : <TrendChart key={trendSets.mode} {...trendSets.avgSale} curFy={trendSets.curFy} prevFy={trendSets.prevFy} mode={trendSets.mode} fmt={$2} label={`Average sale by ${yearWord}`} zeroBase={false} />}
              </div>
            </div>
          )}

          {card === "mix" && (
            <div className={box}>
              <SubHead>Payment mix by month</SubHead>
              <Table
                head={["Month", "Cash $", "Cash %", "EFTPOS $", "EFTPOS %", "Other $", "Other %"]}
                rows={view.months.map((m) => [
                  <span key="l">{m.label}{m.note && <span className="text-xs text-gray-400"> {m.note}</span>}</span>,
                  $0(m.now.cash), pct1(m.now.cash, m.now.till), $0(m.now.eftpos), pct1(m.now.eftpos, m.now.till), $0(m.now.other), pct1(m.now.other, m.now.till),
                ])}
                total={[totalLabel, $0(view.now.cash), pct1(view.now.cash, view.now.till), $0(view.now.eftpos), pct1(view.now.eftpos, view.now.till), $0(view.now.other), pct1(view.now.other, view.now.till)]}
              />
            </div>
          )}

          {card === "overunder" && (
            <div className={box}>
              <div className="flex items-baseline justify-between gap-2 flex-wrap mb-2">
                <div className="text-sm font-bold text-gray-900">Over / under — till counts in the app</div>
                <div className="text-sm tabular-nums">
                  Total cash <span className={varCls(view.ou.totalCash)}>{fmtVariance(view.ou.totalCash)}</span>
                  <span className="text-gray-400"> · </span>EFTPOS <span className="text-gray-700">{fmtVariance(view.ou.totalEftpos)}</span>
                  <span className="text-xs text-gray-400"> · {view.ou.counts.length} counted day{view.ou.counts.length === 1 ? "" : "s"}</span>
                </div>
              </div>

              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-3 mb-1">Days past the {$2(limit)} limit</div>
              {view.ou.past.length === 0 ? <p className="text-sm text-gray-400">None in this period.</p> : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#E7EAF0]">
                      <th className={TH}>Date</th><th className={TH}>Cash</th><th className={TH}>EFTPOS</th>
                      <th className={`${TH} !text-left`}>Reason</th><th className={`${TH} !text-left`}>Counted by</th><th className={`${TH} !text-left`}>Rostered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.ou.past.map((d) => (
                      <tr key={d.id} className="border-t border-[#F0F2F5] align-top">
                        <td className={`${TD} whitespace-nowrap font-semibold`}>{dayLabel(d.takings_date)} {d.takings_date.slice(0, 4)}</td>
                        <td className={`${TD} whitespace-nowrap ${varCls(d.cash_variance)}`}>{fmtVariance(d.cash_variance)}</td>
                        <td className={`${TD} whitespace-nowrap ${varCls(d.eftpos_variance)}`}>{fmtVariance(d.eftpos_variance)}</td>
                        <td className={`${TD} !text-left text-gray-600`}>{d.variance_reason || <span className="text-gray-300">—</span>}</td>
                        <td className={`${TD} !text-left text-gray-600`}>{[d.confirmed_by_1, d.confirmed_by_2].filter((x) => x != null).map(nameOf).join(" & ") || "—"}</td>
                        <td className={`${TD} !text-left text-gray-600`}>{!rostered ? "…" : (rostered[d.takings_date] || []).map(nameOf).sort().join(", ") || <span className="text-gray-300">no roster</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-5 mb-1">Staff</div>
              {!staffTable ? <p className="text-sm text-gray-400">Loading the roster…</p>
                : staffTable.length === 0 ? <p className="text-sm text-gray-400">No rostered days with a till count in this period.</p> : (
                  <Table
                    head={["Name", "Days worked", "Days past the limit", "% of their days", "Cash over/under on their days"]}
                    rows={staffTable.map((p) => [nameOf(p.id), p.days, p.past, p.pct === null ? "—" : `${p.pct.toFixed(1)}%`, fmtVariance(p.cash)])}
                  />
                )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Change in a count: ▲ 1,234 / ▼ 1,234
function Diff({ now, then }) {
  if (!then && !now) return <span className="text-gray-300">—</span>;
  const d = Math.round(now - then);
  return <span className={d >= 0 ? "text-green-700" : "text-red-600"}>{d >= 0 ? "▲" : "▼"} {int(Math.abs(d))}</span>;
}

// One line per financial year, Jul → Jun. This FY strong blue + thick, last FY orange, every older year its own colour
// (fixed by the FY's start year, so a year keeps its colour whatever else is ticked), thinner lines.
const CUR_COLOUR = "#2563eb";   // blue-600
const PREV_COLOUR = "#ea580c";  // orange-600
const OLD_COLOURS = [
  "#16a34a", // green
  "#7c3aed", // purple
  "#0d9488", // teal
  "#dc2626", // red
  "#8b5a2b", // brown
  "#db2777", // pink
  "#6b7d1a", // olive
  "#1e3a8a", // navy
  "#ca8a04", // gold
  "#c026d3", // magenta
  "#374151", // charcoal
  "#7f1d1d", // maroon
];
const oldColour = (fy) => OLD_COLOURS[(((Number(fy.slice(0, 4)) - 2014) % OLD_COLOURS.length) + OLD_COLOURS.length) % OLD_COLOURS.length];

// trend = { fyLabel: [12 × value|null] }, projection = { fy, idx, value, note } | null; fmt formats axis + hover values.
// Shows this FY and last FY until "Show more years" opens the tick list.
// mode "calendar": lines are calendar years ("2026", Jan → Dec); "fy": financial years ("2026-27", Jul → Jun)
function TrendChart({ trend, projection, curFy, prevFy, mode = "fy", fmt = $0, label = "Monthly takings", zeroBase = true }) {
  const allYears = Object.keys(trend).concat(projection && !trend[projection.fy] ? [projection.fy] : []).sort();
  const [shown, setShown] = useState(() => new Set([curFy, prevFy]));
  const [picking, setPicking] = useState(false);
  const [hover, setHover] = useState(null); // { x, y, text }
  if (!allYears.length) return <p className="text-sm text-gray-400">No figures yet.</p>;
  const years = allYears.filter((y) => shown.has(y));
  const style = (y) => (y === curFy ? { stroke: CUR_COLOUR, width: 3 } : y === prevFy ? { stroke: PREV_COLOUR, width: 2.25 } : { stroke: oldColour(y), width: 1.75 });
  // Draw older first so this year and last year sit on top
  const drawOrder = [...years].sort((a, b) => (a === curFy ? 2 : a === prevFy ? 1 : 0) - (b === curFy ? 2 : b === prevFy ? 1 : 0));
  const showProj = projection && shown.has(projection.fy);
  const values = years.flatMap((y) => (trend[y] || []).filter((v) => v !== null)).concat(showProj ? [projection.value] : []);
  const max = Math.max(1, ...values);
  const lo = zeroBase || !values.length ? 0 : Math.max(0, Math.floor(Math.min(...values) * 0.9));
  const W = 760, H = 260, L = 56, R = 16, T = 14, B = 28;
  const x = (i) => L + (i * (W - L - R)) / 11;
  const yv = (v) => T + (H - T - B) * (1 - (v - lo) / (max - lo || 1));
  const cal = mode === "calendar";
  const monthsJul = Array.from({ length: 12 }, (_, i) => MON[cal ? i : (i + 6) % 12]);
  const monthYear = (line, i) => (cal ? `${MON[i]} ${line}` : `${MON[(i + 6) % 12]} ${Number(line.slice(0, 4)) + (i >= 6 ? 1 : 0)}`);
  const toggle = (y) => setShown((s) => { const n = new Set(s); if (n.has(y)) n.delete(y); else n.add(y); return n; });
  const tag = (y) => (y === curFy ? " (this year)" : y === prevFy ? " (last year)" : "");
  const swatch = (y) => <span className="inline-block w-4 rounded" style={{ height: style(y).width + 1, background: style(y).stroke }} />;

  return (
    <div>
      {/* Legend (the years shown) + "Show more years" tick list */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2 text-xs text-gray-700">
        {[...years].reverse().map((y) => <span key={y} className="inline-flex items-center gap-1.5">{swatch(y)}{y}{tag(y)}</span>)}
        <button type="button" onClick={() => setPicking((p) => !p)} className="text-blue-600 hover:underline">{picking ? "Done" : "Show more years"}</button>
      </div>
      {picking && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2 rounded-lg bg-[#F8FAFC] border border-[#E7EAF0] px-3 py-2">
          {[...allYears].reverse().map((y) => (
            <label key={y} className="inline-flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
              <input type="checkbox" checked={shown.has(y)} onChange={() => toggle(y)} className="h-3.5 w-3.5" />
              {swatch(y)}{y}{tag(y)}
            </label>
          ))}
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={label} onMouseLeave={() => setHover(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W - R} y1={yv(lo + (max - lo) * f)} y2={yv(lo + (max - lo) * f)} stroke="#EEF1F5" />
            <text x={L - 6} y={yv(lo + (max - lo) * f) + 4} fontSize="10" textAnchor="end" fill="#6B7280">{fmt(lo + (max - lo) * f)}</text>
          </g>
        ))}
        {monthsJul.map((m, i) => <text key={m} x={x(i)} y={H - 8} fontSize="10" textAnchor="middle" fill="#6B7280">{m}</text>)}
        {drawOrder.map((y) => {
          const vals = trend[y] || [];
          const st = style(y);
          const segs = [];
          let run = [];
          vals.forEach((v, i) => { if (v !== null) run.push(`${x(i)},${yv(v)}`); else if (run.length) { segs.push(run); run = []; } });
          if (run.length) segs.push(run);
          return (
            <g key={y}>
              {segs.map((s, si) => <polyline key={si} points={s.join(" ")} fill="none" stroke={st.stroke} strokeWidth={st.width} strokeLinejoin="round" />)}
              {vals.map((v, i) => v === null ? null : (
                <circle key={i} cx={x(i)} cy={yv(v)} r={y === curFy || y === prevFy ? 3.5 : 2.5} fill={st.stroke}
                  onMouseEnter={() => setHover({ x: x(i), y: yv(v), text: `${monthYear(y, i)}: ${fmt(v)}` })}
                  onClick={() => setHover({ x: x(i), y: yv(v), text: `${monthYear(y, i)}: ${fmt(v)}` })} style={{ cursor: "pointer" }} />
              ))}
            </g>
          );
        })}
        {showProj && (() => {
          const st = style(projection.fy);
          const prevV = projection.idx > 0 ? trend[projection.fy]?.[projection.idx - 1] : null;
          const px = x(projection.idx), py = yv(projection.value);
          const text = `${monthYear(projection.fy, projection.idx)} (projected): ${fmt(projection.value)} — ${projection.note}`;
          return (
            <g>
              {prevV !== null && prevV !== undefined && <line x1={x(projection.idx - 1)} y1={yv(prevV)} x2={px} y2={py} stroke={st.stroke} strokeWidth={st.width} strokeDasharray="4 4" />}
              <circle cx={px} cy={py} r={4.5} fill="white" stroke={st.stroke} strokeWidth="2" style={{ cursor: "pointer" }}
                onMouseEnter={() => setHover({ x: px, y: py, text })} onClick={() => setHover({ x: px, y: py, text })} />
              <text x={px} y={py - 9} fontSize="10" textAnchor="middle" fill={st.stroke}>projected</text>
            </g>
          );
        })()}
        {hover && <Tip hover={hover} W={W} L={L} R={R} T={T} />}
      </svg>
    </div>
  );
}

// Hover box inside a chart, kept within the chart
function Tip({ hover, W, L, R, T }) {
  const w = Math.min(W - L - R, hover.text.length * 6 + 16);
  const bx = Math.max(L, Math.min(hover.x - w / 2, W - R - w));
  const by = hover.y - 34 < T ? hover.y + 10 : hover.y - 34;
  return (
    <g pointerEvents="none">
      <rect x={bx} y={by} width={w} height={22} rx={5} fill="#111827" opacity="0.92" />
      <text x={bx + w / 2} y={by + 15} fontSize="11" textAnchor="middle" fill="white">{hover.text}</text>
    </g>
  );
}

// Seasonal pattern: average customers per trading day in each week of the year (weeks 1–52) over every earlier year,
// with this calendar year's weeks so far on top in the strong colour.
const SEASON_AVG_COLOUR = "#94a3b8"; // slate-400
function SeasonChart({ avg, cur, curYear, range }) {
  const [hover, setHover] = useState(null);
  const values = [...avg, ...cur].filter((v) => v !== null);
  if (!values.length) return <p className="text-sm text-gray-400">No customer figures yet.</p>;
  const max = Math.max(1, ...values);
  const W = 760, H = 220, L = 44, R = 16, T = 14, B = 28;
  const x = (i) => L + (i * (W - L - R)) / 51;
  const yv = (v) => T + (H - T - B) * (1 - v / max);
  const line = (arr) => {
    const segs = [];
    let run = [];
    arr.forEach((v, i) => { if (v !== null) run.push(`${x(i)},${yv(v)}`); else if (run.length) { segs.push(run); run = []; } });
    if (run.length) segs.push(run);
    return segs;
  };
  // Month labels at the week each month starts in
  const monthWeeks = MON.map((m, i) => ({ m, w: Math.min(51, Math.floor((Date.UTC(2025, i, 1) - Date.UTC(2025, 0, 1)) / 86400000 / 7)) }));
  const tip = (i, v, who) => setHover({ x: x(i), y: yv(v), text: `Week ${i + 1} · ${who}: ${Math.round(v)} a day` });
  return (
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2 text-xs text-gray-700">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-4 h-[3px] rounded" style={{ background: SEASON_AVG_COLOUR }} />Average {range}</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-4 h-[4px] rounded" style={{ background: CUR_COLOUR }} />{curYear} so far</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Average customers per day by week of the year" onMouseLeave={() => setHover(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W - R} y1={yv(max * f)} y2={yv(max * f)} stroke="#EEF1F5" />
            <text x={L - 6} y={yv(max * f) + 4} fontSize="10" textAnchor="end" fill="#6B7280">{Math.round(max * f)}</text>
          </g>
        ))}
        {monthWeeks.map(({ m, w }) => <text key={m} x={x(w)} y={H - 8} fontSize="10" textAnchor="start" fill="#6B7280">{m}</text>)}
        {line(avg).map((s, i) => <polyline key={`a${i}`} points={s.join(" ")} fill="none" stroke={SEASON_AVG_COLOUR} strokeWidth="2" strokeLinejoin="round" />)}
        {line(cur).map((s, i) => <polyline key={`c${i}`} points={s.join(" ")} fill="none" stroke={CUR_COLOUR} strokeWidth="3" strokeLinejoin="round" />)}
        {avg.map((v, i) => v === null ? null : <circle key={`ap${i}`} cx={x(i)} cy={yv(v)} r="2.5" fill={SEASON_AVG_COLOUR} style={{ cursor: "pointer" }} onMouseEnter={() => tip(i, v, `average ${range}`)} onClick={() => tip(i, v, `average ${range}`)} />)}
        {cur.map((v, i) => v === null ? null : <circle key={`cp${i}`} cx={x(i)} cy={yv(v)} r="3.5" fill={CUR_COLOUR} style={{ cursor: "pointer" }} onMouseEnter={() => tip(i, v, String(curYear))} onClick={() => tip(i, v, String(curYear))} />)}
        {hover && <Tip hover={hover} W={W} L={L} R={R} T={T} />}
      </svg>
    </div>
  );
}
