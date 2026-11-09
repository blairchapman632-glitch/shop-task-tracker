// Banking (Daily Banking, Stage 3) — owner only, behind the admin PIN (the same gate as /qspp manager mode: a staff PIN
// with can_access_admin, held in memory, locks after 10 minutes idle). Staff never see takings figures.
// Banking tab: cash takings from each confirmed day wait here until they're banked (normally Mondays; a skipped week just
// adds on). Record a deposit = a bank_deposits row + bank_deposit_id on the ticked days (one update; the deposit is
// removed again if that fails). History newest first, 10 at a time; Undo puts the days back.
// Month tab (Stage 4): spreadsheet-style month, owner day editor, Excel export for Arthur — components/banking/MonthTab.js.
// Insights tab (Stage 6) — components/banking/InsightsTab.js. Missed-count banner (Stage 7) — lib/bankingData.js.
// Tables: daily_takings, bank_deposits. Money via lib/banking.js; Perth dates as strings.
import { useEffect, useRef, useState } from "react";
import HomeButton from "../components/HomeButton";
import supabase from "../lib/supabaseClient";
import ManagerPinModal from "../components/qspp/ManagerPinModal";
import { todayPerth } from "../lib/performanceReview";
import { round2, DENOMINATIONS } from "../lib/banking";
import { missedCounts, dayLabel as dayLabelShort, bankingStartDate, unbankedQuery, loadPeriod, loadPaymentTypes, columnTypes } from "../lib/bankingData";
import MonthTab, { DayEditor } from "../components/banking/MonthTab";
import InsightsTab from "../components/banking/InsightsTab";

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";
const IDLE_LOCK_MS = 10 * 60 * 1000;
const PAGE = 10;
const HISTORY_FIRST = 3; // deposit history starts with the last 3; "Show more" adds PAGE at a time
const CNT_NOTES = DENOMINATIONS.filter((d) => d.kind === "note");
const CNT_COINS = DENOMINATIONS.filter((d) => d.kind === "coin");
const TABS = [{ key: "banking", label: "Banking" }, { key: "month", label: "Month" }, { key: "insights", label: "Insights" }];

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const parts = (s) => String(s).slice(0, 10).split("-").map(Number);
const wdOf = (s) => { const [y, m, d] = parts(s); return WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]; };
// "Mon 9 Nov"
const dayLabel = (s) => { const [, m, d] = parts(s); return `${wdOf(s)} ${d} ${MON[m - 1]}`; };
// "Mon 2 – Sun 8 Nov" / "Mon 30 Nov – Sun 6 Dec"
const rangeLabel = (a, b) => {
  if (a === b) return dayLabel(a);
  const [ya, ma, da] = parts(a);
  const [yb, mb] = parts(b);
  return ya === yb && ma === mb ? `${wdOf(a)} ${da} – ${dayLabel(b)}` : `${dayLabel(a)} – ${dayLabel(b)}`;
};
const money = (n) => `$${round2(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const moneyInput = (v) => v.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
const diffText = (d) => `${money(Math.abs(d))} ${d > 0 ? "more" : "less"} than the days`;

export default function BankingPage() {
  const [manager, setManager] = useState(null); // { id, name } once the admin PIN is entered
  const [tab, setTab] = useState("banking");
  const lastActivity = useRef(Date.now());
  const [limit, setLimit] = useState(5);
  const [missed, setMissed] = useState([]); // trading days in the last 7 with no confirmed count

  useEffect(() => {
    if (!manager) return;
    supabase.from("pharmacy_settings").select("banking_variance_limit").eq("pharmacy_id", PHARMACY_ID).maybeSingle()
      .then(({ data }) => setLimit(data?.banking_variance_limit != null ? Number(data.banking_variance_limit) : 5));
    missedCounts(supabase, PHARMACY_ID).then(setMissed).catch(() => setMissed([]));
  }, [manager]);

  // Lock after 10 minutes with no taps / keys / scrolling (as /qspp manager mode)
  useEffect(() => {
    if (!manager) return;
    lastActivity.current = Date.now();
    const bump = () => { lastActivity.current = Date.now(); };
    const events = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true, capture: true }));
    const timer = setInterval(() => { if (Date.now() - lastActivity.current > IDLE_LOCK_MS) setManager(null); }, 15000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump, { capture: true }));
      clearInterval(timer);
    };
  }, [manager]);

  return (
    <div className="min-h-screen bg-[#EEF1F5]">
      <div className="max-w-6xl mx-auto px-4 py-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-gray-900">Banking</h1>
          <div className="flex items-center gap-2">
            {manager && (
              <button onClick={() => setManager(null)} className="text-xs px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-600">
                🔒 Lock ({manager.name.split(" ")[0]})
              </button>
            )}
            <HomeButton />
          </div>
        </div>
        {!manager ? (
          <div className="bg-white rounded-2xl border border-[#E7EAF0] p-6 text-center text-sm text-gray-500">
            Owner only — enter the admin PIN to continue.
            <ManagerPinModal onUnlock={setManager} onClose={() => { window.location.href = "/"; }} />
          </div>
        ) : (
          <>
            {TABS.length > 1 && (
              <div className="flex gap-4 border-b">
                {TABS.map((t) => (
                  <button key={t.key} onClick={() => setTab(t.key)}
                    className={`min-h-[44px] -mb-px text-sm border-b-2 ${tab === t.key ? "border-blue-700 text-blue-700 font-semibold" : "border-transparent text-gray-500"}`}>
                    {t.label}
                  </button>
                ))}
              </div>
            )}
            {missed.length > 0 && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-800">
                ⚠ No confirmed till count for: {missed.map((d) => dayLabelShort(d)).join(", ")}
              </div>
            )}
            {tab === "banking" && <BankingTab manager={manager} />}
            {tab === "month" && <MonthTab pharmacyId={PHARMACY_ID} manager={manager} limit={limit} />}
            {tab === "insights" && <InsightsTab pharmacyId={PHARMACY_ID} limit={limit} />}
          </>
        )}
      </div>
    </div>
  );
}

function BankingTab({ manager }) {
  const today = todayPerth();
  const [staffNames, setStaffNames] = useState({});
  const [waiting, setWaiting] = useState(null);   // confirmed, not banked, cash takings > 0 (oldest first)
  const [openDays, setOpenDays] = useState([]);   // unconfirmed days in the same range
  const [ticked, setTicked] = useState(new Set());
  const [depDate, setDepDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deposits, setDeposits] = useState([]);
  const [depDays, setDepDays] = useState({});     // deposit id -> [days]
  const [shown, setShown] = useState(HISTORY_FIRST);
  const [cnt, setCnt] = useState({});             // cash counter: denomination value (string) -> quantity typed
  const [showCoins, setShowCoins] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [undoAsk, setUndoAsk] = useState(null);   // deposit id waiting for the in-page "Yes, undo"
  const [editing, setEditing] = useState(null);   // { date, day, types, cols } — the Month tab's day editor

  // "Edit" on a waiting day: the same owner editor as the Month tab (edit reason required, logged)
  const openEditor = async (date) => {
    setError("");
    try {
      const [types, { days }] = await Promise.all([loadPaymentTypes(supabase, PHARMACY_ID), loadPeriod(supabase, PHARMACY_ID, date, date, { deposits: false })]);
      setEditing({ date, day: days[0] || null, types, cols: columnTypes(types, days) });
    } catch (e) {
      setError("Couldn't open that day: " + (e?.message || String(e)));
    }
  };

  const loadWaiting = async () => {
    const start = await bankingStartDate(supabase, PHARMACY_ID);
    const { data, error: e } = await unbankedQuery(supabase, PHARMACY_ID, "id, takings_date, cash_takings, confirmed_by_1, confirmed_by_2, source", start)
      .order("takings_date").limit(1000);
    if (e) { setError(e.message); return; }
    const rows = data || [];
    setWaiting(rows);
    setTicked(new Set(rows.map((r) => r.id)));
    setAmountTouched(false);
    // Unconfirmed days from the first waiting day up to today — named, not included
    if (rows.length) {
      const { data: open } = await supabase.from("daily_takings").select("takings_date")
        .eq("pharmacy_id", PHARMACY_ID).eq("status", "open")
        .gte("takings_date", String(rows[0].takings_date).slice(0, 10)).lte("takings_date", today).order("takings_date");
      setOpenDays((open || []).map((o) => String(o.takings_date).slice(0, 10)));
    } else setOpenDays([]);
  };

  const loadDeposits = async (n = shown) => {
    const { data, error: e } = await supabase.from("bank_deposits").select("*").eq("pharmacy_id", PHARMACY_ID)
      .order("deposit_date", { ascending: false }).order("created_at", { ascending: false }).range(0, n); // one extra = "Show more"
    if (e) { setError(e.message); return; }
    const list = data || [];
    setHasMore(list.length > n);
    const page = list.slice(0, n);
    setDeposits(page);
    const ids = page.map((d) => d.id);
    if (!ids.length) { setDepDays({}); return; }
    const { data: days } = await supabase.from("daily_takings").select("id, takings_date, cash_takings, bank_deposit_id")
      .eq("pharmacy_id", PHARMACY_ID).in("bank_deposit_id", ids).order("takings_date");
    const by = {};
    for (const d of days || []) (by[d.bank_deposit_id] = by[d.bank_deposit_id] || []).push(d);
    setDepDays(by);
  };

  useEffect(() => {
    supabase.from("staff").select("id, name").eq("pharmacy_id", PHARMACY_ID)
      .then(({ data }) => setStaffNames(Object.fromEntries((data || []).map((s) => [s.id, s.name]))));
    loadWaiting();
    loadDeposits(HISTORY_FIRST);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const first = (id) => String(staffNames[id] || "").split(" ")[0];
  const tickedRows = (waiting || []).filter((r) => ticked.has(r.id));
  const tickedTotal = round2(tickedRows.reduce((s, r) => s + Number(r.cash_takings || 0), 0));
  const waitingTotal = round2((waiting || []).reduce((s, r) => s + Number(r.cash_takings || 0), 0));
  // The amount follows the ticked days until it's typed over
  const amountNum = amountTouched ? round2(Number(amount) || 0) : tickedTotal;
  const diff = round2(amountNum - tickedTotal);

  const toggle = (id) => setTicked((t) => { const n = new Set(t); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // Cash counter (Count the cash): notes, plus coins for the odd time they're banked
  const qty = (d) => Math.max(0, Math.floor(Number(cnt[String(d.value)]) || 0));
  const countedTotal = round2(DENOMINATIONS.reduce((s, d) => s + qty(d) * d.value, 0));
  const countDiff = round2(countedTotal - tickedTotal);
  const coinsOn = showCoins || CNT_COINS.some((d) => qty(d) > 0);
  // Saved with the deposit: {"100": 2, "50": 10, …} — only denominations with a count; null if nothing was counted
  const countsJson = () => {
    const out = Object.fromEntries(DENOMINATIONS.filter((d) => qty(d) > 0).map((d) => [String(d.value), qty(d)]));
    return Object.keys(out).length ? out : null;
  };
  const useCounted = () => { setAmountTouched(true); setAmount(countedTotal.toFixed(2)); };

  const record = async () => {
    setError("");
    setNotice("");
    if (!tickedRows.length) { setError("Tick at least one day."); return; }
    if (!(amountNum > 0)) { setError("Enter the amount banked."); return; }
    if (diff !== 0 && !note.trim()) { setError(`The amount is ${diffText(diff)} ticked — add a note saying why.`); return; }
    if (!depDate) { setError("Pick the deposit date."); return; }
    setSaving(true);
    let depId = null;
    try {
      const { data: dep, error: e1 } = await supabase.from("bank_deposits").insert([{
        pharmacy_id: PHARMACY_ID, deposit_date: depDate, amount: amountNum, note: note.trim() || null, created_by_staff_id: manager.id,
        cash_counts: countsJson(),
      }]).select("id").single();
      if (e1) throw e1;
      depId = dep.id;
      const ids = tickedRows.map((r) => r.id);
      // One update for all the days — and only days still not banked
      const { data: done, error: e2 } = await supabase.from("daily_takings").update({ bank_deposit_id: depId })
        .eq("pharmacy_id", PHARMACY_ID).in("id", ids).is("bank_deposit_id", null).select("id");
      if (e2 || (done || []).length !== ids.length) {
        // Undo whatever happened, so nothing is left half-done
        await supabase.from("daily_takings").update({ bank_deposit_id: null }).eq("pharmacy_id", PHARMACY_ID).eq("bank_deposit_id", depId);
        await supabase.from("bank_deposits").delete().eq("id", depId).eq("pharmacy_id", PHARMACY_ID);
        throw e2 || new Error("Some of those days were changed on another screen — nothing was recorded. Try again.");
      }
      setNotice(`Deposit of ${money(amountNum)} recorded (${ids.length} day${ids.length === 1 ? "" : "s"}).`);
      setNote("");
      setDepDate(today);
      setAmount("");
      setCnt({});
      setShowCoins(false);
      await Promise.all([loadWaiting(), loadDeposits(shown)]);
    } catch (err) {
      setError("Couldn't record the deposit: " + (err?.message || String(err)));
    } finally {
      setSaving(false);
    }
  };

  const undo = async (dep) => {
    setError("");
    setNotice("");
    const { error: e1 } = await supabase.from("daily_takings").update({ bank_deposit_id: null })
      .eq("pharmacy_id", PHARMACY_ID).eq("bank_deposit_id", dep.id);
    if (e1) { setError("Couldn't undo: " + e1.message); return; }
    const { error: e2 } = await supabase.from("bank_deposits").delete().eq("id", dep.id).eq("pharmacy_id", PHARMACY_ID);
    if (e2) { setError("Couldn't undo: " + e2.message); return; }
    setUndoAsk(null);
    setNotice(`Deposit of ${money(dep.amount)} undone — its days are back in "not yet banked".`);
    await Promise.all([loadWaiting(), loadDeposits(shown)]);
  };

  const card = "bg-white rounded-2xl border border-[#E7EAF0] shadow-sm";
  let running = 0;

  // Count the cash: Enter moves down the boxes (Tab already does — it's a single column)
  const onCountKey = (e) => {
    if (e.key !== "Enter" || !e.target?.dataset?.cnt) return;
    e.preventDefault();
    const boxes = [...e.currentTarget.querySelectorAll("input[data-cnt]")];
    const next = boxes[boxes.indexOf(e.target) + 1];
    if (next) { next.focus(); next.select(); }
  };
  const cntRow = (d) => {
    const k = String(d.value);
    const sub = round2(qty(d) * d.value);
    return (
      <div key={k} className="flex items-center gap-2 py-0.5">
        <span className="w-10 text-sm font-semibold text-gray-700">{d.label}</span>
        <input data-cnt={k} inputMode="numeric" value={cnt[k] ?? ""} placeholder="0" aria-label={`Number of ${d.label}${d.kind === "note" ? " notes" : " coins"}`}
          onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 5); setCnt((c) => ({ ...c, [k]: v })); }}
          className="w-[5.5rem] h-9 rounded-lg border border-gray-300 px-2 text-base tabular-nums text-right focus:outline-none focus:ring-2 focus:ring-blue-400" />
        <span className="text-xs tabular-nums text-gray-500 whitespace-nowrap">{sub ? `= ${money(sub)}` : ""}</span>
      </div>
    );
  };
  // A saved deposit's counts, as "$100 × 2 = $200.00" lines
  const countLines = (counts) => DENOMINATIONS.filter((d) => Number(counts?.[String(d.value)]) > 0)
    .map((d) => ({ d, n: Number(counts[String(d.value)]), sub: round2(Number(counts[String(d.value)]) * d.value) }));

  return (
    <div className="space-y-4">
      {editing && (
        <DayEditor
          pharmacyId={PHARMACY_ID} manager={manager} date={editing.date} day={editing.day} types={editing.types} cols={editing.cols}
          staffName={(id) => staffNames[id] || "—"}
          onClose={() => setEditing(null)} onSaved={() => { loadWaiting(); }}
        />
      )}
      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-2 text-sm text-green-800">{notice}</div>}

      {/* Wide screens: list + deposit form + history on the left, the cash counter on the right (sticky).
          Narrow: list, counter, deposit form, history (DOM order). */}
      <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-x-5 lg:gap-y-4 lg:items-start">

        {/* 1. Cash not yet banked */}
        <section className={`${card} lg:col-start-1 lg:row-start-1`}>
          <div className="px-4 sm:px-5 pt-3 pb-2 border-b border-[#F0F2F5] flex items-baseline justify-between gap-3">
            <div className="text-sm font-semibold text-gray-700">Cash not yet banked</div>
            <div className="text-2xl font-bold tabular-nums text-gray-900">{waiting === null ? "…" : money(waitingTotal)}</div>
          </div>
          <div className="px-4 sm:px-5 py-2 space-y-1.5">
            {openDays.map((d) => (
              <div key={d} className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1">⚠ {dayLabel(d)} count isn't confirmed — not included</div>
            ))}
            {waiting === null ? <p className="text-sm text-gray-400">Loading…</p>
              : waiting.length === 0 ? <p className="text-sm text-green-700 font-medium py-2">All cash is banked.</p>
              : (
                <div className="divide-y divide-[#F0F2F5]">
                  {waiting.map((r) => {
                    running = round2(running + Number(r.cash_takings || 0));
                    const on = ticked.has(r.id);
                    return (
                      <label key={r.id} className="flex items-center gap-3 py-1.5 cursor-pointer">
                        <input type="checkbox" checked={on} onChange={() => toggle(r.id)} className="h-4 w-4 shrink-0" />
                        <div className="flex-1 min-w-0 flex items-baseline gap-2">
                          <span className={`text-sm font-semibold whitespace-nowrap ${on ? "text-gray-900" : "text-gray-400"}`}>{dayLabel(r.takings_date)}</span>
                          <span className="text-xs text-gray-400 truncate">{r.source === "import" ? "From the spreadsheet" : [first(r.confirmed_by_1), first(r.confirmed_by_2)].filter(Boolean).join(" & ") || "—"}</span>
                          <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); openEditor(String(r.takings_date).slice(0, 10)); }}
                            className="text-xs text-blue-600 hover:underline shrink-0">Edit</button>
                        </div>
                        <span className={`text-sm font-semibold tabular-nums ${on ? "text-gray-900" : "text-gray-400 line-through"}`}>{money(r.cash_takings)}</span>
                        <span className="w-24 text-right text-[11px] text-gray-400 tabular-nums hidden sm:inline">running {money(running)}</span>
                      </label>
                    );
                  })}
                </div>
              )}
          </div>
        </section>

        {/* 2. Count the cash (right column, sticky on wide screens) */}
        <aside className="lg:col-start-2 lg:row-start-1 lg:row-span-3 lg:sticky lg:top-4">
          <section className={`${card} px-4 py-3`} onKeyDown={onCountKey}>
            <div className="flex items-baseline justify-between mb-1">
              <h2 className="text-base font-bold text-gray-900">Count the cash</h2>
              {countedTotal > 0 && <button type="button" onClick={() => { setCnt({}); setShowCoins(false); }} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>}
            </div>
            {CNT_NOTES.map(cntRow)}
            {coinsOn ? (
              <div className="mt-1 pt-1 border-t border-[#F0F2F5]">{CNT_COINS.map(cntRow)}</div>
            ) : (
              <button type="button" onClick={() => setShowCoins(true)} className="mt-1 text-xs text-blue-600 hover:underline">+ Coins</button>
            )}
            <div className="mt-2 pt-2 border-t border-[#E7EAF0]">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold text-gray-700">Counted</span>
                <span className="text-xl font-bold tabular-nums text-gray-900">{money(countedTotal)}</span>
              </div>
              {countedTotal > 0 && (
                <div className={`text-sm font-semibold text-right ${countDiff === 0 ? "text-green-700" : "text-red-600"}`}>
                  {countDiff === 0 ? "Matches ✓" : `${money(Math.abs(countDiff))} ${countDiff > 0 ? "over" : "short"}`}
                  <span className="font-normal text-xs text-gray-400"> vs ticked {money(tickedTotal)}</span>
                </div>
              )}
              <button type="button" onClick={useCounted} disabled={!(countedTotal > 0) || !(waiting && waiting.length)}
                className="mt-2 w-full h-9 rounded-lg border border-blue-300 text-blue-700 text-sm font-semibold hover:bg-blue-50 disabled:opacity-40 disabled:hover:bg-transparent">
                Use this amount
              </button>
            </div>
          </section>
        </aside>

        {/* 3. Record a deposit */}
        {waiting && waiting.length > 0 && (
          <section className={`${card} px-4 sm:px-5 py-3 space-y-2.5 lg:col-start-1 lg:row-start-2`}>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-base font-bold text-gray-900">Record a deposit</h2>
              <div className="text-sm text-gray-600">{tickedRows.length} day{tickedRows.length === 1 ? "" : "s"} ticked · {money(tickedTotal)}</div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[10rem_10rem_minmax(0,1fr)] gap-3 items-start">
              <label className="block">
                <span className="block text-xs font-semibold text-gray-700 mb-1">Deposit date</span>
                <input type="date" value={depDate} onChange={(e) => setDepDate(e.target.value)} className="w-full h-10 rounded-lg border border-gray-300 px-2 text-sm" />
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-gray-700 mb-1">Amount</span>
                <input inputMode="decimal" value={amountTouched ? amount : tickedTotal.toFixed(2)}
                  onChange={(e) => { setAmountTouched(true); setAmount(moneyInput(e.target.value)); }}
                  className="w-full h-10 rounded-lg border border-gray-300 px-2 text-base tabular-nums text-right" />
                {amountTouched && (
                  <button type="button" onClick={() => { setAmountTouched(false); setAmount(""); }} className="mt-0.5 text-xs text-blue-600">Use the ticked total</button>
                )}
              </label>
              <label className="block">
                <span className="block text-xs font-semibold text-gray-700 mb-1">Note {diff !== 0 ? <span className="text-red-600">*</span> : <span className="font-normal text-gray-400">(optional)</span>}</span>
                <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="e.g. banked early" className="w-full h-10 rounded-lg border border-gray-300 px-2 text-sm" />
              </label>
            </div>
            {diff !== 0 && tickedRows.length > 0 && (
              <div className="text-sm font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1">
                {diffText(diff)} ticked — a note is needed.
              </div>
            )}
            <button onClick={record} disabled={saving || !tickedRows.length} className="w-full h-11 rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-50">
              {saving ? "Recording…" : `Record deposit · ${money(amountNum)}`}
            </button>
          </section>
        )}

        {/* 4. Deposit history (last 3, then "Show more") */}
        <section className={`${card} lg:col-start-1 lg:row-start-3`}>
          <div className="px-4 sm:px-5 py-2.5 border-b border-[#F0F2F5] text-sm font-bold text-gray-900">Deposits</div>
          {deposits.length === 0 ? <p className="px-4 sm:px-5 py-3 text-sm text-gray-400">No deposits yet.</p> : (
            <div className="divide-y divide-[#F0F2F5]">
              {deposits.map((dep) => {
                const days = depDays[dep.id] || [];
                const daysTotal = round2(days.reduce((s, d) => s + Number(d.cash_takings || 0), 0));
                const dd = round2(Number(dep.amount) - daysTotal);
                const open = expanded === dep.id;
                const lines = countLines(dep.cash_counts);
                return (
                  <div key={dep.id} className="px-4 sm:px-5 py-2.5">
                    <button onClick={() => setExpanded(open ? null : dep.id)} className="w-full flex items-start justify-between gap-3 text-left">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-gray-900">{dayLabel(dep.deposit_date)}</div>
                        <div className="text-xs text-gray-500">
                          {days.length ? `${rangeLabel(String(days[0].takings_date).slice(0, 10), String(days[days.length - 1].takings_date).slice(0, 10))}, ${days.length} day${days.length === 1 ? "" : "s"}` : "No days"}
                          {dep.note ? ` · ${dep.note}` : ""}
                        </div>
                        {dd !== 0 && <div className="text-xs font-medium text-amber-700">{diffText(dd)} ({money(daysTotal)})</div>}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-base font-bold tabular-nums text-gray-900">{money(dep.amount)}</div>
                        <div className="text-[11px] text-blue-600">{open ? "Hide ▴" : "Show ▾"}</div>
                      </div>
                    </button>
                    {open && (
                      <div className="mt-2 rounded-lg bg-[#F8FAFC] px-3 py-2 space-y-1">
                        {days.map((d) => (
                          <div key={d.id} className="flex justify-between text-sm"><span className="text-gray-700">{dayLabel(d.takings_date)}</span><span className="tabular-nums">{money(d.cash_takings)}</span></div>
                        ))}
                        {lines.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-[#E7EAF0]">
                            <div className="text-xs font-semibold text-gray-500 mb-0.5">Cash counted</div>
                            {lines.map(({ d, n, sub }) => (
                              <div key={d.value} className="flex justify-between text-xs text-gray-600 tabular-nums"><span>{d.label} × {n}</span><span>{money(sub)}</span></div>
                            ))}
                            <div className="flex justify-between text-xs font-semibold text-gray-800 tabular-nums"><span>Total counted</span><span>{money(lines.reduce((s, l) => s + l.sub, 0))}</span></div>
                          </div>
                        )}
                        {undoAsk === dep.id ? (
                          <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 space-y-2">
                            <div>Undo this deposit? Its {days.length} day{days.length === 1 ? "" : "s"} go back to "not yet banked".</div>
                            <div className="flex gap-2">
                              <button onClick={() => undo(dep)} className="h-9 px-3 rounded-lg bg-red-600 text-white text-sm font-semibold">Yes, undo</button>
                              <button onClick={() => setUndoAsk(null)} className="h-9 px-3 rounded-lg border border-gray-300 bg-white text-sm">Keep it</button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => setUndoAsk(dep.id)} className="mt-1 text-xs text-red-600 hover:underline">Undo deposit</button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {hasMore && (
            <div className="px-4 sm:px-5 py-2.5 border-t border-[#F0F2F5]">
              <button onClick={() => { const n = shown + PAGE; setShown(n); loadDeposits(n); }} className="text-sm font-semibold text-blue-600">Show more</button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
