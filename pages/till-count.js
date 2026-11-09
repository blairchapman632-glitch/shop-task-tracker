// Kiosk → Till count (Daily Banking, Stage 2). Two staff count the till together at till close (~30–60 min before the
// shop closes): the coins in the till, the spare coins from the dispensary bag (each by coin or as one total), the
// notes, the Z report figures, the EFTPOS printouts (Closing EFTPOS = last night's final printout from the right till,
// kept in the till; Right till + Left till = tonight's readings), then both confirm with their name + PIN.
// Names and help under each EFTPOS field come from banking_payment_types (name, help_text — Admin → Settings).
// Closing EFTPOS blank/$0 after a trading day blocks Confirm until "No EFTPOS after the Z close last night" is ticked
// (daily_takings.no_closing_eftpos). Soft warnings (never block): Closing EFTPOS over 3× its 60-day average; Left till
// higher than Right till when Right is usually higher (80%+ of the last 60 counted days).
// Staff only ever see the day being entered — no history (that's the owner's, Stage 4). Once confirmed the day locks.
// Saves as they go (each field when it loses focus); the day stays 'open' until confirmed. The day's row is only
// created once something is entered, so just opening the page doesn't leave an unfinished day behind.
// Float: coins all stay in the till; notes are added to make up the float, rounded to the nearest $5 (floatSplit); every other
// note is the cash takings — the app does all the rounding, no note-by-note breakdown.
// Tables: daily_takings (+ till_coins_total / bag_coins_total / notes_total — stored in both modes; the saved total is
// the source of truth), cash_counts (location 'till' = till coins + notes, 'bag' = dispensary-bag coins), daily_takings_tenders, banking_payment_types; settings banking_float_amount /
// banking_variance_limit. Money rules in lib/banking.js. Dates are Perth calendar dates as strings.
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import supabase from "../lib/supabaseClient";
import { todayPerth, addDaysStr } from "../lib/performanceReview";
import { longDate } from "../lib/calendar";
import { openOnWeekday, weekdayOf } from "../lib/bankingData";
import {
  DENOMINATIONS, round2, countTotal, floatSplit, cashVariance, eftposVariance, needsReason, fmtVariance,
} from "../lib/banking";

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";

const HISTORY_DAYS = 60; // counted days the soft EFTPOS warnings compare against
const HOURS_COLS = "hours_monday, hours_tuesday, hours_wednesday, hours_thursday, hours_friday, hours_saturday, hours_sunday";

const money = (n) => `$${round2(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (v) => (v === "" || v === null || v === undefined ? null : Number(v));
const toInput = (v) => (v === null || v === undefined ? "" : String(v));
const moneyInput = (v) => v.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");
const PIN_STYLE = { WebkitTextSecurity: "disc" };
const NOTES = DENOMINATIONS.filter((d) => d.kind === "note");
const COINS = DENOMINATIONS.filter((d) => d.kind === "coin");
// "Count by coin" / "Total only" for each coin section — remembered on this computer
const MODE_KEY = (loc) => `tillcount.coinMode.${loc}`;
const readMode = (loc) => { try { return localStorage.getItem(MODE_KEY(loc)) === "total" ? "total" : "coin"; } catch { return "coin"; } };
const writeMode = (loc, m) => { try { localStorage.setItem(MODE_KEY(loc), m); } catch { /* private window etc. */ } };
const rowsOf = (byDenom, list) => list.map((d) => ({ denomination: d.value, quantity: Number(byDenom?.[String(d.value)]) || 0 }));

export default function TillCountPage() {
  const today = todayPerth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [staff, setStaff] = useState([]);
  const [types, setTypes] = useState([]);
  const [settings, setSettings] = useState({ float: 300, limit: 5 });
  const [olderOpen, setOlderOpen] = useState(null); // an unfinished earlier day (last 7 days) to offer first
  const [date, setDate] = useState(null);           // the day being entered
  const [day, setDay] = useState(null);             // its daily_takings row (null until something is saved)

  // What's typed (strings, so a half-typed "12." isn't lost)
  const [counts, setCounts] = useState({ till: {}, bag: {} }); // location -> denomination -> quantity (notes are 'till')
  const [coinMode, setCoinMode] = useState({ till: "coin", bag: "coin" }); // "coin" | "total"
  const [coinTotalIn, setCoinTotalIn] = useState({ till: "", bag: "" });   // "Total only" amounts
  const [z, setZ] = useState({ z_cash: "", z_eftpos: "", customers: "", gst_sales: "" });
  const [tenders, setTenders] = useState({});       // payment_type_id -> amount
  const [reason, setReason] = useState("");
  const [people, setPeople] = useState([{ staffId: "", pin: "" }, { staffId: "", pin: "" }]);
  const [personErr, setPersonErr] = useState(["", ""]);
  const [confirming, setConfirming] = useState(false);
  const [saveState, setSaveState] = useState(""); // "", "Saving…", "Saved"
  const [noClosing, setNoClosing] = useState(false);   // "No EFTPOS after the Z close last night" ticked
  const [prevTrading, setPrevTrading] = useState(false); // the day before was a trading day (open, not a holiday / closed)
  const [hist, setHist] = useState([]);                // last 60 counted days: [{ [payment_type_id]: amount }]
  const settingsRow = useRef(null);                    // pharmacy_settings (opening hours) for openDay
  const dayRef = useRef(null);
  const creating = useRef(null);

  useEffect(() => { setCoinMode({ till: readMode("till"), bag: readMode("bag") }); }, []);

  // ── Load ──
  useEffect(() => {
    (async () => {
      try {
        const [st, ty, se, open] = await Promise.all([
          supabase.from("staff").select("id, name, role, active").eq("pharmacy_id", PHARMACY_ID).order("name"),
          supabase.from("banking_payment_types").select("*").eq("pharmacy_id", PHARMACY_ID).order("sort_order"),
          supabase.from("pharmacy_settings").select(`banking_float_amount, banking_variance_limit, ${HOURS_COLS}`).eq("pharmacy_id", PHARMACY_ID).maybeSingle(),
          supabase.from("daily_takings").select("takings_date").eq("pharmacy_id", PHARMACY_ID).eq("status", "open")
            .gte("takings_date", addDaysStr(today, -7)).lt("takings_date", today).order("takings_date"),
        ]);
        const err = st.error || ty.error || se.error || open.error;
        if (err) throw err;
        setStaff((st.data || []).filter((s) => s.active !== false && s.role !== "Locum"));
        setTypes(ty.data || []);
        settingsRow.current = se.data || null;
        setSettings({
          float: se.data?.banking_float_amount != null ? Number(se.data.banking_float_amount) : 300,
          limit: se.data?.banking_variance_limit != null ? Number(se.data.banking_variance_limit) : 5,
        });
        const older = open.data?.[0]?.takings_date ? String(open.data[0].takings_date).slice(0, 10) : null;
        setOlderOpen(older);
        if (!older) await openDay(today, se.data);
      } catch (e) {
        setError(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Open a day: load its row + what's been entered so far (nothing is created yet)
  const openDay = async (d) => {
    setDate(d);
    setOlderOpen(null);
    loadContext(d).catch(() => { setPrevTrading(false); setHist([]); }); // only warnings — never stops the count
    const { data: row, error: e1 } = await supabase.from("daily_takings").select("*").eq("pharmacy_id", PHARMACY_ID).eq("takings_date", d).maybeSingle();
    if (e1) { setError(e1.message); return; }
    setDay(row || null);
    dayRef.current = row || null;
    setNoClosing(!!row?.no_closing_eftpos);
    if (!row) return;
    const [cc, tt] = await Promise.all([
      supabase.from("cash_counts").select("location, denomination, quantity").eq("daily_takings_id", row.id),
      supabase.from("daily_takings_tenders").select("payment_type_id, amount").eq("daily_takings_id", row.id),
    ]);
    const byLoc = { till: {}, bag: {} };
    for (const r of cc.data || []) byLoc[r.location === "bag" ? "bag" : "till"][String(Number(r.denomination))] = r.quantity ? String(r.quantity) : "";
    setCounts(byLoc);
    // A coin section saved as a total that its coin rows don't add up to was counted "Total only" — show it that way
    const saved = { till: row.till_coins_total, bag: row.bag_coins_total };
    setCoinTotalIn({ till: toInput(saved.till), bag: toInput(saved.bag) });
    setCoinMode((m) => {
      const next = { ...m };
      for (const loc of ["till", "bag"]) {
        if (saved[loc] !== null && saved[loc] !== undefined && round2(saved[loc]) !== countTotal(rowsOf(byLoc[loc], COINS))) next[loc] = "total";
      }
      return next;
    });
    setTenders(Object.fromEntries((tt.data || []).map((r) => [r.payment_type_id, Number(r.amount) ? String(r.amount) : ""])));
    setZ({ z_cash: toInput(row.z_cash), z_eftpos: toInput(row.z_eftpos), customers: toInput(row.customers), gst_sales: toInput(row.gst_sales) });
    setReason(row.variance_reason || "");
  };

  // The day before (a trading day? — open per the pharmacy hours, not a public holiday, not marked closed) and the last
  // 60 counted days' EFTPOS amounts (any source), for the closing-EFTPOS tick and the soft warnings
  const loadContext = async (d) => {
    const prev = addDaysStr(d, -1);
    const [hol, prevRow, recent] = await Promise.all([
      supabase.from("public_holidays").select("date").eq("pharmacy_id", PHARMACY_ID).eq("date", prev).limit(1),
      supabase.from("daily_takings").select("status").eq("pharmacy_id", PHARMACY_ID).eq("takings_date", prev).maybeSingle(),
      supabase.from("daily_takings").select("id").eq("pharmacy_id", PHARMACY_ID).eq("status", "confirmed").lt("takings_date", d)
        .order("takings_date", { ascending: false }).limit(HISTORY_DAYS),
    ]);
    setPrevTrading(!(hol.data || []).length && prevRow.data?.status !== "closed" && openOnWeekday(settingsRow.current, weekdayOf(prev)));
    const ids = (recent.data || []).map((r) => r.id);
    if (!ids.length) { setHist([]); return; }
    const { data: tt } = await supabase.from("daily_takings_tenders").select("daily_takings_id, payment_type_id, amount").in("daily_takings_id", ids);
    const by = Object.fromEntries(ids.map((id) => [id, {}]));
    for (const t of tt || []) if (by[t.daily_takings_id]) by[t.daily_takings_id][t.payment_type_id] = Number(t.amount) || 0;
    setHist(Object.values(by));
  };

  // The day's row — created on first save (upsert on pharmacy + date; float copied from settings)
  const ensureDay = async () => {
    if (dayRef.current) return dayRef.current;
    if (creating.current) return creating.current;
    creating.current = (async () => {
      const { error: upErr } = await supabase.from("daily_takings").upsert([{
        pharmacy_id: PHARMACY_ID, takings_date: date, status: "open", source: "app", float_amount: settings.float,
      }], { onConflict: "pharmacy_id,takings_date", ignoreDuplicates: true });
      if (upErr) throw upErr;
      const { data, error: selErr } = await supabase.from("daily_takings").select("*").eq("pharmacy_id", PHARMACY_ID).eq("takings_date", date).single();
      if (selErr) throw selErr;
      dayRef.current = data;
      setDay(data);
      return data;
    })();
    try { return await creating.current; } finally { creating.current = null; }
  };

  // ── Live figures ──
  const eftposTypes = types.filter((t) => t.active !== false && t.kind === "eftpos");
  const otherTypes = types.filter((t) => t.active !== false && t.kind === "other");
  const shownTypes = [...otherTypes, ...eftposTypes];
  const tillCoins = coinMode.till === "total" ? round2(Number(coinTotalIn.till) || 0) : countTotal(rowsOf(counts.till, COINS));
  const bagCoins = coinMode.bag === "total" ? round2(Number(coinTotalIn.bag) || 0) : countTotal(rowsOf(counts.bag, COINS));
  const notesTotal = countTotal(rowsOf(counts.till, NOTES));
  const coinsTotal = round2(tillCoins + bagCoins);
  const counted = round2(coinsTotal + notesTotal);
  const floatAmt = day?.float_amount != null ? Number(day.float_amount) : settings.float;
  const split = floatSplit({ coinsTotal, notesTotal, float: floatAmt });
  const takings = split.takings; // every note not needed for the float — what staff take out
  const tenderList = shownTypes.map((t) => ({ payment_type_id: t.id, amount: Number(tenders[t.id]) || 0 }));
  const hasZCash = z.z_cash !== "";
  const hasZEftpos = z.z_eftpos !== "";
  const cashVar = hasZCash ? cashVariance(counted - floatAmt, Number(z.z_cash)) : null; // unrounded counted − float
  const eftVar = hasZEftpos ? eftposVariance(tenderList, types, Number(z.z_eftpos)) : null;
  const reasonNeeded = needsReason(cashVar || 0, eftVar || 0, settings.limit);

  // Closing EFTPOS (last night's final printout from the right till) and the two tonight readings, by key
  const tClosing = eftposTypes.find((t) => t.key === "eftpos_t3");
  const tRight = eftposTypes.find((t) => t.key === "eftpos_t1");
  const tLeft = eftposTypes.find((t) => t.key === "eftpos_t2");
  const amt = (t) => (t && tenders[t.id] !== undefined && tenders[t.id] !== "" ? Number(tenders[t.id]) : null);
  // Blank / $0 after a trading day: Confirm needs the "no closing printout" tick
  const needClosingTick = !!tClosing && prevTrading && !(amt(tClosing) > 0);
  // Soft warnings against the last 60 counted days (need at least 10 to say what's usual)
  const enoughHist = hist.length >= 10;
  const closingAvg = enoughHist && tClosing ? hist.reduce((s, h) => s + (h[tClosing.id] || 0), 0) / hist.length : 0;
  const closingHigh = closingAvg > 0 && amt(tClosing) > 3 * closingAvg;
  const rightUsuallyHigher = enoughHist && tRight && tLeft && hist.filter((h) => (h[tRight.id] || 0) > (h[tLeft.id] || 0)).length / hist.length >= 0.8;
  const leftHigher = rightUsuallyHigher && amt(tRight) !== null && amt(tLeft) !== null && amt(tLeft) > amt(tRight);
  const softWarn = {
    ...(tClosing && closingHigh ? { [tClosing.id]: "Closing EFTPOS is higher than usual — check it's last night's printout from the right till." } : {}),
    ...(tLeft && leftHigher ? { [tLeft.id]: "Left till is higher than right till — check they aren't swapped." } : {}),
  };

  // Figures stored on the day (saved with every change)
  const summaryPatch = () => ({
    z_cash: num(z.z_cash), z_eftpos: num(z.z_eftpos), customers: z.customers === "" ? null : Math.round(Number(z.customers)), gst_sales: num(z.gst_sales),
    counted_cash: counted, float_amount: floatAmt, cash_takings: takings,
    till_coins_total: tillCoins, bag_coins_total: bagCoins, notes_total: notesTotal,
    cash_variance: cashVar, eftpos_variance: eftVar, variance_reason: reason.trim() || null,
    no_closing_eftpos: needClosingTick && noClosing, updated_at: new Date().toISOString(),
  });

  const locked = day && day.status !== "open";
  const guard = async (fn) => {
    if (locked) return;
    setSaveState("Saving…");
    try { await fn(await ensureDay()); setSaveState("Saved"); setError(""); }
    catch (e) { setSaveState(""); setError("Couldn't save: " + (e?.message || String(e))); }
  };
  const saveSummary = (row) => supabase.from("daily_takings").update(summaryPatch()).eq("id", row.id).eq("status", "open")
    .then(({ error: e }) => { if (e) throw e; });

  const saveCount = (loc, denom) => guard(async (row) => {
    const { error: e } = await supabase.from("cash_counts").upsert([{
      pharmacy_id: PHARMACY_ID, daily_takings_id: row.id, location: loc, denomination: Number(denom), quantity: Math.max(0, Math.floor(Number(counts[loc]?.[denom]) || 0)),
    }], { onConflict: "daily_takings_id,location,denomination" });
    if (e) throw e;
    await saveSummary(row);
  });
  const saveTender = (typeId) => guard(async (row) => {
    const { error: e } = await supabase.from("daily_takings_tenders").upsert([{
      pharmacy_id: PHARMACY_ID, daily_takings_id: row.id, payment_type_id: typeId, amount: round2(Number(tenders[typeId]) || 0),
    }], { onConflict: "daily_takings_id,payment_type_id" });
    if (e) throw e;
    await saveSummary(row);
  });
  const saveFields = () => guard((row) => saveSummary(row));

  // ── Confirm: both people's PINs (the same check the kiosk uses), then save everything and lock ──
  const confirm = async () => {
    setError("");
    const errs = ["", ""];
    if (!hasZCash || !hasZEftpos) { setError("Enter the Z report Cash and EFTPOS first."); return; }
    if (counted <= 0) { setError("Count the cash first."); return; }
    if (reasonNeeded && !reason.trim()) { setError("Give a reason for the difference."); return; }
    if (needClosingTick && !noClosing) { setError("Enter the Closing EFTPOS, or tick “No EFTPOS after the Z close last night”."); return; }
    people.forEach((p, i) => {
      if (!p.staffId) errs[i] = "Pick your name.";
      else if (!/^\d{4}$/.test(p.pin)) errs[i] = "Enter your 4-digit PIN.";
    });
    if (!errs[1] && people[0].staffId && people[0].staffId === people[1].staffId) errs[1] = "The second person must be someone else.";
    if (errs[0] || errs[1]) { setPersonErr(errs); return; }
    setConfirming(true);
    try {
      for (let i = 0; i < 2; i++) {
        const { data } = await supabase.from("staff").select("id").eq("id", Number(people[i].staffId)).eq("pin", people[i].pin).maybeSingle();
        if (!data) errs[i] = "Incorrect PIN.";
      }
      if (errs[0] || errs[1]) {
        setPersonErr(errs);
        setPeople((ps) => ps.map((p, i) => (errs[i] ? { ...p, pin: "" } : p)));
        return;
      }
      setPersonErr(["", ""]);
      const row = await ensureDay();
      // Everything shown, saved in full (blank = 0)
      const countRows = (loc, list) => list.map((d) => ({
        pharmacy_id: PHARMACY_ID, daily_takings_id: row.id, location: loc, denomination: d.value,
        quantity: Math.max(0, Math.floor(Number(counts[loc]?.[String(d.value)]) || 0)),
      }));
      const cc = await supabase.from("cash_counts").upsert([
        ...countRows("till", NOTES),
        ...(coinMode.till === "coin" ? countRows("till", COINS) : []),
        ...(coinMode.bag === "coin" ? countRows("bag", COINS) : []),
      ], { onConflict: "daily_takings_id,location,denomination" });
      if (cc.error) throw cc.error;
      const tt = await supabase.from("daily_takings_tenders").upsert(shownTypes.map((t) => ({
        pharmacy_id: PHARMACY_ID, daily_takings_id: row.id, payment_type_id: t.id, amount: round2(Number(tenders[t.id]) || 0),
      })), { onConflict: "daily_takings_id,payment_type_id" });
      if (tt.error) throw tt.error;
      const { data: done, error: e } = await supabase.from("daily_takings").update({
        ...summaryPatch(), status: "confirmed",
        confirmed_by_1: Number(people[0].staffId), confirmed_by_2: Number(people[1].staffId), confirmed_at: new Date().toISOString(),
      }).eq("id", row.id).eq("status", "open").select("*");
      if (e) throw e;
      if (!done?.length) throw new Error("This day was already confirmed on another screen.");
      dayRef.current = done[0];
      setDay(done[0]);
      setPeople([{ staffId: "", pin: "" }, { staffId: "", pin: "" }]);
    } catch (err) {
      setError("Couldn't confirm: " + (err?.message || String(err)));
    } finally {
      setConfirming(false);
    }
  };

  const nameOf = (id) => staff.find((s) => Number(s.id) === Number(id))?.name || "—";
  const varianceCls = (v) => (v === null ? "text-gray-400" : Math.abs(v) > settings.limit ? "text-red-600" : "text-green-700");
  const input = "w-full h-11 rounded-lg border border-gray-300 px-3 text-lg tabular-nums text-right focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-50";
  const card = "bg-white rounded-2xl border border-[#E7EAF0] shadow-sm p-5";

  // ── Screens ──
  if (loading) return <Shell><p className="text-sm text-gray-500">Loading…</p></Shell>;

  if (olderOpen) {
    return (
      <Shell>
        <div className={`${card} space-y-4`}>
          <h1 className="text-xl font-bold text-gray-900">Till count</h1>
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            ⚠️ The count for <span className="font-semibold">{longDate(olderOpen)}</span> isn't finished.
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button onClick={() => openDay(olderOpen)} className="h-12 px-5 rounded-lg bg-blue-600 text-white font-semibold">Finish {longDate(olderOpen)}</button>
            <button onClick={() => openDay(today)} className="h-12 px-5 rounded-lg border border-gray-300 bg-white text-gray-700">Count today instead</button>
          </div>
        </div>
      </Shell>
    );
  }

  if (locked) {
    return (
      <Shell>
        <div className={`${card} space-y-3`}>
          <h1 className="text-xl font-bold text-gray-900">Till count — {longDate(date)}</h1>
          <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-green-800">
            <div className="font-semibold">✓ Done — confirmed by {nameOf(day.confirmed_by_1)} and {nameOf(day.confirmed_by_2)}</div>
            {day.confirmed_at && <div className="text-sm">{new Date(day.confirmed_at).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}</div>}
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-gray-500">Coins (till + bag)</dt><dd className="text-right tabular-nums">{money(Number(day.till_coins_total || 0) + Number(day.bag_coins_total || 0))}</dd>
            <dt className="text-gray-500">Notes</dt><dd className="text-right tabular-nums">{money(day.notes_total)}</dd>
            <dt className="text-gray-500">Total counted</dt><dd className="text-right tabular-nums">{money(day.counted_cash)}</dd>
            <dt className="text-gray-500">Cash takings</dt><dd className="text-right tabular-nums font-semibold">{money(day.cash_takings)}</dd>
            <dt className="text-gray-500">Cash</dt><dd className={`text-right tabular-nums ${varianceCls(Number(day.cash_variance))}`}>{fmtVariance(day.cash_variance)}</dd>
            <dt className="text-gray-500">EFTPOS</dt><dd className={`text-right tabular-nums ${varianceCls(Number(day.eftpos_variance))}`}>{fmtVariance(day.eftpos_variance)}</dd>
            {day.variance_reason && (<><dt className="text-gray-500">Reason</dt><dd className="text-right">{day.variance_reason}</dd></>)}
          </dl>
          <p className="text-xs text-gray-400">This count is locked. Ask the owner if anything needs changing.</p>
        </div>
      </Shell>
    );
  }

  const countRow = (loc, d) => {
    const k = String(d.value);
    const sub = round2((Number(counts[loc]?.[k]) || 0) * d.value);
    return (
      <div key={`${loc}-${k}`} className="grid grid-cols-[3.5rem_minmax(0,1fr)_6rem] items-center gap-3">
        <span className="text-base font-semibold text-gray-700">{d.label}</span>
        <input
          inputMode="numeric"
          value={counts[loc]?.[k] ?? ""}
          onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 5); setCounts((c) => ({ ...c, [loc]: { ...c[loc], [k]: v } })); }}
          onBlur={() => saveCount(loc, k)}
          placeholder="0"
          aria-label={`Number of ${d.label}${loc === "bag" ? " in the dispensary bag" : ""}`}
          className={input}
        />
        <span className="text-right tabular-nums text-gray-600">{sub ? money(sub) : "—"}</span>
      </div>
    );
  };
  // A coin section: "Count by coin" (6 quantity fields) or "Total only" (one dollar field)
  const coinSection = (loc, title, totalLabel, total) => (
    <section className={card}>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <h2 className="text-base font-bold text-gray-900">{title}</h2>
        <div className="inline-flex bg-gray-100 rounded-lg p-0.5" role="group" aria-label={`${title}: how to count`}>
          {[{ m: "coin", l: "Count by coin" }, { m: "total", l: "Total only" }].map((o) => (
            <button
              key={o.m}
              type="button"
              tabIndex={-1}
              onClick={() => { setCoinMode((c) => ({ ...c, [loc]: o.m })); writeMode(loc, o.m); }}
              className={`h-9 px-3 rounded-md text-sm ${coinMode[loc] === o.m ? "bg-white font-semibold shadow-sm text-gray-900" : "text-gray-600"}`}
            >
              {o.l}
            </button>
          ))}
        </div>
      </div>
      {coinMode[loc] === "coin" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">{COINS.map((d) => countRow(loc, d))}</div>
      ) : (
        <label className="block max-w-xs">
          <span className="block text-sm font-semibold text-gray-800 mb-1">{totalLabel}</span>
          <input inputMode="decimal" value={coinTotalIn[loc]} onChange={(e) => { const v = moneyInput(e.target.value); setCoinTotalIn((t) => ({ ...t, [loc]: v })); }}
            onBlur={saveFields} placeholder="0.00" className={input} />
        </label>
      )}
      <div className="mt-3 pt-3 border-t flex items-center justify-between text-base">
        <span className="font-semibold text-gray-800">{loc === "bag" ? "Bag coins" : "Till coins"}</span>
        <span className="font-bold tabular-nums">{money(total)}</span>
      </div>
    </section>
  );
  const moneyField = (label, help, value, onChange, onBlur, key, warn) => (
    <label key={key} className="block">
      <span className="block text-sm font-semibold text-gray-800">{label}</span>
      {help && <span className="block text-xs text-gray-500 mb-1">{help}</span>}
      <input inputMode="decimal" value={value} onChange={(e) => onChange(moneyInput(e.target.value))} onBlur={onBlur} placeholder="0.00"
        className={`${input} ${warn ? "border-amber-400" : ""}`} />
      {warn && <span className="block text-xs font-medium text-amber-700 mt-1">⚠ {warn}</span>}
    </label>
  );

  return (
    <Shell saveState={saveState}>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Till count — {longDate(date)}</h1>
          <p className="text-sm text-gray-500">Two people count together. Everything saves as you go.</p>
        </div>
        {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{error}</div>}

        {/* 1–3. Count the cash: till coins, dispensary-bag coins, notes */}
        {coinSection("till", "1. Coins in the till", "Total coins in the till", tillCoins)}
        {coinSection("bag", "2. Spare coins from the dispensary bag", "Total coins in the bag", bagCoins)}
        <section className={card}>
          <h2 className="text-base font-bold text-gray-900 mb-3">3. Notes</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">{NOTES.map((d) => countRow("till", d))}</div>
          <div className="mt-3 pt-3 border-t flex items-center justify-between text-base">
            <span className="font-semibold text-gray-800">Notes</span>
            <span className="font-bold tabular-nums">{money(notesTotal)}</span>
          </div>
        </section>

        {/* 4. Float and takings — the app does the rounding */}
        <section className={card}>
          <h2 className="text-base font-bold text-gray-900 mb-3">4. Float and takings</h2>
          <dl className="space-y-1.5 text-base">
            <div className="flex justify-between"><dt className="text-gray-600">Coins (till + bag)</dt><dd className="tabular-nums">{money(coinsTotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-600">Notes to leave in the till <span className="text-xs text-gray-400">(to the nearest $5)</span></dt><dd className="tabular-nums">{money(split.notesToLeave)}</dd></div>
            {split.coinsCoverFloat ? <p className="text-sm text-gray-500">Coins already cover the float</p>
              : split.notesToLeave === 0 ? <p className="text-sm text-gray-500">No notes needed — the coins are within $2.50 of the float</p> : null}
            <div className="flex justify-between"><dt className="text-gray-600">Float in the till</dt><dd className="tabular-nums">{money(split.floatLeft)}</dd></div>
          </dl>
          <div className="mt-3 pt-3 border-t flex items-baseline justify-between">
            <span className="text-lg font-bold text-gray-900">Cash takings (all other notes)</span>
            <span className="text-3xl font-bold tabular-nums text-gray-900">{money(takings)}</span>
          </div>
          {split.shortOfNotes && (
            <div className="mt-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm font-medium text-red-700">Not enough notes to make up the float</div>
          )}
          <p className="text-xs text-gray-400 mt-2">Total counted {money(counted)}</p>
        </section>
        {/* 5. From the Z report */}
        <section className={card}>
          <h2 className="text-base font-bold text-gray-900 mb-3">5. From the Z report</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {moneyField("Cash", "Payment Breakdown → Cash", z.z_cash, (v) => setZ((s) => ({ ...s, z_cash: v })), saveFields, "zc")}
            {moneyField("EFTPOS", "Card Payments → EFTPOS", z.z_eftpos, (v) => setZ((s) => ({ ...s, z_eftpos: v })), saveFields, "ze")}
            {otherTypes.map((t) => moneyField(t.name, t.help_text || "Other Payments — leave blank if none", tenders[t.id] ?? "", (v) => setTenders((s) => ({ ...s, [t.id]: v })), () => saveTender(t.id), t.id))}
            <label className="block">
              <span className="block text-sm font-semibold text-gray-800">Total Customers Served</span>
              <span className="block text-xs text-gray-500 mb-1">&nbsp;</span>
              <input inputMode="numeric" value={z.customers} onChange={(e) => setZ((s) => ({ ...s, customers: e.target.value.replace(/\D/g, "") }))} onBlur={saveFields} placeholder="0" className={input} />
            </label>
            {moneyField("Total GST Sales", "not GST Collected", z.gst_sales, (v) => setZ((s) => ({ ...s, gst_sales: v })), saveFields, "gst")}
          </div>
        </section>

        {/* 6. EFTPOS printouts */}
        <section className={card}>
          <h2 className="text-base font-bold text-gray-900 mb-3">6. EFTPOS printouts</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {eftposTypes.map((t) => moneyField(t.name, t.help_text || "", tenders[t.id] ?? "", (v) => setTenders((s) => ({ ...s, [t.id]: v })), () => saveTender(t.id), t.id, softWarn[t.id]))}
          </div>
          {needClosingTick && (
            <label className={`mt-4 flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer ${noClosing ? "border-gray-200 bg-gray-50" : "border-amber-300 bg-amber-50"}`}>
              <input type="checkbox" checked={noClosing} onChange={(e) => {
                const v = e.target.checked;
                setNoClosing(v);
                guard((row) => supabase.from("daily_takings").update({ no_closing_eftpos: v }).eq("id", row.id).eq("status", "open").then(({ error: er }) => { if (er) throw er; }));
              }} className="h-5 w-5 mt-0.5 shrink-0" />
              <span className="text-sm text-gray-800">
                <span className="font-semibold">No EFTPOS after the Z close last night (no closing printout)</span>
                <span className="block text-xs text-gray-500">Closing EFTPOS is blank — tick this if there really was no printout, otherwise enter it above.</span>
              </span>
            </label>
          )}
        </section>

        {/* 7. Check */}
        <section className={card}>
          <h2 className="text-base font-bold text-gray-900 mb-3">7. Check</h2>
          <dl className="space-y-1.5 text-lg">
            <div className="flex justify-between"><dt className="text-gray-700">Cash</dt><dd className={`font-semibold tabular-nums ${varianceCls(cashVar)}`}>{cashVar === null ? "Enter the Z cash" : fmtVariance(cashVar)}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-700">EFTPOS</dt><dd className={`font-semibold tabular-nums ${varianceCls(eftVar)}`}>{eftVar === null ? "Enter the Z EFTPOS" : fmtVariance(eftVar)}</dd></div>
          </dl>
          <p className="text-xs text-gray-400 mt-1">Within {money(settings.limit)} either way is fine.</p>
          {reasonNeeded && (
            <label className="block mt-3">
              <span className="block text-sm font-semibold text-red-700">Reason for the difference *</span>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} onBlur={saveFields} rows={2} maxLength={500}
                className="w-full rounded-lg border border-red-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-red-300" />
            </label>
          )}
        </section>

        {/* 8. Confirm */}
        <section className={card}>
          <h2 className="text-base font-bold text-gray-900 mb-3">8. Confirm</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[0, 1].map((i) => (
              <div key={i} className="space-y-2">
                <div className="text-sm font-semibold text-gray-800">{i === 0 ? "First person" : "Second person"}</div>
                <select
                  value={people[i].staffId}
                  onChange={(e) => { const v = e.target.value; setPeople((ps) => ps.map((p, k) => (k === i ? { ...p, staffId: v } : p))); setPersonErr((es) => es.map((x, k) => (k === i ? "" : x))); }}
                  className="w-full h-11 rounded-lg border border-gray-300 px-3 text-base bg-white"
                >
                  <option value="">Your name…</option>
                  {staff.filter((s) => i === 0 || String(s.id) !== people[0].staffId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={4}
                  value={people[i].pin}
                  onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 4); setPeople((ps) => ps.map((p, k) => (k === i ? { ...p, pin: v } : p))); setPersonErr((es) => es.map((x, k) => (k === i ? "" : x))); }}
                  placeholder="PIN"
                  style={PIN_STYLE}
                  className="w-full h-11 rounded-lg border border-gray-300 px-3 text-lg tracking-widest"
                />
                {personErr[i] && <p className="text-sm text-red-600">{personErr[i]}</p>}
              </div>
            ))}
          </div>
          <button onClick={confirm} disabled={confirming} className="mt-4 w-full h-12 rounded-lg bg-green-600 text-white text-base font-semibold disabled:opacity-50">
            {confirming ? "Confirming…" : "Confirm count"}
          </button>
          <p className="text-xs text-gray-400 mt-2">Once confirmed the count is locked.</p>
        </section>
      </div>
    </Shell>
  );
}

function Shell({ children, saveState }) {
  return (
    <div className="min-h-screen bg-[#EEF1F5]">
      <div className="max-w-3xl mx-auto px-4 py-5 space-y-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm text-blue-600 hover:underline">← Back to the kiosk</Link>
          {saveState && <span className="text-xs text-gray-400">{saveState}</span>}
        </div>
        {children}
      </div>
    </div>
  );
}
