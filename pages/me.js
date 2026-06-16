import { useEffect, useRef, useState } from "react";
import supabase from "../lib/supabaseClient";
import { toISO, buildWageRows, fmt as wageFmt } from "../lib/wageCalc";

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";

// Convert a base64 VAPID key to the Uint8Array the browser needs.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// Ask permission and save this device's push subscription for the staff member.
async function subscribeToPush(staffMember) {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapid) return;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid),
      });
    }

    const json = sub.toJSON();
    await supabase.from("push_subscriptions").upsert({
      staff_id: staffMember.id,
      pharmacy_id: PHARMACY_ID,
      endpoint: sub.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    }, { onConflict: "endpoint" });
  } catch (err) {
    console.error("Push subscribe failed:", err);
  }
}

const formatTime = (time) => {
  if (!time) return "";
  const [hourStr, minuteStr] = String(time).split(":");
  let hour = Number(hourStr);
  const minute = Number(minuteStr);
  const suffix = hour >= 12 ? "pm" : "am";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  if (minute === 0) return `${hour}${suffix}`;
  return `${hour}.${String(minute).padStart(2, "0")}${suffix}`;
};

const roleColour = {
  Pharmacist: "text-purple-700",
  Locum: "text-blue-700",
  "DAA Coordinator": "text-orange-600",
  "Pharmacy Assistant": "text-teal-700",
  "Intern Pharmacist": "text-purple-500",
  Manager: "text-gray-700",
};

function ShiftsTab({ staff }) {
  const [loading, setLoading] = useState(true);
  const [shifts, setShifts] = useState([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const todayStr = new Date().toISOString().slice(0, 10);

      // This staff member's upcoming shifts
      const { data: shiftData } = await supabase
        .from("roster_shifts")
        .select("id, shift_date, start_time, end_time, role, roster_month_id")
        .eq("staff_id", staff.id)
        .gte("shift_date", todayStr)
        .order("shift_date")
        .order("start_time");

      const rows = shiftData || [];

      // Keep only shifts whose month is published
      const monthIds = [...new Set(rows.map((s) => s.roster_month_id).filter(Boolean))];
      let publishedIds = new Set();
      if (monthIds.length) {
        const { data: months } = await supabase
          .from("roster_months")
          .select("id, status")
          .in("id", monthIds);
        publishedIds = new Set((months || []).filter((m) => m.status === "published").map((m) => m.id));
      }
      const published = rows.filter((s) => publishedIds.has(s.roster_month_id));

      // Absences for these shifts
      const shiftIds = published.map((s) => s.id);
      let sickMap = {};
      if (shiftIds.length) {
        const { data: sick } = await supabase
          .from("sick_days")
          .select("roster_shift_id, leave_type")
          .in("roster_shift_id", shiftIds);
        (sick || []).forEach((s) => { sickMap[s.roster_shift_id] = s.leave_type; });
      }

      setShifts(published.map((s) => ({ ...s, absence: sickMap[s.id] || null })));
      setLoading(false);
    };
    load();
  }, [staff.id]);

  if (loading) return <div className="text-sm text-gray-400 text-center mt-10">Loading shifts…</div>;
  if (shifts.length === 0) return <div className="text-sm text-gray-400 text-center mt-10">No upcoming published shifts.</div>;

  const fmtDate = (d) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="space-y-2 max-w-lg mx-auto">
      {shifts.map((s) => (
        <div key={s.id} className="bg-white rounded-xl border p-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-800">{fmtDate(s.shift_date)}</div>
            <div className={`text-xs ${roleColour[s.role] || "text-gray-500"}`}>{s.role}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-sm font-medium text-gray-700">
              {formatTime(s.start_time)} – {formatTime(s.end_time)}
            </div>
            {s.absence === "compassionate" && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-600">🕊️ Compassionate</span>
            )}
            {s.absence && s.absence !== "compassionate" && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">🤒 Sick / Carer's</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

const sortRosterShifts = (arr) => {
  const group = (role) => {
    const r = (role || "").toLowerCase();
    if (r === "pharmacy assistant" || r === "daa" || r === "daa coordinator") return 0;
    return 1;
  };
  return [...arr].sort((a, b) => {
    const g = group(a.role) - group(b.role);
    if (g !== 0) return g;
    return (a.start_time || "").localeCompare(b.start_time || "");
  });
};

const TO_DAYS = [
  { dow: 1, label: "Monday" },
  { dow: 2, label: "Tuesday" },
  { dow: 3, label: "Wednesday" },
  { dow: 4, label: "Thursday" },
  { dow: 5, label: "Friday" },
  { dow: 6, label: "Saturday" },
  { dow: 0, label: "Sunday" },
];

const TO_STATUS = [
  { value: "all_day", label: "All day", emoji: "✅" },
  { value: "am", label: "Mornings", emoji: "🌅" },
  { value: "pm", label: "Afternoons", emoji: "🌆" },
  { value: "unavailable", label: "Unavailable", emoji: "❌" },
];

const TO_LEAVE_TYPES = ["Annual Leave", "Personal/Carer's Leave", "Unpaid Leave"];

const toStatusMeta = (v) => TO_STATUS.find((s) => s.value === v) || TO_STATUS[0];

const toFmtDate = (d) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

function TimeOffTab({ staff }) {
  const leaveOnly = false;

  const [activeTab, setActiveTab] = useState(["Permanent", "Salary"].includes(staff.employment_type) ? "leave" : "availability");

  // Month selector (next 12 months, starting next month)
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
  const [publishedMonths, setPublishedMonths] = useState(new Set());

  // Availability state
  const [pattern, setPattern] = useState({});
  const [patternNote, setPatternNote] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [savedRanges, setSavedRanges] = useState([]);
  const [editingRangeKey, setEditingRangeKey] = useState(null);
  const [overrides, setOverrides] = useState([]);
  const [newOverrideDate, setNewOverrideDate] = useState("");
  const [newOverrideStatus, setNewOverrideStatus] = useState("unavailable");
  const [newOverrideNote, setNewOverrideNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showAvailability, setShowAvailability] = useState(false);

  // Leave state
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

  const isMultiDay = leaveFrom && leaveTo && leaveFrom !== leaveTo;
  const rangeKey = (r) => `${r.from_date || ""}|${r.to_date || ""}`;
  const setDayStatus = (dow, status) => setPattern((p) => ({ ...p, [dow]: status }));

  useEffect(() => {
    supabase.from("roster_months").select("month, status").eq("status", "published")
      .then(({ data }) => setPublishedMonths(new Set((data || []).map((r) => r.month.slice(0, 7)))));
    if (!leaveOnly) loadExisting(selectedMonth);
    loadMyLeave();
  }, []);

  const loadExisting = async (yearMonth) => {
    setLoading(true);
    const monthStart = `${yearMonth}-01`;
    const monthEnd = `${yearMonth}-31`;
    const [{ data: pats }, { data: ovrs }] = await Promise.all([
      supabase.from("availability_patterns").select("*").eq("staff_id", staff.id)
        .or(`and(from_date.lte.${monthEnd},to_date.gte.${monthStart}),and(from_date.lte.${monthEnd},to_date.is.null)`)
        .order("from_date"),
      supabase.from("availability_overrides").select("*").eq("staff_id", staff.id)
        .gte("override_date", new Date().toISOString().slice(0, 10)).order("override_date"),
    ]);

    const byRange = {};
    (pats || []).forEach((p) => {
      const key = `${p.from_date || ""}|${p.to_date || ""}`;
      if (!byRange[key]) byRange[key] = { from_date: p.from_date, to_date: p.to_date, note: p.note || "", days: {} };
      byRange[key].days[p.day_of_week] = p.status;
    });
    const ranges = Object.values(byRange).map((r) => {
      TO_DAYS.forEach((d) => { if (!(d.dow in r.days)) r.days[d.dow] = "all_day"; });
      return r;
    });
    setSavedRanges(ranges);

    const pmap = {};
    TO_DAYS.forEach((d) => { pmap[d.dow] = "all_day"; });
    setPattern(pmap);
    setPatternNote("");
    setFromDate("");
    setToDate("");
    setOverrides((ovrs || []).map((o) => ({ override_date: o.override_date, status: o.status, note: o.note || "" })));
    setEditingRangeKey(null);
    setLoading(false);
  };

  const loadMyLeave = async () => {
    const { data } = await supabase.from("leave_requests").select("*").eq("staff_id", staff.id).order("created_at", { ascending: false });
    setMyLeave(data || []);
  };

  const handleEditRange = (range) => {
    const key = rangeKey(range);
    if (editingRangeKey === key) { setEditingRangeKey(null); return; }
    setPattern({ ...range.days });
    setPatternNote(range.note || "");
    setFromDate(range.from_date || "");
    setToDate(range.to_date || "");
    setEditingRangeKey(key);
  };

  const handleDeleteRange = async (range) => {
    if (!window.confirm("Delete this availability range?")) return;
    try {
      let q = supabase.from("availability_patterns").delete().eq("staff_id", staff.id).eq("from_date", range.from_date);
      q = range.to_date ? q.eq("to_date", range.to_date) : q.is("to_date", null);
      const { error } = await q;
      if (error) throw error;
      await loadExisting(selectedMonth);
    } catch (err) {
      alert("Couldn't delete range: " + (err?.message || String(err)));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const rFrom = fromDate || `${selectedMonth}-01`;
      const lastDay = new Date(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5, 7)), 0).getDate();
      const rTo = toDate || `${selectedMonth}-${String(lastDay).padStart(2, "0")}`;
      if (rTo < rFrom) { alert("'Until' can't be before 'Applies from'."); setSaving(false); return; }

      await supabase.from("availability_patterns").delete()
        .eq("staff_id", staff.id).eq("from_date", rFrom).eq("to_date", rTo);

      const rows = TO_DAYS.map((d) => ({
        staff_id: staff.id,
        day_of_week: d.dow,
        status: pattern[d.dow] || "all_day",
        note: patternNote.trim() || null,
        pharmacy_id: PHARMACY_ID,
        from_date: rFrom,
        to_date: rTo,
        year_month: selectedMonth,
      }));
      const { error } = await supabase.from("availability_patterns").insert(rows);
      if (error) throw error;
      await loadExisting(selectedMonth);
      setEditingRangeKey(null);
      setSaved(true);
    } catch (err) {
      alert("Couldn't save: " + (err?.message || String(err)));
    } finally {
      setSaving(false);
    }
  };

  const addOverride = async () => {
    if (!newOverrideDate) return;
    if (overrides.some((o) => o.override_date === newOverrideDate)) { alert("You already have an entry for that date."); return; }
    try {
      const { error } = await supabase.from("availability_overrides").insert([{
        staff_id: staff.id, override_date: newOverrideDate, status: newOverrideStatus,
        note: newOverrideNote.trim() || null, pharmacy_id: PHARMACY_ID,
      }]);
      if (error) throw error;
      setNewOverrideDate(""); setNewOverrideStatus("unavailable"); setNewOverrideNote("");
      await loadExisting(selectedMonth);
      setSaved(true);
    } catch (err) {
      alert("Couldn't add date: " + (err?.message || String(err)));
    }
  };

  const removeOverride = async (date) => {
    try {
      const { error } = await supabase.from("availability_overrides").delete().eq("staff_id", staff.id).eq("override_date", date);
      if (error) throw error;
      await loadExisting(selectedMonth);
    } catch (err) {
      alert("Couldn't remove date: " + (err?.message || String(err)));
    }
  };

  const handleSubmitLeave = async () => {
    if (!leaveFrom || !leaveTo) { alert("Please choose dates."); return; }
    if (leaveTo < leaveFrom) { alert("End date can't be before start date."); return; }
    setSavingLeave(true);
    try {
      const partial = !leaveAllDay && !isMultiDay;
      const { error } = await supabase.from("leave_requests").insert([{
        staff_id: staff.id, pharmacy_id: PHARMACY_ID, leave_type: leaveType,
        from_date: leaveFrom, to_date: leaveTo,
        all_day: isMultiDay ? true : leaveAllDay,
        start_time: partial ? leaveStart : null,
        end_time: partial ? leaveEnd : null,
        note: leaveNote.trim() || null, status: "pending", staff_seen_status: "pending",
      }]);
      if (error) throw error;
      await loadMyLeave();
      setLeaveFrom(""); setLeaveTo(""); setLeaveAllDay(true);
      setLeaveStart("09:00"); setLeaveEnd("17:00"); setLeaveNote(""); setLeaveType("Annual Leave");
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
      await loadMyLeave();
    } catch (err) {
      alert("Couldn't cancel: " + (err?.message || String(err)));
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-4">
      {/* Sub-tabs (casual only sees both) */}
      {!leaveOnly && (
        <div className="flex gap-1">
          {[{ key: "availability", label: "📅 Availability" }, { key: "leave", label: "🏖️ Leave" }].map((t) => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`flex-1 text-sm rounded-lg py-2 font-medium ${activeTab === t.key ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {activeTab === "availability" && !leaveOnly && (
        <>
          {/* Saved availability */}
          {(savedRanges.length > 0 || overrides.length > 0) && (
            <div className="bg-white rounded-2xl shadow-sm border p-5">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Your saved availability</div>
              <div className="space-y-2">
                {savedRanges.map((r, i) => {
                  const rangeLabel = r.to_date ? `${toFmtDate(r.from_date)} → ${toFmtDate(r.to_date)}` : `From ${toFmtDate(r.from_date)} (ongoing)`;
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
                      {isEditing && (
                        <div className="mt-3 pt-3 border-t border-blue-200 space-y-2">
                          {TO_DAYS.map((d) => (
                            <div key={d.dow} className="flex items-center gap-2">
                              <span className="text-xs w-20 shrink-0 text-gray-700">{d.label}</span>
                              <div className="flex gap-1 flex-1">
                                {TO_STATUS.map((opt) => {
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

              {overrides.length > 0 && (
                <div className="mt-3 pt-3 border-t">
                  <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Specific dates</div>
                  <div className="space-y-1.5">
                    {overrides.map((o) => (
                      <div key={o.override_date} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                        <span>{toStatusMeta(o.status).emoji}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-gray-700">{toFmtDate(o.override_date)} — {toStatusMeta(o.status).label}</div>
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

          {/* Add availability */}
          <div className="bg-white rounded-2xl shadow-sm border p-5">
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Month</label>
              <select value={selectedMonth} onChange={(e) => { setSelectedMonth(e.target.value); loadExisting(e.target.value); }} className="w-full border rounded-lg px-3 py-2 text-sm">
                {monthOptions.map((m) => (
                  <option key={m.val} value={m.val}>{m.label}{publishedMonths.has(m.val) ? " — Published 🔒" : ""}</option>
                ))}
              </select>
            </div>

            {["Permanent", "Salary"].includes(staff.employment_type) && (
              <div className="mb-4 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-xs text-blue-700">
                <p className="mb-2">ℹ️ Your contracted hours are already set in the roster. Use availability to flag any changes to your usual pattern — e.g. a period when you can't work certain days.</p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={showAvailability} onChange={(e) => setShowAvailability(e.target.checked)} className="h-3.5 w-3.5 rounded border-gray-300" />
                  <span>Show availability settings</span>
                </label>
              </div>
            )}
            {(showAvailability || !["Permanent", "Salary"].includes(staff.employment_type)) && (
            <>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Add availability</div>
            <p className="text-xs text-gray-400 mb-3">Set your weekly pattern, optionally limit it to a date range, then save.</p>

            {loading ? (
              <div className="text-sm text-gray-400">Loading…</div>
            ) : (
              <div className="space-y-2">
                {TO_DAYS.map((d) => (
                  <div key={d.dow} className="flex items-center gap-2">
                    <span className="text-sm w-24 shrink-0 text-gray-700">{d.label}</span>
                    <div className="flex gap-1 flex-1">
                      {TO_STATUS.map((opt) => {
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
                <div className="flex gap-2 text-[10px] text-gray-400 pt-1 justify-end">
                  {TO_STATUS.map((o) => <span key={o.value}>{o.emoji} {o.label}</span>)}
                </div>
              </div>
            )}

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
            <p className="text-[11px] text-gray-400 mt-1">Leave blank for ongoing.</p>

            <div className="mt-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">Note (optional)</label>
              <textarea value={patternNote} onChange={(e) => setPatternNote(e.target.value)} rows={2} placeholder="Anything the roster manager should know…" className="w-full border rounded-lg px-3 py-2 text-sm resize-none" />
            </div>

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

          {(showAvailability || !["Permanent", "Salary"].includes(staff.employment_type)) && (
          <div className="bg-white rounded-2xl shadow-sm border p-5">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Add a specific date</div>
            <p className="text-xs text-gray-400 mb-3">One-off exception. Saves straight away.</p>
            <div className="space-y-2">
              <input type="date" value={newOverrideDate} onChange={(e) => setNewOverrideDate(e.target.value)} className="w-full border rounded-lg px-2 py-1.5 text-sm" />
              <div className="flex gap-1">
                {TO_STATUS.map((opt) => (
                  <button key={opt.value} onClick={() => setNewOverrideStatus(opt.value)} className={`flex-1 text-[11px] rounded-lg border py-1.5 ${newOverrideStatus === opt.value ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200"}`}>
                    {opt.emoji} {opt.label}
                  </button>
                ))}
              </div>
              <input value={newOverrideNote} onChange={(e) => setNewOverrideNote(e.target.value)} placeholder="Note (optional)" className="w-full border rounded-lg px-3 py-2 text-sm" />
              <button onClick={addOverride} disabled={!newOverrideDate} className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-40">Save date</button>
            </div>
          </div>
          )}

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
                {TO_LEAVE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
                <input type="date" value={leaveFrom} onChange={(e) => setLeaveFrom(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white min-w-0" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
                <input type="date" value={leaveTo} onChange={(e) => setLeaveTo(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white min-w-0" />
              </div>
            </div>

            {!isMultiDay && (
              <div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={leaveAllDay} onChange={(e) => setLeaveAllDay(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
                  <span className="text-gray-700">All day</span>
                </label>
                {!leaveAllDay && (
                  <div className="grid grid-cols-2 gap-4 mt-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Start</label>
                      <input type="time" value={leaveStart} onChange={(e) => setLeaveStart(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white min-w-0" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">End</label>
                      <input type="time" value={leaveEnd} onChange={(e) => setLeaveEnd(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white min-w-0" />
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
                  const meta = {
                    pending: { label: "Pending", cls: "bg-amber-50 text-amber-700 border-amber-200" },
                    approved: { label: "Approved", cls: "bg-green-50 text-green-700 border-green-200" },
                    declined: { label: "Declined", cls: "bg-red-50 text-red-600 border-red-200" },
                  }[lr.status] || { label: lr.status, cls: "bg-gray-50 text-gray-600 border-gray-200" };
                  const sameDay = lr.from_date === lr.to_date;
                  const dateLabel = sameDay ? toFmtDate(lr.from_date) : `${toFmtDate(lr.from_date)} → ${toFmtDate(lr.to_date)}`;
                  return (
                    <div key={lr.id} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-gray-800">{lr.leave_type}</span>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full border ${meta.cls}`}>{meta.label}</span>
                      </div>
                      <div className="text-xs text-gray-600 mt-0.5">
                        {dateLabel}{!lr.all_day && lr.start_time ? ` · ${lr.start_time.slice(0,5)}–${lr.end_time?.slice(0,5)}` : ""}
                      </div>
                      {lr.note && <div className="text-xs text-gray-500 mt-0.5">{lr.note}</div>}
                      {lr.manager_note && <div className="text-xs text-blue-600 mt-0.5">Manager: {lr.manager_note}</div>}
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
  );
}

const meFmtWhen = (d) =>
  new Date(d).toLocaleString("en-AU", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

const NOTE_REACTIONS = ["👍", "❤️", "🙂"];

function MessagesCombinedTab({ staff, onBoardSeen, newBoardCount, unreadCount }) {
  const [sub, setSub] = useState("notes");

  const handleSubTab = (key) => {
    setSub(key);
    if (key === "notes") {
      supabase.from("staff").update({ board_last_seen_at: new Date().toISOString() }).eq("id", staff.id).then(() => {
        if (onBoardSeen) onBoardSeen();
      });
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="flex gap-1">
        {[{ key: "direct", label: "💬 Messages" }, { key: "notes", label: "📌 Wall" }].map((t) => (
          <button key={t.key} onClick={() => handleSubTab(t.key)}
            className={`relative flex-1 text-sm rounded-lg py-2 font-medium ${sub === t.key ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            {t.label}
            {t.key === "notes" && newBoardCount > 0 && sub !== "notes" && (
              <span className="absolute top-1 right-2 inline-flex items-center justify-center h-2 w-2 rounded-full bg-red-500" />
            )}
            {t.key === "direct" && unreadCount > 0 && sub !== "direct" && (
              <span className="absolute top-1 right-2 inline-flex items-center justify-center h-2 w-2 rounded-full bg-red-500" />
            )}
          </button>
        ))}
      </div>
      {sub === "direct" ? <MessagesTab staff={staff} /> : <NotesTab staff={staff} />}
    </div>
  );
}

function NotesTab({ staff }) {
  const me = staff;
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [noteText, setNoteText] = useState("");
  const [posting, setPosting] = useState(false);
  const [staffById, setStaffById] = useState({});
  const [repliesByNote, setRepliesByNote] = useState({});
  const [replyText, setReplyText] = useState({});
  const [replySaving, setReplySaving] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [reactionsByNote, setReactionsByNote] = useState({});
  const [showResolved, setShowResolved] = useState(false);
  const [pollsByNote, setPollsByNote] = useState({});
  const [customOptDraft, setCustomOptDraft] = useState({});
  const [customOptSaving, setCustomOptSaving] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data: staffData } = await supabase
        .from("staff").select("id, name, photo_url").eq("pharmacy_id", PHARMACY_ID);
      setStaffById(Object.fromEntries((staffData || []).map((s) => [s.id, s])));

      const { data, error } = await supabase
        .from("kiosk_notes")
        .select("id, body, staff_id, created_at, pinned, deleted, last_activity_at, resolved, resolved_at, resolved_by_staff_id, type, poll_question, allow_custom_options")
        .eq("pharmacy_id", PHARMACY_ID)
        .or("deleted.is.null,deleted.eq.false")
        .order("pinned", { ascending: false })
        .order("last_activity_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      setNotes(data || []);

      const pollNoteIds = (data || []).filter((n) => n.type === "poll").map((n) => n.id);
      if (pollNoteIds.length) {
        const [{ data: optData }, { data: voteData }] = await Promise.all([
          supabase.from("poll_options").select("id, kiosk_note_id, label, display_order, added_by_staff_id").eq("pharmacy_id", PHARMACY_ID).in("kiosk_note_id", pollNoteIds).order("display_order", { ascending: true }),
          supabase.from("poll_votes").select("poll_option_id, kiosk_note_id, staff_id").eq("pharmacy_id", PHARMACY_ID).in("kiosk_note_id", pollNoteIds),
        ]);
        const polls = {};
        for (const o of optData || []) {
          if (!polls[o.kiosk_note_id]) polls[o.kiosk_note_id] = { options: [], votes: [] };
          polls[o.kiosk_note_id].options.push(o);
        }
        for (const v of voteData || []) {
          if (!polls[v.kiosk_note_id]) polls[v.kiosk_note_id] = { options: [], votes: [] };
          polls[v.kiosk_note_id].votes.push(v);
        }
        setPollsByNote(polls);
      } else {
        setPollsByNote({});
      }

      const ids = (data || []).map((n) => n.id);
      if (ids.length) {
        const [{ data: reps }, { data: rx }] = await Promise.all([
          supabase.from("kiosk_note_replies").select("id, note_id, staff_id, body, created_at").eq("pharmacy_id", PHARMACY_ID).in("note_id", ids).order("created_at", { ascending: true }),
          supabase.from("kiosk_note_reactions").select("note_id, staff_id, reaction").eq("pharmacy_id", PHARMACY_ID).in("note_id", ids),
        ]);
        const grouped = {};
        for (const r of reps || []) { (grouped[r.note_id] ||= []).push(r); }
        setRepliesByNote(grouped);
        const by = {};
        for (const row of rx || []) {
          if (!by[row.note_id]) by[row.note_id] = { counts: {}, mine: null };
          by[row.note_id].counts[row.reaction] = (by[row.note_id].counts[row.reaction] || 0) + 1;
          if (Number(row.staff_id) === Number(me.id)) by[row.note_id].mine = row.reaction;
        }
        setReactionsByNote(by);
      } else {
        setRepliesByNote({});
        setReactionsByNote({});
      }
    } catch (err) {
      console.error("Notes load failed:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [me.id]);

  const postNote = async () => {
    const body = noteText.trim();
    if (!body) return;
    setPosting(true);
    try {
      const { data, error } = await supabase.from("kiosk_notes")
        .insert({ body, staff_id: Number(me.id), deleted: false, pharmacy_id: PHARMACY_ID })
        .select("id, body, staff_id, created_at, pinned, deleted, last_activity_at, resolved").single();
      if (error) throw error;
      setNotes((prev) => [data, ...prev]);
      setNoteText("");
    } catch (err) {
      alert("Couldn't post note: " + (err?.message || String(err)));
    } finally {
      setPosting(false);
    }
  };

  const postReply = async (noteId) => {
    const body = String(replyText[noteId] || "").trim();
    if (!body) return;
    setReplySaving(noteId);
    try {
      const { data, error } = await supabase.from("kiosk_note_replies")
        .insert({ note_id: Number(noteId), staff_id: Number(me.id), body, pharmacy_id: PHARMACY_ID })
        .select("id, note_id, staff_id, body, created_at").single();
      if (error) throw error;
      setRepliesByNote((prev) => { const next = { ...prev }; next[noteId] = [...(next[noteId] || []), data]; return next; });
      setReplyText((prev) => ({ ...prev, [noteId]: "" }));
    } catch (err) {
      alert("Couldn't reply: " + (err?.message || String(err)));
    } finally {
      setReplySaving(null);
    }
  };

  const toggleReaction = async (noteId, reaction) => {
    const mine = reactionsByNote[noteId]?.mine || null;
    try {
      if (mine === reaction) {
        await supabase.from("kiosk_note_reactions").delete().eq("note_id", Number(noteId)).eq("staff_id", Number(me.id));
      } else {
        await supabase.from("kiosk_note_reactions").upsert({ note_id: Number(noteId), staff_id: Number(me.id), reaction, pharmacy_id: PHARMACY_ID }, { onConflict: "note_id,staff_id" });
      }
      setReactionsByNote((prev) => {
        const next = { ...prev };
        const entry = next[noteId] || { counts: {}, mine: null };
        const counts = { ...entry.counts };
        const mineNow = entry.mine;
        if (mine === reaction) { counts[reaction] = Math.max(0, (counts[reaction] || 0) - 1); next[noteId] = { counts, mine: null }; return next; }
        if (mineNow && mineNow !== reaction) counts[mineNow] = Math.max(0, (counts[mineNow] || 0) - 1);
        counts[reaction] = (counts[reaction] || 0) + 1;
        next[noteId] = { counts, mine: reaction };
        return next;
      });
    } catch (err) {
      alert("Couldn't react: " + (err?.message || String(err)));
    }
  };

  const castVote = async (noteId, optionId) => {
    const sid = Number(me.id);
    const poll = pollsByNote[noteId];
    if (!poll) return;
    const existing = poll.votes.find((v) => Number(v.staff_id) === sid);
    try {
      if (existing && Number(existing.poll_option_id) === Number(optionId)) return;
      if (existing) await supabase.from("poll_votes").delete().eq("kiosk_note_id", noteId).eq("staff_id", sid);
      await supabase.from("poll_votes").insert({ poll_option_id: optionId, kiosk_note_id: noteId, staff_id: sid, pharmacy_id: PHARMACY_ID });
      setPollsByNote((prev) => {
        const next = { ...prev };
        const p = next[noteId] ? { ...next[noteId], votes: [...next[noteId].votes] } : { options: [], votes: [] };
        p.votes = p.votes.filter((v) => Number(v.staff_id) !== sid);
        p.votes.push({ poll_option_id: optionId, kiosk_note_id: noteId, staff_id: sid });
        next[noteId] = p;
        return next;
      });
    } catch (err) {
      alert("Couldn't vote: " + (err?.message || String(err)));
    }
  };

  const addCustomOption = async (noteId) => {
    const label = String(customOptDraft[noteId] || "").trim();
    if (!label) return;
    const sid = Number(me.id);
    const poll = pollsByNote[noteId] || { options: [], votes: [] };
    if (poll.options.some((o) => o.label.toLowerCase() === label.toLowerCase())) { alert("That option already exists."); return; }
    setCustomOptSaving(noteId);
    try {
      const { data: opt, error: optErr } = await supabase.from("poll_options").insert({ kiosk_note_id: noteId, pharmacy_id: PHARMACY_ID, label, display_order: poll.options.length, added_by_staff_id: sid }).select("id, kiosk_note_id, label, display_order, added_by_staff_id").single();
      if (optErr) throw optErr;
      const existing = poll.votes.find((v) => Number(v.staff_id) === sid);
      if (existing) await supabase.from("poll_votes").delete().eq("kiosk_note_id", noteId).eq("staff_id", sid);
      await supabase.from("poll_votes").insert({ poll_option_id: opt.id, kiosk_note_id: noteId, staff_id: sid, pharmacy_id: PHARMACY_ID });
      setPollsByNote((prev) => {
        const next = { ...prev };
        const p = next[noteId] ? { options: [...next[noteId].options], votes: [...next[noteId].votes] } : { options: [], votes: [] };
        p.options.push(opt);
        p.votes = p.votes.filter((v) => Number(v.staff_id) !== sid);
        p.votes.push({ poll_option_id: opt.id, kiosk_note_id: noteId, staff_id: sid });
        next[noteId] = p;
        return next;
      });
      setCustomOptDraft((prev) => ({ ...prev, [noteId]: "" }));
    } catch (err) {
      alert("Couldn't add option: " + (err?.message || String(err)));
    } finally {
      setCustomOptSaving(null);
    }
  };

  const noteTrunc = (text, max = 160) => {
    const s = String(text || "").trim();
    return s.length <= max ? s : s.slice(0, max - 1) + "…";
  };

  const renderNote = (n) => {
    const author = staffById[n.staff_id];
    const when = new Date(n.created_at).toLocaleString("en-AU", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    const reps = repliesByNote[n.id] || [];
    const rx = reactionsByNote[n.id] || { counts: {}, mine: null };
    const isOpen = expandedId === n.id;
    return (
      <div key={n.id} className={`rounded-xl border p-3 ${n.resolved ? "bg-gray-50 border-gray-200" : "bg-white border-gray-100"}`}>
        <div className="flex items-start gap-2">
          <img src={author?.photo_url || "/placeholder.png"} alt={author?.name || "Staff"} className="w-8 h-8 rounded-full object-cover mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {n.pinned && <span title="Pinned" className="text-red-500 text-xs">📌</span>}
              <span className="text-sm font-medium text-gray-800">{author?.name || "Someone"}</span>
              <span className="text-[11px] text-gray-400">{when}</span>
              {n.resolved && <span className="text-[11px] rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700">✅ Resolved</span>}
            </div>
            {n.type === "poll" ? (
              <div className="mt-1">
                <div className="text-sm font-semibold text-gray-800 mb-2">📊 {n.poll_question || n.body}</div>
                {(() => {
                  const poll = pollsByNote[n.id] || { options: [], votes: [] };
                  const total = poll.votes.length;
                  const sid = Number(me.id);
                  const myVote = poll.votes.find((v) => Number(v.staff_id) === sid);
                  return (
                    <div className="space-y-1.5">
                      {poll.options.map((opt) => {
                        const count = poll.votes.filter((v) => Number(v.poll_option_id) === Number(opt.id)).length;
                        const pct = total ? Math.round((count / total) * 100) : 0;
                        const mine = myVote && Number(myVote.poll_option_id) === Number(opt.id);
                        return (
                          <button
                            key={opt.id}
                            onClick={() => castVote(n.id, opt.id)}
                            disabled={n.resolved}
                            className={`relative w-full text-left rounded-lg border overflow-hidden disabled:cursor-default ${mine ? "border-purple-500" : "border-gray-200"}`}
                          >
                            <div className="absolute inset-0 bg-purple-100" style={{ width: `${pct}%` }} />
                            <div className="relative flex items-center justify-between px-3 py-2 text-sm">
                              <span className={`font-medium ${mine ? "text-purple-800" : "text-gray-700"}`}>{mine && "✓ "}{opt.label}</span>
                              <span className="tabular-nums text-xs text-gray-500">{count} · {pct}%</span>
                            </div>
                          </button>
                        );
                      })}
                      {n.allow_custom_options && !n.resolved && (
                        <div className="flex gap-2 items-center pt-1">
                          <input
                            type="text"
                            value={customOptDraft[n.id] || ""}
                            onChange={(e) => setCustomOptDraft((prev) => ({ ...prev, [n.id]: e.target.value }))}
                            maxLength={100}
                            placeholder="Add your own option…"
                            className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-300"
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomOption(n.id); } }}
                          />
                          <button
                            onClick={() => addCustomOption(n.id)}
                            disabled={customOptSaving === n.id || !(customOptDraft[n.id] || "").trim()}
                            className="rounded-lg px-3 py-1.5 text-xs font-medium bg-purple-600 text-white disabled:opacity-40"
                          >
                            {customOptSaving === n.id ? "…" : "Add"}
                          </button>
                        </div>
                      )}
                      <div className="text-[11px] text-gray-400">{total} vote{total === 1 ? "" : "s"}{n.resolved ? " · closed" : ""}</div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="text-sm text-gray-800 whitespace-pre-wrap break-words mt-1" onClick={() => setExpandedId(isOpen ? null : n.id)}>
                {isOpen ? n.body : noteTrunc(n.body)}
              </div>
            )}

            {/* Footer actions */}
            <div className="mt-2 flex items-center gap-1 flex-wrap">
              <button onClick={() => setExpandedId(isOpen ? null : n.id)} className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${isOpen ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-600"}`}>
                💬 <span>{reps.length}</span>
              </button>
              {!n.resolved && NOTE_REACTIONS.map((r) => {
                const active = rx.mine === r;
                return (
                  <button key={r} onClick={() => toggleReaction(n.id, r)} className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${active ? "border-blue-600 bg-blue-50" : "border-gray-200 bg-white"}`}>
                    {r} <span className="tabular-nums text-gray-600">{rx.counts[r] || 0}</span>
                  </button>
                );
              })}
            </div>

            {/* Replies */}
            {isOpen && (
              <div className="mt-2 rounded-lg border border-gray-200 bg-white p-2">
                <div className="text-[11px] font-medium text-gray-600 mb-1">Replies</div>
                {reps.length === 0 ? (
                  <div className="text-xs text-gray-500">No replies yet.</div>
                ) : (
                  <div className="space-y-2">
                    {reps.map((r) => {
                      const who = staffById[r.staff_id];
                      return (
                        <div key={r.id} className="flex items-start gap-2">
                          <img src={who?.photo_url || "/placeholder.png"} alt={who?.name || "Staff"} className="w-6 h-6 rounded-full object-cover mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] font-medium">{who?.name || "Someone"}</span>
                              <span className="text-[11px] text-gray-400">{new Date(r.created_at).toLocaleString("en-AU", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                            </div>
                            <div className="text-sm whitespace-pre-wrap break-words">{r.body}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {n.resolved ? (
                  <div className="mt-2 border-t pt-2 text-xs text-gray-500">This note is resolved.</div>
                ) : (
                  <div className="mt-2 border-t pt-2">
                    <textarea
                      value={replyText[n.id] || ""}
                      onChange={(e) => setReplyText((prev) => ({ ...prev, [n.id]: e.target.value }))}
                      rows={2}
                      maxLength={500}
                      placeholder="Reply…"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none"
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); postReply(n.id); } }}
                    />
                    <div className="mt-2 flex justify-end">
                      <button onClick={() => postReply(n.id)} disabled={!String(replyText[n.id] || "").trim() || replySaving === n.id} className="rounded-lg px-3 py-1.5 text-sm bg-blue-600 text-white disabled:opacity-40">
                        {replySaving === n.id ? "Posting…" : "Reply"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const openNotes = notes.filter((n) => n.resolved !== true);
  const resolvedNotes = notes.filter((n) => n.resolved === true);

  return (
    <div className="max-w-lg mx-auto space-y-3">
      {/* Composer */}
      <div className="bg-white rounded-2xl shadow-sm border p-3 flex gap-2 items-end">
        <textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="Post a note to the team…"
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-300"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); postNote(); } }}
        />
        <button onClick={postNote} disabled={!noteText.trim() || posting} className="rounded-lg px-3 py-2 text-sm font-medium bg-blue-600 text-white disabled:opacity-40">
          {posting ? "…" : "Post"}
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 text-center mt-6">Loading notes…</div>
      ) : (
        <>
          {openNotes.length === 0 && resolvedNotes.length === 0 && (
            <p className="text-sm text-gray-400 text-center mt-6">No notes yet.</p>
          )}
          <div className="space-y-2">{openNotes.map(renderNote)}</div>
          {resolvedNotes.length > 0 && (
            <div className="pt-2">
              <button onClick={() => setShowResolved((v) => !v)} className="w-full text-xs rounded-lg border border-gray-200 px-3 py-2 text-gray-600 hover:bg-gray-50">
                {showResolved ? "Hide resolved" : `Resolved (${resolvedNotes.length})`}
              </button>
              {showResolved && <div className="space-y-2 mt-2">{resolvedNotes.map(renderNote)}</div>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MessagesTab({ staff }) {
  const [staffList, setStaffList] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeStaffId, setActiveStaffId] = useState(null);
  const [composeText, setComposeText] = useState("");
  const [sending, setSending] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const threadEndRef = useRef(null);

  const me = staff;

  useEffect(() => {
    supabase.from("staff").select("id, name, photo_url, role").eq("pharmacy_id", PHARMACY_ID).eq("active", true).order("name")
      .then(({ data }) => setStaffList((data || []).filter((s) => s.role !== "Locum")));
    loadMessages();
  }, [staff.id]);

  const loadMessages = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("messages")
      .select("*")
      .or(`recipient_staff_id.eq.${me.id},sender_staff_id.eq.${me.id}`)
      .order("created_at", { ascending: true });
    const visible = (data || []).filter((m) => {
      if (m.recipient_staff_id === me.id && m.deleted_by_recipient) return false;
      if (m.sender_staff_id === me.id && m.deleted_by_sender) return false;
      return true;
    });
    setMessages(visible);
    setLoading(false);
  };

  const markThreadRead = async (otherId) => {
    const unreadIds = messages
      .filter((m) => m.recipient_staff_id === me.id && m.sender_staff_id === otherId && !m.read_at)
      .map((m) => m.id);
    if (!unreadIds.length) return;
    await supabase.from("messages").update({ read_at: new Date().toISOString() }).in("id", unreadIds);
    setMessages((prev) => prev.map((m) => unreadIds.includes(m.id) ? { ...m, read_at: new Date().toISOString() } : m));
  };

  const openThread = (otherId) => { setActiveStaffId(otherId); markThreadRead(otherId); };

  const sendMessage = async () => {
    const body = composeText.trim();
    if (!body || !activeStaffId) return;
    setSending(true);
    try {
      const { data, error } = await supabase.from("messages").insert({
        pharmacy_id: PHARMACY_ID, sender_staff_id: me.id, recipient_staff_id: activeStaffId, type: "dm", body,
      }).select("*").single();
      if (error) throw error;
      setMessages((prev) => [...prev, data]);
      setComposeText("");
      // Notify the recipient
      fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staff_ids: [activeStaffId],
          title: `Message from ${me.name}`,
          body: body.length > 80 ? body.slice(0, 80) + "…" : body,
          url: "/me?p=byford",
        }),
      }).catch(() => {});
    } catch (err) {
      alert("Couldn't send: " + (err?.message || String(err)));
    } finally {
      setSending(false);
    }
  };

  const handleImagePick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !activeStaffId) return;
    if (!file.type.startsWith("image/")) { alert("Please choose an image."); return; }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${me.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("message-images").upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("message-images").getPublicUrl(path);
      const { data, error } = await supabase.from("messages").insert({
        pharmacy_id: PHARMACY_ID, sender_staff_id: me.id, recipient_staff_id: activeStaffId, type: "dm", body: null, image_url: pub.publicUrl,
      }).select("*").single();
      if (error) throw error;
      setMessages((prev) => [...prev, data]);
      // Notify the recipient
      fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staff_ids: [activeStaffId],
          title: `Message from ${me.name}`,
          body: "📷 Sent a photo",
          url: "/me?p=byford",
        }),
      }).catch(() => {});
    } catch (err) {
      alert("Couldn't send image: " + (err?.message || String(err)));
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    if (activeStaffId && threadEndRef.current) threadEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [activeStaffId, messages]);

  const staffById = Object.fromEntries(staffList.map((s) => [s.id, s]));

  const conversations = (() => {
    const byOther = {};
    for (const m of messages) {
      const otherId = m.sender_staff_id === me.id ? m.recipient_staff_id : m.sender_staff_id;
      if (!otherId) continue;
      if (!byOther[otherId]) byOther[otherId] = { otherId, last: m, unread: 0 };
      if (new Date(m.created_at) >= new Date(byOther[otherId].last.created_at)) byOther[otherId].last = m;
      if (m.recipient_staff_id === me.id && !m.read_at) byOther[otherId].unread += 1;
    }
    return Object.values(byOther).sort((a, b) => new Date(b.last.created_at) - new Date(a.last.created_at));
  })();

  const systemNotes = messages.filter((m) => m.type === "system" && m.recipient_staff_id === me.id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const activeThread = activeStaffId
    ? messages.filter((m) =>
        (m.sender_staff_id === activeStaffId && m.recipient_staff_id === me.id) ||
        (m.sender_staff_id === me.id && m.recipient_staff_id === activeStaffId)
      ).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    : [];

  return (
    <div className="max-w-lg mx-auto space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-700">{activeStaffId ? staffById[activeStaffId]?.name || "Conversation" : "Messages"}</div>
        {!activeStaffId ? (
          <button onClick={() => setShowNewChat((v) => !v)} className="text-sm bg-blue-600 text-white rounded-lg px-3 py-1.5 font-medium">✏️ New</button>
        ) : (
          <button onClick={() => setActiveStaffId(null)} className="text-sm text-blue-600 hover:underline">← Inbox</button>
        )}
      </div>

      {/* New chat picker */}
      {!activeStaffId && showNewChat && (
        <div className="bg-white rounded-2xl shadow-sm border p-4">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Message someone</div>
          <div className="space-y-1 max-h-[40vh] overflow-y-auto">
            {staffList.filter((s) => s.id !== me.id).map((s) => (
              <button key={s.id} onClick={() => { setShowNewChat(false); openThread(s.id); }} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 text-left">
                <img src={s.photo_url || "/placeholder.png"} alt={s.name} className="w-8 h-8 rounded-full object-cover" />
                <span className="text-sm font-medium text-gray-800">{s.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Inbox */}
      {!activeStaffId && !showNewChat && (
        <>
          {systemNotes.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border p-4">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">🔔 Notifications</div>
              <div className="space-y-2">
                {systemNotes.map((n) => (
                  <div key={n.id} className={`rounded-lg border px-3 py-2 ${n.read_at ? "border-gray-100 bg-gray-50" : "border-blue-200 bg-blue-50"}`}>
                    <div className="text-sm text-gray-800 whitespace-pre-wrap break-words">{n.body}</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">{meFmtWhen(n.created_at)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm border p-4">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Conversations</div>
            {loading ? (
              <div className="text-sm text-gray-400">Loading…</div>
            ) : conversations.length === 0 ? (
              <p className="text-sm text-gray-400">No messages yet. Tap “New” to message someone.</p>
            ) : (
              <div className="space-y-1">
                {conversations.map((c) => {
                  const other = staffById[c.otherId];
                  const preview = c.last.body || (c.last.image_url ? "📷 Photo" : "");
                  return (
                    <button key={c.otherId} onClick={() => openThread(c.otherId)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 text-left">
                      <img src={other?.photo_url || "/placeholder.png"} alt={other?.name} className="w-10 h-10 rounded-full object-cover" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-gray-800 truncate">{other?.name || "Unknown"}</span>
                          <span className="text-[11px] text-gray-400 shrink-0">{meFmtWhen(c.last.created_at)}</span>
                        </div>
                        <div className="text-xs text-gray-500 truncate">{c.last.sender_staff_id === me.id ? "You: " : ""}{preview}</div>
                      </div>
                      {c.unread > 0 && <span className="shrink-0 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-blue-600 text-white text-[11px] font-semibold">{c.unread}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Thread */}
      {activeStaffId && (
        <div className="bg-white rounded-2xl shadow-sm border flex flex-col" style={{ height: "65vh" }}>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {activeThread.length === 0 && <p className="text-sm text-gray-400 text-center mt-4">No messages yet. Say hello 👋</p>}
            {activeThread.map((m) => {
              const mine = m.sender_staff_id === me.id;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] rounded-2xl px-3 py-2 ${mine ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-800"}`}>
                    {m.image_url && (
                      <a href={m.image_url} target="_blank" rel="noopener noreferrer">
                        <img src={m.image_url} alt="" className="rounded-lg max-w-full max-h-64 object-cover mb-1" />
                      </a>
                    )}
                    {m.body && <div className="text-sm whitespace-pre-wrap break-words">{m.body}</div>}
                    <div className={`text-[10px] mt-0.5 ${mine ? "text-blue-100" : "text-gray-400"}`}>
                      {meFmtWhen(m.created_at)}{mine && m.read_at ? " · Seen" : ""}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={threadEndRef} />
          </div>

          <div className="flex gap-2 px-3 py-3 border-t shrink-0 items-end">
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImagePick} className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="rounded-lg px-3 py-2 text-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40" title="Send photo">
              {uploading ? "…" : "📷"}
            </button>
            <textarea
              value={composeText}
              onChange={(e) => setComposeText(e.target.value)}
              rows={1}
              placeholder="Message…"
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-300"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            />
            <button onClick={sendMessage} disabled={!composeText.trim() || sending} className="rounded-lg px-4 py-2 text-sm font-medium bg-blue-600 text-white disabled:opacity-40">
              {sending ? "…" : "Send"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MeEditShiftModal({ shift, staff, onClose, onSaved }) {
  const [noLunch, setNoLunch] = useState(shift.edit?.no_lunch || false);
  const [adjustMins, setAdjustMins] = useState(shift.edit?.adjust_minutes ? String(shift.edit.adjust_minutes) : "");
  const [reason, setReason] = useState(shift.edit?.reason || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const adjNum = Number(adjustMins) || 0;
  const timesChanged = adjNum !== 0;
  const anyChange = noLunch || timesChanged;

  const handleSave = async () => {
    setError("");
    if (!anyChange) { setError("Tick 'no lunch' or change a time to make an edit."); return; }
    if (timesChanged && !reason.trim()) { setError("A reason is required when changing times."); return; }
    setSaving(true);
    const { error: upErr } = await supabase.from("shift_edits").upsert({
      roster_shift_id: shift.id,
      adjust_minutes: adjNum,
      no_lunch: noLunch,
      reason: reason.trim(),
      edited_by_staff_id: staff.id,
      edited_at: new Date().toISOString(),
      pharmacy_id: PHARMACY_ID,
    }, { onConflict: "roster_shift_id" });
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
          {new Date(shift.date + "T00:00:00").toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "short" })}
          {shift.start ? ` · rostered ${String(shift.start).slice(0,5)}–${String(shift.end).slice(0,5)}` : ""}
        </p>

        {!shift.neverDeductsLunch && (
          <label className="flex items-center gap-2 text-sm mb-4 cursor-pointer">
            <input type="checkbox" checked={noLunch} onChange={(e) => setNoLunch(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
            <span className="text-gray-700">No lunch break taken (adds 30 min back)</span>
          </label>
        )}

        <div className="text-xs font-medium text-gray-600 mb-1">Adjust time (optional)</div>
        <div className="flex items-center gap-2 mb-1">
          <input type="number" step="5" value={adjustMins} onChange={(e) => setAdjustMins(e.target.value)} placeholder="0" className="w-28 border rounded-lg px-3 py-1.5 text-sm" />
          <span className="text-sm text-gray-500">minutes</span>
        </div>
        <p className="text-[11px] text-gray-400 mb-4">e.g. <span className="font-medium">30</span> if you stayed late, <span className="font-medium">−30</span> if you left early.</p>

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

function DetailsTab({ staff }) {
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (!window.confirm("Log out of Chalkboard Pocket?")) return;
    setLoggingOut(true);
    try {
      await supabase.auth.signOut();
      try { localStorage.removeItem("cb_pharmacy_id"); } catch (e) {}
      window.location.href = "/me?p=byford";
    } catch (err) {
      setLoggingOut(false);
      alert("Couldn't log out: " + (err?.message || String(err)));
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="bg-white rounded-2xl shadow-sm border p-5">
        <div className="flex items-center gap-3">
          <img src={staff.photo_url || "/placeholder.png"} alt={staff.name} className="w-14 h-14 rounded-full object-cover border" />
          <div className="min-w-0">
            <div className="text-base font-semibold text-gray-800 truncate">{staff.name}</div>
            <div className="text-sm text-gray-500 truncate">{staff.role || ""}</div>
          </div>
        </div>
        {staff.email && (
          <div className="mt-4 pt-4 border-t text-sm">
            <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-0.5">Email</div>
            <div className="text-gray-700 break-words">{staff.email}</div>
          </div>
        )}
      </div>

      <button
        onClick={handleLogout}
        disabled={loggingOut}
        className="w-full border border-red-200 text-red-600 rounded-xl py-3 text-sm font-medium hover:bg-red-50 disabled:opacity-40"
      >
        {loggingOut ? "Logging out…" : "Log out"}
      </button>

      <p className="text-center text-[11px] text-gray-400">More profile details coming soon.</p>
    </div>
  );
}

function WagesTab({ staff }) {
  const [loading, setLoading] = useState(true);
  const [payrollStart, setPayrollStart] = useState(null);
  const [periodOffset, setPeriodOffset] = useState(0);
  const [row, setRow] = useState(null);
  const [approved, setApproved] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [editShift, setEditShift] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    supabase.from("pharmacy_settings").select("payroll_start_date").eq("pharmacy_id", PHARMACY_ID).single()
      .then(({ data }) => setPayrollStart(data?.payroll_start_date || null));
  }, []);

  const getPeriod = () => {
    if (!payrollStart) return null;
    const start = new Date(payrollStart + "T00:00:00");
    const today = new Date();
    let cur = new Date(start);
    while (cur.getTime() + 14 * 86400000 <= today.getTime()) cur.setDate(cur.getDate() + 14);
    cur.setDate(cur.getDate() + periodOffset * 14);
    const end = new Date(cur);
    end.setDate(end.getDate() + 13);
    return { start: cur, end };
  };
  const period = payrollStart ? getPeriod() : null;

  useEffect(() => {
    if (!period) return;
    const load = async () => {
      setLoading(true);
      const startISO = toISO(period.start);
      const endISO = toISO(period.end);

      const [{ data: shifts }, { data: staffData }, { data: holidays }, { data: appr }, { data: leaveData }] = await Promise.all([
        supabase.from("roster_shifts").select("id, shift_date, start_time, end_time, role, staff_id, staff_name").gte("shift_date", startISO).lte("shift_date", endISO),
        supabase.from("staff").select("id, name, role, employment_type, contracted_hours, active, schedule_type, weekly_schedule, week_ab_schedule, no_lunch_deduction").eq("pharmacy_id", PHARMACY_ID),
        supabase.from("public_holidays").select("date, name").eq("pharmacy_id", PHARMACY_ID).gte("date", startISO).lte("date", endISO),
        supabase.from("wage_approvals").select("staff_id").eq("pharmacy_id", PHARMACY_ID).eq("period_start", startISO).eq("staff_id", staff.id),
        supabase.from("leave_requests").select("*").eq("status", "approved").lte("from_date", endISO).gte("to_date", startISO),
      ]);

      const shiftIds = (shifts || []).map((s) => s.id);
      let editsByShift = {}, sickByShift = {};
      if (shiftIds.length) {
        const [{ data: editData }, { data: sickData }] = await Promise.all([
          supabase.from("shift_edits").select("*").in("roster_shift_id", shiftIds),
          supabase.from("sick_days").select("roster_shift_id, leave_type").in("roster_shift_id", shiftIds),
        ]);
        editsByShift = Object.fromEntries((editData || []).map((e) => [e.roster_shift_id, e]));
        sickByShift = Object.fromEntries((sickData || []).map((s) => [s.roster_shift_id, s]));
      }

      const built = buildWageRows({ period, staffData, shifts, holidays, editsByShift, sickByShift, leaveData });
      const mine = built.find((r) => r.staffId === staff.id) || null;
      setRow(mine);
      setApproved((appr || []).length > 0);
      setLoading(false);
    };
    load();
  }, [payrollStart, periodOffset, reloadKey, staff.id]);

  const handleConfirm = async () => {
    if (!period) return;
    setConfirming(true);
    const { error } = await supabase.from("wage_approvals").upsert(
      { staff_id: staff.id, period_start: toISO(period.start), approved_at: new Date().toISOString(), approved_by_staff_id: staff.id, pharmacy_id: PHARMACY_ID },
      { onConflict: "staff_id,period_start" }
    );
    setConfirming(false);
    if (error) { alert("Couldn't confirm: " + error.message); return; }
    setApproved(true);
  };

  const periodLabel = period
    ? `${period.start.toLocaleDateString("en-AU", { day: "numeric", month: "short" })} – ${period.end.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`
    : "—";
  const dayLabel = { weekday: "Weekday", sat: "Saturday", sun: "Sunday", ph: "Public Holiday" };
  const neverDeductsLunch = staff.no_lunch_deduction === true;

  return (
    <div className="max-w-lg mx-auto space-y-4">
      {/* Period nav */}
      <div className="flex items-center justify-between">
        <button onClick={() => setPeriodOffset((o) => o - 1)} className="px-3 py-1.5 rounded-lg border bg-white text-sm hover:bg-gray-50">←</button>
        <div className="text-sm font-semibold text-gray-700 text-center">
          {periodLabel}
          {periodOffset === 0 && <span className="block text-[11px] text-blue-600">Current period</span>}
        </div>
        <button onClick={() => setPeriodOffset((o) => o + 1)} className="px-3 py-1.5 rounded-lg border bg-white text-sm hover:bg-gray-50">→</button>
      </div>

      {!payrollStart ? (
        <div className="text-sm text-gray-400 text-center mt-10">Payroll not set up yet.</div>
      ) : loading ? (
        <div className="text-sm text-gray-400 text-center mt-10">Loading…</div>
      ) : !row ? (
        <div className="bg-white rounded-2xl shadow-sm border p-5 text-sm text-gray-400 text-center">No hours in this pay period.</div>
      ) : (
        <>
          {/* Hours summary */}
          <div className="bg-white rounded-2xl shadow-sm border p-5">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Your hours this fortnight</div>
            {row.isSalary ? (
              <div className="flex justify-between text-sm py-1">
                <span className="text-gray-600">Contracted</span>
                <span className="font-semibold text-gray-800 tabular-nums">{wageFmt(row.contracted)} hrs</span>
              </div>
            ) : (
              <div className="space-y-1.5">
                {[["Weekday", row.weekday], ["Saturday", row.sat], ["Sunday", row.sun], ["Public holiday", row.ph], ["Overtime", row.ot]].map(([label, val]) => (
                  val > 0 && (
                    <div key={label} className="flex justify-between text-sm">
                      <span className="text-gray-600">{label}</span>
                      <span className="tabular-nums text-gray-800">{wageFmt(val)} hrs</span>
                    </div>
                  )
                ))}
                {(row.sick > 0) && <div className="flex justify-between text-sm"><span className="text-gray-500">Sick / carer's</span><span className="tabular-nums text-gray-500">{wageFmt(row.sick)} hrs</span></div>}
                {(row.compassionate > 0) && <div className="flex justify-between text-sm"><span className="text-gray-500">Compassionate</span><span className="tabular-nums text-gray-500">{wageFmt(row.compassionate)} hrs</span></div>}
                {(row.annual > 0) && <div className="flex justify-between text-sm"><span className="text-gray-500">Annual leave</span><span className="tabular-nums text-gray-500">{wageFmt(row.annual)} hrs</span></div>}
              </div>
            )}
            <div className="flex justify-between text-sm font-bold text-gray-900 border-t mt-3 pt-3">
              <span>Total</span>
              <span className="tabular-nums">{wageFmt(row.total)} hrs</span>
            </div>
          </div>

          {/* Shifts list */}
          {!row.isSalary && (
            <div className="bg-white rounded-2xl shadow-sm border p-5">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Shifts this period</div>
              {row.shifts.length === 0 ? (
                <p className="text-xs text-gray-400">No shifts.</p>
              ) : (
                <div className="space-y-2">
                  {[...row.shifts].sort((a, b) => a.date.localeCompare(b.date)).map((sh) => {
                    const edited = !!sh.edit;
                    const canEdit = !sh.isPublicHoliday && !sh.isSick && !sh.isLeave;
                    return (
                      <div key={sh.id} className="flex items-center gap-2 text-sm border-b border-gray-50 pb-2 last:border-0">
                        <div className="min-w-0 flex-1">
                          <div className="text-gray-800">{new Date(sh.date + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}</div>
                          <div className="text-[11px] text-gray-400">
                            {sh.isPublicHoliday ? "Public holiday" : sh.isLeave ? sh.leaveType : sh.isSick ? "Sick / carer's" : `${String(sh.start).slice(0,5)}–${String(sh.end).slice(0,5)}`}
                            {sh.breakDeducted && !sh.isSick && !sh.isLeave ? " · −30 min lunch" : ""}
                            {edited ? ` · ✏️ edited${sh.adjustMins ? ` ${sh.adjustMins > 0 ? "+" : ""}${sh.adjustMins} min` : ""}${sh.edit.no_lunch ? " · no lunch" : ""}` : ""}
                          </div>
                        </div>
                        <span className="tabular-nums text-gray-700 shrink-0">{sh.isSick && !sh.paidSick ? "—" : `${wageFmt(sh.paidHrs)} hrs`}</span>
                        {canEdit && !approved && (
                          <button onClick={() => setEditShift({ ...sh, neverDeductsLunch })} className="text-[11px] text-blue-600 hover:underline shrink-0">
                            {edited ? "Edit" : "Adjust"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Confirm */}
          {!row.isSalary && (
            approved ? (
              <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-4 text-center">
                <div className="text-2xl mb-1">✅</div>
                <div className="text-sm font-semibold text-green-700">Hours confirmed for this period.</div>
              </div>
            ) : (
              <button onClick={handleConfirm} disabled={confirming} className="w-full bg-green-600 text-white rounded-xl py-3 text-sm font-medium disabled:opacity-40">
                {confirming ? "Confirming…" : "Confirm my hours"}
              </button>
            )
          )}
        </>
      )}

      {editShift && (
        <MeEditShiftModal
          shift={editShift}
          staff={staff}
          onClose={() => setEditShift(null)}
          onSaved={() => { setEditShift(null); setReloadKey((k) => k + 1); }}
        />
      )}
    </div>
  );
}

function RosterCombinedTab({ staff }) {
  const [sub, setSub] = useState("shifts"); // "shifts" | "full"
  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="flex gap-1">
        {[{ key: "shifts", label: "📅 My shifts" }, { key: "full", label: "🗓️ Full roster" }].map((t) => (
          <button key={t.key} onClick={() => setSub(t.key)}
            className={`flex-1 text-sm rounded-lg py-2 font-medium ${sub === t.key ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            {t.label}
          </button>
        ))}
      </div>
      {sub === "shifts" ? <ShiftsTab staff={staff} /> : <FullRosterTab staff={staff} />}
    </div>
  );
}

function FullRosterTab({ staff }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [shiftsByDate, setShiftsByDate] = useState({});
  const [sickByShift, setSickByShift] = useState({});
  const [publishedMonths, setPublishedMonths] = useState(new Set());

  // Monday of the current displayed week
  const getMonday = (offset) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const day = (d.getDay() + 6) % 7; // 0 = Monday
    d.setDate(d.getDate() - day + offset * 7);
    return d;
  };

  const monday = getMonday(weekOffset);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
  const toStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const startStr = toStr(weekDays[0]);
      const endStr = toStr(weekDays[6]);

      const { data: shiftData } = await supabase
        .from("roster_shifts")
        .select("id, shift_date, start_time, end_time, role, staff_id, staff_name, staff:staff_id(id, name)")
        .gte("shift_date", startStr)
        .lte("shift_date", endStr);
      const rows = shiftData || [];

      // Which of this week's months are published
      const monthDates = [...new Set(weekDays.map((d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`))];
      const { data: months } = await supabase
        .from("roster_months")
        .select("month, status")
        .in("month", monthDates);
      const pub = new Set((months || []).filter((m) => m.status === "published").map((m) => m.month.slice(0, 7)));
      setPublishedMonths(pub);

      // Absences
      const ids = rows.map((s) => s.id);
      let sickMap = {};
      if (ids.length) {
        const { data: sick } = await supabase
          .from("sick_days")
          .select("roster_shift_id, leave_type")
          .in("roster_shift_id", ids);
        (sick || []).forEach((s) => { sickMap[s.roster_shift_id] = s.leave_type; });
      }
      setSickByShift(sickMap);

      const byDate = {};
      rows.forEach((s) => {
        if (!byDate[s.shift_date]) byDate[s.shift_date] = [];
        byDate[s.shift_date].push(s);
      });
      setShiftsByDate(byDate);
      setLoading(false);
    };
    load();
  }, [weekOffset, staff.id]);

  const weekLabel = `${monday.toLocaleDateString("en-AU", { day: "numeric", month: "short" })} – ${weekDays[6].toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`;
  const todayStr = toStr(new Date());

  return (
    <div className="max-w-lg mx-auto">
      {/* Week nav */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setWeekOffset((w) => w - 1)} className="px-3 py-1.5 rounded-lg border bg-white text-sm hover:bg-gray-50">←</button>
        <div className="text-sm font-semibold text-gray-700 text-center">
          {weekLabel}
          {weekOffset !== 0 && (
            <button onClick={() => setWeekOffset(0)} className="block mx-auto text-[11px] text-blue-600 hover:underline">Back to this week</button>
          )}
        </div>
        <button onClick={() => setWeekOffset((w) => w + 1)} className="px-3 py-1.5 rounded-lg border bg-white text-sm hover:bg-gray-50">→</button>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 text-center mt-10">Loading…</div>
      ) : (
        <div className="space-y-2">
          {weekDays.map((d) => {
            const dateStr = toStr(d);
            const ym = dateStr.slice(0, 7);
            const isPublished = publishedMonths.has(ym);
            const isToday = dateStr === todayStr;
            const dayShifts = sortRosterShifts(shiftsByDate[dateStr] || []);
            return (
              <div key={dateStr} className={`bg-white rounded-xl border ${isToday ? "border-blue-300 ring-1 ring-blue-200" : ""}`}>
                <div className={`px-3 py-2 border-b text-sm font-semibold ${isToday ? "text-blue-700" : "text-gray-700"}`}>
                  {d.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "short" })}
                  {isToday && <span className="ml-2 text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full">Today</span>}
                </div>
                <div className="px-3 py-2">
                  {!isPublished ? (
                    <div className="text-xs text-gray-400 italic">Not published yet</div>
                  ) : dayShifts.length === 0 ? (
                    <div className="text-xs text-gray-400">No one rostered.</div>
                  ) : (
                    <div className="space-y-1">
                      {dayShifts.map((s) => {
                        const name = s.staff?.name || s.staff_name || null;
                        const isTBC = !s.staff_id && !s.staff_name;
                        const absence = sickByShift[s.id];
                        const isMe = s.staff_id && String(s.staff_id) === String(staff.id);
                        return (
                          <div key={s.id} className="flex items-center justify-between gap-2 text-xs">
                            <span className={`truncate ${absence === "compassionate" ? "text-purple-400 line-through" : absence ? "text-red-400 line-through" : isTBC ? "text-red-500 font-medium" : "text-gray-700"} ${isMe ? "font-bold" : ""}`}>
                              {absence === "compassionate" ? "🕊️ " : absence ? "🤒 " : ""}{isTBC ? `TBC ${s.role}` : name}
                            </span>
                            <span className="text-gray-500 shrink-0">{formatTime(s.start_time)}–{formatTime(s.end_time)}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LoginScreen({ onLoggedIn }) {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleSendReset = async () => {
    if (!email.trim()) { setErr("Enter your email first."); return; }
    setBusy(true); setErr("");
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset`,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setResetSent(true);
  };

  // Match the authenticated email to a staff row and hand it back up.
  const linkAndFinish = async (authEmail) => {
    const { data, error } = await supabase
      .from("staff").select("*").ilike("email", authEmail).maybeSingle();
    if (error || !data) { setErr("No staff record found for this email. Ask your manager to add it."); return false; }
    if (data.active === false) { setErr("This account is no longer active."); return false; }
    onLoggedIn(data);
    return true;
  };

  // One flow: try to log in; if no account yet, create it (email must be on file).
  const handleContinue = async () => {
    if (!email.trim() || !password) { setErr("Enter your email and password."); return; }
    if (password.length < 6) { setErr("Password must be at least 6 characters."); return; }
    setBusy(true); setErr("");

    // Try logging in first.
    const login = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (!login.error) {
      await linkAndFinish(login.data.user.email);
      setBusy(false);
      return;
    }

    // Login failed. If it's because the account doesn't exist, create it.
    const msg = (login.error.message || "").toLowerCase();
    const noAccount = msg.includes("invalid login credentials");
    if (!noAccount) { setErr(login.error.message); setBusy(false); return; }

    // Account may not exist yet — confirm email is on file, then sign up.
    const { data: staffRow } = await supabase
      .from("staff").select("id, active").ilike("email", email.trim()).maybeSingle();
    if (!staffRow) { setErr("That email isn't on file. Ask your manager to add it first."); setBusy(false); return; }
    if (staffRow.active === false) { setErr("This account is no longer active."); setBusy(false); return; }

    const signup = await supabase.auth.signUp({ email: email.trim(), password });
    if (signup.error) {
      // If it already existed, the password was just wrong.
      const smsg = (signup.error.message || "").toLowerCase();
      if (smsg.includes("already registered")) setErr("Incorrect password.");
      else setErr(signup.error.message);
      setBusy(false);
      return;
    }
    if (signup.data.session) {
      await linkAndFinish(signup.data.user.email);
    } else {
      setErr("Account created. Please enter your password again to log in.");
    }
    setBusy(false);
  };

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50 px-6">
      <div className="bg-white rounded-2xl shadow-sm border p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <img src="/icons/icon-192.png" alt="" className="w-14 h-14 rounded-xl mx-auto mb-3" />
          <h1 className="text-lg font-bold text-gray-800">Byford Pharmacy</h1>
          <p className="text-sm text-gray-500 mt-1">Log in with your work email.</p>
        </div>

        <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
        <input
          type="email" autoComplete="email" value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border rounded-lg px-3 py-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="email@example.com"
        />

        {!resetMode && (
          <>
            <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
            <input
              type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleContinue()}
              className="w-full border rounded-lg px-3 py-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="••••••••"
            />
          </>
        )}

        {resetMode && !resetSent && (
          <p className="text-xs text-gray-500 mb-3">Enter your email and we'll send you a link to reset your password.</p>
        )}

        {err && <p className="text-sm text-red-500 mb-3">{err}</p>}

        {resetMode ? (
          resetSent ? (
            <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-3 text-center text-sm text-green-700">
              ✅ If that email is on file, a reset link is on its way. Check your inbox.
              <button onClick={() => { setResetMode(false); setResetSent(false); }} className="block mx-auto mt-2 text-xs text-green-700 underline">Back to login</button>
            </div>
          ) : (
            <>
              <button
                onClick={handleSendReset}
                disabled={busy}
                className="w-full bg-blue-600 text-white rounded-lg py-2.5 font-medium disabled:opacity-40"
              >
                {busy ? "Sending…" : "Send reset link"}
              </button>
              <button onClick={() => { setResetMode(false); setErr(""); }} className="block mx-auto mt-3 text-xs text-gray-500 underline">
                Back to login
              </button>
            </>
          )
        ) : (
          <>
            <button
              onClick={handleContinue}
              disabled={busy}
              className="w-full bg-blue-600 text-white rounded-lg py-2.5 font-medium disabled:opacity-40"
            >
              {busy ? "Please wait…" : "Continue"}
            </button>

            <button onClick={() => { setResetMode(true); setErr(""); }} className="block mx-auto mt-3 text-xs text-blue-600 underline">
              Forgot password?
            </button>

            <p className="text-center text-[11px] text-gray-400 mt-4">
              First time logging in? Just enter your work email and choose a password.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function MePage() {
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(null);
  const [staff, setStaff] = useState(null);
  const [error, setError] = useState("");

  // ── PWA install banner ──
  const [installEvent, setInstallEvent] = useState(null); // Android/Chrome prompt
  const [showIosHint, setShowIosHint] = useState(false);   // iOS instructions
  const [installDismissed, setInstallDismissed] = useState(false);

  useEffect(() => {
    // Already installed / running as app → never show the banner
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
    if (standalone) return;
    if (sessionStorage.getItem("cb_install_dismissed") === "1") {
      setInstallDismissed(true);
      return;
    }

    // Android/Chrome: capture the install prompt for a custom button
    const onPrompt = (e) => {
      e.preventDefault();
      setInstallEvent(e);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    // iOS Safari: no prompt event exists — detect and show manual hint
    const ua = window.navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(ua);
    const isSafari = /safari/.test(ua) && !/crios|fxios|edgios/.test(ua);
    if (isIos && isSafari) setShowIosHint(true);

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const handleInstallClick = async () => {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  };

  const dismissInstall = () => {
    sessionStorage.setItem("cb_install_dismissed", "1");
    setInstallDismissed(true);
    setInstallEvent(null);
    setShowIosHint(false);
  };

  // PIN gate
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [checking, setChecking] = useState(false);

  const [tab, setTab] = useState("roster");
  const [unreadCount, setUnreadCount] = useState(0);
  const [newBoardCount, setNewBoardCount] = useState(0);
  const [leaveUpdate, setLeaveUpdate] = useState(false);

  // Unread message count + new board posts for the tab badge
  useEffect(() => {
    if (!staff?.id) return;
    supabase
      .from("messages")
      .select("id")
      .eq("recipient_staff_id", staff.id)
      .is("read_at", null)
      .eq("deleted_by_recipient", false)
      .then(({ data }) => setUnreadCount((data || []).length));

    // New board posts since last viewed
    const lastSeen = staff.board_last_seen_at;
    let query = supabase
      .from("kiosk_notes")
      .select("id", { count: "exact", head: true })
      .eq("pharmacy_id", PHARMACY_ID)
      .or("deleted.is.null,deleted.eq.false")
      .neq("staff_id", staff.id); // don't count own posts
    if (lastSeen) query = query.gt("created_at", lastSeen);
    query.then(({ count }) => setNewBoardCount(count || 0));
  }, [staff?.id, tab]);

  // Register this device for push notifications once logged in.
  useEffect(() => {
    if (!staff?.id) return;
    subscribeToPush(staff);
  }, [staff?.id]);

  // Leave status update indicator for the Time off tab
  useEffect(() => {
    if (!staff?.id) return;
    supabase
      .from("leave_requests")
      .select("status, staff_seen_status")
      .eq("staff_id", staff.id)
      .neq("status", "pending")
      .then(({ data }) => {
        const hasUpdate = (data || []).some((lr) => lr.status !== lr.staff_seen_status);
        setLeaveUpdate(hasUpdate);
      });
  }, [staff?.id, tab]);

  // When the Time off tab is opened, mark this staff member's requests as seen
  useEffect(() => {
    if (!staff?.id || tab !== "timeoff") return;
    const markSeen = async () => {
      try {
        const { data } = await supabase
          .from("leave_requests")
          .select("id, status, staff_seen_status")
          .eq("staff_id", staff.id)
          .neq("status", "pending");
        const toUpdate = (data || []).filter((lr) => lr.status !== lr.staff_seen_status);
        for (const lr of toUpdate) {
          await supabase.from("leave_requests").update({ staff_seen_status: lr.status }).eq("id", lr.id);
        }
        if (toUpdate.length) setLeaveUpdate(false);
      } catch (err) {
        console.error("Mark leave seen failed:", err);
      }
    };
    markSeen();
  }, [staff?.id, tab]);

  // Identity resolution: Auth session first, then legacy ?token= fallback.
  useEffect(() => {
    const resolve = async () => {
      const params = new URLSearchParams(window.location.search);

      // ── Legacy path: ?token=xxx still works exactly as before ──
      let t = params.get("token");
      if (t) {
        setToken(t);
        const { data, error: err } = await supabase
          .from("staff").select("*").eq("staff_token", t).maybeSingle();
        if (err || !data) setError("invalid_token");
        else if (data.active === false) setError("inactive");
        else { setStaff(data); setUnlocked(true); } // token already proves identity
        setLoading(false);
        return;
      }

      // ── Auth path ──
      // Remember which pharmacy this device belongs to (from ?p= slug).
      const slug = params.get("p");
      if (slug) {
        const { data: ph } = await supabase
          .from("pharmacies").select("id, slug").eq("slug", slug).maybeSingle();
        if (ph) { try { localStorage.setItem("cb_pharmacy_id", ph.id); } catch (e) {} }
      }

      // Is someone already logged in?
      const { data: sessionData } = await supabase.auth.getSession();
      const authUser = sessionData?.session?.user || null;

      if (authUser) {
        await linkStaff(authUser.email);
      } else {
        setLoading(false); // show login screen
      }
    };

    // Match the logged-in email to a staff row and load it.
    const linkStaff = async (email) => {
      const { data, error: err } = await supabase
        .from("staff").select("*").ilike("email", email).maybeSingle();
      if (err || !data) { setError("no_staff_match"); }
      else if (data.active === false) { setError("inactive"); }
      else { setStaff(data); setUnlocked(true); } // Auth already proves identity
      setLoading(false);
    };

    resolve();
  }, []);

  const handlePinSubmit = () => {
    if (pin.length !== 4) return;
    setChecking(true);
    setPinError("");
    // Token already identifies the person — just verify their own PIN
    if (staff?.pin && pin === staff.pin) {
      setUnlocked(true);
    } else {
      setPinError("Incorrect PIN.");
      setPin("");
    }
    setChecking(false);
  };

  // ─── Loading / error screens ───
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-400">Loading…</div>
      </div>
    );
  }

  if (error) {
    const messages = {
      no_token: "No access link provided. Please use your personal link.",
      invalid_token: "This link isn’t valid. Ask your manager for a new one.",
      inactive: "This account is no longer active.",
    };
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 px-6">
        <div className="bg-white rounded-2xl shadow-sm border p-8 max-w-sm text-center">
          <div className="text-3xl mb-3">🔒</div>
          <p className="text-sm text-gray-600">{messages[error] || "Something went wrong."}</p>
          <p className="text-xs text-gray-400 mt-2">code: {error}</p>
        </div>
      </div>
    );
  }

  // ─── Email + password login (Auth) ───
  if (!unlocked) {
    return <LoginScreen onLoggedIn={(s) => { setStaff(s); setUnlocked(true); }} />;
  }

  // ─── Main portal ───
  const TABS = [
    { key: "roster", label: "Roster", icon: "📅" },
    { key: "timeoff", label: "Time off", icon: "✅" },
    { key: "wages", label: "Wages", icon: "💰" },
    { key: "messages", label: "Messages", icon: "💬" },
    { key: "details", label: "Details", icon: "👤" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header
        className="bg-white border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-10"
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}
      >
        <img
          src={staff.photo_url || "/placeholder.png"}
          alt={staff.name}
          className="w-10 h-10 rounded-full object-cover border"
        />
        <div className="min-w-0">
          <div className="text-sm font-bold text-gray-800 truncate">{staff.name}</div>
          <div className="text-xs text-gray-400 truncate">{staff.role || ""}</div>
        </div>
      </header>

      {/* Install app banner */}
      {!installDismissed && (installEvent || showIosHint) && (
        <div className="bg-[#12282c] text-white px-4 py-3 flex items-start gap-3">
          <img src="/icons/icon-192.png" alt="" className="w-9 h-9 rounded-lg shrink-0" />
          <div className="min-w-0 flex-1">
            {installEvent ? (
              <>
                <div className="text-sm font-semibold">Add Chalkboard to your phone</div>
                <div className="text-xs text-gray-300">Open it like an app, straight from your home screen.</div>
                <div className="mt-2 flex gap-2">
                  <button onClick={handleInstallClick} className="bg-white text-[#12282c] rounded-lg px-3 py-1.5 text-xs font-semibold">
                    Install
                  </button>
                  <button onClick={dismissInstall} className="text-gray-300 text-xs px-2">
                    Not now
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="text-sm font-semibold">Add Chalkboard to your phone</div>
                <div className="text-xs text-gray-300 mt-0.5">
                  Tap the Share button <span className="inline-block">⬆️</span> below, then choose <span className="font-medium">“Add to Home Screen”</span>.
                </div>
                <button onClick={dismissInstall} className="mt-2 text-gray-300 text-xs underline">
                  Got it
                </button>
              </>
            )}
          </div>
        </div>
      )}

      

      {/* Content */}
      <main className="flex-1 p-4" style={{ paddingBottom: "calc(5rem + env(safe-area-inset-bottom))" }}>
        {tab === "roster" ? (
          <RosterCombinedTab staff={staff} />
        ) : tab === "timeoff" ? (
          <TimeOffTab staff={staff} />
        ) : tab === "wages" ? (
          <WagesTab staff={staff} />
        ) : tab === "messages" ? (
          <MessagesCombinedTab staff={staff} onBoardSeen={() => setNewBoardCount(0)} newBoardCount={newBoardCount} unreadCount={unreadCount} />
        ) : tab === "details" ? (
          <DetailsTab staff={staff} />
        ) : (
          <div className="text-sm text-gray-400 text-center mt-10">
            {TABS.find((t) => t.key === tab)?.label} tab — coming next.
          </div>
        )}
      </main>

      {/* Bottom tab bar */}
      <nav
        className="bg-white border-t flex fixed bottom-0 left-0 right-0 z-20"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`relative flex-1 py-2 text-[11px] font-medium flex flex-col items-center gap-0.5 ${
              tab === t.key ? "text-blue-600" : "text-gray-400"
            }`}
          >
            <span className="relative text-xl">
              {t.icon}
              {t.key === "messages" && unreadCount > 0 && (
                <span className="absolute -top-1 -right-2.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold leading-none">
                  {unreadCount}
                </span>
              )}
              {t.key === "messages" && unreadCount === 0 && newBoardCount > 0 && (
                <span className="absolute -top-1 -right-1 inline-flex items-center justify-center h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
              )}
              {t.key === "timeoff" && leaveUpdate && (
                <span className="absolute -top-1 -right-2 inline-flex items-center justify-center h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" title="Leave request update" />
              )}
            </span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}