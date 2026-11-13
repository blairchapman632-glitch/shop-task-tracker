// Daily Banking — pure helpers (no database calls), shared by the till-close screen (Stage 2), the banking screen and
// the spreadsheet import. Tables: daily_takings (+ _tenders, cash_counts, _edits), bank_deposits, banking_payment_types.
// Settings: pharmacy_settings.banking_float_amount ($300), banking_variance_limit ($5).
//   Cash check:   (counted cash − float) vs Z Cash
//   EFTPOS check: T1 + T2 + T3 (active 'eftpos' payment types) vs Z EFTPOS — T3 is last night's final T1 printout
// Every result is rounded to cents with round2, so floating-point leftovers (e.g. 10.399999) never show.

// Round to 2 decimals (cents). Nudged by EPSILON so 1.005 → 1.01, not 1.00.
export const round2 = (n) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round((x + Math.sign(x) * Number.EPSILON) * 100) / 100;
};

// Notes and coins counted at till close (largest first)
export const DENOMINATIONS = [
  { value: 100, label: "$100", kind: "note" },
  { value: 50, label: "$50", kind: "note" },
  { value: 20, label: "$20", kind: "note" },
  { value: 10, label: "$10", kind: "note" },
  { value: 5, label: "$5", kind: "note" },
  { value: 2, label: "$2", kind: "coin" },
  { value: 1, label: "$1", kind: "coin" },
  { value: 0.5, label: "50c", kind: "coin" },
  { value: 0.2, label: "20c", kind: "coin" },
  { value: 0.1, label: "10c", kind: "coin" },
  { value: 0.05, label: "5c", kind: "coin" },
];

// Total of a cash count: counts = [{ denomination, quantity }] or { [denomination]: quantity }.
// Worked in cents so 5c × 3 adds up exactly.
export function countTotal(counts) {
  const rows = Array.isArray(counts)
    ? counts
    : Object.entries(counts || {}).map(([denomination, quantity]) => ({ denomination, quantity }));
  const cents = rows.reduce((sum, r) => sum + Math.round(Number(r.denomination) * 100) * (Number(r.quantity) || 0), 0);
  return round2(cents / 100);
}

// Cash takings = counted cash − float
export const cashTakings = (countedCash, floatAmount) => round2(Number(countedCash || 0) - Number(floatAmount || 0));

// Cash variance = cash takings − Z cash (positive = over, negative = under)
export const cashVariance = (takings, zCash) => round2(Number(takings || 0) - Number(zCash || 0));

// Tender amount for a payment type: tenders = [{ payment_type_id, amount }] or { [payment_type_id]: amount }
const tenderRows = (tenders) => (Array.isArray(tenders)
  ? tenders
  : Object.entries(tenders || {}).map(([payment_type_id, amount]) => ({ payment_type_id, amount })));
const sumWhere = (tenders, paymentTypes, keep) => {
  const typeById = new Map((paymentTypes || []).map((t) => [String(t.id), t]));
  return round2(tenderRows(tenders).reduce((sum, r) => {
    const t = typeById.get(String(r.payment_type_id));
    return t && keep(t) ? sum + Number(r.amount || 0) : sum;
  }, 0));
};

// EFTPOS variance = (sum of active 'eftpos' tenders: T1 + T2 + T3) − Z EFTPOS
// EFTPOS entered on the day: every active EFTPOS type (Closing + Right till + Left till)
export const eftposTotal = (tenders, paymentTypes) => sumWhere(tenders, paymentTypes, (t) => t.kind === "eftpos" && t.active !== false);
export const eftposVariance = (tenders, paymentTypes, zEftpos) =>
  round2(eftposTotal(tenders, paymentTypes) - Number(zEftpos || 0));

// What goes to the Bendigo account: tenders whose payment type counts_to_bendigo
export const bendigoTotal = (tenders, paymentTypes) => sumWhere(tenders, paymentTypes, (t) => t.counts_to_bendigo === true);

// The spreadsheet "Till" column: cash takings + every tender
export const tillTotal = (takings, tenders) =>
  round2(Number(takings || 0) + tenderRows(tenders).reduce((sum, r) => sum + Number(r.amount || 0), 0));

// A reason is needed when either variance is past the limit (either way)
export const needsReason = (cashVar, eftposVar, limit) =>
  Math.abs(round2(cashVar)) > Number(limit) || Math.abs(round2(eftposVar)) > Number(limit);

// Takings to bank = counted − float, rounded DOWN to the nearest $5 (takings are notes only; leftover cents stay
// with the float). Never below 0.
export const takingsToBank = (countedCash, floatAmount) => {
  const raw = Number(countedCash || 0) - Number(floatAmount || 0);
  return raw > 0 ? Math.floor(round2(raw) / 5) * 5 : 0;
};

// Which notes to take out for the bank: from the notes actually counted, largest first, adding up to exactly
// `amount` — or, if the counted notes can't make it, the closest amount below it.
// counts = [{ denomination, quantity }] or { [denomination]: quantity }
// -> { amount, notes: [{ denomination, quantity }] }  (amount = what the notes add up to, may be < the target)
export function notesToBank(counts, amount) {
  const rows = Array.isArray(counts)
    ? counts
    : Object.entries(counts || {}).map(([denomination, quantity]) => ({ denomination, quantity }));
  const have = Object.fromEntries(rows.map((r) => [Number(r.denomination), Math.max(0, Math.floor(Number(r.quantity) || 0))]));
  // Notes only ($5 and up), largest first, worked in $5 units
  const notes = DENOMINATIONS.filter((d) => d.kind === "note").map((d) => ({ value: d.value, unit: d.value / 5, qty: have[d.value] || 0 }));
  const target = Math.max(0, Math.floor(Number(amount || 0) / 5));
  // reach[i][u] = can the notes from index i onwards make exactly u units (bounded by how many were counted)
  const reach = Array.from({ length: notes.length + 1 }, () => new Array(target + 1).fill(false));
  reach[notes.length][0] = true;
  for (let i = notes.length - 1; i >= 0; i--) {
    for (let u = 0; u <= target; u++) {
      for (let k = 0; k <= notes[i].qty && k * notes[i].unit <= u; k++) {
        if (reach[i + 1][u - k * notes[i].unit]) { reach[i][u] = true; break; }
      }
    }
  }
  let best = target;
  while (best > 0 && !reach[0][best]) best--;
  // Largest notes first: at each note, take as many as still leave the rest makeable by the smaller notes
  const out = [];
  let left = best;
  for (let i = 0; i < notes.length; i++) {
    for (let k = Math.min(notes[i].qty, Math.floor(left / notes[i].unit)); k >= 0; k--) {
      if (reach[i + 1][left - k * notes[i].unit]) {
        if (k > 0) out.push({ denomination: notes[i].value, quantity: k });
        left -= k * notes[i].unit;
        break;
      }
    }
  }
  return { amount: best * 5, notes: out };
}

// Closing EFTPOS from the right till's closing receipt (counts from 9 Nov 2026 on; earlier days keep the Closing EFTPOS
// as entered). The receipt shows the WHOLE-DAY total, so Closing EFTPOS = receipt total − the previous day's Right till
// EFTPOS reading (lib/bankingData.js previousRightTill). Can come out negative — the till count blocks Confirm then.
// e.g. receipt 2,963.18 − right till 2,758.84 = 204.34
export const CLOSING_RECEIPT_FROM = "2026-11-09";
export const closingFromReceipt = (receiptTotal, prevRightTill) => round2(Number(receiptTotal) - Number(prevRightTill));

// How the float is made up and what's banked (the till-count screen does all the rounding):
//   coins (till + dispensary bag) all stay in the till;
//   notes to leave = (float − coins) rounded to the NEAREST $5 (exactly halfway, e.g. $2.50, rounds up), never below 0
//   — so the float left can be up to $2.49 under the float setting, which is fine;
//   float left = coins + notes to leave;  takings = every other note (notes total − notes to leave, never below 0).
// The cash variance is NOT rounded — it uses the exact total counted − float setting − Z cash (see till-count.js).
// e.g. coins $41.40,  notes $1,175, float $300 -> short $258.60 -> leave $260, float left $301.40, takings $915.
//      coins $294.35, notes $340,   float $300 -> short $5.65   -> leave $5,   float left $299.35, takings $335.
// -> { notesToLeave, floatLeft, takings, shortOfNotes, coinsCoverFloat }
export function floatSplit({ coinsTotal, notesTotal, float }) {
  const coins = round2(coinsTotal);
  const notes = round2(notesTotal);
  const short = round2(Number(float || 0) - coins);
  // In whole cents so halfway ($2.50, $7.50 …) is exact: + 250c then floor to 500c = round half up to $5
  const notesToLeave = short > 0 ? Math.floor((Math.round(short * 100) + 250) / 500) * 5 : 0;
  return {
    notesToLeave,
    floatLeft: round2(coins + notesToLeave),
    takings: round2(Math.max(0, notes - notesToLeave)),
    shortOfNotes: notes < notesToLeave,
    coinsCoverFloat: short <= 0,
  };
}

// "+$9.97 over" / "−$10.40 under" / "$0.00"
// Did a day balance against the Z report? (Banking → Month column + the day panel strip)
//   cash   = cash variance  (total counted − float, vs Z cash)
//   eftpos = EFTPOS variance (Closing + Right till + Left till, vs Z EFTPOS)
//   total  = cash + EFTPOS
//   Each is ok when |difference| <= limit (exactly at the limit is ok). A reason never turns red green.
// day: { status, source, z_cash, z_eftpos, counted_cash, float_amount, tenders: { [payment_type_id]: amount } }
// -> { state, cash: { z, counted, diff, ok }, eftpos: { z, entered, diff, ok }, total: { diff, ok } }
//   state: "balanced" | "out" (confirmed) · "unconfirmed" (open) · "nocheck" (no Z figures — imported days) ·
//          "none" (closed / missing / no day)
export function dayBalance(day, paymentTypes, limit) {
  if (!day || day.status === "closed" || day.status === "missing") return { state: "none" };
  const has = (v) => v !== null && v !== undefined && v !== "";
  const lim = Number(limit);
  const within = (d) => (d === null ? null : Math.abs(round2(d)) <= lim);
  const tenders = day.tenders || {};
  const counted = has(day.counted_cash) ? cashTakings(day.counted_cash, day.float_amount) : null;
  const cashDiff = has(day.z_cash) && counted !== null ? cashVariance(counted, day.z_cash) : null;
  const eftDiff = has(day.z_eftpos) ? eftposVariance(tenders, paymentTypes, day.z_eftpos) : null;
  const totDiff = cashDiff !== null && eftDiff !== null ? round2(cashDiff + eftDiff) : null;
  const out = {
    cash: { z: has(day.z_cash) ? Number(day.z_cash) : null, counted, diff: cashDiff, ok: within(cashDiff) },
    eftpos: { z: has(day.z_eftpos) ? Number(day.z_eftpos) : null, entered: eftposTotal(tenders, paymentTypes), diff: eftDiff, ok: within(eftDiff) },
    total: { diff: totDiff, ok: within(totDiff) },
  };
  if (day.status === "open") return { state: "unconfirmed", ...out };
  if (cashDiff === null || eftDiff === null) return { state: "nocheck", ...out };
  return { state: out.cash.ok && out.eftpos.ok && out.total.ok ? "balanced" : "out", ...out };
}
// "+6.00" / "−10.40" / "0.00" (the month table) and "Over $1.53" / "Under $10.40" / "$0.00" (the day panel)
export const fmtDiffShort = (v) => { const x = round2(v); return x === 0 ? "0.00" : `${x > 0 ? "+" : "−"}${Math.abs(x).toFixed(2)}`; };
export const fmtOverUnder = (v) => { const x = round2(v); return x === 0 ? "$0.00" : `${x > 0 ? "Over" : "Under"} $${Math.abs(x).toFixed(2)}`; };

export const fmtVariance = (v) => {
  const x = round2(v);
  if (x === 0) return "$0.00";
  return `${x > 0 ? "+" : "−"}$${Math.abs(x).toFixed(2)} ${x > 0 ? "over" : "under"}`;
};
