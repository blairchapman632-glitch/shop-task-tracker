import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import supabase from "../lib/supabaseClient";
import {
  FORTNIGHT_THRESHOLD,
  toISO,
  shiftHours,
  dayCategory,
  scheduledHoursForDate,
  fmt,
  buildWageRows,
} from "../lib/wageCalc";

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";



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
        <h2 className="font-semibold text-gray-800 mb-1">Confirm your hours</h2>
        <p className="text-sm text-gray-500 mb-4">
          {row.name} — {fmt(row.total)} hrs this fortnight.{" "}
          {isManager ? `${row.name}'s PIN, or a manager PIN to confirm on their behalf.` : "Enter your PIN to confirm."}
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
            {saving ? "Confirming…" : "Confirm"}
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

// ─── Notes Block ──────────────────────────────────────────────────────────────

function NotesBlock({ row, note, isManager, isSelf, onSave }) {
  const [managerText, setManagerText] = useState(note?.manager_note || "");
  const [staffText, setStaffText] = useState(note?.staff_note || "");
  const [savingM, setSavingM] = useState(false);
  const [savingS, setSavingS] = useState(false);

  useEffect(() => {
    setManagerText(note?.manager_note || "");
    setStaffText(note?.staff_note || "");
  }, [note?.manager_note, note?.staff_note]);

  const hasStaffNote = !!(note?.staff_note && note.staff_note.trim());
  const reviewed = !!note?.manager_reviewed_at;

  const saveManager = async () => {
    setSavingM(true);
    await onSave(row.staffId, { manager_note: managerText.trim() || null });
    setSavingM(false);
  };

  const saveStaff = async () => {
    setSavingS(true);
    await onSave(row.staffId, { staff_note: staffText.trim() || null, manager_reviewed_at: null });
    setSavingS(false);
  };

  return (
    <div className="mt-3 pt-3 border-t border-gray-200">
      <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Notes</div>

      {/* Staff note */}
      {isManager ? (
        hasStaffNote ? (
          <div className={`rounded-lg border px-3 py-2 mb-3 ${reviewed ? "bg-white border-gray-200" : "bg-amber-50 border-amber-200"}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-semibold text-gray-600">📝 From {row.name}</span>
              {reviewed
                ? <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">Reviewed</span>
                : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">Needs review</span>}
            </div>
            <div className="text-sm text-gray-700 whitespace-pre-wrap">{note.staff_note}</div>
            <div className="flex gap-2 mt-2">
              {!reviewed && (
                <button
                  onClick={() => onSave(row.staffId, { manager_reviewed_at: new Date().toISOString() })}
                  className="text-[11px] px-2 py-1 rounded border border-green-200 text-green-700 hover:bg-green-50"
                >
                  ✓ Mark reviewed
                </button>
              )}
              <button
                onClick={() => setManagerText((t) => (t ? t + " " : "") + note.staff_note)}
                className="text-[11px] px-2 py-1 rounded border border-blue-200 text-blue-600 hover:bg-blue-50"
              >
                Copy to Notes
              </button>
            </div>
          </div>
        ) : null
      ) : (
        <div className="mb-3">
          <div className="text-[11px] font-medium text-gray-600 mb-1">Your note to the manager</div>
          <textarea
            value={staffText}
            onChange={(e) => setStaffText(e.target.value)}
            rows={2}
            placeholder="e.g. used my car for the Tuesday delivery run"
            className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
          />
          <button onClick={saveStaff} disabled={savingS} className="mt-1 text-[11px] px-3 py-1 rounded border border-blue-200 text-blue-600 hover:bg-blue-50 disabled:opacity-40">
            {savingS ? "Saving…" : "Save note"}
          </button>
        </div>
      )}

      {/* Manager note — goes to Excel */}
      {isManager && (
        <div>
          <div className="text-[11px] font-medium text-gray-600 mb-1">Notes for payroll</div>
          <textarea
            value={managerText}
            onChange={(e) => setManagerText(e.target.value)}
            rows={2}
            placeholder=""
            className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
          />
          <button onClick={saveManager} disabled={savingM} className="mt-1 text-[11px] px-3 py-1 rounded border border-blue-200 text-blue-600 hover:bg-blue-50 disabled:opacity-40">
            {savingM ? "Saving…" : "Save note"}
          </button>
        </div>
      )}
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
  const [notes, setNotes] = useState({}); // staffId -> wage_notes row
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

      const [{ data: shifts }, { data: staffData }, { data: holidays }, { data: appr }, { data: noteData }, { data: leaveData }] = await Promise.all([
        supabase.from("roster_shifts").select("id, shift_date, start_time, end_time, role, staff_id, staff_name").gte("shift_date", startISO).lte("shift_date", endISO),
        supabase.from("staff").select("id, name, role, employment_type, contracted_hours, active, schedule_type, weekly_schedule, week_ab_schedule, no_lunch_deduction").eq("pharmacy_id", PHARMACY_ID),
        supabase.from("public_holidays").select("date, name").eq("pharmacy_id", PHARMACY_ID).gte("date", startISO).lte("date", endISO),
        supabase.from("wage_approvals").select("staff_id").eq("pharmacy_id", PHARMACY_ID).eq("period_start", startISO),
        supabase.from("wage_notes").select("*").eq("pharmacy_id", PHARMACY_ID).eq("period_start", startISO),
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
          supabase.from("sick_days").select("roster_shift_id, leave_type").in("roster_shift_id", shiftIds),
        ]);
        editsByShift = Object.fromEntries((editData || []).map((e) => [e.roster_shift_id, e]));
        sickByShift = Object.fromEntries((sickData || []).map((s) => [s.roster_shift_id, s]));
      }

      setStaff(staffData || []);
      setApprovals(new Set((appr || []).map((a) => a.staff_id)));
      setNotes(Object.fromEntries((noteData || []).map((n) => [String(n.staff_id), n])));

      const built = buildWageRows({
        period,
        staffData,
        shifts,
        holidays,
        editsByShift,
        sickByShift,
        leaveData,
      });

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

  const saveNote = async (staffId, fields) => {
    const startISO = toISO(period.start);
    const payload = {
      pharmacy_id: PHARMACY_ID,
      staff_id: staffId,
      period_start: startISO,
      updated_at: new Date().toISOString(),
      ...fields,
    };
    const { data, error } = await supabase
      .from("wage_notes")
      .upsert(payload, { onConflict: "staff_id,period_start" })
      .select()
      .maybeSingle();
    if (error) { alert("Could not save note: " + error.message); return; }
    if (data) setNotes((prev) => ({ ...prev, [String(staffId)]: data }));
  };

  const unreviewedCount = Object.values(notes).filter(
    (n) => n.staff_note && n.staff_note.trim() && !n.manager_reviewed_at
  ).length;

  const allApproved = rows.filter((r) => r.staffId && !r.isSalary).every((r) => approvals.has(r.staffId));

  const handleExport = async () => {
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const startISO = toISO(period.start);
      const endISO = toISO(period.end);
      const data = rows.map((r) => {
        const sick = Number((r.sick || 0).toFixed(2));
        const comp = Number((r.compassionate || 0).toFixed(2));
        const annual = Number((r.annual || 0).toFixed(2));
        let leaveNote = "";
        if (r.isSalary) {
          const parts = [];
          if (sick) parts.push(`${sick} sick`);
          if (comp) parts.push(`${comp} comp`);
          if (annual) parts.push(`${annual} annual`);
          if (parts.length) leaveNote = "incl. " + parts.join(", ");
        }
        const mgrNote = (notes[String(r.staffId)]?.manager_note || "").trim();
        const combinedNote = [leaveNote, mgrNote].filter(Boolean).join(" — ");
        return {
          Name: r.name,
          "Contracted hrs": Number((r.isSalary ? (r.contracted || 0) : 0).toFixed(2)),
          "Weekday hrs": Number(r.weekday.toFixed(2)),
          "Saturday hrs": Number(r.sat.toFixed(2)),
          "Sunday hrs": Number(r.sun.toFixed(2)),
          "PH hrs": Number(r.ph.toFixed(2)),
          "Sick hrs": sick,
          "Compassionate hrs": comp,
          "Annual Leave hrs": annual,
          "OT hrs": Number(r.ot.toFixed(2)),
          "Total hrs": Number(r.total.toFixed(2)),
          Notes: combinedNote,
        };
      });
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
                  {unreviewedCount > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                      📝 {unreviewedCount} staff {unreviewedCount === 1 ? "note" : "notes"} not yet reviewed
                    </span>
                  )}
                  {!allApproved && rows.some((r) => r.staffId) && (
                    <span className="text-xs text-amber-600">Some hours not yet confirmed</span>
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
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-400 uppercase">Comp</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-400 uppercase">Annual</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-orange-500 uppercase">OT</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700 uppercase">Total</th>
                    <th className="px-3 py-2 text-center text-xs font-semibold text-gray-500 uppercase">Approval</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r) => {
                    const approved = r.staffId && approvals.has(r.staffId);
                    const expanded = r.staffId && (isManager ? expandedKey === r.key : true);
                    const dayLabel = { weekday: "Weekday", sat: "Saturday", sun: "Sunday", ph: "Public Holiday" };
                    return (
                      <React.Fragment key={r.key}>
                      <tr className={`border-t border-gray-100 hover:bg-gray-50 ${isManager && r.staffId ? "cursor-pointer" : ""}`} onClick={() => { if (isManager && r.staffId) setExpandedKey(expandedKey === r.key ? null : r.key); }}>
                        <td className="px-3 py-2 font-medium text-gray-800">
                          {isManager && r.staffId && <span className="inline-block w-4 text-gray-400">{expandedKey === r.key ? "▾" : "▸"}</span>}
                          {isManager && !r.staffId && <span className="inline-block w-4" />}
                          {r.name}
                          {(() => { const n = notes[String(r.staffId)]; return n?.staff_note && !n.manager_reviewed_at ? <span className="ml-1 text-amber-600" title="Staff note needs review">📝</span> : null; })()}
                          {!r.staffId && <span className="ml-1 text-[10px] text-gray-400">(casual)</span>}
                          {r.isSalary && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-600 border border-purple-100">Salary</span>}
                          {!r.isSalary && r.shifts.some((sh) => sh.edit) && <span className="ml-1 text-blue-600" title="Has edited shifts">✏️</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmt(r.weekday)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmt(r.sat)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmt(r.sun)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-700">{fmt(r.ph)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-300">{fmt(r.sick)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-300">{fmt(r.compassionate || 0)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-300">{fmt(r.annual)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-orange-600 font-medium">{fmt(r.ot)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-800">{fmt(r.total)}</td>
                        <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                          {!r.staffId || r.isSalary ? (
                            <span className="text-xs text-gray-300">—</span>
                          ) : approved ? (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">✓ Confirmed</span>
                          ) : (
                            <button onClick={() => setApproveRow(r)} className="text-xs px-2 py-0.5 rounded-full border border-blue-200 text-blue-600 hover:bg-blue-50">Confirm hours</button>
                          )}
                        </td>
                      </tr>

                      {expanded && (
                        <tr className="bg-gray-50 border-t border-gray-100">
                          <td colSpan={11} className="px-6 py-3">
                            {!r.isSalary && <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Shifts this period</div>}
                            {r.isSalary ? null : r.shifts.length === 0 ? (
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
                                    {sh.isSick && sh.isCompassionate && <span className="text-[10px] text-purple-600">🕊️ compassionate{sh.paidSick ? " — paid" : " — unpaid (casual)"}</span>}
                                    {sh.isSick && !sh.isCompassionate && <span className="text-[10px] text-amber-600">🤒 sick/carer's{sh.paidSick ? " — paid" : " — unpaid (casual)"}</span>}
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
                            <NotesBlock
                              row={r}
                              note={notes[String(r.staffId)]}
                              isManager={isManager}
                              isSelf={currentUser?.id === r.staffId}
                              onSave={saveNote}
                            />
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