import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import supabase from "../lib/supabaseClient";

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";



const FORTNIGHT_THRESHOLD = 76;

// ─── Helpers ────────────────────────────────────────────────────────────────

const toISO = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};

const shiftHours = (start, end) => {
  if (!start || !end) return 0;
  const [sh, sm] = String(start).split(":").map(Number);
  const [eh, em] = String(end).split(":").map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60; // overnight safety
  return mins / 60;
};

const dayCategory = (dateStr, holidaySet) => {
  if (holidaySet.has(dateStr)) return "ph";
  const dow = new Date(dateStr + "T00:00:00").getDay(); // 0 = Sun, 6 = Sat
  if (dow === 6) return "sat";
  if (dow === 0) return "sun";
  return "weekday";
};

// Map a date to the schedule day key
const DOW_KEY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const dayKey = (dateStr) => DOW_KEY[new Date(dateStr + "T00:00:00").getDay()];

// Which half of the pay period a date falls in: "a" (first 7 days) or "b" (second 7 days)
const abForDate = (dateStr, periodStart) => {
  const d = new Date(dateStr + "T00:00:00");
  const ps = new Date(periodStart);
  ps.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((d.getTime() - ps.getTime()) / 86400000);
  return diffDays < 7 ? "a" : "b";
};

// Get a permanent staff member's scheduled hours for a given date (0 if not scheduled)
const scheduledHoursForDate = (staffMember, dateStr, periodStart) => {
  if (!staffMember || staffMember.employment_type !== "Permanent") return 0;
  const key = dayKey(dateStr);
  let day = null;
  if (staffMember.schedule_type === "alternating") {
    const ab = abForDate(dateStr, periodStart);
    day = staffMember.week_ab_schedule?.[ab]?.[key];
  } else {
    day = staffMember.weekly_schedule?.[key];
  }
  if (!day || !day.active || !day.start || !day.end) return 0;
  return shiftHours(day.start, day.end);
};

const fmt = (n) => (n === 0 ? "—" : n.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1"));

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function Sidebar() {
  return (
    <aside className="w-[200px] min-w-[200px] h-screen bg-white border-r flex flex-col py-4 px-3 gap-1 shrink-0">
      <div className="text-sm font-bold text-gray-800 px-2 mb-3 leading-tight">Byford Pharmacy</div>
      <Link href="/" className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-gray-700 hover:bg-gray-100"><span>🏠</span> Home</Link>
      <Link href="/roster" className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-gray-700 hover:bg-gray-100"><span>📅</span> Roster</Link>
      <Link href="/insights" className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-gray-700 hover:bg-gray-100"><span>📊</span> Insights</Link>
      <Link href="/tasks" className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-gray-700 hover:bg-gray-100"><span>✅</span> Tasks</Link>
      <Link href="/wages" className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm bg-gray-100 font-semibold text-gray-900"><span>💰</span> Wages</Link>
      <Link href="/admin" className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-gray-700 hover:bg-gray-100"><span>⚙️</span> Admin</Link>
    </aside>
  );
}

// ─── PIN Screen ───────────────────────────────────────────────────────────────

function PinScreen({ onUnlock }) {
  const [staffList, setStaffList] = useState([]);
  const [step, setStep] = useState("select"); // select → pin
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    supabase.from("staff")
      .select("id, name, photo_url, can_access_wages")
      .eq("pharmacy_id", PHARMACY_ID)
      .eq("active", true)
      .neq("role", "Locum")
      .order("name")
      .then(({ data }) => setStaffList(data || []));
  }, []);

  const handleSelect = (s) => {
    setSelectedStaff(s);
    setPin("");
    setError("");
    setStep("pin");
  };

  const handleSubmit = async () => {
    if (pin.length !== 4) { setError("Enter your 4-digit PIN."); return; }
    setChecking(true);
    setError("");
    const { data, error: err } = await supabase
      .from("staff")
      .select("id, name, can_access_wages")
      .eq("id", selectedStaff.id)
      .eq("pin", pin)
      .maybeSingle();
    setChecking(false);
    if (err || !data) {
      setError("Incorrect PIN.");
      setPin("");
    } else {
      onUnlock(data);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-gray-100">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-2xl mb-1">💰</div>
          <h1 className="text-lg font-bold text-gray-800 mb-1">Wages</h1>
          <p className="text-sm text-gray-500">
            {step === "select" ? "Select your name" : "Enter your PIN"}
          </p>
        </div>

        {step === "select" ? (
          <div className="space-y-1 max-h-[60vh] overflow-y-auto">
            {staffList.map((s) => (
              <button key={s.id} onClick={() => handleSelect(s)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 text-left border border-transparent hover:border-gray-200">
                <img src={s.photo_url || "/placeholder.png"} alt={s.name} className="w-10 h-10 rounded-full object-cover" />
                <span className="text-sm font-medium text-gray-800">{s.name}</span>
              </button>
            ))}
            {staffList.length === 0 && <div className="text-sm text-gray-400 text-center">Loading staff…</div>}
          </div>
        ) : (
          <div className="text-center">
            <img src={selectedStaff.photo_url || "/placeholder.png"} alt={selectedStaff.name} className="w-14 h-14 rounded-full object-cover mx-auto mb-2" />
            <div className="font-medium text-gray-800 mb-4">{selectedStaff.name}</div>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder="••••"
              autoFocus
              className="w-full border rounded-lg px-4 py-3 text-center text-2xl tracking-widest mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => { setStep("select"); setSelectedStaff(null); }} className="flex-1 border border-gray-300 rounded-lg py-2.5 text-sm text-gray-600 hover:bg-gray-50">Back</button>
              <button onClick={handleSubmit} disabled={pin.length !== 4 || checking} className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-40">
                {checking ? "Checking…" : "Continue"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Approve Modal ──────────────────────────────────────────────────────────

function ApproveModal({ row, periodStart, currentUser, isManager, onClose, onApproved }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleApprove = async () => {
    setError("");
    if (pin.length !== 4) { setError("Enter the 4-digit PIN."); return; }
    setSaving(true);

    // First check: does the PIN belong to this staff member (self-approval)?
    const { data: selfMatch } = await supabase
      .from("staff").select("id").eq("id", row.staffId).eq("pin", pin).maybeSingle();

    let approvedBy = null;
    if (selfMatch) {
      approvedBy = row.staffId; // self-approved
    } else if (isManager) {
      // Manager override: PIN must belong to a staff member with wages access
      const { data: mgrMatch } = await supabase
        .from("staff").select("id").eq("pin", pin).eq("can_access_wages", true).eq("pharmacy_id", PHARMACY_ID).maybeSingle();
      if (mgrMatch) approvedBy = mgrMatch.id; // manager-approved on their behalf
    }

    if (!approvedBy) {
      setSaving(false);
      setError(isManager ? "PIN doesn't match this staff member or a manager." : "Incorrect PIN.");
      return;
    }

    const { error: insErr } = await supabase.from("wage_approvals").upsert(
      { staff_id: row.staffId, period_start: periodStart, approved_at: new Date().toISOString(), approved_by_staff_id: approvedBy, pharmacy_id: PHARMACY_ID },
      { onConflict: "staff_id,period_start" }
    );
    setSaving(false);
    if (insErr) { setError(insErr.message); return; }
    onApproved(row.staffId);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="font-semibold text-gray-800 mb-1">Approve timesheet</h2>
        <p className="text-sm text-gray-500 mb-4">
          {row.name} — {fmt(row.total)} hrs this fortnight.{" "}
          {isManager ? `${row.name}'s PIN, or a manager PIN to approve on their behalf.` : "Enter your PIN to approve."}
        </p>
        <input
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setError(""); }}
          onKeyDown={(e) => e.key === "Enter" && handleApprove()}
          placeholder="••••"
          className="w-full border rounded-lg px-4 py-3 text-center text-2xl tracking-widest mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
          autoFocus
        />
        {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={handleApprove} disabled={saving} className="flex-1 bg-green-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-40">
            {saving ? "Approving…" : "Approve"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Shift Modal ─────────────────────────────────────────────────────────

function EditShiftModal({ shift, currentUser, isManager, onClose, onSaved }) {
  const [noLunch, setNoLunch] = useState(shift.edit?.no_lunch || false);
  const [adjustMins, setAdjustMins] = useState(shift.edit?.adjust_minutes ? String(shift.edit.adjust_minutes) : "");
  const [reason, setReason] = useState(shift.edit?.reason || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const rosteredStart = String(shift.start).slice(0, 5);
  const rosteredEnd = String(shift.end).slice(0, 5);
  const adjNum = Number(adjustMins) || 0;
  const timesChanged = adjNum !== 0;
  const anyChange = noLunch || timesChanged;

  const handleSave = async () => {
    setError("");
    if (!anyChange) { setError("Tick 'no lunch' or change a time to make an edit."); return; }
    if (timesChanged && !reason.trim()) { setError("A reason is required when changing times."); return; }

    setSaving(true);
    const payload = {
      roster_shift_id: shift.id,
      adjust_minutes: adjNum,
      no_lunch: noLunch,
      reason: reason.trim(),
      edited_by_staff_id: currentUser.id,
      edited_at: new Date().toISOString(),
      pharmacy_id: PHARMACY_ID,
    };
    const { error: upErr } = await supabase.from("shift_edits").upsert(payload, { onConflict: "roster_shift_id" });
    setSaving(false);
    if (upErr) { setError(upErr.message); return; }
    onSaved();
  };

  const handleRemove = async () => {
    if (!shift.edit) { onClose(); return; }
    if (!window.confirm("Remove this edit and revert to rostered hours?")) return;
    setSaving(true);
    const { error: delErr } = await supabase.from("shift_edits").delete().eq("roster_shift_id", shift.id);
    setSaving(false);
    if (delErr) { setError(delErr.message); return; }
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="font-semibold text-gray-800 mb-1">Edit shift</h2>
        <p className="text-sm text-gray-500 mb-4">
          {new Date(shift.date + "T00:00:00").toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "short" })} · rostered {rosteredStart}–{rosteredEnd}
        </p>

        {!shift.neverDeductsLunch && (
          <label className="flex items-center gap-2 text-sm mb-4 cursor-pointer">
            <input type="checkbox" checked={noLunch} onChange={(e) => setNoLunch(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
            <span className="text-gray-700">No lunch break taken (adds 30 min back)</span>
          </label>
        )}

        <div className="text-xs font-medium text-gray-600 mb-1">Adjust time (optional)</div>
        <div className="flex items-center gap-2 mb-1">
          <input
            type="number"
            step="5"
            value={adjustMins}
            onChange={(e) => setAdjustMins(e.target.value)}
            placeholder="0"
            className="w-28 border rounded-lg px-3 py-1.5 text-sm"
          />
          <span className="text-sm text-gray-500">minutes</span>
        </div>
        <p className="text-[11px] text-gray-400 mb-4">e.g. <span className="font-medium">30</span> if stayed late, <span className="font-medium">−30</span> if left early.</p>

        <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">
          ⓘ Any edits are reviewed by management before pay is finalised.
        </div>

        <div className="text-xs font-medium text-gray-600 mb-1">Reason {timesChanged ? "*" : "(optional)"}</div>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="e.g. stayed back to finish DAA packing" className="w-full border rounded-lg px-3 py-2 text-sm resize-none mb-4" />

        {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          {shift.edit && <button onClick={handleRemove} disabled={saving} className="px-3 border border-red-200 text-red-600 rounded-lg py-2 text-sm hover:bg-red-50">Remove</button>}
          <button onClick={handleSave} disabled={saving} className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-40">
            {saving ? "Saving…" : "Save edit"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function WagesPage() {
  const router = useRouter();
  const [unlocked, setUnlocked] = useState(false);
  const [currentUser, setCurrentUser] = useState(null); // { id, name, can_access_wages }

  const [loading, setLoading] = useState(true);
  const [payrollStart, setPayrollStart] = useState(null);
  const [periodOffset, setPeriodOffset] = useState(0); // 0 = current, -1 = prev, +1 = next
  const [staff, setStaff] = useState([]);
  const [rows, setRows] = useState([]);
  const [approvals, setApprovals] = useState(new Set());
  const [approveRow, setApproveRow] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [expandedKey, setExpandedKey] = useState(null);
  const [editShift, setEditShift] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Load payroll start once unlocked
  useEffect(() => {
    if (!unlocked) return;
    const load = async () => {
      const { data } = await supabase.from("pharmacy_settings").select("payroll_start_date").eq("pharmacy_id", PHARMACY_ID).single();
      setPayrollStart(data?.payroll_start_date || null);
    };
    load();
  }, [unlocked]);

  // Compute current period start based on payrollStart + offset
  const getPeriod = () => {
    if (!payrollStart) return null;
    const start = new Date(payrollStart + "T00:00:00");
    const today = new Date();
    // find the period containing today
    let cur = new Date(start);
    while (cur.getTime() + 14 * 86400000 <= today.getTime()) {
      cur.setDate(cur.getDate() + 14);
    }
    cur.setDate(cur.getDate() + periodOffset * 14);
    const end = new Date(cur);
    end.setDate(end.getDate() + 13);
    return { start: cur, end };
  };

  const period = payrollStart ? getPeriod() : null;

  // Load shifts + staff + holidays + approvals for the period
  useEffect(() => {
    if (!unlocked || !period) return;
    const load = async () => {
      setLoading(true);
      const startISO = toISO(period.start);
      const endISO = toISO(period.end);

      const [{ data: shifts }, { data: staffData }, { data: holidays }, { data: appr }, { data: leaveData }] = await Promise.all([
        supabase.from("roster_shifts").select("id, shift_date, start_time, end_time, role, staff_id, staff_name").gte("shift_date", startISO).lte("shift_date", endISO),
        supabase.from("staff").select("id, name, role, employment_type, contracted_hours, active, schedule_type, weekly_schedule, week_ab_schedule, no_lunch_deduction").eq("pharmacy_id", PHARMACY_ID),
        supabase.from("public_holidays").select("date, name").eq("pharmacy_id", PHARMACY_ID).gte("date", startISO).lte("date", endISO),
        supabase.from("wage_approvals").select("staff_id").eq("pharmacy_id", PHARMACY_ID).eq("period_start", startISO),
        // Approved leave overlapping this pay period
        supabase.from("leave_requests").select("*").eq("status", "approved").lte("from_date", endISO).gte("to_date", startISO),
      ]);

      // Load edits for these shifts
      const shiftIds = (shifts || []).map((s) => s.id);
      let editsByShift = {};
      let sickByShift = {};
      if (shiftIds.length) {
        const [{ data: editData }, { data: sickData }] = await Promise.all([
          supabase.from("shift_edits").select("*").in("roster_shift_id", shiftIds),
          supabase.from("sick_days").select("roster_shift_id").in("roster_shift_id", shiftIds),
        ]);
        editsByShift = Object.fromEntries((editData || []).map((e) => [e.roster_shift_id, e]));
        sickByShift = Object.fromEntries((sickData || []).map((s) => [s.roster_shift_id, true]));
      }

      setStaff(staffData || []);
      setApprovals(new Set((appr || []).map((a) => a.staff_id)));

      const holidaySet = new Set((holidays || []).map((h) => h.date));
      const staffById = Object.fromEntries((staffData || []).map((s) => [s.id, s]));

      // Group shifts by staff (or casual name)
      const grouped = {};
      for (const sh of shifts || []) {
        const key = sh.staff_id ? `s_${sh.staff_id}` : `c_${sh.staff_name || "Unknown"}`;
        const role = sh.staff_id ? (staffById[sh.staff_id]?.role || sh.role) : sh.role;
        const name = sh.staff_id ? (staffById[sh.staff_id]?.name || sh.staff_name || "?") : (sh.staff_name || "Casual");
        if (!grouped[key]) {
          grouped[key] = { key, staffId: sh.staff_id || null, name, role, weekday: 0, sat: 0, sun: 0, ph: 0, shifts: [] };
        }
        const edit = editsByShift[sh.id] || null;
        const isSick = !!sickByShift[sh.id];
        const isPermanent = sh.staff_id ? (staffById[sh.staff_id]?.employment_type === "Permanent") : false;
        const staffNoLunch = sh.staff_id ? (staffById[sh.staff_id]?.no_lunch_deduction === true) : false;
        const rosteredHrs = shiftHours(sh.start_time, sh.end_time);
        const adjustMins = edit?.adjust_minutes || 0;
        let hrs = rosteredHrs + adjustMins / 60;
        // Lunch deducted for any shift over 5 hrs, unless "no lunch" ticked OR staff never deducts lunch
        const breakApplies = hrs > 5 && !(edit?.no_lunch) && !staffNoLunch;
        if (breakApplies) hrs -= 0.5;
        const cat = dayCategory(sh.shift_date, holidaySet);

        if (isSick) {
          // Permanent → hours go to Sick column. Casual → unpaid (zero). Either way not in worked categories.
          if (isPermanent) {
            grouped[key].sick = (grouped[key].sick || 0) + hrs;
          }
          grouped[key].shifts.push({
            id: sh.id, date: sh.shift_date, start: sh.start_time, end: sh.end_time,
            cat: "sick", rosteredHrs, adjustMins,
            paidHrs: isPermanent ? hrs : 0,
            breakDeducted: breakApplies, edit, isSick, paidSick: isPermanent,
          });
        } else {
          grouped[key][cat] += hrs;
          grouped[key].shifts.push({
            id: sh.id, date: sh.shift_date, start: sh.start_time, end: sh.end_time,
            cat, rosteredHrs, adjustMins, paidHrs: hrs,
            breakDeducted: breakApplies, edit,
          });
        }
      }

      // Public holiday pay for permanent staff (closed days have no shifts, so pull from schedule)
      const holidayDates = (holidays || []).map((h) => h.date);
      for (const st of staffData || []) {
        if (st.employment_type !== "Permanent" || st.active === false) continue;
        for (const hDate of holidayDates) {
          // Skip if an actual shift exists for this staff member on the holiday (already counted as PH)
          const hasShift = (shifts || []).some((sh) => sh.staff_id === st.id && sh.shift_date === hDate);
          if (hasShift) continue;
          let phHrs = scheduledHoursForDate(st, hDate, period.start);
          if (phHrs <= 0) continue;
          // Lunch deducted for scheduled day over 5 hrs, unless staff never deducts lunch
          if (phHrs > 5 && st.no_lunch_deduction !== true) phHrs -= 0.5;
          const key = `s_${st.id}`;
          if (!grouped[key]) {
            grouped[key] = { key, staffId: st.id, name: st.name, role: st.role, weekday: 0, sat: 0, sun: 0, ph: 0, shifts: [] };
          }
          grouped[key].ph += phHrs;
          grouped[key].shifts.push({
            id: `ph_${st.id}_${hDate}`,
            date: hDate,
            start: null,
            end: null,
            cat: "ph",
            rosteredHrs: phHrs,
            adjustMins: 0,
            paidHrs: phHrs,
            breakDeducted: false,
            edit: null,
            isPublicHoliday: true,
          });
        }
      }
// ── Approved leave → paid leave hours ──
      // Annual Leave → annual column; Personal/Carer's → sick column; Unpaid → skip
      const startD = new Date(startISO + "T00:00:00");
      const endD = new Date(endISO + "T00:00:00");
      for (const lr of leaveData || []) {
        if (lr.leave_type === "Unpaid Leave") continue;
        const st = staffById[lr.staff_id];
        if (!st || st.active === false) continue;
        if (st.employment_type === "Casual") continue; // casuals don't accrue paid leave
        if (st.employment_type === "Salary") continue;  // salary is fixed; leave doesn't change pay

        const key = `s_${lr.staff_id}`;
        if (!grouped[key]) {
          grouped[key] = { key, staffId: lr.staff_id, name: st.name, role: st.role, weekday: 0, sat: 0, sun: 0, ph: 0, shifts: [] };
        }

        // Walk each date in the leave range that falls within the pay period
        const lrStart = new Date(lr.from_date + "T00:00:00");
        const lrEnd = new Date(lr.to_date + "T00:00:00");
        const cur = new Date(Math.max(lrStart, startD));
        const last = new Date(Math.min(lrEnd, endD));
        while (cur <= last) {
          const dateStr = toISO(cur);
          // Don't double-pay if there's a worked shift or PH already that day
          const hasShift = (shifts || []).some((sh) => sh.staff_id === lr.staff_id && sh.shift_date === dateStr);
          if (!hasShift) {
            let hrs;
            if (!lr.all_day && lr.start_time && lr.end_time && lr.from_date === lr.to_date) {
              hrs = shiftHours(lr.start_time, lr.end_time);
            } else {
              hrs = scheduledHoursForDate(st, dateStr, period.start);
            }
            if (hrs > 0) {
              const col = lr.leave_type === "Annual Leave" ? "annual" : "sick";
              grouped[key][col] = (grouped[key][col] || 0) + hrs;
              grouped[key].shifts.push({
                id: `leave_${lr.id}_${dateStr}`,
                date: dateStr,
                start: null,
                end: null,
                cat: "leave",
                leaveType: lr.leave_type,
                rosteredHrs: hrs,
                adjustMins: 0,
                paidHrs: hrs,
                breakDeducted: false,
                edit: null,
                isLeave: true,
              });
            }
          }
          cur.setDate(cur.getDate() + 1);
        }
      }

    
      // Compute OT (over threshold), pulled from weekday → sat → sun
      const built = Object.values(grouped).map((g) => {
        const st = g.staffId ? staffById[g.staffId] : null;
        const isSalary = st?.employment_type === "Salary";
        if (isSalary) {
          const salaryHrs = Number(st?.contracted_hours) || 0;
          return { ...g, weekday: 0, sat: 0, sun: 0, ph: 0, ot: 0, sick: 0, annual: 0, total: salaryHrs, isSalary: true };
        }
        const sick = g.sick || 0;
        const annual = g.annual || 0;
        // OT threshold based on worked hours only (sick/leave excluded)
        const worked = g.weekday + g.sat + g.sun + g.ph;
        let ot = Math.max(0, worked - FORTNIGHT_THRESHOLD);
        let weekday = g.weekday, sat = g.sat, sun = g.sun;
        let remaining = ot;
        const pull = (val) => { const take = Math.min(val, remaining); remaining -= take; return val - take; };
        weekday = pull(weekday);
        sat = pull(sat);
        sun = pull(sun);
        const total = worked + sick + annual;
        return { ...g, weekday, sat, sun, ph: g.ph, ot, total, sick, annual, isSalary: false };
      });

      // Ensure all active salary staff appear, even with no shifts this period
      const presentStaffIds = new Set(built.filter((r) => r.staffId).map((r) => r.staffId));
      for (const st of staffData || []) {
        if (st.employment_type === "Salary" && st.active !== false && !presentStaffIds.has(st.id)) {
          built.push({
            key: `s_${st.id}`,
            staffId: st.id,
            name: st.name,
            role: st.role,
            weekday: 0, sat: 0, sun: 0, ph: 0, ot: 0, sick: 0, annual: 0,
            total: Number(st.contracted_hours) || 0,
            shifts: [],
            isSalary: true,
          });
        }
      }

      built.sort((a, b) => a.name.localeCompare(b.name));
      setRows(built);
      setLoading(false);
    };
    load();
  }, [unlocked, payrollStart, periodOffset, reloadKey]);

  const handleApproved = (staffId) => {
    setApprovals((prev) => new Set(prev).add(staffId));
    setApproveRow(null);
  };

  const handleEditSaved = () => { setEditShift(null); setReloadKey((k) => k + 1); };

  const allApproved = rows.filter((r) => r.staffId && !r.isSalary).every((r) => approvals.has(r.staffId));

  const handleExport = async () => {
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const startISO = toISO(period.start);
      const endISO = toISO(period.end);
      const data = rows.map((r) => ({
        Name: r.name,
        "Weekday hrs": Number(r.weekday.toFixed(2)),
        "Saturday hrs": Number(r.sat.toFixed(2)),
        "Sunday hrs": Number(r.sun.toFixed(2)),
        "PH hrs": Number(r.ph.toFixed(2)),
        "Sick hrs": Number(r.sick.toFixed(2)),
        "Annual Leave hrs": Number(r.annual.toFixed(2)),
        "OT hrs": Number(r.ot.toFixed(2)),
        "Total hrs": Number(r.total.toFixed(2)),
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Wages");
      XLSX.writeFile(wb, `wages_${startISO}_to_${endISO}.xlsx`);
    } catch (err) {
      alert("Export failed: " + (err?.message || String(err)));
    } finally {
      setExporting(false);
    }
  };

  if (!unlocked) return <PinScreen onUnlock={(user) => { setCurrentUser(user); setUnlocked(true); }} />;

  const isManager = currentUser?.can_access_wages === true;

  // Personal view — staff without wages access see only their own row
  const visibleRows = isManager ? rows : rows.filter((r) => r.staffId === currentUser?.id);

  const periodLabel = period
    ? `${period.start.toLocaleDateString("en-AU", { day: "numeric", month: "short" })} – ${period.end.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`
    : "—";

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-white border-b px-6 py-4 shrink-0">
          <h1 className="text-xl font-bold text-gray-800 mb-3">Wages</h1>

          {!payrollStart ? (
            <div className="text-sm text-amber-600">No payroll start date set. Set it in Admin → Settings → Payroll first.</div>
          ) : (
            <div className="flex items-center gap-3">
              <button onClick={() => setPeriodOffset((o) => o - 1)} className="px-2 py-1 rounded border text-sm hover:bg-gray-50">←</button>
              <div className="text-sm font-medium text-gray-700">{periodLabel}{periodOffset === 0 && <span className="ml-2 text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">Current</span>}</div>
              <button onClick={() => setPeriodOffset((o) => o + 1)} className="px-2 py-1 rounded border text-sm hover:bg-gray-50">→</button>

              {isManager && (
                <div className="ml-auto flex items-center gap-2">
                  {!allApproved && rows.some((r) => r.staffId) && (
                    <span className="text-xs text-amber-600">Some timesheets not yet approved</span>
                  )}
                  <button
                    onClick={handleExport}
                    disabled={exporting || rows.length === 0}
                    className="px-4 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-40"
                  >
                    {exporting ? "Exporting…" : "Export Excel"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {loading ? (
            <div className="text-sm text-gray-400 py-8 text-center">Loading…</div>
          ) : visibleRows.length === 0 ? (
            <div className="text-sm text-gray-400 py-8 text-center">No shifts in this pay period.</div>
          ) : (
            <div className="bg-white rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Staff</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Weekday</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Sat</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">Sun</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase">PH</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-400 uppercase">Sick</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-400 uppercase">Annual</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-orange-500 uppercase">OT</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700 uppercase">Total</th>
                    <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Approval</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r) => {
                    const approved = r.staffId && approvals.has(r.staffId);
                    const expanded = !r.isSalary && (!isManager || expandedKey === r.key);
                    const dayLabel = { weekday: "Weekday", sat: "Saturday", sun: "Sunday", ph: "Public Holiday" };
                    return (
                      <React.Fragment key={r.key}>
                      <tr className={`border-t border-gray-100 hover:bg-gray-50 ${isManager && !r.isSalary ? "cursor-pointer" : ""}`} onClick={() => { if (isManager && !r.isSalary) setExpandedKey(expandedKey === r.key ? null : r.key); }}>
                        <td className="px-3 py-2 font-medium text-gray-800">
                          {isManager && !r.isSalary && <span className="inline-block w-4 text-gray-400">{expandedKey === r.key ? "▾" : "▸"}</span>}
                          {isManager && r.isSalary && <span className="inline-block w-4" />}
                          {r.name}
                          {!r.staffId && <span className="ml-1 text-[10px] text-gray-400">(casual)</span>}
                          {r.isSalary && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-600 border border-purple-100">Salary</span>}
                          {!r.isSalary && r.shifts.some((sh) => sh.edit) && <span className="ml-1 text-blue-600" title="Has edited shifts">✏️</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmt(r.weekday)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmt(r.sat)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmt(r.sun)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmt(r.ph)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-300">{fmt(r.sick)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-300">{fmt(r.annual)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-orange-600 font-medium">{fmt(r.ot)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-800">{fmt(r.total)}</td>
                        <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                          {!r.staffId || r.isSalary ? (
                            <span className="text-xs text-gray-300">—</span>
                          ) : approved ? (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">✓ Approved</span>
                          ) : (
                            <button onClick={() => setApproveRow(r)} className="text-xs px-2 py-0.5 rounded-full border border-blue-200 text-blue-600 hover:bg-blue-50">Approve</button>
                          )}
                        </td>
                      </tr>

                      {expanded && (
                        <tr className="bg-gray-50 border-t border-gray-100">
                          <td colSpan={10} className="px-6 py-3">
                            <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Shifts this period</div>
                            {r.shifts.length === 0 ? (
                              <div className="text-sm text-gray-400">No shifts.</div>
                            ) : (
                              <div className="space-y-1">
                                {[...r.shifts].sort((a, b) => a.date.localeCompare(b.date)).map((sh) => {
                                  const edited = !!sh.edit;
                                  const canEdit = r.staffId && !sh.isPublicHoliday && !sh.isSick && !sh.isLeave && (isManager || currentUser?.id === r.staffId);
                                  return (
                                  <div key={sh.id} className="flex items-center gap-3 text-sm">
                                    <span className="w-32 text-gray-700">{new Date(sh.date + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}</span>
                                    <span className="w-28 text-gray-600 tabular-nums">
                                      {sh.isPublicHoliday ? <span className="text-red-500 text-xs">Public holiday</span> : sh.isLeave ? <span className="text-blue-400 text-xs">All day</span> : <>{String(sh.start).slice(0,5)}–{String(sh.end).slice(0,5)}</>}
                                    </span>
                                    <span className="w-24 text-gray-400 text-xs">{sh.isLeave ? "Leave" : sh.isSick ? "Sick" : dayLabel[sh.cat]}</span>
                                    <span className="w-20 text-right tabular-nums font-medium text-gray-800">{sh.isSick && !sh.paidSick ? "—" : `${fmt(sh.paidHrs)} hrs`}</span>
                                    {sh.breakDeducted && !sh.isSick && !sh.isLeave && <span className="text-[10px] text-gray-400">(−30 min lunch)</span>}
                                    {sh.isPublicHoliday && <span className="text-[10px] text-red-400">(from schedule — closed)</span>}
                                    {sh.isSick && <span className="text-[10px] text-amber-600">🤒 sick{sh.paidSick ? " — paid" : " — unpaid (casual)"}</span>}
                                    {sh.isLeave && <span className="text-[10px] text-blue-500">🏖️ {sh.leaveType}</span>}
                                    {edited && (
                                      <span className="text-[10px] text-blue-600" title={sh.edit.reason || ""}>
                                        ✏️ edited{sh.edit.no_lunch ? " · no lunch" : ""}{sh.adjustMins ? ` · ${sh.adjustMins > 0 ? "+" : ""}${sh.adjustMins} min` : ""}{sh.edit.reason ? ` — ${sh.edit.reason}` : ""}
                                      </span>
                                    )}
                                    {canEdit && (
                                      <button onClick={(e) => { e.stopPropagation(); setEditShift({ ...sh, neverDeductsLunch: r.staffId ? (staff.find((st) => st.id === r.staffId)?.no_lunch_deduction === true) : false }); }} className="ml-auto text-[11px] text-blue-600 hover:underline">
                                        {edited ? "Edit" : "Adjust"}
                                      </button>
                                    )}
                                  </div>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {approveRow && (
        <ApproveModal
          row={approveRow}
          periodStart={toISO(period.start)}
          currentUser={currentUser}
          isManager={isManager}
          onClose={() => setApproveRow(null)}
          onApproved={handleApproved}
        />
      )}

      {editShift && (
        <EditShiftModal
          shift={editShift}
          currentUser={currentUser}
          isManager={isManager}
          onClose={() => setEditShift(null)}
          onSaved={handleEditSaved}
        />
      )}
    </div>
  );
}