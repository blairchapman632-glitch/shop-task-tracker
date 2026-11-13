// Kiosk → Till count (Daily Banking, Stage 2). Two staff count the till together at till close (~30–60 min before the
// shop closes): the coins in the till, the spare coins from the dispensary bag (each by coin or as one total), the
// notes, the Z report figures, the EFTPOS printouts (in order: Left till + Right till = tonight's readings, then the
// Previous settlement report — Right till, printed during the count), then both confirm with their name + PIN.
// Names, help and ORDER of the EFTPOS fields come from banking_payment_types (name, help_text, sort_order — Admin →
// Settings); Enter / Tab follow that order.
// From 9 Nov 2026 staff enter the Previous settlement report — Right till total (whole day, required; printed during
// the count); Closing EFTPOS = report total − the previous Right till reading ($0 is valid). With no earlier
// reading, Closing EFTPOS is entered directly (also required). daily_takings.no_closing_eftpos is no longer used.
// Soft warnings (never block): Closing EFTPOS over 3× its 60-day average; Left till
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
import HomeButton from "../components/HomeButton";
import supabase from "../lib/supabaseClient";
import { todayPerth, addDaysStr } from "../lib/performanceReview";
import { longDate } from "../lib/calendar";
import { previousRightTill, dayLabel } from "../lib/bankingData";
import {
  DENOMINATIONS, round2, countTotal, floatSplit, cashVariance, eftposVariance, needsReason, fmtVariance,
  CLOSING_RECEIPT_FROM, closingFromReceipt,
} from "../lib/banking";

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";

const HISTORY_DAYS = 60; // counted days the soft EFTPOS warnings compare against

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
  const [hist, setHist] = useState([]);                // last 60 counted days: [{ [payment_type_id]: amount }]
  const [receipt, setReceipt] = useState("");          // Previous settlement report — Right till total (stored as daily_takings.closing_receipt_total) — from 9 Nov 2026
  const [prevRight, setPrevRight] = useState(undefined); // previous Right till reading { date, amount } | null (undefined = looking)
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
          supabase.from("pharmacy_settings").select("banking_float_amount, banking_variance_limit").eq("pharmacy_id", PHARMACY_ID).maybeSingle(),
          supabase.from("daily_takings").select("takings_date").eq("pharmacy_id", PHARMACY_ID).eq("status", "open")
            .gte("takings_date", addDaysStr(today, -7)).lt("takings_date", today).order("takings_date"),
        ]);
        const err = st.error || ty.error || se.error || open.error;
        if (err) throw err;
        setStaff((st.data || []).filter((s) => s.active !== false && s.role !== "Locum"));
        setTypes(ty.data || []);
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
    loadContext(d).catch(() => setHist([])); // only warnings — never stops the count
    setPrevRight(undefined);
    previousRightTill(supabase, PHARMACY_ID, d).then(setPrevRight).catch(() => setPrevRight(null));
    const { data: row, error: e1 } = await supabase.from("daily_takings").select("*").eq("pharmacy_id", PHARMACY_ID).eq("takings_date", d).maybeSingle();
    if (e1) { setError(e1.message); return; }
    setDay(row || null);
    dayRef.current = row || null;
    setReceipt(toInput(row?.closing_receipt_total));
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

  // The last 60 counted days' EFTPOS amounts (any source), for the soft warnings
  const loadContext = async (d) => {
    const recent = await supabase.from("daily_takings").select("id").eq("pharmacy_id", PHARMACY_ID).eq("status", "confirmed").lt("takings_date", d)
      .order("takings_date", { ascending: false }).limit(HISTORY_DAYS);
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

  // Closing EFTPOS (from the previous settlement report, right till) and the two tonight readings, by key
  const tClosing = eftposTypes.find((t) => t.key === "eftpos_t3");
  const tRight = eftposTypes.find((t) => t.key === "eftpos_t1");
  const tLeft = eftposTypes.find((t) => t.key === "eftpos_t2");
  const amt = (t) => (t && tenders[t.id] !== undefined && tenders[t.id] !== "" ? Number(tenders[t.id]) : null);
  // From 9 Nov 2026: staff enter the previous settlement report total (whole day); Closing EFTPOS = report − previous Right till
  // reading, kept in the eftpos_t3 tender as before. No earlier reading -> a direct Closing EFTPOS box instead.
  const receiptDay = !!tClosing && !!date && date >= CLOSING_RECEIPT_FROM;
  const receiptMode = receiptDay && !!prevRight;
  const receiptNum = receipt === "" ? null : Number(receipt);
  const receiptCalc = receiptMode && receiptNum !== null ? closingFromReceipt(receiptNum, prevRight.amount) : null;
  const receiptNegative = receiptCalc !== null && receiptCalc < 0;
  const onReceipt = (v) => {
    setReceipt(v);
    const c = v === "" || !prevRight ? null : closingFromReceipt(Number(v), prevRight.amount);
    setTenders((s) => ({ ...s, [tClosing.id]: c === null || c < 0 ? "" : String(c) }));
  };
  // Soft warnings against the last 60 counted days (need at least 10 to say what's usual)
  const enoughHist = hist.length >= 10;
  const closingAvg = enoughHist && tClosing ? hist.reduce((s, h) => s + (h[tClosing.id] || 0), 0) / hist.length : 0;
  const closingHigh = closingAvg > 0 && amt(tClosing) > 3 * closingAvg;
  const rightUsuallyHigher = enoughHist && tRight && tLeft && hist.filter((h) => (h[tRight.id] || 0) > (h[tLeft.id] || 0)).length / hist.length >= 0.8;
  const leftHigher = rightUsuallyHigher && amt(tRight) !== null && amt(tLeft) !== null && amt(tLeft) > amt(tRight);
  const softWarn = {
    ...(tClosing && closingHigh ? { [tClosing.id]: "Closing EFTPOS is higher than usual — check the previous settlement report from the right till." } : {}),
    ...(tLeft && leftHigher ? { [tLeft.id]: "Left till is higher than right till — check they aren't swapped." } : {}),
  };

  // Figures stored on the day (saved with every change)
  const summaryPatch = () => ({
    z_cash: num(z.z_cash), z_eftpos: num(z.z_eftpos), customers: z.customers === "" ? null : Math.round(Number(z.customers)), gst_sales: num(z.gst_sales),
    counted_cash: counted, float_amount: floatAmt, cash_takings: takings,
    till_coins_total: tillCoins, bag_coins_total: bagCoins, notes_total: notesTotal,
    cash_variance: cashVar, eftpos_variance: eftVar, variance_reason: reason.trim() || null,
    updated_at: new Date().toISOString(),
    ...(receiptMode ? { closing_receipt_total: receiptNum } : {}),
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
    if (receiptNegative) { setError(`Previous settlement report total is less than the right till reading on ${dayLabel(prevRight.date)} — check the report.`); return; }
    // The closing figure is required: the receipt total (or, with no earlier right till reading, Closing EFTPOS itself)
    if (receiptDay && prevRight === undefined) { setError("Still looking up the last right till reading — try again in a moment."); return; }
    if (receiptMode && receipt === "") { setError("Enter the Previous settlement report — Right till total."); return; }
    if (tClosing && !receiptMode && amt(tClosing) === null) { setError("Enter the Closing EFTPOS."); return; }
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

  // Anything counted yet? (the float messages only appear once there is)
  const hasCount = [...Object.values(counts.till || {}), ...Object.values(counts.bag || {})].some((v) => Number(v) > 0)
    || Number(coinTotalIn.till) > 0 || Number(coinTotalIn.bag) > 0;

  // Enter and Tab = the next box, Shift+Tab = the previous one, all in the same order (data-nav), not the table's row
  // order: Till coins column top to bottom (or its single total box), Bag coins, Notes, Z report, EFTPOS, reason, then
  // name → PIN for each person. Enter in the last PIN does nothing — staff click Confirm count; Tab from the last PIN
  // carries on to the Confirm button as normal.
  const onEnter = (e) => {
    const isEnter = e.key === "Enter" && !e.shiftKey;
    const isTab = e.key === "Tab";
    if (!isEnter && !isTab) return;
    const n = Number(e.target?.dataset?.nav);
    if (!n) return;
    const all = [...e.currentTarget.querySelectorAll("[data-nav]")]
      .filter((x) => !x.disabled && x.offsetParent !== null)
      .sort((a, b) => Number(a.dataset.nav) - Number(b.dataset.nav));
    const back = isTab && e.shiftKey;
    const target = back ? [...all].reverse().find((x) => Number(x.dataset.nav) < n) : all.find((x) => Number(x.dataset.nav) > n);
    if (!target) { if (isEnter) e.preventDefault(); return; } // Tab past either end: the browser's normal order
    e.preventDefault();
    target.focus();
    if (target.tagName === "INPUT" && target.select) target.select();
  };

  // ── Count the cash: one table (rows = denominations; columns = Till coins | Bag coins | Notes) ──
  const box = "w-[5.5rem] h-10 rounded-lg border border-gray-300 px-2 text-base tabular-nums text-right focus:outline-none focus:ring-2 focus:ring-blue-400";
  const ROWS = [...COINS, ...NOTES]; // coins first, then notes (Enter order: Till coins down, Bag coins down, Notes down)
  const COIN_COLS = [{ loc: "till", title: "Till coins", sub: "in the till", nav: 100 }, { loc: "bag", title: "Bag coins", sub: "from the dispensary bag", nav: 200 }];
  const qtyCell = (loc, d, nav) => {
    const k = String(d.value);
    const sub = round2((Number(counts[loc]?.[k]) || 0) * d.value);
    return (
      <div className="flex items-center gap-1.5">
        <input
          data-nav={nav}
          inputMode="numeric"
          value={counts[loc]?.[k] ?? ""}
          onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 5); setCounts((c) => ({ ...c, [loc]: { ...c[loc], [k]: v } })); }}
          onBlur={() => saveCount(loc, k)}
          placeholder="0"
          aria-label={`Number of ${d.label}${loc === "bag" ? " in the dispensary bag" : d.kind === "coin" ? " in the till" : " notes"}`}
          className={box}
        />
        <span className="text-xs tabular-nums text-gray-500 whitespace-nowrap min-w-[4.25rem]">{sub ? `= ${money(sub)}` : ""}</span>
      </div>
    );
  };
  const modeSwitch = (loc, title) => (
    <div className="inline-flex bg-gray-100 rounded-md p-0.5 mt-1" role="group" aria-label={`${title}: how to count`}>
      {[{ m: "coin", l: "By coin" }, { m: "total", l: "Total only" }].map((o) => (
        <button key={o.m} type="button" tabIndex={-1}
          onClick={() => { setCoinMode((c) => ({ ...c, [loc]: o.m })); writeMode(loc, o.m); }}
          className={`h-7 px-2 rounded text-xs ${coinMode[loc] === o.m ? "bg-white font-semibold shadow-sm text-gray-900" : "text-gray-600"}`}>
          {o.l}
        </button>
      ))}
    </div>
  );

  const moneyField = (label, help, value, onChange, onBlur, key, warn, nav) => (
    <label key={key} className="block">
      <span className="block text-sm font-semibold text-gray-800">{label}</span>
      {help && <span className="block text-xs text-gray-500 mb-1">{help}</span>}
      <input data-nav={nav} inputMode="decimal" value={value} onChange={(e) => onChange(moneyInput(e.target.value))} onBlur={onBlur} placeholder="0.00"
        className={`${input} ${warn ? "border-amber-400" : ""}`} />
      {warn && <span className="block text-xs font-medium text-amber-700 mt-1">⚠ {warn}</span>}
    </label>
  );
  const errorBox = (cls) => error && <div className={`rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700 ${cls}`}>{error}</div>;
  const line = (label, value, note) => (
    <div className="flex justify-between gap-3"><dt className="text-gray-600">{label}{note && <span className="text-xs text-gray-400"> {note}</span>}</dt><dd className="tabular-nums">{value}</dd></div>
  );

  return (
    <Shell saveState={saveState} wide>
      <div className="space-y-4" onKeyDown={onEnter}>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Till count — {longDate(date)}</h1>
          <p className="text-sm text-gray-500">Two people count together. Everything saves as you go.</p>
        </div>
        {errorBox("lg:hidden")}

        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_21rem] xl:grid-cols-[minmax(0,1fr)_23rem] lg:gap-5 lg:items-start space-y-4 lg:space-y-0">
          {/* ── LEFT: the inputs ── */}
          <div className="space-y-4 min-w-0">
            {/* 1. Count the cash */}
            <section className={card}>
              <h2 className="text-base font-bold text-gray-900 mb-2">1. Count the cash</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="align-bottom">
                      <th className="w-12" />
                      {COIN_COLS.map((c) => (
                        <th key={c.loc} className="text-left font-semibold text-gray-800 pb-2 pr-2">
                          <div>{c.title} <span className="font-normal text-xs text-gray-400">{c.sub}</span></div>
                          {modeSwitch(c.loc, c.title)}
                        </th>
                      ))}
                      <th className="text-left font-semibold text-gray-800 pb-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ROWS.map((d) => {
                      const ci = COINS.indexOf(d);
                      return (
                        <tr key={d.value} className="border-t border-[#F0F2F5]">
                          <td className="py-1 pr-2 font-semibold text-gray-700 whitespace-nowrap">{d.label}</td>
                          {COIN_COLS.map((c) => {
                            if (d.kind === "note") return <td key={c.loc} />;
                            if (coinMode[c.loc] === "total") {
                              return ci === 0 ? (
                                <td key={c.loc} rowSpan={COINS.length} className="align-top py-1 pr-2">
                                  <div className="text-xs text-gray-500 mb-1">Total {c.title.toLowerCase()}</div>
                                  <input data-nav={c.nav} inputMode="decimal" value={coinTotalIn[c.loc]}
                                    onChange={(e) => { const v = moneyInput(e.target.value); setCoinTotalIn((t) => ({ ...t, [c.loc]: v })); }}
                                    onBlur={saveFields} placeholder="0.00" aria-label={`Total ${c.title.toLowerCase()}`} className={`${box} w-[6.5rem]`} />
                                </td>
                              ) : null;
                            }
                            return <td key={c.loc} className="py-1 pr-2">{qtyCell(c.loc, d, c.nav + ci)}</td>;
                          })}
                          <td className="py-1">{d.kind === "note" ? qtyCell("till", d, 300 + NOTES.indexOf(d)) : null}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-[#E7EAF0] font-bold">
                      <td className="pt-2 pr-2 text-gray-700">Total</td>
                      <td className="pt-2 pr-2 tabular-nums">{money(tillCoins)}</td>
                      <td className="pt-2 pr-2 tabular-nums">{money(bagCoins)}</td>
                      <td className="pt-2 tabular-nums">{money(notesTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>

            {/* 2. From the Z report */}
            <section className={card}>
              <h2 className="text-base font-bold text-gray-900 mb-3">2. From the Z report</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {moneyField("Cash", "Payment Breakdown → Cash", z.z_cash, (v) => setZ((s) => ({ ...s, z_cash: v })), saveFields, "zc", null, 400)}
                {moneyField("EFTPOS", "Card Payments → EFTPOS", z.z_eftpos, (v) => setZ((s) => ({ ...s, z_eftpos: v })), saveFields, "ze", null, 401)}
                {otherTypes.map((t, i) => moneyField(t.name, t.help_text || "Other Payments — leave blank if none", tenders[t.id] ?? "", (v) => setTenders((s) => ({ ...s, [t.id]: v })), () => saveTender(t.id), t.id, null, 402 + i))}
                <label className="block">
                  <span className="block text-sm font-semibold text-gray-800">Total Customers Served</span>
                  <span className="block text-xs text-gray-500 mb-1">&nbsp;</span>
                  <input data-nav={450} inputMode="numeric" value={z.customers} onChange={(e) => setZ((s) => ({ ...s, customers: e.target.value.replace(/\D/g, "") }))} onBlur={saveFields} placeholder="0" className={input} />
                </label>
                {moneyField("Total GST Sales", "not GST Collected", z.gst_sales, (v) => setZ((s) => ({ ...s, gst_sales: v })), saveFields, "gst", null, 451)}
              </div>
            </section>

            {/* 3. EFTPOS printouts */}
            <section className={card}>
              <h2 className="text-base font-bold text-gray-900 mb-3">3. EFTPOS printouts</h2>
              {/* Each field spans 3 rows of the parent grid (label + help | input | line underneath) via subgrid, so the
                  three inputs sit level however the help texts wrap */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-1">
                {eftposTypes.map((t, ti) => {
                  const cell = ({ label, help, notice, value, onChange, warn, below }) => (
                    <div key={t.id} className="grid grid-rows-subgrid row-span-3">
                      <div>
                        {notice && <p className="text-xs font-medium text-amber-700 mb-1">{notice}</p>}
                        <label htmlFor={`eftpos-${t.id}`} className="block text-sm font-semibold text-gray-800">{label}</label>
                        {help && <span className="block text-xs text-gray-500 mb-1">{help}</span>}
                      </div>
                      <input id={`eftpos-${t.id}`} data-nav={500 + ti} inputMode="decimal" value={value} onChange={(e) => onChange(moneyInput(e.target.value))} onBlur={() => saveTender(t.id)}
                        placeholder="0.00" className={`${input} ${warn ? "border-amber-400" : ""}`} />
                      <div className="pb-3 sm:pb-0">
                        {warn && <span className="block text-xs font-medium text-amber-700 mt-1">⚠ {warn}</span>}
                        {below}
                      </div>
                    </div>
                  );
                  const direct = (notice) => cell({ label: t.name, help: t.help_text || "", notice, value: tenders[t.id] ?? "", onChange: (v) => setTenders((s) => ({ ...s, [t.id]: v })), warn: softWarn[t.id] });
                  if (t.id === tClosing?.id && receiptDay) {
                    if (prevRight === undefined) return <div key={t.id} className="row-span-3 text-sm text-gray-400">Looking up the last right till reading…</div>;
                    if (!receiptMode) return direct("No earlier right till reading found — enter Closing EFTPOS directly");
                    return cell({
                      label: "Previous settlement report — Right till",
                      help: "",
                      value: receipt, onChange: onReceipt, warn: receiptNegative ? null : softWarn[t.id],
                      below: receiptNum === null ? null : receiptNegative ? (
                        <p className="mt-1 rounded-lg bg-red-50 border border-red-200 px-2 py-1.5 text-xs font-semibold text-red-700">
                          Report total is less than the right till reading on {dayLabel(prevRight.date)} — check the report
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-gray-600">
                          Report total {money(receiptNum)} − right till reading on {dayLabel(prevRight.date)} {money(prevRight.amount)} = <span className="font-semibold text-gray-900">Closing EFTPOS {money(receiptCalc)}</span>
                        </p>
                      ),
                    });
                  }
                  return direct(null);
                })}
              </div>
            </section>
          </div>

          {/* ── RIGHT: summary, check and confirm (stays on screen on wide screens) ── */}
          <aside className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
            <div className={`${card} space-y-4`}>
              <dl className="space-y-1 text-sm">
                {line("Total counted", money(counted))}
                {line("Coins (till + bag)", money(coinsTotal))}
                {hasCount && line("Notes to leave in the till", money(split.notesToLeave), "(to the nearest $5)")}
                {line("Float in the till", hasCount ? money(split.floatLeft) : "—")}
              </dl>
              {hasCount && (split.coinsCoverFloat ? <p className="text-xs text-gray-500 -mt-2">Coins already cover the float</p>
                : split.notesToLeave === 0 ? <p className="text-xs text-gray-500 -mt-2">No notes needed — the coins are within $2.50 of the float</p> : null)}

              <div className="pt-3 border-t">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-base font-bold text-gray-900">Cash takings</span>
                  <span className="text-3xl font-bold tabular-nums text-gray-900">{money(takings)}</span>
                </div>
                <div className="text-xs text-gray-400 text-right">all other notes</div>
                {hasCount && split.shortOfNotes && (
                  <div className="mt-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm font-medium text-red-700">Not enough notes to make up the float</div>
                )}
              </div>

              <div className="pt-3 border-t">
                <dl className="space-y-1 text-base">
                  <div className="flex justify-between"><dt className="text-gray-700">Cash check</dt><dd className={`font-semibold tabular-nums ${varianceCls(cashVar)}`}>{cashVar === null ? "—" : fmtVariance(cashVar)}</dd></div>
                  <div className="flex justify-between"><dt className="text-gray-700">EFTPOS check</dt><dd className={`font-semibold tabular-nums ${varianceCls(eftVar)}`}>{eftVar === null ? "—" : fmtVariance(eftVar)}</dd></div>
                </dl>
                <p className="text-xs text-gray-400 mt-1">Within {money(settings.limit)} either way is fine.</p>
                {reasonNeeded && (
                  <label className="block mt-3">
                    <span className="block text-sm font-semibold text-red-700">Reason for the difference *</span>
                    <textarea data-nav={600} value={reason} onChange={(e) => setReason(e.target.value)} onBlur={saveFields} rows={2} maxLength={500}
                      className="w-full rounded-lg border border-red-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300" />
                  </label>
                )}
              </div>

              <div className="pt-3 border-t space-y-3">
                {[0, 1].map((i) => (
                  <div key={i}>
                    <div className="text-sm font-semibold text-gray-800 mb-1">{i === 0 ? "First person" : "Second person"}</div>
                    <div className="flex gap-2">
                      <select
                        data-nav={700 + i * 2}
                        value={people[i].staffId}
                        onChange={(e) => { const v = e.target.value; setPeople((ps) => ps.map((p, k) => (k === i ? { ...p, staffId: v } : p))); setPersonErr((es) => es.map((x, k) => (k === i ? "" : x))); }}
                        className="flex-1 min-w-0 h-11 rounded-lg border border-gray-300 px-2 text-base bg-white"
                      >
                        <option value="">Your name…</option>
                        {staff.filter((s) => i === 0 || String(s.id) !== people[0].staffId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      <input
                        data-nav={701 + i * 2}
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        maxLength={4}
                        value={people[i].pin}
                        onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 4); setPeople((ps) => ps.map((p, k) => (k === i ? { ...p, pin: v } : p))); setPersonErr((es) => es.map((x, k) => (k === i ? "" : x))); }}
                        placeholder="PIN"
                        aria-label={`${i === 0 ? "First" : "Second"} person's PIN`}
                        style={PIN_STYLE}
                        className="w-24 h-11 rounded-lg border border-gray-300 px-3 text-lg tracking-widest"
                      />
                    </div>
                    {personErr[i] && <p className="text-sm text-red-600 mt-1">{personErr[i]}</p>}
                  </div>
                ))}
                {errorBox("hidden lg:block")}
                <button onClick={confirm} disabled={confirming} className="w-full h-12 rounded-lg bg-green-600 text-white text-base font-semibold disabled:opacity-50">
                  {confirming ? "Confirming…" : "Confirm count"}
                </button>
                <p className="text-xs text-gray-400">Once confirmed the count is locked.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children, saveState, wide = false }) {
  return (
    <div className="min-h-screen bg-[#EEF1F5]">
      <div className={`${wide ? "max-w-6xl" : "max-w-3xl"} mx-auto px-4 py-5 space-y-4`}>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-gray-400">{saveState}</span>
          <HomeButton />
        </div>
        {children}
      </div>
    </div>
  );
}
