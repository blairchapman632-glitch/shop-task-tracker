import { useEffect, useState } from "react";
import supabase from "../lib/supabaseClient";

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";

const DAYS = [
  { dow: 1, label: "Monday" },
  { dow: 2, label: "Tuesday" },
  { dow: 3, label: "Wednesday" },
  { dow: 4, label: "Thursday" },
  { dow: 5, label: "Friday" },
  { dow: 6, label: "Saturday" },
  { dow: 0, label: "Sunday" },
];

const STATUS_OPTIONS = [
  { value: "all_day", label: "All day", emoji: "✅" },
  { value: "am", label: "Mornings", emoji: "🌅" },
  { value: "pm", label: "Afternoons", emoji: "🌆" },
  { value: "unavailable", label: "Unavailable", emoji: "❌" },
];

const statusMeta = (v) => STATUS_OPTIONS.find((s) => s.value === v) || STATUS_OPTIONS[0];

const fmtDate = (d) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

export default function AvailabilityPage() {
  // ── Identity ──
  const [staffList, setStaffList] = useState([]);
  const [step, setStep] = useState("select"); // select → pin → form
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [checking, setChecking] = useState(false);

  // ── Month selector ──
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1 + i);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
    return { val, label };
  });

  // ── Form state ──
  const [pattern, setPattern] = useState({});   // dow -> status
  const [patternNote, setPatternNote] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [savedRanges, setSavedRanges] = useState([]); // [{ from_date, to_date, note, days: {dow: status} }]
  const [editingRangeKey, setEditingRangeKey] = useState(null); // "from|to" of the range being edited inline
  const [overrides, setOverrides] = useState([]); // {override_date, status, note}
  const [newOverrideDate, setNewOverrideDate] = useState("");
  const [newOverrideStatus, setNewOverrideStatus] = useState("unavailable");
  const [newOverrideNote, setNewOverrideNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [publishedMonths, setPublishedMonths] = useState(new Set());
  const [showAvailability, setShowAvailability] = useState(false);

  // ── Leave tab ──
  const [activeTab, setActiveTab] = useState("availability"); // availability | leave
  const [leaveType, setLeaveType] = useState("Annual Leave");
  const [leaveFrom, setLeaveFrom] = useState("");
  const [leaveTo, setLeaveTo] = useState("");
  const [leaveAllDay, setLeaveAllDay] = useState(true);
  const [leaveStart, setLeaveStart] = useState("09:00");
  const [leaveEnd, setLeaveEnd] = useState("17:00");
  const [leaveNote, setLeaveNote] = useState("");
  const [myLeave, setMyLeave] = useState([]);
  const [savingLeave, setSavingLeave] = useState(false);
  const [leaveSaved, setLeaveSaved] = useState(false);

  // Load active staff and published months
  useEffect(() => {
    supabase.from("staff").select("id, name, photo_url, pin, role, employment_type").eq("pharmacy_id", PHARMACY_ID).eq("active", true).order("name")
      .then(({ data }) => setStaffList((data || []).filter((s) => s.role !== "Locum")));
    supabase.from("roster_months").select("month, status").eq("status", "published")
      .then(({ data }) => {
        const months = new Set((data || []).map((r) => r.month.slice(0, 7)));
        setPublishedMonths(months);
      });
  }, []);

  const handleSelectStaff = (s) => {
    setSelectedStaff(s);
    setPin("");
    setPinError("");
    setStep("pin");
  };

  const handlePin = async () => {
    if (pin.length !== 4) { setPinError("Enter your 4-digit PIN."); return; }
    setChecking(true);
    const { data, error } = await supabase
      .from("staff").select("id").eq("id", selectedStaff.id).eq("pin", pin).single();
    setChecking(false);
    if (error || !data) { setPinError("Incorrect PIN."); setPin(""); return; }
    await loadExisting(selectedStaff.id, selectedMonth);
    await loadMyLeave(selectedStaff.id);
    setActiveTab(["Permanent", "Salary"].includes(selectedStaff.employment_type) ? "leave" : "availability");
    setStep("form");
  };

  const loadExisting = async (staffId, yearMonth) => {
    setLoading(true);
    const monthStart = `${yearMonth}-01`;
    const monthEnd = `${yearMonth}-31`; // string compare upper bound, safe for date strings
    // Load all ranges that overlap the selected month, plus overrides
    const [{ data: pats }, { data: ovrs }] = await Promise.all([
      supabase.from("availability_patterns").select("*").eq("staff_id", staffId)
        .or(`and(from_date.lte.${monthEnd},to_date.gte.${monthStart}),and(from_date.lte.${monthEnd},to_date.is.null)`)
        .order("from_date"),
      supabase.from("availability_overrides").select("*").eq("staff_id", staffId).gte("override_date", new Date().toISOString().slice(0, 10)).order("override_date"),
    ]);

    // Group pattern rows into ranges keyed by from_date|to_date
    const byRange = {};
    (pats || []).forEach((p) => {
      const key = `${p.from_date || ""}|${p.to_date || ""}`;
      if (!byRange[key]) byRange[key] = { from_date: p.from_date, to_date: p.to_date, note: p.note || "", days: {} };
      byRange[key].days[p.day_of_week] = p.status;
    });
    const ranges = Object.values(byRange).map((r) => {
      DAYS.forEach((d) => { if (!(d.dow in r.days)) r.days[d.dow] = "all_day"; });
      return r;
    });
    setSavedRanges(ranges);

    // Reset the editing grid to a fresh blank range
    const pmap = {};
    DAYS.forEach((d) => { pmap[d.dow] = "all_day"; });
    setPattern(pmap);
    setPatternNote("");
    setFromDate("");
    setToDate("");

    setOverrides((ovrs || []).map((o) => ({ override_date: o.override_date, status: o.status, note: o.note || "" })));
    setEditingRangeKey(null);
    setLoading(false);
  };

  const setDayStatus = (dow, status) => setPattern((p) => ({ ...p, [dow]: status }));

  // Add an override — saves immediately to the DB
  const addOverride = async () => {
    if (!newOverrideDate) return;
    if (overrides.some((o) => o.override_date === newOverrideDate)) {
      alert("You already have an entry for that date.");
      return;
    }
    try {
      const { error } = await supabase.from("availability_overrides").insert([{
        staff_id: selectedStaff.id,
        override_date: newOverrideDate,
        status: newOverrideStatus,
        note: newOverrideNote.trim() || null,
        pharmacy_id: PHARMACY_ID,
      }]);
      if (error) throw error;
      setNewOverrideDate("");
      setNewOverrideStatus("unavailable");
      setNewOverrideNote("");
      await loadExisting(selectedStaff.id, selectedMonth);
      setSaved(true);
      setTimeout(() => { try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) {} }, 50);
    } catch (err) {
      alert("Couldn't add date: " + (err?.message || String(err)));
    }
  };

  // Remove an override — deletes immediately from the DB
  const removeOverride = async (date) => {
    try {
      const { error } = await supabase.from("availability_overrides").delete()
        .eq("staff_id", selectedStaff.id).eq("override_date", date);
      if (error) throw error;
      await loadExisting(selectedStaff.id, selectedMonth);
    } catch (err) {
      alert("Couldn't remove date: " + (err?.message || String(err)));
    }
  };
  const handleDeleteRange = async (range) => {
    if (!window.confirm("Delete this availability range?")) return;
    try {
      let q = supabase.from("availability_patterns").delete().eq("staff_id", selectedStaff.id).eq("from_date", range.from_date);
      q = range.to_date ? q.eq("to_date", range.to_date) : q.is("to_date", null);
      const { error } = await q;
      if (error) throw error;
      await loadExisting(selectedStaff.id, selectedMonth);
    } catch (err) {
      alert("Couldn't delete range: " + (err?.message || String(err)));
    }
  };

  const rangeKey = (r) => `${r.from_date || ""}|${r.to_date || ""}`;

  const handleEditRange = (range) => {
    const key = rangeKey(range);
    if (editingRangeKey === key) {
      // Toggle closed
      setEditingRangeKey(null);
      return;
    }
    // Load this range into the working grid; saving with the same dates replaces it
    setPattern({ ...range.days });
    setPatternNote(range.note || "");
    setFromDate(range.from_date || "");
    setToDate(range.to_date || "");
    setEditingRangeKey(key);
  };
const LEAVE_TYPES = ["Annual Leave", "Personal/Carer's Leave", "Unpaid Leave"];

  const loadMyLeave = async (staffId) => {
    const { data } = await supabase
      .from("leave_requests")
      .select("*")
      .eq("staff_id", staffId)
      .order("created_at", { ascending: false });
    setMyLeave(data || []);
  };

  const isMultiDay = leaveFrom && leaveTo && leaveFrom !== leaveTo;

  const handleSubmitLeave = async () => {
    if (!leaveFrom || !leaveTo) { alert("Please choose dates."); return; }
    if (leaveTo < leaveFrom) { alert("End date can't be before start date."); return; }
    setSavingLeave(true);
    try {
      const partial = !leaveAllDay && !isMultiDay;
      const { error } = await supabase.from("leave_requests").insert([{
        staff_id: selectedStaff.id,
        pharmacy_id: PHARMACY_ID,
        leave_type: leaveType,
        from_date: leaveFrom,
        to_date: leaveTo,
        all_day: isMultiDay ? true : leaveAllDay,
        start_time: partial ? leaveStart : null,
        end_time: partial ? leaveEnd : null,
        note: leaveNote.trim() || null,
        status: "pending",
        staff_seen_status: "pending",
      }]);
      if (error) throw error;
      await loadMyLeave(selectedStaff.id);
      setLeaveFrom(""); setLeaveTo(""); setLeaveAllDay(true);
      setLeaveStart("09:00"); setLeaveEnd("17:00"); setLeaveNote("");
      setLeaveType("Annual Leave");
      setLeaveSaved(true);
      setTimeout(() => setLeaveSaved(false), 4000);
    } catch (err) {
      alert("Couldn't submit: " + (err?.message || String(err)));
    } finally {
      setSavingLeave(false);
    }
  };

  const handleCancelLeave = async (id) => {
    if (!window.confirm("Cancel this leave request?")) return;
    try {
      await supabase.from("leave_requests").delete().eq("id", id);
      await loadMyLeave(selectedStaff.id);
    } catch (err) {
      alert("Couldn't cancel: " + (err?.message || String(err)));
    }
  };
  const handleSave = async () => {
    setSaving(true);
    try {
      const staffId = selectedStaff.id;
      // Default blank dates to the selected month's span
      const rFrom = fromDate || `${selectedMonth}-01`;
      const lastDay = new Date(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5, 7)), 0).getDate();
      const rTo = toDate || `${selectedMonth}-${String(lastDay).padStart(2, "0")}`;

      if (rTo < rFrom) { alert("'Until' can't be before 'Applies from'."); setSaving(false); return; }

      // Replace any existing range with the exact same from/to
      await supabase.from("availability_patterns").delete()
        .eq("staff_id", staffId).eq("from_date", rFrom).eq("to_date", rTo);

      const patternRows = DAYS.map((d) => ({
        staff_id: staffId,
        day_of_week: d.dow,
        status: pattern[d.dow] || "all_day",
        note: patternNote.trim() || null,
        pharmacy_id: PHARMACY_ID,
        from_date: rFrom,
        to_date: rTo,
        year_month: selectedMonth,
      }));
      const { error: insError } = await supabase.from("availability_patterns").insert(patternRows);
      if (insError) throw insError;

      // Reload ranges so the new one shows in the list and the grid resets
      await loadExisting(staffId, selectedMonth);
      setEditingRangeKey(null);
      setSaved(true);
      setTimeout(() => { try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch (e) {} }, 50);
    } catch (err) {
      alert("Couldn't save: " + (err?.message || String(err)));
    } finally {
      setSaving(false);
    }
  };

  // ── Render ──
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center py-8 px-4">
      <div className="w-full max-w-lg">
        <div className="mb-2">
          <a href="/" className="text-sm text-blue-600 hover:underline">← Back to home</a>
        </div>
        <div className="text-center mb-6">
          <div className="text-3xl mb-1">📅</div>
          <h1 className="text-xl font-bold text-gray-800">Byford Pharmacy</h1>
          <p className="text-sm text-gray-500">Availability & Leave</p>
        </div>

        {/* Step: select staff */}
        {step === "select" && (
          <div className="bg-white rounded-2xl shadow-sm border p-5">
            <p className="text-sm text-gray-500 mb-3">Select your name:</p>
            <div className="space-y-1 max-h-[60vh] overflow-y-auto">
              {staffList.map((s) => (
                <button key={s.id} onClick={() => handleSelectStaff(s)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 text-left border border-transparent hover:border-gray-200">
                  <img src={s.photo_url || "/placeholder.png"} alt={s.name} className="w-10 h-10 rounded-full object-cover" />
                  <span className="text-sm font-medium text-gray-800">{s.name}</span>
                </button>
              ))}
              {staffList.length === 0 && <div className="text-sm text-gray-400">Loading staff…</div>}
            </div>
          </div>
        )}

        {/* Step: PIN */}
        {step === "pin" && selectedStaff && (
          <div className="bg-white rounded-2xl shadow-sm border p-6 text-center">
            <img src={selectedStaff.photo_url || "/placeholder.png"} alt={selectedStaff.name} className="w-14 h-14 rounded-full object-cover mx-auto mb-2" />
            <div className="font-medium text-gray-800 mb-4">{selectedStaff.name}</div>
            <input
              type="password" inputMode="numeric" maxLength={4} value={pin}
              onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setPinError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handlePin()}
              placeholder="••••" autoFocus
              className="w-full border rounded-lg px-4 py-3 text-center text-2xl tracking-widest mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            {pinError && <p className="text-sm text-red-500 mb-3">{pinError}</p>}
            <div className="flex gap-2">
              <button onClick={() => { setStep("select"); setSelectedStaff(null); }} className="flex-1 border border-gray-300 rounded-lg py-2.5 text-sm text-gray-600 hover:bg-gray-50">Back</button>
              <button onClick={handlePin} disabled={checking} className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-40">{checking ? "Checking…" : "Continue"}</button>
            </div>
          </div>
        )}

        {/* Step: form */}
        {step === "form" && selectedStaff && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border p-5">
              <div className="flex items-center gap-3 mb-4">
                <img src={selectedStaff.photo_url || "/placeholder.png"} alt={selectedStaff.name} className="w-10 h-10 rounded-full object-cover" />
                <div>
                  <div className="font-medium text-gray-800">{selectedStaff.name}</div>
                  <button onClick={() => { setStep("select"); setSelectedStaff(null); }} className="text-xs text-blue-600 hover:underline">Not you?</button>
                </div>
              </div>

              <div className="flex gap-1 mb-4">
                {[{ key: "availability", label: "📅 Availability" }, { key: "leave", label: "🏖️ Leave" }].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex-1 text-sm rounded-lg py-2 font-medium ${activeTab === tab.key ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {activeTab === "availability" && (
            <>
            {/* Saved availability — ranges + specific dates (single source of truth) */}
            {(savedRanges.length > 0 || overrides.length > 0) && (
              <div className="bg-white rounded-2xl shadow-sm border p-5">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Your saved availability</div>

                {/* Saved ranges */}
                <div className="space-y-2">
                  {savedRanges.map((r, i) => {
                    const rangeLabel = r.to_date
                      ? `${fmtDate(r.from_date)} → ${fmtDate(r.to_date)}`
                      : `From ${fmtDate(r.from_date)} (ongoing)`;
                    const limited = DAYS.filter((d) => (r.days[d.dow] || "all_day") !== "all_day")
                      .map((d) => `${d.label.slice(0, 3)}: ${statusMeta(r.days[d.dow]).label}`);
                    const isEditing = editingRangeKey === rangeKey(r);
                    return (
                      <div key={i} className={`rounded-lg border px-3 py-2 ${isEditing ? "border-blue-300 bg-blue-50/40" : "border-gray-100 bg-gray-50"}`}>
                        <div className="flex items-center justify-between gap-2">
                          <button onClick={() => handleEditRange(r)} className="flex items-center gap-1.5 text-left min-w-0">
                            <span className={`text-gray-400 text-xs transition-transform ${isEditing ? "rotate-180" : ""}`}>▾</span>
                            <span className="text-sm font-medium text-gray-800 truncate">{rangeLabel}</span>
                          </button>
                          <div className="flex gap-2 shrink-0">
                            <button onClick={() => handleEditRange(r)} className="text-xs text-blue-600 hover:underline">{isEditing ? "Close" : "Edit"}</button>
                            <button onClick={() => handleDeleteRange(r)} className="text-xs text-red-500 hover:text-red-700">Delete</button>
                          </div>
                        </div>
                        {r.note && <div className="text-[11px] text-gray-500 mt-0.5 italic">{r.note}</div>}

                        {/* Inline editor */}
                        {isEditing && (
                          <div className="mt-3 pt-3 border-t border-blue-200 space-y-2">
                            {DAYS.map((d) => (
                              <div key={d.dow} className="flex items-center gap-2">
                                <span className="text-xs w-20 shrink-0 text-gray-700">{d.label}</span>
                                <div className="flex gap-1 flex-1">
                                  {STATUS_OPTIONS.map((opt) => {
                                    const active = (pattern[d.dow] || "all_day") === opt.value;
                                    return (
                                      <button key={opt.value} onClick={() => setDayStatus(d.dow, opt.value)} title={opt.label}
                                        className={`flex-1 text-[11px] rounded-lg border py-1.5 ${active ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
                                        {opt.emoji}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[10px] font-medium text-gray-600 mb-1">Applies from</label>
                                <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full border rounded-lg px-2 py-1.5 text-xs" />
                              </div>
                              <div>
                                <label className="block text-[10px] font-medium text-gray-600 mb-1">Until</label>
                                <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full border rounded-lg px-2 py-1.5 text-xs" />
                              </div>
                            </div>
                            <textarea value={patternNote} onChange={(e) => setPatternNote(e.target.value)} rows={2} placeholder="Note (optional)…" className="w-full border rounded-lg px-3 py-2 text-xs resize-none" />
                            <button onClick={handleSave} disabled={saving} className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-40">
                              {saving ? "Saving…" : "Save changes"}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Saved specific dates */}
                {overrides.length > 0 && (
                  <div className="mt-3 pt-3 border-t">
                    <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Specific dates</div>
                    <div className="space-y-1.5">
                      {overrides.map((o) => (
                        <div key={o.override_date} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                          <span>{statusMeta(o.status).emoji}</span>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm text-gray-700">{fmtDate(o.override_date)} — {statusMeta(o.status).label}</div>
                            {o.note && <div className="text-xs text-gray-500">{o.note}</div>}
                          </div>
                          <button onClick={() => removeOverride(o.override_date)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-[11px] text-gray-400 mt-3">Add another range or specific date below.</p>
              </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm border p-5">
              <div className="mb-4">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Month</label>
                <select
                  value={selectedMonth}
                  onChange={(e) => {
                    setSelectedMonth(e.target.value);
                    loadExisting(selectedStaff.id, e.target.value);
                  }}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  {monthOptions.map((m) => {
                    const isPublished = publishedMonths.has(m.val);
                    return (
                      <option key={m.val} value={m.val}>
                        {m.label}{isPublished ? " — Published 🔒" : ""}
                      </option>
                    );
                  })}
                </select>
                <p className="text-[11px] text-gray-400 mt-1">Changing month loads that month's availability. Your current month is not affected.</p>
              </div>

              {["Permanent", "Salary"].includes(selectedStaff.employment_type) && (
                <div className="mb-4 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-xs text-blue-700">
                  <p className="mb-2">ℹ️ Your contracted hours are already set in the roster. Use availability to flag any changes to your usual pattern — e.g. a period when you can't work certain days.</p>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={showAvailability} onChange={(e) => setShowAvailability(e.target.checked)} className="h-3.5 w-3.5 rounded border-gray-300" />
                    <span>Show availability settings</span>
                  </label>
                </div>
              )}
              {(showAvailability || !["Permanent", "Salary"].includes(selectedStaff.employment_type)) && (
              <>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Add availability</div>
              <p className="text-xs text-gray-400 mb-3">Set your weekly pattern, optionally limit it to a date range, then save. Add more ranges for periods that differ.</p>

              {loading ? (
                <div className="text-sm text-gray-400">Loading…</div>
              ) : (
                <div className="space-y-2">
                  {DAYS.map((d) => (
                    <div key={d.dow} className="flex items-center gap-2">
                      <span className="text-sm w-24 shrink-0 text-gray-700">{d.label}</span>
                      <div className="flex gap-1 flex-1">
                        {STATUS_OPTIONS.map((opt) => {
                          const active = (pattern[d.dow] || "all_day") === opt.value;
                          return (
                            <button
                              key={opt.value}
                              onClick={() => setDayStatus(d.dow, opt.value)}
                              className={`flex-1 text-[11px] rounded-lg border py-1.5 ${active ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}
                              title={opt.label}
                            >
                              {opt.emoji}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-2 text-[10px] text-gray-400 pt-1 justify-end">
                    {STATUS_OPTIONS.map((o) => <span key={o.value}>{o.emoji} {o.label}</span>)}
                  </div>
                </div>
              )}

              {/* Optional date range for the pattern */}
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Applies from (optional)</label>
                  <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full border rounded-lg px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Until (optional)</label>
                  <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full border rounded-lg px-2 py-1.5 text-sm" />
                </div>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">e.g. set an end date if this is just for a uni semester. Leave blank for ongoing.</p>

              <div className="mt-3">
                <label className="block text-xs font-medium text-gray-600 mb-1">Note (optional)</label>
                <textarea value={patternNote} onChange={(e) => setPatternNote(e.target.value)} rows={2} placeholder="Anything the roster manager should know…" className="w-full border rounded-lg px-3 py-2 text-sm resize-none" />
              </div>

              {/* Save this range — directly under the grid */}
              {publishedMonths.has(selectedMonth) ? (
                <div className="mt-4 w-full rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-center text-sm text-amber-700 font-medium">
                  🔒 This month's roster is published — availability can't be changed.
                </div>
              ) : (
                <button onClick={handleSave} disabled={saving} className="mt-4 w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-medium disabled:opacity-40">
                  {saving ? "Saving…" : (fromDate || toDate) ? "Save this range" : "Save availability"}
                </button>
              )}
            </>
            )}
            </div>

            {/* Add a specific date — saves immediately */}
            <div className="bg-white rounded-2xl shadow-sm border p-5">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Add a specific date</div>
              <p className="text-xs text-gray-400 mb-3">One-off exception — a day you can't do, or a normally-off day you can. Saves straight away.</p>

              <div className="space-y-2">
                <input type="date" value={newOverrideDate} onChange={(e) => setNewOverrideDate(e.target.value)} className="w-full border rounded-lg px-2 py-1.5 text-sm" />
                <div className="flex gap-1">
                  {STATUS_OPTIONS.map((opt) => (
                    <button key={opt.value} onClick={() => setNewOverrideStatus(opt.value)} className={`flex-1 text-[11px] rounded-lg border py-1.5 ${newOverrideStatus === opt.value ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200"}`}>
                      {opt.emoji} {opt.label}
                    </button>
                  ))}
                </div>
                <input value={newOverrideNote} onChange={(e) => setNewOverrideNote(e.target.value)} placeholder="Note (optional)" className="w-full border rounded-lg px-3 py-2 text-sm" />
                <button onClick={addOverride} disabled={!newOverrideDate} className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-40">Save date</button>
              </div>
            </div>

            {saved && (
              <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-4 text-center">
                <div className="text-2xl mb-1">✅</div>
                <div className="text-sm font-semibold text-green-700">Saved.</div>
                <button onClick={() => setSaved(false)} className="mt-2 text-xs text-green-700 underline">Dismiss</button>
              </div>
            )}
            </>
            )}

            {activeTab === "leave" && (
            <>
              <div className="bg-white rounded-2xl shadow-sm border p-5 space-y-3">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Request leave</div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Leave type</label>
                  <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                    {LEAVE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
                    <input type="date" value={leaveFrom} onChange={(e) => setLeaveFrom(e.target.value)} className="w-full border rounded-lg px-2 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
                    <input type="date" value={leaveTo} onChange={(e) => setLeaveTo(e.target.value)} className="w-full border rounded-lg px-2 py-1.5 text-sm" />
                  </div>
                </div>

                {!isMultiDay && (
                  <div>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={leaveAllDay} onChange={(e) => setLeaveAllDay(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
                      <span className="text-gray-700">All day</span>
                    </label>
                    {!leaveAllDay && (
                      <div className="grid grid-cols-2 gap-3 mt-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Start</label>
                          <input type="time" value={leaveStart} onChange={(e) => setLeaveStart(e.target.value)} className="w-full border rounded-lg px-2 py-1.5 text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">End</label>
                          <input type="time" value={leaveEnd} onChange={(e) => setLeaveEnd(e.target.value)} className="w-full border rounded-lg px-2 py-1.5 text-sm" />
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {isMultiDay && <p className="text-[11px] text-gray-400">Multi-day requests are all day.</p>}

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Note (optional)</label>
                  <textarea value={leaveNote} onChange={(e) => setLeaveNote(e.target.value)} rows={2} placeholder="Reason or any details…" className="w-full border rounded-lg px-3 py-2 text-sm resize-none" />
                </div>

                <button onClick={handleSubmitLeave} disabled={savingLeave} className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-40">
                  {savingLeave ? "Submitting…" : "Submit leave request"}
                </button>
                {leaveSaved && (
                  <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-center text-sm text-green-700 font-medium">
                    ✅ Request submitted for review.
                  </div>
                )}
              </div>

              <div className="bg-white rounded-2xl shadow-sm border p-5">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">My requests</div>
                {myLeave.length === 0 ? (
                  <p className="text-xs text-gray-400">No leave requests yet.</p>
                ) : (
                  <div className="space-y-2">
                    {myLeave.map((lr) => {
                      const statusMeta = {
                        pending: { label: "Pending", cls: "bg-amber-50 text-amber-700 border-amber-200" },
                        approved: { label: "Approved", cls: "bg-green-50 text-green-700 border-green-200" },
                        declined: { label: "Declined", cls: "bg-red-50 text-red-600 border-red-200" },
                      }[lr.status] || { label: lr.status, cls: "bg-gray-50 text-gray-600 border-gray-200" };
                      const sameDay = lr.from_date === lr.to_date;
                      const dateLabel = sameDay ? fmtDate(lr.from_date) : `${fmtDate(lr.from_date)} → ${fmtDate(lr.to_date)}`;
                      return (
                        <div key={lr.id} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-gray-800">{lr.leave_type}</span>
                            <span className={`text-[11px] px-2 py-0.5 rounded-full border ${statusMeta.cls}`}>{statusMeta.label}</span>
                          </div>
                          <div className="text-xs text-gray-600 mt-0.5">
                            {dateLabel}{!lr.all_day && lr.start_time ? ` · ${lr.start_time.slice(0,5)}–${lr.end_time?.slice(0,5)}` : ""}
                          </div>
                          {lr.note && <div className="text-xs text-gray-500 mt-0.5">{lr.note}</div>}
                          {lr.manager_note && <div className="text-xs text-blue-600 mt-0.5">Paige: {lr.manager_note}</div>}
                          {lr.status === "pending" && (
                            <button onClick={() => handleCancelLeave(lr.id)} className="mt-1 text-xs text-red-500 hover:text-red-700">Cancel request</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}