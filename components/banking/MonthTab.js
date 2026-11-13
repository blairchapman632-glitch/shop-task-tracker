// Banking → Month (owner only, behind the admin PIN on pages/banking.js). Laid out like the old spreadsheet: Mon–Sun week
// blocks (Date, Day, Till, Cash, a column per payment type that's active or used that month, Total Bendigo, GST Sales,
// Customers, over/under marker), "Total Weekly" + "Cash Banking" under each week, monthly totals at the foot.
// Click a day for the owner editor (every figure editable with an edit reason → daily_takings_edits; Mark closed /
// missing / Reopen). Export for Arthur: this month or the financial year (lib/bankingExport.js).
import { useEffect, useState } from "react";
import supabase from "../../lib/supabaseClient";
import { round2, fmtVariance, cashVariance, eftposVariance, closingFromReceipt, dayBalance, fmtDiffShort, fmtOverUnder } from "../../lib/banking";
import {
  loadPeriod, loadPaymentTypes, weeksOfMonth, dayFigures, countsInTotals, columnTypes, dayLabel, WD, MON_LONG, previousRightTill,
  addMonthsYm, monthStart, monthEnd, fyOf, weekdayOf,
} from "../../lib/bankingData";
import { buildBankingWorkbook, exportFileName } from "../../lib/bankingExport";
import { todayPerth } from "../../lib/performanceReview";

const money = (n) => (n === null || n === undefined ? "" : round2(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const $ = (n) => `$${money(n)}`;
const STATUS = {
  open: { label: "Not confirmed", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  closed: { label: "Closed", cls: "bg-gray-100 text-gray-600 border-gray-200" },
  missing: { label: "Missing — no figures", cls: "bg-gray-100 text-gray-600 border-gray-200" },
};

export default function MonthTab({ pharmacyId, manager, limit }) {
  const today = todayPerth();
  const [ym, setYm] = useState(today.slice(0, 7));
  const [types, setTypes] = useState([]);
  const [data, setData] = useState(null); // { days, deposits }
  const [staffNames, setStaffNames] = useState({});
  const [error, setError] = useState("");
  const [openDate, setOpenDate] = useState(null);
  const [markerFor, setMarkerFor] = useState(null);
  const [exportMenu, setExportMenu] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    loadPaymentTypes(supabase, pharmacyId).then(setTypes).catch((e) => setError(e.message));
    supabase.from("staff").select("id, name").eq("pharmacy_id", pharmacyId)
      .then(({ data: s }) => setStaffNames(Object.fromEntries((s || []).map((x) => [x.id, x.name]))));
  }, [pharmacyId]);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    const wks = weeksOfMonth(ym);
    (async () => {
      try {
        // Days for the month; deposits for the whole weeks (a week can start in the month before)
        const [{ days }, { deposits }] = await Promise.all([
          loadPeriod(supabase, pharmacyId, monthStart(ym), monthEnd(ym), { deposits: false }),
          loadPeriod(supabase, pharmacyId, wks[0].start, wks[wks.length - 1].end, { deposits: true }).then((r) => ({ deposits: r.deposits })),
        ]);
        if (!cancelled) { setData({ days, deposits }); setError(""); }
      } catch (e) {
        if (!cancelled) setError(e?.message || String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [pharmacyId, ym, reload]);

  const exportXlsx = async (kind) => {
    setExportMenu(false);
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const fy = fyOf(monthStart(ym));
      const months = [];
      if (kind === "month") months.push(ym);
      else {
        const lastYm = (today < fy.end ? today : fy.end).slice(0, 7);
        for (let m = fy.start.slice(0, 7); m <= lastYm; m = addMonthsYm(m, 1)) months.push(m);
      }
      const out = [];
      for (const m of months) {
        const wks = weeksOfMonth(m);
        const [{ days }, { deposits }] = await Promise.all([
          loadPeriod(supabase, pharmacyId, monthStart(m), monthEnd(m), { deposits: false }),
          loadPeriod(supabase, pharmacyId, wks[0].start, wks[wks.length - 1].end, { deposits: true }),
        ]);
        out.push({ ym: m, days, deposits });
      }
      XLSX.writeFile(buildBankingWorkbook(XLSX, out, types), exportFileName(kind, ym, fy.label));
    } catch (e) {
      setError("Export failed: " + (e?.message || String(e)));
    } finally {
      setExporting(false);
    }
  };

  const [y, m] = ym.split("-").map(Number);
  const days = data?.days || [];
  const byDate = Object.fromEntries(days.map((d) => [d.takings_date, d]));
  const cols = columnTypes(types, days);
  const first = (id) => String(staffNames[id] || "").split(" ")[0];
  const past = (v) => v !== null && v !== undefined && Math.abs(Number(v)) > Number(limit);

  // Month totals
  const counted = days.filter(countsInTotals);
  const figs = counted.map((d) => ({ d, f: dayFigures(d, types) }));
  const sum = (fn) => round2(figs.reduce((s, x) => s + (fn(x) || 0), 0));
  const custDays = figs.filter((x) => x.f.customers > 0);
  const avgCust = custDays.length ? Math.round(custDays.reduce((s, x) => s + x.f.customers, 0) / custDays.length) : null;
  const colCount = 5 + cols.length + 4; // Date, Day, Balanced, Till, Cash, …types…, Bendigo, GST, Cust., status
  const isEftposCol = (t) => t.kind === "eftpos" && t.active !== false; // the columns in the EFTPOS check
  // "Balanced" cell: green tick / what's out in red / amber Not confirmed / grey dash (lib/banking.js dayBalance)
  const balanceCell = (b) => {
    if (b.state === "balanced") return <span className="text-green-600 font-bold" title="Balanced — cash, EFTPOS and total all within the limit">✓</span>;
    if (b.state === "unconfirmed") return <span className="text-amber-600 font-semibold">Not conf.</span>;
    if (b.state === "nocheck") return <span className="text-gray-300" title="No Z report figures to check">—</span>;
    if (b.state !== "out") return null;
    const lines = [!b.cash.ok && `Cash ${fmtDiffShort(b.cash.diff)}`, !b.eftpos.ok && `EFTPOS ${fmtDiffShort(b.eftpos.diff)}`].filter(Boolean);
    if (!lines.length) lines.push(`Total ${fmtDiffShort(b.total.diff)}`);
    return <span className="text-red-600 font-semibold">{lines.map((l) => <span key={l} className="block">{l}</span>)}</span>;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <button onClick={() => setYm(addMonthsYm(ym, -1))} className="w-10 h-10 rounded-lg bg-white border text-gray-600" aria-label="Previous month">‹</button>
          <button onClick={() => setYm(today.slice(0, 7))} className="min-w-[150px] text-base font-semibold text-gray-900" title="This month">{MON_LONG[m - 1]} {y}</button>
          <button onClick={() => setYm(addMonthsYm(ym, 1))} className="w-10 h-10 rounded-lg bg-white border text-gray-600" aria-label="Next month">›</button>
        </div>
        <div className="relative">
          <button onClick={() => setExportMenu((x) => !x)} disabled={exporting} className="h-10 px-4 rounded-lg bg-green-600 text-white text-sm font-semibold disabled:opacity-50">
            {exporting ? "Exporting…" : "Export ▾"}
          </button>
          {exportMenu && (
            <div className="absolute right-0 mt-1 w-56 rounded-lg border bg-white shadow-lg z-10 overflow-hidden">
              <button onClick={() => exportXlsx("month")} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">This month ({MON_LONG[m - 1]})</button>
              <button onClick={() => exportXlsx("fy")} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-t">Financial year {fyOf(monthStart(ym)).label} (for Arthur)</button>
            </div>
          )}
        </div>
      </div>
      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{error}</div>}

      {!data ? <p className="text-sm text-gray-400">Loading…</p> : (
        <div className="bg-white rounded-2xl border border-[#E7EAF0] shadow-sm overflow-x-auto">
          <table className="w-full text-xs sm:text-sm tabular-nums">
            {weeksOfMonth(ym).map((wk) => {
              let wkTill = 0;
              let wkGst = 0;
              const deps = data.deposits.filter((x) => x.deposit_date >= wk.start && x.deposit_date <= wk.end);
              return (
                <tbody key={wk.start} className="border-b-4 border-[#EEF1F5]">
                  <tr className="bg-gray-50 text-gray-500 text-[11px] uppercase">
                    <th className="px-2 py-1.5 text-left">Date</th><th className="px-2 py-1.5 text-left">Day</th>
                    <th className="px-1 py-1.5 text-center" title="Balanced against the Z report">Bal.</th>
                    <th className="px-2 py-1.5 text-right">Till</th><th className="px-2 py-1.5 text-right">Cash</th>
                    {cols.map((t) => <th key={t.id} className="px-2 py-1.5 text-right whitespace-nowrap">{t.name}</th>)}
                    <th className="px-2 py-1.5 text-right whitespace-nowrap">Total Bendigo</th><th className="px-2 py-1.5 text-right">GST Sales</th>
                    <th className="px-2 py-1.5 text-right">Cust.</th><th className="px-2 py-1.5" />
                  </tr>
                  {wk.days.map((d) => {
                    const day = byDate[d];
                    const isPast = d < today;
                    const st = day && STATUS[day.status];
                    const f = day && countsInTotals(day) ? dayFigures(day, types) : null;
                    if (f) { wkTill += f.till; wkGst += f.gst || 0; }
                    const flagged = day && (past(day.cash_variance) || past(day.eftpos_variance));
                    const bal = dayBalance(day, types, limit);
                    const out = bal.state === "out";
                    const red = "bg-red-50";
                    return (
                      <FragmentRow key={d}>
                        <tr onClick={() => setOpenDate(d)} className="border-t border-[#F0F2F5] hover:bg-blue-50/40 cursor-pointer">
                          <td className="px-2 py-1.5 whitespace-nowrap">{Number(d.slice(8))}/{Number(d.slice(5, 7))}</td>
                          <td className="px-2 py-1.5">{WD[weekdayOf(d)]}</td>
                          <td className="px-1 py-1 text-center text-[10px] leading-tight whitespace-nowrap">{balanceCell(bal)}</td>
                          {f ? (
                            <>
                              <td className={`px-2 py-1.5 text-right font-semibold ${out && bal.cash.ok && bal.eftpos.ok ? red : ""}`}>{money(f.till)}</td>
                              <td className={`px-2 py-1.5 text-right ${out && !bal.cash.ok ? red : ""}`}>{money(f.cash)}</td>
                              {cols.map((t) => <td key={t.id} className={`px-2 py-1.5 text-right ${out && !bal.eftpos.ok && isEftposCol(t) ? red : ""}`}>{day.tenders[t.id] ? money(day.tenders[t.id]) : ""}</td>)}
                              <td className="px-2 py-1.5 text-right">{money(f.bendigo)}</td>
                              <td className="px-2 py-1.5 text-right">{f.gst === null ? "" : money(f.gst)}</td>
                              <td className="px-2 py-1.5 text-right">{f.customers ?? ""}</td>
                            </>
                          ) : (
                            <td colSpan={cols.length + 6} className="px-2 py-1.5 text-gray-400">{day ? "" : isPast ? "No count" : ""}</td>
                          )}
                          <td className="px-2 py-1.5 whitespace-nowrap text-right">
                            {st && <span className={`text-[10px] px-1.5 py-0.5 rounded border ${st.cls}`}>{st.label}</span>}
                            {day?.source === "import" && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">imported</span>}
                            {flagged && (
                              <button onClick={(e) => { e.stopPropagation(); setMarkerFor(markerFor === d ? null : d); }}
                                title={`Cash ${fmtVariance(day.cash_variance)} · EFTPOS ${fmtVariance(day.eftpos_variance)}${day.variance_reason ? ` — ${day.variance_reason}` : ""}`}
                                className="ml-1 inline-block w-3 h-3 rounded-full bg-red-500 align-middle" aria-label="Over/under" />
                            )}
                          </td>
                        </tr>
                        {markerFor === d && flagged && (
                          <tr><td colSpan={colCount} className="px-3 py-1.5 text-xs bg-red-50 text-red-800">
                            Cash {fmtVariance(day.cash_variance)} · EFTPOS {fmtVariance(day.eftpos_variance)}{day.variance_reason ? ` — “${day.variance_reason}”` : ""}
                          </td></tr>
                        )}
                      </FragmentRow>
                    );
                  })}
                  <tr className="border-t border-[#E7EAF0] bg-[#F8FAFC] font-semibold">
                    <td className="px-2 py-1.5" colSpan={3}>Total Weekly</td>
                    <td className="px-2 py-1.5 text-right">{money(wkTill)}</td>
                    <td colSpan={cols.length + 2} />
                    <td className="px-2 py-1.5 text-right">{money(wkGst)}</td>
                    <td colSpan={2} />
                  </tr>
                  <tr className="text-gray-600">
                    <td className="px-2 py-1.5" colSpan={3}>Cash Banking</td>
                    <td className="px-2 py-1.5" colSpan={colCount - 3}>
                      {deps.length ? deps.map((x) => `${dayLabel(x.deposit_date)} ${$(x.amount)}${x.note ? ` (${x.note})` : ""}`).join(" · ") : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                </tbody>
              );
            })}
            <tfoot>
              <tr className="bg-gray-800 text-white font-semibold">
                <td className="px-2 py-2" colSpan={3}>Monthly total</td>
                <td className="px-2 py-2 text-right">{money(sum((x) => x.f.till))}</td>
                <td className="px-2 py-2 text-right">{money(sum((x) => x.f.cash))}</td>
                {cols.map((t) => <td key={t.id} className="px-2 py-2 text-right">{money(sum((x) => x.d.tenders[t.id]))}</td>)}
                <td className="px-2 py-2 text-right">{money(sum((x) => x.f.bendigo))}</td>
                <td className="px-2 py-2 text-right">{money(sum((x) => x.f.gst))}</td>
                <td className="px-2 py-2 text-right" title="Average customers per trading day">{avgCust === null ? "" : `avg ${avgCust}`}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {openDate && (
        <DayEditor
          pharmacyId={pharmacyId} manager={manager} limit={limit} date={openDate} day={byDate[openDate] || null} types={types} cols={cols}
          staffName={(id) => staffNames[id] || "—"} first={first}
          onClose={() => setOpenDate(null)} onSaved={() => setReload((n) => n + 1)}
        />
      )}
    </div>
  );
}

const FragmentRow = ({ children }) => <>{children}</>;

// ── Owner day editor ──
const FIELDS = [
  { key: "z_cash", label: "Z report Cash" },
  { key: "z_eftpos", label: "Z report EFTPOS" },
  { key: "customers", label: "Customers", int: true },
  { key: "gst_sales", label: "GST Sales" },
  { key: "cash_takings", label: "Cash takings (banked)" },
  { key: "counted_cash", label: "Total counted" },
  { key: "till_coins_total", label: "Till coins" },
  { key: "bag_coins_total", label: "Bag coins" },
  { key: "notes_total", label: "Notes" },
];
const toIn = (v) => (v === null || v === undefined ? "" : String(v));
const toNum = (v, int) => (String(v).trim() === "" ? null : int ? Math.round(Number(v)) : round2(Number(v)));

// Day panel result strip: Cash / EFTPOS / Total boxes, green within the limit, red past it (lib/banking.js dayBalance).
// Not confirmed: whatever can be worked out + an amber label. Imported days: one grey line. Closed / missing: nothing.
function BalanceStrip({ bal, reason }) {
  if (bal.state === "none") return null;
  if (bal.state === "nocheck") return <p className="text-sm text-gray-500">Imported day — no Z report figures to check.</p>;
  const box = (title, ok, lines, diff) => (
    <div className={`rounded-lg border px-2.5 py-2 ${ok === null ? "bg-gray-50 border-gray-200" : ok ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
      <div className={`text-xs font-bold ${ok === null ? "text-gray-500" : ok ? "text-green-800" : "text-red-700"}`}>{title} {ok === null ? "" : ok ? "✓" : "✗"}</div>
      {lines.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-1 text-[11px] text-gray-600 tabular-nums"><span>{k}</span><span>{v === null ? "—" : $(v)}</span></div>
      ))}
      <div className={`mt-0.5 text-sm font-semibold tabular-nums ${ok === null ? "text-gray-400" : ok ? "text-green-800" : "text-red-700"}`}>{diff === null ? "—" : fmtOverUnder(diff)}</div>
    </div>
  );
  return (
    <div className="space-y-1.5">
      {bal.state === "unconfirmed" && <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">Not confirmed</span>}
      <div className="grid grid-cols-3 gap-2">
        {box("Cash", bal.cash.ok, [["Z report", bal.cash.z], ["Counted", bal.cash.counted]], bal.cash.diff)}
        {box("EFTPOS", bal.eftpos.ok, [["Z report", bal.eftpos.z], ["Entered", bal.eftpos.entered]], bal.eftpos.diff)}
        {box("Total", bal.total.ok, [], bal.total.diff)}
      </div>
      {reason && <p className="text-xs text-gray-600"><span className="font-semibold">Reason:</span> {reason}</p>}
    </div>
  );
}

// Also opened from the Banking tab's "Cash not yet banked" list (pages/banking.js)
export function DayEditor({ pharmacyId, manager, limit = 5, date, day, types, cols, staffName, onClose, onSaved }) {
  const editTypes = types.filter((t) => cols.some((c) => c.id === t.id) || Number(day?.tenders?.[t.id]));
  const [form, setForm] = useState(() => Object.fromEntries(FIELDS.map((fl) => [fl.key, toIn(day?.[fl.key])])));
  const [tenders, setTenders] = useState(() => Object.fromEntries(editTypes.map((t) => [t.id, toIn(day?.tenders?.[t.id] ?? "")])));
  const [reason, setReason] = useState(toIn(day?.variance_reason));
  const [editReason, setEditReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);
  const [deposit, setDeposit] = useState(null);
  // Days counted with the closing RECEIPT total (from 9 Nov 2026): Closing EFTPOS = receipt − previous Right till reading.
  // Earlier days have no receipt total and just show Closing EFTPOS as entered.
  const tClosing = types.find((t) => t.key === "eftpos_t3");
  const receiptMode = !!day && day.closing_receipt_total !== null && day.closing_receipt_total !== undefined && !!tClosing;
  const [receiptIn, setReceiptIn] = useState(toIn(day?.closing_receipt_total));
  const [prevRight, setPrevRight] = useState(undefined); // { date, amount } | null
  useEffect(() => {
    if (!receiptMode) return;
    previousRightTill(supabase, pharmacyId, date).then(setPrevRight).catch(() => setPrevRight(null));
  }, [receiptMode, pharmacyId, date]);
  const receiptCalc = receiptMode && prevRight && receiptIn !== "" ? closingFromReceipt(receiptIn, prevRight.amount) : null;
  const onReceipt = (v) => {
    setReceiptIn(v);
    if (prevRight && v !== "") setTenders((x) => ({ ...x, [tClosing.id]: String(closingFromReceipt(v, prevRight.amount)) }));
  };

  useEffect(() => {
    if (!day) return;
    supabase.from("daily_takings_edits").select("*").eq("pharmacy_id", pharmacyId).eq("daily_takings_id", day.id).order("edited_at", { ascending: false })
      .then(({ data }) => setHistory(data || []));
    if (day.bank_deposit_id) supabase.from("bank_deposits").select("deposit_date, amount").eq("id", day.bank_deposit_id).maybeSingle().then(({ data }) => setDeposit(data));
  }, [day, pharmacyId]);

  const hasFigures = day && dayFigures(day, types).hasFigures;
  // The balance check from what's in the boxes now (updates as figures are edited) — lib/banking.js dayBalance
  const liveBal = day ? dayBalance({
    ...day,
    z_cash: form.z_cash, z_eftpos: form.z_eftpos, counted_cash: form.counted_cash,
    tenders: { ...day.tenders, ...Object.fromEntries(Object.entries(tenders).map(([id, v]) => [id, Number(v) || 0])) },
  }, types, limit) : { state: "none" };

  const save = async () => {
    setError("");
    if (!editReason.trim()) { setError("Give a reason for the edit."); return; }
    const before = {};
    const after = {};
    const patch = {};
    for (const fl of FIELDS) {
      const was = day[fl.key] === null || day[fl.key] === undefined ? null : Number(day[fl.key]);
      const now = toNum(form[fl.key], fl.int);
      if (was !== now) { before[fl.key] = was; after[fl.key] = now; patch[fl.key] = now; }
    }
    const wasReason = day.variance_reason || null;
    const nowReason = reason.trim() || null;
    if (wasReason !== nowReason) { before.variance_reason = wasReason; after.variance_reason = nowReason; patch.variance_reason = nowReason; }
    if (receiptMode) {
      if (receiptCalc !== null && receiptCalc < 0) { setError(`Receipt total is less than the right till reading on ${dayLabel(prevRight.date)} — check the receipt.`); return; }
      const was = Number(day.closing_receipt_total);
      const now = toNum(receiptIn);
      if (was !== now) { before.closing_receipt_total = was; after.closing_receipt_total = now; patch.closing_receipt_total = now; }
    }
    const tenderChanges = [];
    for (const t of editTypes) {
      const was = Number(day.tenders?.[t.id] || 0);
      const now = round2(Number(tenders[t.id]) || 0);
      if (was !== now) { before[`tender_${t.key}`] = was; after[`tender_${t.key}`] = now; tenderChanges.push({ t, now }); }
    }
    if (!Object.keys(after).length) { setError("Nothing has changed."); return; }
    setSaving(true);
    try {
      for (const { t, now } of tenderChanges) {
        const { error: e } = await supabase.from("daily_takings_tenders").upsert([{ pharmacy_id: pharmacyId, daily_takings_id: day.id, payment_type_id: t.id, amount: now }], { onConflict: "daily_takings_id,payment_type_id" });
        if (e) throw e;
      }
      // Recalculate the variances from the new figures (only where the day has the figures for them)
      const merged = { ...day, ...patch };
      const newTenders = { ...day.tenders, ...Object.fromEntries(tenderChanges.map(({ t, now }) => [t.id, now])) };
      const tenderList = Object.entries(newTenders).map(([payment_type_id, amount]) => ({ payment_type_id, amount }));
      patch.cash_variance = merged.z_cash !== null && merged.counted_cash !== null && merged.z_cash !== undefined && merged.counted_cash !== undefined
        ? cashVariance(Number(merged.counted_cash) - Number(merged.float_amount ?? 0), Number(merged.z_cash)) : day.cash_variance;
      patch.eftpos_variance = merged.z_eftpos !== null && merged.z_eftpos !== undefined ? eftposVariance(tenderList, types, Number(merged.z_eftpos)) : day.eftpos_variance;
      patch.updated_at = new Date().toISOString();
      const { error: e1 } = await supabase.from("daily_takings").update(patch).eq("id", day.id).eq("pharmacy_id", pharmacyId);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("daily_takings_edits").insert([{
        pharmacy_id: pharmacyId, daily_takings_id: day.id, edited_by_staff_id: manager.id, before, after, reason: editReason.trim(),
      }]);
      if (e2) throw e2;
      onSaved();
      onClose();
    } catch (err) {
      setError("Couldn't save: " + (err?.message || String(err)));
    } finally {
      setSaving(false);
    }
  };

  // Mark closed / missing (creates the day if needed) and Reopen — logged in the edit history
  const setStatus = async (status) => {
    setError("");
    setSaving(true);
    try {
      let row = day;
      if (!row) {
        const { data, error: e } = await supabase.from("daily_takings").insert([{ pharmacy_id: pharmacyId, takings_date: date, status, source: "app" }]).select("*").single();
        if (e) throw e;
        row = data;
      } else {
        const { error: e } = await supabase.from("daily_takings").update({ status, updated_at: new Date().toISOString() }).eq("id", row.id).eq("pharmacy_id", pharmacyId);
        if (e) throw e;
      }
      await supabase.from("daily_takings_edits").insert([{
        pharmacy_id: pharmacyId, daily_takings_id: row.id, edited_by_staff_id: manager.id,
        before: { status: day?.status || null }, after: { status }, reason: status === "open" ? "Reopened" : `Marked ${status}`,
      }]);
      onSaved();
      onClose();
    } catch (err) {
      setError("Couldn't change it: " + (err?.message || String(err)));
    } finally {
      setSaving(false);
    }
  };

  const input = "w-full h-10 rounded-lg border border-gray-300 px-3 text-base tabular-nums text-right";
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-lg h-full bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <div className="text-base font-bold text-gray-900">{dayLabel(date)} {date.slice(0, 4)}</div>
            <div className="text-xs text-gray-500">
              {!day ? "No count" : `${STATUS[day.status]?.label || "Confirmed"}${day.source === "import" ? " · imported" : ""}`}
              {day?.confirmed_by_1 ? ` · confirmed by ${staffName(day.confirmed_by_1)} & ${staffName(day.confirmed_by_2)}` : ""}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 text-xl">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <BalanceStrip bal={liveBal} reason={reason.trim()} />
          {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}
          {deposit && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
              This day is in the deposit of {dayLabel(String(deposit.deposit_date))}; the deposit amount won't change.
            </div>
          )}

          {(!day || !hasFigures || ["closed", "missing"].includes(day?.status)) && (
            <div className="flex flex-wrap gap-2">
              {(!day || day.status === "open") && !hasFigures && (
                <>
                  <button onClick={() => setStatus("closed")} disabled={saving} className="h-10 px-3 rounded-lg border border-gray-300 text-sm">Mark closed</button>
                  <button onClick={() => setStatus("missing")} disabled={saving} className="h-10 px-3 rounded-lg border border-gray-300 text-sm">Mark missing</button>
                </>
              )}
              {day && ["closed", "missing"].includes(day.status) && (
                <button onClick={() => setStatus("open")} disabled={saving} className="h-10 px-3 rounded-lg border border-blue-300 text-blue-700 text-sm">Reopen</button>
              )}
            </div>
          )}

          {day && (
            <>
              <div className="grid grid-cols-2 gap-3">
                {FIELDS.map((fl) => (
                  <label key={fl.key} className="block">
                    <span className="block text-xs font-semibold text-gray-600 mb-0.5">{fl.label}</span>
                    <input inputMode="decimal" value={form[fl.key]} onChange={(e) => setForm((x) => ({ ...x, [fl.key]: e.target.value.replace(/[^\d.\-]/g, "") }))} className={input} />
                  </label>
                ))}
                {editTypes.map((t) => {
                  const calc = receiptMode && t.id === tClosing.id;
                  return (
                    <label key={t.id} className="block">
                      <span className="block text-xs font-semibold text-gray-600 mb-0.5">{t.name}{calc ? " (calculated)" : ""}</span>
                      <input inputMode="decimal" value={tenders[t.id] ?? ""} readOnly={calc}
                        onChange={(e) => setTenders((x) => ({ ...x, [t.id]: e.target.value.replace(/[^\d.\-]/g, "") }))} className={`${input} ${calc ? "bg-gray-50 text-gray-600" : ""}`} />
                    </label>
                  );
                })}
              </div>
              {receiptMode && (
                <div className="rounded-lg bg-[#F8FAFC] border border-[#E7EAF0] px-3 py-2 space-y-1">
                  <label className="block max-w-[14rem]">
                    <span className="block text-xs font-semibold text-gray-600 mb-0.5">Closing receipt total (right till)</span>
                    <input inputMode="decimal" value={receiptIn} onChange={(e) => onReceipt(e.target.value.replace(/[^\d.]/g, ""))} className={input} />
                  </label>
                  <p className={`text-xs ${receiptCalc !== null && receiptCalc < 0 ? "text-red-700 font-semibold" : "text-gray-600"}`}>
                    {prevRight === undefined ? "Looking up the right till reading…"
                      : !prevRight ? "No earlier right till reading found — Closing EFTPOS can't be recalculated."
                      : receiptCalc === null ? `Right till reading on ${dayLabel(prevRight.date)}: ${$(prevRight.amount)}`
                      : receiptCalc < 0 ? `Receipt total is less than the right till reading on ${dayLabel(prevRight.date)} — check the receipt`
                      : `Receipt total ${$(Number(receiptIn))} − right till reading on ${dayLabel(prevRight.date)} ${$(prevRight.amount)} = Closing EFTPOS ${$(receiptCalc)}`}
                  </p>
                </div>
              )}
              <label className="block">
                <span className="block text-xs font-semibold text-gray-600 mb-0.5">Reason for the difference</span>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-gray-800 mb-0.5">Edit reason *</span>
                <input value={editReason} onChange={(e) => setEditReason(e.target.value)} maxLength={300} placeholder="e.g. Z report re-read" className="w-full h-10 rounded-lg border border-gray-300 px-3 text-sm" />
              </label>
              <button onClick={save} disabled={saving} className="w-full h-11 rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-50">{saving ? "Saving…" : "Save changes"}</button>

              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Edit history</div>
                {history.length === 0 ? <p className="text-xs text-gray-400">No edits.</p> : (
                  <div className="space-y-2">
                    {history.map((h) => (
                      <div key={h.id} className="rounded-lg bg-[#F8FAFC] px-3 py-2 text-xs">
                        <div className="font-semibold text-gray-700">{new Date(h.edited_at).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })} · {staffName(h.edited_by_staff_id)}</div>
                        <div className="text-gray-600">{h.reason}</div>
                        <div className="text-gray-500">
                          {Object.keys(h.after || {}).map((k) => `${k.replace(/^tender_/, "").replace(/_/g, " ")}: ${h.before?.[k] ?? "—"} → ${h.after[k] ?? "—"}`).join(" · ")}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
