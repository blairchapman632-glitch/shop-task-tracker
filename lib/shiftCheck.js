// Shift-time safeguards — one check used everywhere a shift's start / finish is entered (roster, /me, wages, Admin
// locums + regular schedule), on the roster Issues panel and on the wages pages. Flagging only: wage maths
// (lib/wageCalc.js) is untouched.
// Limits are config (pharmacy_settings, Admin → Settings → Shift safeguards):
//   max_shift_hours (12)  long_shift_mode 'block' | 'warn'  shift_earliest_time (07:00)  shift_latest_time (19:00)
// validateShift({ start, end, settings }) -> { errors, warnings, suggestion }
//   finish at or before start   ERROR (never treated as an overnight shift) + an AM/PM-flipped suggestion if one
//                               gives a valid shift inside the normal-hours window, e.g. start 8:30pm -> 8:30am
//   longer than max_shift_hours ERROR in 'block' mode, WARNING in 'warn' mode ("This shift is 14.5 hrs (limit 12).")
//   starts before earliest / finishes after latest   WARNING "Outside normal hours (7:00am–7:00pm)."
// Length = raw start -> finish (before the lunch deduction).
import { useEffect, useState } from "react";

export const SHIFT_SETTINGS_DEFAULTS = { max_shift_hours: 12, long_shift_mode: "block", shift_earliest_time: "07:00", shift_latest_time: "19:00" };

export async function loadShiftSettings(supabase, pharmacyId) {
  const { data } = await supabase.from("pharmacy_settings")
    .select("max_shift_hours, long_shift_mode, shift_earliest_time, shift_latest_time").eq("pharmacy_id", pharmacyId).maybeSingle();
  return { ...SHIFT_SETTINGS_DEFAULTS, ...Object.fromEntries(Object.entries(data || {}).filter(([, v]) => v !== null && v !== undefined)) };
}
// The same, as a hook — loaded once per page load and shared by every form that uses it
let cachedSettings = null;
export function useShiftSettings(supabase, pharmacyId) {
  const [settings, setSettings] = useState(cachedSettings || SHIFT_SETTINGS_DEFAULTS);
  useEffect(() => {
    if (!pharmacyId) return;
    if (cachedSettings) { setSettings(cachedSettings); return; }
    loadShiftSettings(supabase, pharmacyId).then((v) => { cachedSettings = v; setSettings(v); }).catch(() => {});
  }, [supabase, pharmacyId]);
  return settings;
}

// The finish the wages use: rostered finish + the shift_edits adjustment (minutes; − = left early).
// (Wage maths in lib/wageCalc.js works from rostered start → finish + adjust_minutes.)
export const effectiveEnd = (end, adjustMinutes) => {
  const e = toMin(end);
  if (e === null || !Number(adjustMinutes)) return end;
  return toHHMM(Math.max(0, Math.min(24 * 60, e + Number(adjustMinutes))));
};

const toMin = (t) => {
  if (!t) return null;
  const [h, m] = String(t).split(":").map(Number);
  return Number.isFinite(h) ? h * 60 + (m || 0) : null;
};
const toHHMM = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
// "08:30" -> "8:30am", "19:00" -> "7:00pm"
export const fmt12 = (t) => {
  const m = toMin(t);
  if (m === null) return "";
  const h = Math.floor(m / 60) % 24;
  return `${h % 12 || 12}:${String(m % 60).padStart(2, "0")}${h >= 12 ? "pm" : "am"}`;
};
const hrs = (min) => { const h = Math.round((min / 60) * 100) / 100; return Number.isInteger(h) ? String(h) : String(h); };

export function validateShift({ start, end, settings }) {
  const cfg = { ...SHIFT_SETTINGS_DEFAULTS, ...(settings || {}) };
  const errors = [];
  const warnings = [];
  let suggestion = null;
  const s = toMin(start);
  const e = toMin(end);
  if (s === null || e === null) return { errors, warnings, suggestion };
  const max = Number(cfg.max_shift_hours) || 12;
  const early = toMin(cfg.shift_earliest_time) ?? 0;
  const late = toMin(cfg.shift_latest_time) ?? 24 * 60;
  // A flipped suggestion must be a sensible shift: inside normal hours, within the limit, and at least 2 hrs
  const fits = (a, b) => b - a >= 120 && b - a <= max * 60 && a >= early && b <= late;

  if (e <= s) {
    errors.push("Finish is before start.");
  } else {
    const len = e - s;
    if (len > max * 60) {
      const msg = `This shift is ${hrs(len)} hrs (limit ${hrs(max * 60)}).`;
      if (cfg.long_shift_mode === "warn") warnings.push(msg); else errors.push(msg);
    }
    if (s < early || e > late) warnings.push(`Outside normal hours (${fmt12(cfg.shift_earliest_time)}–${fmt12(cfg.shift_latest_time)}).`);
  }

  // Something's wrong: is it the AM/PM flipped on one end? Try the start first if it's outside normal hours.
  if (errors.length || warnings.length) {
    const flip = (m) => (m >= 12 * 60 ? m - 12 * 60 : m + 12 * 60);
    const tries = (s < early || s > late ? ["start", "end"] : ["end", "start"]);
    for (const field of tries) {
      const ns = field === "start" ? flip(s) : s;
      const ne = field === "end" ? flip(e) : e;
      if (ns >= 0 && ne <= 24 * 60 && fits(ns, ne)) {
        const value = toHHMM(field === "start" ? ns : ne);
        suggestion = { field, value, label: `Use ${fmt12(value)} instead` };
        break;
      }
    }
  }
  return { errors, warnings, suggestion };
}

export const shiftHasProblem = (r) => !!r && (r.errors.length > 0 || r.warnings.length > 0);
// One line for lists (Issues panel, wages flags): "20.5 hrs, finish before start" / "This shift is 14.5 hrs (limit 12)"
// (a finish before start shows the hours it would wrongly come to as an overnight shift)
export function shiftProblemText(start, end, r) {
  const s = toMin(start);
  const e = toMin(end);
  const parts = [...r.errors, ...r.warnings].map((m) => m.replace(/\.$/, ""));
  if (s !== null && e !== null && e <= s) {
    return [`${hrs(e - s + 24 * 60)} hrs, finish before start`, ...parts.filter((p) => p !== "Finish is before start")].join("; ");
  }
  return parts.join("; ");
}

// Save gate for a form: errors block; warnings need a second click ("Save anyway") with the same times.
//   const chk = useShiftCheck(settings);  if (!chk.gate(start, end)) return;  … <ShiftCheckNotice check={chk} onUse=…/>
export function useShiftCheck(settings) {
  const [shown, setShown] = useState(null); // { errors, warnings, suggestion, key }
  const [ack, setAck] = useState(null);
  const gate = (start, end) => {
    const r = validateShift({ start, end, settings });
    const key = `${start}|${end}`;
    if (r.errors.length) { setShown({ ...r, key }); setAck(null); return false; }
    if (r.warnings.length && ack !== key) { setShown({ ...r, key }); setAck(key); return false; }
    setShown(null);
    setAck(null);
    return true;
  };
  const reset = () => { setShown(null); setAck(null); };
  const warnOnly = !!shown && !shown.errors.length && shown.warnings.length > 0;
  return { gate, reset, shown, warnOnly, saveLabel: (label = "Save") => (warnOnly ? "Save anyway" : label) };
}

// The inline message under a form's times: red for errors, amber for warnings, plus the one-tap suggestion
export function ShiftCheckNotice({ check, onUse, className = "" }) {
  const r = check?.shown || check;
  if (!r || (!r.errors?.length && !r.warnings?.length)) return null;
  const isError = r.errors.length > 0;
  return (
    <div className={`rounded-lg border px-3 py-2 text-xs space-y-1 ${isError ? "bg-red-50 border-red-200 text-red-700" : "bg-amber-50 border-amber-200 text-amber-800"} ${className}`}>
      {[...r.errors, ...r.warnings].map((m) => <div key={m}>{m}</div>)}
      {!isError && <div className="font-medium">Check the times, then press Save again to save anyway.</div>}
      {r.suggestion && onUse && (
        <button type="button" onClick={() => onUse(r.suggestion.field, r.suggestion.value)}
          className="mt-0.5 px-2.5 py-1 rounded-md bg-white border border-current font-semibold">
          {r.suggestion.label}
        </button>
      )}
    </div>
  );
}
