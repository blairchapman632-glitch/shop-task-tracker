import React, { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import supabase from "../lib/supabaseClient";

// ─── Helpers ────────────────────────────────────────────────────────────────

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
  pharmacist: "text-purple-700",
  Pharmacist: "text-purple-700",
  locum: "text-blue-700",
  Locum: "text-blue-700",
  DAA: "text-orange-600",
  "DAA Coordinator": "text-orange-600",
  "pharmacy assistant": "text-teal-700",
  "Pharmacy Assistant": "text-teal-700",
  "Intern Pharmacist": "text-purple-500",
  Manager: "text-gray-700",
};

const roleBorder = {
  pharmacist: "border-purple-400",
  Pharmacist: "border-purple-400",
  locum: "border-blue-400",
  Locum: "border-blue-400",
  DAA: "border-orange-400",
  "DAA Coordinator": "border-orange-400",
  "pharmacy assistant": "border-teal-400",
  "Pharmacy Assistant": "border-teal-400",
  "Intern Pharmacist": "border-purple-300",
  Manager: "border-gray-400",
};

const holidayEmoji = {
  newyear: "🎆",
  australia: "🦘",
  easter: "🐣",
  anzac: "🌺",
  wa: "⚓",
  christmas: "🎅",
  default: "🏖️",
};

const ROLES = ["Pharmacist", "Locum", "DAA Coordinator", "Pharmacy Assistant", "Intern Pharmacist", "Manager"];

const toMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const [h, m] = String(timeStr).split(":").map(Number);
  return h * 60 + (m || 0);
};

const minutesToHours = (mins) => Math.round((mins / 60) * 100) / 100;

// ─── Main Component ──────────────────────────────────────────────────────────

export default function RosterPage() {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const [pinEntered, setPinEntered] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);

  const handlePinSubmit = async () => {
    const { data, error } = await supabase
      .from("staff")
      .select("id")
      .eq("pharmacy_id", "81ab394f-d642-4246-b896-e71938b25671")
      .eq("pin", pinInput)
      .eq("can_access_roster", true)
      .single();
    if (data && !error) {
      setPinEntered(true);
      setPinError(false);
    } else {
      setPinError(true);
      setPinInput("");
    }
  };

  // ── State ──
  const [monthOffset, setMonthOffset] = useState(0);
  const [shifts, setShifts] = useState([]);
  const [staffOptions, setStaffOptions] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  

  // Add shift form
  const [newStaffId, setNewStaffId] = useState("");
  const [newStaffName, setNewStaffName] = useState("");
  const [newRole, setNewRole] = useState("pharmacist");
  const [newStart, setNewStart] = useState("09:00");
  const [newEnd, setNewEnd] = useState("17:00");
  const [savingShift, setSavingShift] = useState(false);

  // Edit shift
  const [editingShiftId, setEditingShiftId] = useState(null);
  const [editStaffId, setEditStaffId] = useState("");
  const [editStaffName, setEditStaffName] = useState("");
  const [editRole, setEditRole] = useState("pharmacist");
  const [editStart, setEditStart] = useState("09:00");
  const [editEnd, setEditEnd] = useState("17:00");
  const [savingEdit, setSavingEdit] = useState(false);

  // Drag
  const [draggedShiftId, setDraggedShiftId] = useState(null);
  const [dragTargetDate, setDragTargetDate] = useState(null);
  const [dragCopyMode, setDragCopyMode] = useState(false);
  const [savingDrag, setSavingDrag] = useState(false);

  // Print image
  const [printImage, setPrintImage] = useState("none");

  // Publish status
  const [monthStatus, setMonthStatus] = useState("draft");
  const [publishingMonth, setPublishingMonth] = useState(false);

  // Sick days
  const [sickByShift, setSickByShift] = useState({});

  // Availability data (all staff) for conflict detection
  const [allPatterns, setAllPatterns] = useState([]);
  const [allOverrides, setAllOverrides] = useState([]);
  const [showIssues, setShowIssues] = useState(false);

  // Leave requests
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [approvedLeave, setApprovedLeave] = useState([]);
  const [showRequests, setShowRequests] = useState(false);
  const [requestManagerNotes, setRequestManagerNotes] = useState({});
  const [processingLeaveId, setProcessingLeaveId] = useState(null);

  // Notes
  const [dayNotes, setDayNotes] = useState({});
  const [monthNote, setMonthNote] = useState("");
  const [savingDayNote, setSavingDayNote] = useState(false);
  const [savingMonthNote, setSavingMonthNote] = useState(false);

  // Settings panel
  const [pharmacyId, setPharmacyId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState("holidays");

  // Holiday management
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [newHolidayName, setNewHolidayName] = useState("");
  const [newHolidayKey, setNewHolidayKey] = useState("default");
  const [savingHoliday, setSavingHoliday] = useState(false);

  // Template management
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateRole, setNewTemplateRole] = useState("pharmacist");
  const [newTemplateStart, setNewTemplateStart] = useState("09:00");
  const [newTemplateEnd, setNewTemplateEnd] = useState("17:00");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [editTemplateName, setEditTemplateName] = useState("");
  const [editTemplateRole, setEditTemplateRole] = useState("pharmacist");
  const [editTemplateStart, setEditTemplateStart] = useState("09:00");
  const [editTemplateEnd, setEditTemplateEnd] = useState("17:00");
  const [savingTemplateEdit, setSavingTemplateEdit] = useState(false);

  // ── Derived ──
  const displayMonth = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const currentYear = displayMonth.getFullYear();
  const currentMonth = displayMonth.getMonth();

  const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const startOffset = (firstDayOfMonth.getDay() + 6) % 7;

  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const sortShifts = (shiftsToSort) => {
    const roleGroup = (role) => {
      const r = (role || "").toLowerCase();
      if (r === "pharmacy assistant" || r === "daa" || r === "daa coordinator") return 0;
      return 1;
    };
    return [...shiftsToSort].sort((a, b) => {
      const groupDiff = roleGroup(a.role) - roleGroup(b.role);
      if (groupDiff !== 0) return groupDiff;
      return (a.start_time || "").localeCompare(b.start_time || "");
    });
  };

const selectedDayShifts = selectedDate
    ? sortShifts(shifts.filter((s) => s.shift_date === selectedDate))
    : [];

  const selectedHoliday = selectedDate
    ? holidays.find((h) => h.date === selectedDate)
    : null;

  // ── Availability conflict detection ──
  const getShiftConflict = (shift) => {
    if (!shift.staff_id) return null; // TBC handled separately
    const date = shift.shift_date;

    // Approved leave covering this date takes top priority
    const leave = approvedLeave.find((lr) =>
      String(lr.staff_id) === String(shift.staff_id) &&
      date >= lr.from_date && date <= lr.to_date
    );
    if (leave) return `On ${leave.leave_type}`;

    // Override for this exact date takes priority
    const ovr = allOverrides.find((o) => String(o.staff_id) === String(shift.staff_id) && o.override_date === date);
    let status = null;
    if (ovr) {
      status = ovr.status;
    } else {
      const dow = new Date(date + "T00:00:00").getDay();
      const pats = allPatterns.filter((p) => String(p.staff_id) === String(shift.staff_id) && p.day_of_week === dow);
      status = pats[0]?.status || null;
    }
    if (!status || status === "all_day") return null;
    if (status === "unavailable") return "Marked unavailable";
    const startMin = toMinutes(shift.start_time);
    const endMin = toMinutes(shift.end_time);
    const NOON = 12 * 60;
    if (status === "am" && endMin > NOON) return "Available mornings only";
    if (status === "pm" && startMin < NOON) return "Available afternoons only";
    return null;
  };

  // ── Data loading ──
  const refreshDayNotes = useCallback(async () => {
    const monthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;
    const startDate = `${monthStr}-01`;
    const endDate = `${currentYear}-${String(currentMonth + 2).padStart(2, "0")}-01`;
    const { data } = await supabase.from("roster_day_notes").select("*").gte("date", startDate).lt("date", endDate);
    const map = {};
    (data || []).forEach((n) => { map[n.date] = n.note; });
    setDayNotes(map);
  }, [currentYear, currentMonth]);

  const refreshMonthNote = useCallback(async () => {
    const monthDate = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`;
    const { data } = await supabase.from("roster_month_notes").select("*").eq("month", monthDate).maybeSingle();
    setMonthNote(data?.note || "");
  }, [currentYear, currentMonth]);

  const refreshSick = useCallback(async () => {
    const { data } = await supabase.from("sick_days").select("*");
    const map = {};
    (data || []).forEach((s) => { map[s.roster_shift_id] = s; });
    setSickByShift(map);
  }, []);
const refreshLeave = useCallback(async () => {
    const { data } = await supabase
      .from("leave_requests")
      .select("*, staff:staff_id(id, name)")
      .order("from_date", { ascending: true });
    const all = data || [];
    setLeaveRequests(all);
    setApprovedLeave(all.filter((lr) => lr.status === "approved"));
  }, []);
  const refreshShifts = useCallback(async () => {
    const { data, error } = await supabase
      .from("roster_shifts")
      .select(`id, shift_date, start_time, end_time, role, staff_id, staff_name, notes, pharmacy_id, staff:staff_id(id, name)`);
    if (!error) {
      setShifts(data || []);
      const foundPharmacyId = (data || []).find((s) => s.pharmacy_id)?.pharmacy_id || null;
      if (foundPharmacyId) setPharmacyId(foundPharmacyId);
    }
    await refreshSick();
  }, [refreshSick]);

  useEffect(() => {
    const load = async () => {
      const monthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;
      const startDate = `${monthStr}-01`;
      const endDate = `${currentYear}-${String(currentMonth + 2).padStart(2, "0")}-01`;
      const monthDate = `${monthStr}-01`;

      const [
        { data: shiftData },
        { data: staffData },
        { data: templateData },
        { data: holidayData },
        { data: dayNoteData },
        { data: monthNoteData },
        { data: rosterMonthData },
      ] = await Promise.all([
        supabase.from("roster_shifts").select(`id, shift_date, start_time, end_time, role, staff_id, staff_name, notes, pharmacy_id, staff:staff_id(id, name)`),
        supabase.from("staff").select("id,name,active,role").neq("role", "Locum").order("name"),
        supabase.from("shift_templates").select("*").order("name"),
        supabase.from("public_holidays").select("*"),
        supabase.from("roster_day_notes").select("*").gte("date", startDate).lt("date", endDate),
        supabase.from("roster_month_notes").select("*").eq("month", monthDate).maybeSingle(),
        supabase.from("roster_months").select("id, status").eq("month", monthDate).maybeSingle(),
      ]);

      // Availability data for conflict detection (all staff)
      const [{ data: patData }, { data: ovrData }] = await Promise.all([
        supabase.from("availability_patterns").select("staff_id, day_of_week, status").eq("year_month", monthStr),
        supabase.from("availability_overrides").select("staff_id, override_date, status"),
      ]);
      setAllPatterns(patData || []);
      setAllOverrides(ovrData || []);

      // Leave requests
      const { data: leaveData } = await supabase
        .from("leave_requests")
        .select("*, staff:staff_id(id, name)")
        .order("from_date", { ascending: true });
      const allLeave = leaveData || [];
      setLeaveRequests(allLeave);
      setApprovedLeave(allLeave.filter((lr) => lr.status === "approved"));

      setShifts(shiftData || []);
      refreshSick();
      setStaffOptions((staffData || []).filter((s) => s.active !== false));
      setTemplates(templateData || []);
      setHolidays(holidayData || []);
      setMonthStatus(rosterMonthData?.status || "draft");

      const foundPharmacyId = (shiftData || []).find((s) => s.pharmacy_id)?.pharmacy_id || null;
      if (foundPharmacyId) setPharmacyId(foundPharmacyId);

      const map = {};
      (dayNoteData || []).forEach((n) => { map[n.date] = n.note; });
      setDayNotes(map);
      setMonthNote(monthNoteData?.note || "");
    };
    load();
  }, [monthOffset]);
// Reload availability panel when month changes
  useEffect(() => {
    if (showAvailability && availStaffId) {
      loadStaffAvailability(availStaffId);
    }
  }, [monthOffset]);
  // ── Hours summary ──
  const monthHours = () => {
    const monthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;
    const monthShifts = shifts.filter((s) => s.shift_date?.startsWith(monthStr));
    const map = {};
    monthShifts.forEach((s) => {
      const name = s.staff?.name || s.staff_name || null;
      if (!name) return;
      if (!s.start_time || !s.end_time) return;
      const start = toMinutes(s.start_time);
      const end = toMinutes(s.end_time);
      const mins = end > start ? end - start : 0;
      if (mins <= 0) return;
      if (!map[name]) map[name] = 0;
      map[name] += mins;
    });
    return Object.entries(map)
      .map(([name, mins]) => ({ name, hours: minutesToHours(mins) }))
      .sort((a, b) => b.hours - a.hours);
  };

  // ── Roster month helper ──
  const getRosterMonthId = async (dateStr) => {
    const monthDate = `${dateStr.slice(0, 7)}-01`;
    const { data: existing } = await supabase.from("roster_months").select("id").eq("month", monthDate).maybeSingle();
    if (existing?.id) return existing.id;
    const { data: created, error } = await supabase.from("roster_months").insert([{ month: monthDate, status: "draft", pharmacy_id: pharmacyId }]).select("id").single();
    if (error) throw error;
    return created.id;
  };

  // ── Add shift ──
  const handleAddShift = async () => {
    if (!selectedDate) return;
    const resolvedStaffId = newStaffId === "other" || newStaffId === "" ? null : newStaffId ? Number(newStaffId) : null;
    const resolvedStaffName = newStaffId === "other" ? newStaffName.trim() : null;
    if (!newStart || !newEnd) { alert("Please enter start and end times."); return; }
    try {
      setSavingShift(true);
      const rosterMonthId = await getRosterMonthId(selectedDate);
      const { error } = await supabase.from("roster_shifts").insert([{
        staff_id: resolvedStaffId,
        staff_name: resolvedStaffName,
        shift_date: selectedDate,
        start_time: newStart,
        end_time: newEnd,
        role: newRole,
        roster_month_id: rosterMonthId,
      }]);
      if (error) throw error;
      await refreshShifts();
      setNewStaffId("");
      setNewStaffName("");
      setNewRole("pharmacist");
      setNewStart("09:00");
      setNewEnd("17:00");
    } catch (err) {
      alert("Couldn't save shift: " + (err?.message || String(err)));
    } finally {
      setSavingShift(false);
    }
  };

  // ── Edit shift ──
  const handleStartEdit = (s) => {
    setEditingShiftId(s.id);
    setEditStaffId(s.staff_id ? String(s.staff_id) : s.staff_name ? "other" : "");
    setEditStaffName(s.staff_name || "");
    setEditRole(s.role || "pharmacist");
    setEditStart(s.start_time || "09:00");
    setEditEnd(s.end_time || "17:00");
  };

  const handleCancelEdit = () => {
    setEditingShiftId(null);
    setEditStaffId("");
    setEditStaffName("");
    setEditRole("pharmacist");
    setEditStart("09:00");
    setEditEnd("17:00");
  };

  const handleUpdateShift = async () => {
    if (!editingShiftId) return;
    const resolvedStaffId = editStaffId === "other" ? null : editStaffId ? Number(editStaffId) : null;
    const resolvedStaffName = editStaffId === "other" ? editStaffName.trim() : null;
    if (!resolvedStaffId && !resolvedStaffName) { alert("Please choose or enter a staff member."); return; }
    try {
      setSavingEdit(true);
      const { error } = await supabase.from("roster_shifts").update({
        staff_id: resolvedStaffId,
        staff_name: resolvedStaffName,
        role: editRole,
        start_time: editStart,
        end_time: editEnd,
      }).eq("id", editingShiftId);
      if (error) throw error;
      await refreshShifts();
      handleCancelEdit();
    } catch (err) {
      alert("Couldn't update shift: " + (err?.message || String(err)));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleMarkSick = async (shift, name, leaveType = "sick") => {
    const label = leaveType === "compassionate" ? "compassionate leave" : "sick / carer's leave";
    const reason = window.prompt(`Mark ${name} as on ${label}?\n\nOptional reason (shown only in their staff file):`, "");
    if (reason === null) return; // cancelled
    try {
      const { error } = await supabase.from("sick_days").upsert({
        roster_shift_id: shift.id,
        staff_id: shift.staff_id || null,
        sick_date: shift.shift_date,
        reason: reason.trim() || null,
        leave_type: leaveType,
        pharmacy_id: pharmacyId,
      }, { onConflict: "roster_shift_id" });
      if (error) throw error;
      await refreshSick();
    } catch (err) {
      alert("Couldn't mark absence: " + (err?.message || String(err)));
    }
  };

  const handleUnmarkSick = async (shift) => {
    try {
      const { error } = await supabase.from("sick_days").delete().eq("roster_shift_id", shift.id);
      if (error) throw error;
      await refreshSick();
    } catch (err) {
      alert("Couldn't unmark sick: " + (err?.message || String(err)));
    }
  };

  const handleDeleteShift = async (id, name) => {
    if (!window.confirm(`Delete shift for ${name}?`)) return;
    try {
      const { error } = await supabase.from("roster_shifts").delete().eq("id", id);
      if (error) throw error;
      if (editingShiftId === id) handleCancelEdit();
      await refreshShifts();
    } catch (err) {
      alert("Couldn't delete shift: " + (err?.message || String(err)));
    }
  };

  // ── Template apply ──
  const applyTemplate = (template) => {
    setNewRole(template.role);
    setNewStart(template.start_time.slice(0, 5));
    setNewEnd(template.end_time.slice(0, 5));
  };

  // ── Drag ──
  const handleDragStart = (event, shift) => {
    event.stopPropagation();
    setDraggedShiftId(shift.id);
    setDragCopyMode(Boolean(event.altKey));
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = event.altKey ? "copy" : "move";
      event.dataTransfer.setData("text/plain", String(shift.id));
    }
  };

  const handleDragEnd = () => {
    setDraggedShiftId(null);
    setDragTargetDate(null);
    setDragCopyMode(false);
  };

  const handleDragOver = (event, dateString) => {
    if (!dateString || savingDrag) return;
    event.preventDefault();
    setDragTargetDate(dateString);
    if (event.dataTransfer) event.dataTransfer.dropEffect = dragCopyMode ? "copy" : "move";
  };

  const handleDragLeave = (dateString) => {
    if (dragTargetDate === dateString) setDragTargetDate(null);
  };

  const handleDrop = async (event, dateString) => {
    event.preventDefault();
    event.stopPropagation();
    const droppedId = Number(event.dataTransfer?.getData("text/plain") || draggedShiftId);
    const isCopy = Boolean(event.altKey || dragCopyMode);
    setDragTargetDate(null);
    if (!dateString || !droppedId || savingDrag) return;
    const draggedShift = shifts.find((s) => s.id === droppedId);
    if (!draggedShift) { handleDragEnd(); return; }
    if (!isCopy && draggedShift.shift_date === dateString) { handleDragEnd(); return; }
    const previousShifts = shifts;
    try {
      setSavingDrag(true);
      const rosterMonthId = await getRosterMonthId(dateString);
      if (isCopy) {
        setShifts((cur) => [...cur, { ...draggedShift, id: `temp-${Date.now()}`, shift_date: dateString }]);
        const { error } = await supabase.from("roster_shifts").insert([{
          staff_id: draggedShift.staff_id || draggedShift.staff?.id,
          staff_name: draggedShift.staff_name,
          shift_date: dateString,
          start_time: draggedShift.start_time,
          end_time: draggedShift.end_time,
          role: draggedShift.role,
          roster_month_id: rosterMonthId,
        }]);
        if (error) throw error;
      } else {
        setShifts((cur) => cur.map((s) => s.id === droppedId ? { ...s, shift_date: dateString } : s));
        const { error } = await supabase.from("roster_shifts").update({ shift_date: dateString, roster_month_id: rosterMonthId }).eq("id", droppedId);
        if (error) throw error;
      }
      await refreshShifts();
    } catch (err) {
      setShifts(previousShifts);
      alert("Couldn't save dragged shift: " + (err?.message || String(err)));
    } finally {
      setSavingDrag(false);
      handleDragEnd();
    }
  };

  // ── Copy previous month ──
  const handleCopyPreviousMonth = async () => {
    if (!window.confirm("This will replace all shifts in this month with a copy of last month. Continue?")) return;
    try {
      
      const targetMonthDate = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`;
      const prevMonth = new Date(currentYear, currentMonth - 1, 1);
      const prevYear = prevMonth.getFullYear();
      const prevMonthIndex = prevMonth.getMonth();
      const prevMonthDate = `${prevYear}-${String(prevMonthIndex + 1).padStart(2, "0")}-01`;
      const targetEnd = `${currentYear}-${String(currentMonth + 2).padStart(2, "0")}-01`;
      const prevEnd = `${prevYear}-${String(prevMonthIndex + 2).padStart(2, "0")}-01`;

      await supabase.from("roster_shifts").delete().gte("shift_date", targetMonthDate).lt("shift_date", targetEnd);

      const { data: prevShifts } = await supabase.from("roster_shifts").select("*").gte("shift_date", prevMonthDate).lt("shift_date", prevEnd);
      if (!prevShifts?.length) { alert("No shifts found in previous month."); return; }

      let targetMonthId;
      const { data: existingMonth } = await supabase.from("roster_months").select("id").eq("month", targetMonthDate).maybeSingle();
      if (existingMonth?.id) {
        targetMonthId = existingMonth.id;
      } else {
        const { data: created, error: createError } = await supabase.from("roster_months").insert([{ month: targetMonthDate, status: "draft", pharmacy_id: pharmacyId }]).select("id").single();
        if (createError) throw createError;
        targetMonthId = created.id;
      }

      const getWeekday = (d) => (d.getDay() + 6) % 7;
      const getOccurrence = (d) => Math.floor((d.getDate() - 1) / 7) + 1;
      const findDate = (weekday, occurrence) => {
        const days = new Date(currentYear, currentMonth + 1, 0).getDate();
        let count = 0;
        for (let day = 1; day <= days; day++) {
          const c = new Date(currentYear, currentMonth, day);
          if (getWeekday(c) === weekday) {
            count++;
            if (count === occurrence) return `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          }
        }
        return null;
      };

      const copied = prevShifts.map((s) => {
        const orig = new Date(s.shift_date);
        const newDate = findDate(getWeekday(orig), getOccurrence(orig));
        if (!newDate) return null;
        return { staff_id: s.staff_id, staff_name: s.staff_name, shift_date: newDate, start_time: s.start_time, end_time: s.end_time, role: s.role, roster_month_id: targetMonthId };
      }).filter(Boolean);

      if (!copied.length) { alert("No valid shifts to copy."); return; }
      await supabase.from("roster_shifts").insert(copied);
      await refreshShifts();
      alert("Previous month copied successfully.");
    } catch (err) {
      alert("Couldn't copy month: " + (err?.message || String(err)));
    }
  };

  // ── Save day note ──
  const handleSaveDayNote = async () => {
    if (!selectedDate) return;
    try {
      setSavingDayNote(true);
      const note = dayNotes[selectedDate] || "";
      const { data: existing } = await supabase.from("roster_day_notes").select("id").eq("date", selectedDate).maybeSingle();
      if (existing?.id) {
        await supabase.from("roster_day_notes").update({ note }).eq("id", existing.id);
      } else {
        await supabase.from("roster_day_notes").insert([{ date: selectedDate, note }]);
      }
    } catch (err) {
      alert("Couldn't save note: " + (err?.message || String(err)));
    } finally {
      setSavingDayNote(false);
    }
  };

  // ── Save month note ──
  const handleSaveMonthNote = async () => {
    try {
      setSavingMonthNote(true);
      const monthDate = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`;
      const { data: existing } = await supabase.from("roster_month_notes").select("id").eq("month", monthDate).maybeSingle();
      if (existing?.id) {
        await supabase.from("roster_month_notes").update({ note: monthNote }).eq("id", existing.id);
      } else {
        await supabase.from("roster_month_notes").insert([{ month: monthDate, note: monthNote }]);
      }
    } catch (err) {
      alert("Couldn't save month note: " + (err?.message || String(err)));
    } finally {
      setSavingMonthNote(false);
    }
  };

  // ── Publish month ──
  const handlePublishToggle = async () => {
    const isPublished = monthStatus === "published";
    if (!window.confirm(isPublished ? "Unpublish this month? Staff will no longer see it." : "Publish this month? Staff will be able to view it.")) return;
    try {
      setPublishingMonth(true);
      const monthDate = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`;
      const patch = isPublished
        ? { status: "draft", published_at: null }
        : { status: "published", published_at: new Date().toISOString() };
      const { data: existing } = await supabase.from("roster_months").select("id").eq("month", monthDate).maybeSingle();
      if (existing?.id) {
        await supabase.from("roster_months").update(patch).eq("id", existing.id);
      } else {
        await supabase.from("roster_months").insert([{ month: monthDate, status: "published", published_at: new Date().toISOString(), pharmacy_id: pharmacyId }]);
      }
      setMonthStatus(isPublished ? "draft" : "published");
    } catch (err) {
      alert("Couldn't update roster status: " + (err?.message || String(err)));
    } finally {
      setPublishingMonth(false);
    }
  };

  // ── Print ──
  const handlePrint = () => window.print();

  // ── Holiday management ──
  const handleAddHoliday = async () => {
    if (!newHolidayDate || !newHolidayName.trim()) { alert("Please enter a date and name."); return; }
    try {
      setSavingHoliday(true);
      const { error } = await supabase.from("public_holidays").insert([{
        date: newHolidayDate,
        name: newHolidayName.trim(),
        image_key: newHolidayKey,
      }]);
      if (error) throw error;
      const { data } = await supabase.from("public_holidays").select("*");
      setHolidays(data || []);
      setNewHolidayDate("");
      setNewHolidayName("");
      setNewHolidayKey("default");
    } catch (err) {
      alert("Couldn't save holiday: " + (err?.message || String(err)));
    } finally {
      setSavingHoliday(false);
    }
  };

  const handleDeleteHoliday = async (id) => {
    if (!window.confirm("Delete this public holiday?")) return;
    try {
      const { error } = await supabase.from("public_holidays").delete().eq("id", id);
      if (error) throw error;
      const { data } = await supabase.from("public_holidays").select("*");
      setHolidays(data || []);
    } catch (err) {
      alert("Couldn't delete holiday: " + (err?.message || String(err)));
    }
  };

  // ── Template management ──
  const handleAddTemplate = async () => {
    if (!newTemplateName.trim()) { alert("Please enter a template name."); return; }
    try {
      setSavingTemplate(true);
      const { error } = await supabase.from("shift_templates").insert([{
        name: newTemplateName.trim(),
        role: newTemplateRole,
        start_time: newTemplateStart,
        end_time: newTemplateEnd,
      }]);
      if (error) throw error;
      const { data } = await supabase.from("shift_templates").select("*").order("name");
      setTemplates(data || []);
      setNewTemplateName("");
      setNewTemplateRole("pharmacist");
      setNewTemplateStart("09:00");
      setNewTemplateEnd("17:00");
    } catch (err) {
      alert("Couldn't save template: " + (err?.message || String(err)));
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleDeleteTemplate = async (id) => {
    if (!window.confirm("Delete this template?")) return;
    try {
      const { error } = await supabase.from("shift_templates").delete().eq("id", id);
      if (error) throw error;
      const { data } = await supabase.from("shift_templates").select("*").order("name");
      setTemplates(data || []);
    } catch (err) {
      alert("Couldn't delete template: " + (err?.message || String(err)));
    }
  };

  const handleStartEditTemplate = (t) => {
    setEditingTemplateId(t.id);
    setEditTemplateName(t.name);
    setEditTemplateRole(t.role);
    setEditTemplateStart(t.start_time.slice(0, 5));
    setEditTemplateEnd(t.end_time.slice(0, 5));
  };

  const handleCancelEditTemplate = () => {
    setEditingTemplateId(null);
    setEditTemplateName("");
    setEditTemplateRole("pharmacist");
    setEditTemplateStart("09:00");
    setEditTemplateEnd("17:00");
  };

  const handleUpdateTemplate = async () => {
    if (!editingTemplateId || !editTemplateName.trim()) { alert("Please enter a name."); return; }
    try {
      setSavingTemplateEdit(true);
      const { error } = await supabase.from("shift_templates").update({
        name: editTemplateName.trim(),
        role: editTemplateRole,
        start_time: editTemplateStart,
        end_time: editTemplateEnd,
      }).eq("id", editingTemplateId);
      if (error) throw error;
      const { data } = await supabase.from("shift_templates").select("*").order("name");
      setTemplates(data || []);
      handleCancelEditTemplate();
    } catch (err) {
      alert("Couldn't update template: " + (err?.message || String(err)));
    } finally {
      setSavingTemplateEdit(false);
    }
  };

  // ── Availability panel loader ──
  const loadStaffAvailability = async (staffId, monthOffset = availMonthOffset) => {
    setAvailStaffId(staffId);
    setAvailLoading(true);
    const d = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const monthStart = `${monthStr}-01`;
    const monthEnd = `${d.getFullYear()}-${String(d.getMonth() + 2).padStart(2, "0")}-01`;
    const [{ data: pats }, { data: ovrs }, { data: mNote }, { data: leave }] = await Promise.all([
      supabase.from("availability_patterns").select("*").eq("staff_id", staffId).eq("year_month", monthStr),
      supabase.from("availability_overrides").select("*").eq("staff_id", staffId).gte("override_date", `${monthStr}-01`).order("override_date"),
      supabase.from("availability_manager_notes").select("note").eq("staff_id", staffId).eq("month", monthStr).maybeSingle(),
      // Approved leave overlapping the viewed month: from_date < next month AND to_date >= month start
      supabase.from("leave_requests").select("*").eq("staff_id", staffId).eq("status", "approved").lt("from_date", monthEnd).gte("to_date", monthStart).order("from_date"),
    ]);
    setAvailPatterns(pats || []);
    setAvailOverrides(ovrs || []);
    setAvailLeave(leave || []);
    const firstNote = (pats || []).find((p) => p.note)?.note || "";
    setAvailStaffNote(firstNote);
    setAvailManagerNote(mNote?.note || "");
    setAvailLoading(false);
  };
const handleLeaveDecision = async (lr, decision) => {
    setProcessingLeaveId(lr.id);
    try {
      const { error } = await supabase.from("leave_requests").update({
        status: decision,
        manager_note: (requestManagerNotes[lr.id] || "").trim() || null,
      }).eq("id", lr.id);
      if (error) throw error;
      await refreshLeave();
    } catch (err) {
      alert("Couldn't update request: " + (err?.message || String(err)));
    } finally {
      setProcessingLeaveId(null);
    }
  };
  const handleSaveManagerNote = async () => {
    if (!availStaffId) return;
    try {
      setSavingManagerNote(true);
      const monthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;
      const { error } = await supabase.from("availability_manager_notes").upsert({
        staff_id: availStaffId,
        month: monthStr,
        note: availManagerNote.trim() || null,
        pharmacy_id: pharmacyId,
        updated_at: new Date().toISOString(),
      }, { onConflict: "staff_id,month" });
      if (error) throw error;
    } catch (err) {
      alert("Couldn't save note: " + (err?.message || String(err)));
    } finally {
      setSavingManagerNote(false);
    }
  };

  // ── Sidebar modal state ──
  const [showHolidays, setShowHolidays] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showMonthNotes, setShowMonthNotes] = useState(false);

  // Availability panel
  const [showAvailability, setShowAvailability] = useState(false);
  const [availStaffId, setAvailStaffId] = useState(null);
  const [availPatterns, setAvailPatterns] = useState([]);
  const [availOverrides, setAvailOverrides] = useState([]);
  const [availStaffNote, setAvailStaffNote] = useState("");
  const [availManagerNote, setAvailManagerNote] = useState("");
  const [availLoading, setAvailLoading] = useState(false);
  const [savingManagerNote, setSavingManagerNote] = useState(false);
  const [availMonthOffset, setAvailMonthOffset] = useState(0);
  const [availLeave, setAvailLeave] = useState([]);

  // ── Inline edit state ──
  const [inlineEdit, setInlineEdit] = useState(null); // { shift, rect }
  const [inlineEditName, setInlineEditName] = useState("");
  const inlineStartRef = React.useRef("");
  const inlineEndRef = React.useRef("");
  const [inlineSuggestions, setInlineSuggestions] = useState([]);
  const [savingInline, setSavingInline] = useState(false);

  // ── Staff role lookup ──
  const staffRoleMap = Object.fromEntries(
    staffOptions.map((s) => [s.name.toLowerCase(), s.role || "pharmacy assistant"])
  );

  // ── Render ──
  const monthLabel = displayMonth.toLocaleString("en-AU", { month: "long", year: "numeric" });

  const printImageOptions = [
    { value: "none", label: "No image" },
    { value: "autumn", label: "🍂 Autumn" },
    { value: "winter", label: "❄️ Winter" },
    { value: "spring", label: "🌸 Spring" },
    { value: "summer", label: "☀️ Summer" },
    { value: "christmas", label: "🎅 Christmas" },
    { value: "easter", label: "🐣 Easter" },
  ];

  const printImageEmoji = {
    autumn: "🍂🍁🍂",
    winter: "❄️⛄❄️",
    spring: "🌸🌺🌸",
    summer: "☀️🌻☀️",
    christmas: "🎅🎄🎅",
    easter: "🐣🌷🐣",
  };
// ── Sidebar component ──
  const RosterSidebar = () => (
    <aside className="no-print w-[200px] min-w-[200px] h-screen bg-white border-r flex flex-col py-4 px-3 gap-1 shrink-0 overflow-y-auto">
      {/* Month navigation */}
      <div className="text-sm font-bold text-gray-800 px-2 mb-1 leading-tight text-center">
        {monthLabel}
      </div>
      <div className="flex gap-1 mb-2">
        <button onClick={() => setMonthOffset((m) => m - 1)} className="flex-1 py-1.5 rounded-lg border bg-white text-sm hover:bg-gray-50">←</button>
        <button onClick={() => setMonthOffset((m) => m + 1)} className="flex-1 py-1.5 rounded-lg border bg-white text-sm hover:bg-gray-50">→</button>
      </div>

      {/* Actions */}
      <button onClick={handleCopyPreviousMonth} className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-blue-700 hover:bg-blue-50 w-full text-left font-medium">
        📋 Copy last month
      </button>

      <button
        onClick={handlePublishToggle}
        disabled={publishingMonth}
        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs w-full text-left font-medium ${
          monthStatus === "published"
            ? "text-green-700 hover:bg-green-50"
            : "text-gray-600 hover:bg-gray-100"
        }`}
      >
        {monthStatus === "published" ? "✓ Published" : "⬜ Publish"}
      </button>

      {/* Print */}
      <div className="px-2 py-1.5">
        <select value={printImage} onChange={(e) => setPrintImage(e.target.value)} className="w-full rounded border border-gray-200 px-1 py-1 text-xs mb-1">
          {printImageOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button onClick={handlePrint} className="w-full py-1 rounded-lg border bg-white text-xs font-medium hover:bg-gray-50">
          🖨️ Print
        </button>
      </div>

      <div className="border-t my-1" />

      {/* New features */}
      <button onClick={() => { setShowAvailability(true); setShowHolidays(false); setShowTemplates(false); setShowMonthNotes(false); }} className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-gray-700 hover:bg-gray-100 w-full text-left">
        👥 Availability
      </button>
      <button onClick={() => { setShowIssues(true); setShowAvailability(false); setShowHolidays(false); setShowTemplates(false); setShowMonthNotes(false); }} className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-gray-700 hover:bg-gray-100 w-full text-left">
        ⚠️ Issues
      </button>
      <button onClick={() => { setShowRequests(true); setShowIssues(false); setShowAvailability(false); setShowHolidays(false); setShowTemplates(false); setShowMonthNotes(false); }} className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-gray-700 hover:bg-gray-100 w-full text-left">
        📨 Requests
        {leaveRequests.filter((lr) => lr.status === "pending").length > 0 && (
          <span className="ml-auto text-[10px] bg-red-500 text-white rounded-full px-1.5 py-0.5 font-semibold">
            {leaveRequests.filter((lr) => lr.status === "pending").length}
          </span>
        )}
      </button>

      <div className="border-t my-1" />

      {/* Roster tools */}
      <button onClick={() => { setShowHolidays(true); setShowTemplates(false); setShowMonthNotes(false); }} className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-gray-700 hover:bg-gray-100 w-full text-left">
        📅 Holidays
      </button>
      <button onClick={() => { setShowTemplates(true); setShowHolidays(false); setShowMonthNotes(false); }} className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-gray-700 hover:bg-gray-100 w-full text-left">
        📝 Templates
      </button>
      <button onClick={() => { setShowMonthNotes(true); setShowHolidays(false); setShowTemplates(false); }} className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-gray-700 hover:bg-gray-100 w-full text-left">
        📓 Month Notes
      </button>

      <div className="border-t my-1" />

      {/* Nav */}
      <Link href="/" className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-gray-700 hover:bg-gray-100">
        🏠 Home
      </Link>
      <Link href="/admin" className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-gray-700 hover:bg-gray-100">
        ⚙️ Admin
      </Link>
    </aside>
  );
  // ── Inline Edit Popup ──
  const InlineEditPopup = React.memo(() => {
    if (!inlineEdit) return null;
    const { shift, rect } = inlineEdit;
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom;
    const showAbove = spaceBelow < 220;
    const top = showAbove ? rect.top - 8 : rect.bottom + 4;
    const left = Math.min(Math.max(rect.left, 8), window.innerWidth - 240);

    const handleSave = async () => {
      setSavingInline(true);
      const name = inlineEditName.trim();
      const matched = staffOptions.find((s) => s.name.toLowerCase() === name.toLowerCase());
      const staffId = matched ? matched.id : null;
      const staffName = !matched && name ? name : null;
      // Priority: matched staff role → existing shift role → fallback
      const role = matched?.role || shift.role || "Pharmacy Assistant";
      await supabase.from("roster_shifts").update({
        staff_id: staffId || null,
        staff_name: staffName || null,
        start_time: inlineStartRef.current,
        end_time: inlineEndRef.current,
        role,
      }).eq("id", shift.id);
      await refreshShifts();
      setInlineEdit(null);
      setInlineSuggestions([]);
      setSavingInline(false);
    };

    const handleDelete = async () => {
      if (!window.confirm(`Delete this shift?`)) return;
      await supabase.from("roster_shifts").delete().eq("id", shift.id);
      await refreshShifts();
      setInlineEdit(null);
    };

    return createPortal(
      <>
        <div className="fixed inset-0 z-40" onClick={() => { setInlineEdit(null); setInlineSuggestions([]); }} />
        <div
          className="fixed z-50 bg-white border border-gray-200 rounded-xl shadow-xl p-3 w-[230px]"
          style={{ top: showAbove ? undefined : top, bottom: showAbove ? viewportHeight - rect.top + 4 : undefined, left }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-xs font-semibold text-gray-700 mb-2">Edit Shift</div>
          <div className="relative mb-2">
            <input
              value={inlineEditName}
              onChange={(e) => {
                const val = e.target.value;
                setInlineEditName(val);
                setInlineSuggestions(
                  val.length > 0
                    ? staffOptions.filter((s) => s.name.toLowerCase().startsWith(val.toLowerCase())).slice(0, 4)
                    : []
                );
              }}
              onKeyDown={(e) => { if (e.key === "Enter") { setInlineSuggestions([]); handleSave(); } if (e.key === "Escape") { setInlineEdit(null); setInlineSuggestions([]); } }}
              placeholder="Name (blank = TBC)"
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs"
            />
            {inlineSuggestions.length > 0 && (
              <div className="absolute z-10 w-full bg-white border border-gray-200 rounded shadow text-xs mt-0.5">
                {inlineSuggestions.map((s) => (
                  <button key={s.id} onClick={() => { setInlineEditName(s.name); setInlineSuggestions([]); }} className="w-full text-left px-2 py-1.5 hover:bg-blue-50">
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-1.5 mb-2 items-center">
            <input
              type="time"
              defaultValue={inlineStartRef.current}
              onChange={(e) => { inlineStartRef.current = e.target.value; }}
              className="flex-1 rounded border border-gray-300 px-1.5 py-1 text-xs"
            />
            <span className="text-gray-400 text-xs">–</span>
            <input
              type="time"
              defaultValue={inlineEndRef.current}
              onChange={(e) => { inlineEndRef.current = e.target.value; }}
              className="flex-1 rounded border border-gray-300 px-1.5 py-1 text-xs"
            />
          </div>
          <div className="flex gap-1.5">
            <button onClick={handleDelete} className="px-2 py-1 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50">Delete</button>
            <button onClick={() => { setInlineEdit(null); setInlineSuggestions([]); }} className="flex-1 px-2 py-1 text-xs border rounded hover:bg-gray-50">Cancel</button>
            <button onClick={handleSave} disabled={savingInline} className="flex-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
              {savingInline ? "..." : "Save"}
            </button>
          </div>
        </div>
      </>,
      document.body
    );
  });
  if (!pinEntered) {
    return (
      <main className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white rounded-xl border shadow-sm p-8 w-full max-w-xs text-center">
          <div className="text-2xl mb-1">🔒</div>
          <h1 className="text-lg font-semibold text-gray-800 mb-1">Roster</h1>
          <p className="text-xs text-gray-500 mb-4">Enter PIN to continue</p>
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pinInput}
            onChange={(e) => { setPinInput(e.target.value); setPinError(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") handlePinSubmit(); }}
            placeholder="••••"
            className="w-full text-center rounded-lg border border-gray-300 px-3 py-2 text-lg tracking-widest mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
            autoFocus
          />
          {pinError && <p className="text-xs text-red-500 mb-3">Incorrect PIN. Try again.</p>}
          <button
            onClick={handlePinSubmit}
            className="w-full py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            Enter
          </button>
        </div>
      </main>
    );
  }

  return (
    <>
      {/* ── Print styles ── */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { background: white !important; margin: 0 !important; }
          main { background: white !important; padding: 0 !important; }
          @page { size: A4 landscape; margin: 6mm; }

          .print-outer { max-width: 100% !important; margin: 0 !important; padding: 0 !important; }
          .print-container { box-shadow: none !important; border: 1px solid #ccc !important; width: 100% !important; }
          .hours-summary { display: none !important; }
          .print-note-icon { display: none !important; }

          .print-month-title { font-size: 36px !important; font-weight: 400 !important; letter-spacing: 3px !important; text-transform: uppercase !important; }
          .print-legend { font-size: 9px !important; }
          .print-day-header { font-size: 9px !important; padding: 3px 0 !important; font-weight: 600 !important; }

          .print-calendar-cell { height: 115px !important; padding: 3px 4px !important; overflow: hidden !important; }
          .print-day-number { font-size: 11px !important; font-weight: 700 !important; }
          .print-shift-line { font-size: 10px !important; line-height: 1.5 !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; display: block !important; }
          .print-weekend-cell { 
            background-color: #faf5ff !important; 
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          .print-calendar-cell, .print-day-header {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
        .print-only { display: none; }
      `}</style>

      <div className="flex h-screen overflow-hidden bg-gray-100">
        <RosterSidebar />

        <div className="flex-1 overflow-y-auto">
        <div className="print-outer p-2">

          {/* ── Print header (print only) ── */}
          <div className="print-only text-center mb-4">
            <div className="flex items-center justify-between px-2">
              {printImage !== "none" ? (
                <div className="text-4xl">{printImageEmoji[printImage]}</div>
              ) : <div />}
              <div className="print-month-title text-xl font-black tracking-wide">{monthLabel}</div>
              {printImage !== "none" ? (
                <div className="text-4xl">{printImageEmoji[printImage]}</div>
              ) : <div />}
            </div>
            <div className="print-legend mt-3 flex justify-center gap-6">
              <span className="text-purple-700 font-semibold">● Pharmacist</span>
              <span className="text-blue-700 font-semibold">● Locum</span>
              <span className="text-orange-600 font-semibold">● DAA</span>
              <span className="text-teal-700 font-semibold">● Pharmacy Assistant</span>
            </div>
          </div>

          

          {/* ── Calendar ── */}
          <div className="bg-white rounded-xl border print-container">

            {/* Day headers */}
            <div className="grid grid-cols-7 border-b">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => (
                <div key={d} className={`print-day-header ${i >= 5 ? "print-weekend-cell" : ""} text-center text-xs font-semibold py-1.5 ${i >= 5 ? "text-purple-600" : "text-gray-600"} ${i < 6 ? "border-r" : ""}`}>{d}</div>
              ))}
            </div>

            {/* Cells */}
            <div className="grid grid-cols-7">
              {cells.map((day, i) => {
                const dateString = day ? `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` : null;
                const col = i % 7;
                const isWeekend = col >= 5;
                const isToday = dateString === todayStr;
                const isSelected = dateString === selectedDate;
                const isDragTarget = dateString && dragTargetDate === dateString;
                const holiday = dateString ? holidays.find((h) => h.date === dateString) : null;
                const dayShifts = day ? sortShifts(shifts.filter((s) => s.shift_date === dateString)) : [];
                const isLastRow = i >= cells.length - 7;
                const isLastCol = col === 6;

                return (
                  <div
                    key={i}
                    onClick={(e) => { if (!dateString || draggedShiftId || savingDrag) return; setSelectedDate(dateString); }}
                    onDragOver={(e) => { if (!dateString) return; handleDragOver(e, dateString); }}
                    onDragLeave={() => { if (!dateString) return; handleDragLeave(dateString); }}
                    onDrop={(e) => { if (!dateString) return; handleDrop(e, dateString); }}
                    className={`
                      print-calendar-cell
                      ${isWeekend ? "print-weekend-cell" : ""}
                      ${isLastCol ? "" : "border-r"} ${isLastRow ? "" : "border-b"}
                      min-h-[90px] p-1 text-xs cursor-pointer transition-colors
                      ${isDragTarget ? (dragCopyMode ? "bg-green-50 ring-2 ring-inset ring-green-400" : "bg-blue-50 ring-2 ring-inset ring-blue-400") :
                        (isSelected && day) ? "bg-blue-50 ring-2 ring-inset ring-blue-500" :
                        isToday ? "bg-amber-50" :
                        holiday ? "bg-red-50" :
                        day ? (isWeekend ? "bg-purple-50 hover:bg-purple-100" : "bg-white hover:bg-gray-50") :
                        (isWeekend ? "bg-purple-50" : "bg-gray-50")}
                    `}
                  >
                    {day ? (
                      <>
                        <div className="flex items-start justify-between mb-0.5">
                          <span className={`print-day-number text-xs font-bold ${isToday ? "text-amber-600" : isWeekend ? "text-purple-600" : "text-gray-700"}`}>{day}</span>
                          <div className="flex items-center gap-1">
                            {dayNotes[dateString] && <span title="Has notes" className="print-note-icon text-[10px] leading-none">📝</span>}
                            {holiday && <span title={holiday.name} className="text-sm leading-none">{holidayEmoji[holiday.image_key] || holidayEmoji.default}</span>}
                            {isDragTarget && <span className={`text-[9px] px-1 rounded ${dragCopyMode ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>{dragCopyMode ? "Copy" : "Move"}</span>}
                          </div>
                        </div>
                        {holiday && <div className="text-[9px] text-red-600 font-medium mb-0.5 leading-tight">{holiday.name}</div>}
                        <div
                            className="space-y-px"
                            style={{
                              fontSize: dayShifts.length > 6
                                ? "8px"
                                : dayShifts.length > 4
                                ? "9px"
                                : "10.5px"
                            }}
                          >
                          {dayShifts.slice(0, 10).map((s) => {
                            const name = s.staff?.name || s.staff_name || "?";
                            const start = formatTime(s.start_time);
                            const end = formatTime(s.end_time);
                            const isDragging = draggedShiftId === s.id;
                            const isTBC = !s.staff_id && !s.staff_name;
                            const conflict = getShiftConflict(s);
                            return (
                              <div
                                key={s.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, s)}
                                onDragEnd={handleDragEnd}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setInlineEdit({ shift: s, rect });
                                  setInlineEditName(s.staff?.name || s.staff_name || "");
                                  inlineStartRef.current = s.start_time?.slice(0, 5) || "";
                                  inlineEndRef.current = s.end_time?.slice(0, 5) || "";
                                  setInlineSuggestions([]);
                                }}
                                className={`print-shift-line text-[10px] leading-tight truncate ${sickByShift[s.id]?.leave_type === "compassionate" ? "text-purple-400 line-through" : sickByShift[s.id] ? "text-red-400 line-through" : conflict ? "text-amber-700 font-medium" : isTBC ? "text-red-500 font-medium" : roleColour[s.role] || "text-gray-700"} ${isDragging ? "opacity-30" : ""}`}
                                style={{
                                  fontSize: dayShifts.length > 7 ? "8px" : dayShifts.length > 5 ? "9px" : "10px"
                                }}
                                title={`${name} ${start}–${end} (${s.role})${sickByShift[s.id] ? " — Sick" : ""}${conflict ? ` — ⚠️ ${conflict}` : ""}`}
                              >
                                {sickByShift[s.id]?.leave_type === "compassionate" ? "🕊️ " : sickByShift[s.id] ? "🤒 " : !sickByShift[s.id] && conflict ? "⚠️ " : ""}{isTBC ? `TBC ${s.role}` : name} <span className="opacity-70">{start}–{end}</span>
                              </div>
                            );
                          })}
                          {dayShifts.length > 10 && <div className="text-[9px] text-gray-400">+{dayShifts.length - 10} more</div>}
                        </div>
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Hours summary ── */}
          <div className="no-print hours-summary mt-2 bg-white rounded-xl border p-3">
            <div className="text-xs font-semibold text-gray-700 mb-2">Hours this month</div>
            <div className="flex flex-wrap gap-3">
              {monthHours().map(({ name, hours }) => (
                <div key={name} className="text-xs text-gray-600">
                  <span className="font-medium text-gray-800">{name}</span> {hours}h
                </div>
              ))}
              {monthHours().length === 0 && <div className="text-xs text-gray-400">No shifts this month.</div>}
            </div>
          </div>

        </div>
        </div>
      </div>

      {/* ── Side panel ── */}
      {selectedDate && (
        <div className="no-print fixed inset-0 z-40 flex">
          {/* Backdrop */}
          <div className="flex-1 bg-black/20" onClick={() => { setSelectedDate(null); handleCancelEdit(); }} />

          {/* Panel */}
          <div className="w-full max-w-sm bg-white shadow-2xl flex flex-col h-full overflow-hidden">

            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
              <div>
                <div className="font-semibold text-gray-900 text-sm">
                  {new Date(selectedDate).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}
                </div>
                {selectedHoliday && (
                  <div className="text-xs text-red-600 font-medium mt-0.5">
                    {holidayEmoji[selectedHoliday.image_key] || "🏖️"} {selectedHoliday.name} — Public Holiday
                  </div>
                )}
              </div>
              <button onClick={() => { setSelectedDate(null); handleCancelEdit(); }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">

              {/* Existing shifts */}
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Shifts</div>
                {selectedDayShifts.length === 0 ? (
                  <p className="text-xs text-gray-400">No shifts yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {selectedDayShifts.map((s) => {
                      const name = s.staff?.name || s.staff_name || "?";
                      const start = formatTime(s.start_time);
                      const end = formatTime(s.end_time);
                      const isEditing = editingShiftId === s.id;

                      return (
                        <div key={s.id} className={`rounded-lg border p-2 ${roleBorder[s.role] || "border-gray-200"} border-l-4`}>
                          {isEditing ? (
                            <div className="space-y-2">
                              <select
                                value={editStaffId}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setEditStaffId(val);
                                  if (val && val !== "other") {
                                    const found = staffOptions.find((st) => String(st.id) === val);
                                    if (found?.role) setEditRole(found.role);
                                  }
                                }}
                                className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                              >
                                <option value="">— TBC —</option>
                                {staffOptions.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
                                <option value="other">+ Other (type name)</option>
                              </select>
                              {editStaffId === "other" && (
                                <input value={editStaffName} onChange={(e) => setEditStaffName(e.target.value)} placeholder="Enter name" className="w-full rounded border border-gray-300 px-2 py-1 text-xs" />
                              )}
                              <select value={editRole} onChange={(e) => setEditRole(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1 text-xs">
                                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                              </select>
                              <div className="flex gap-2">
                                <input type="time" value={editStart} onChange={(e) => setEditStart(e.target.value)} className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs" />
                                <input type="time" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs" />
                              </div>
                              <div className="flex gap-2 justify-end">
                                <button onClick={handleCancelEdit} className="px-2 py-1 text-xs border rounded hover:bg-gray-50">Cancel</button>
                                <button onClick={handleUpdateShift} disabled={savingEdit} className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">{savingEdit ? "Saving..." : "Save"}</button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className={`text-xs font-medium truncate ${roleColour[s.role] || "text-gray-800"}`}>
                                  {name}
                                  {sickByShift[s.id]?.leave_type === "compassionate" && <span className="ml-1 text-[10px] px-1 py-0.5 rounded-full bg-purple-100 text-purple-600">🕊️ Compassionate</span>}
                                  {sickByShift[s.id] && sickByShift[s.id]?.leave_type !== "compassionate" && <span className="ml-1 text-[10px] px-1 py-0.5 rounded-full bg-red-100 text-red-600">🤒 Sick / Carer's</span>}
                                  {!sickByShift[s.id] && getShiftConflict(s) && <span className="ml-1 text-[10px] px-1 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">⚠️ {getShiftConflict(s)}</span>}
                                </div>
                                <div className="text-[10px] text-gray-500">{start}–{end} · {s.role}</div>
                              </div>
                              <div className="flex gap-1 shrink-0">
                                {sickByShift[s.id] ? (
                                  <button onClick={() => handleUnmarkSick(s)} className="px-1.5 py-0.5 text-[10px] border border-amber-200 text-amber-600 rounded hover:bg-amber-50">Unmark</button>
                                ) : (
                                  <>
                                    <button onClick={() => handleMarkSick(s, name, "sick")} className="px-1.5 py-0.5 text-[10px] border border-amber-200 text-amber-600 rounded hover:bg-amber-50">🤒 Sick</button>
                                    <button onClick={() => handleMarkSick(s, name, "compassionate")} className="px-1.5 py-0.5 text-[10px] border border-purple-200 text-purple-600 rounded hover:bg-purple-50">🕊️ Comp</button>
                                  </>
                                )}
                                <button onClick={() => handleStartEdit(s)} className="px-1.5 py-0.5 text-[10px] border border-blue-200 text-blue-600 rounded hover:bg-blue-50">Edit</button>
                                <button onClick={() => handleDeleteShift(s.id, name)} className="px-1.5 py-0.5 text-[10px] border border-red-200 text-red-600 rounded hover:bg-red-50">Del</button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Add shift */}
              <div className="border-t pt-3">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Add shift</div>

                {/* Templates */}
                {templates.length > 0 && (
                  <div className="mb-2">
                    <div className="text-[10px] text-gray-400 mb-1">Quick templates</div>
                    <div className="flex flex-wrap gap-1">
                      {templates.map((t) => (
                        <button key={t.id} onClick={() => applyTemplate(t)} className="px-2 py-0.5 text-[10px] border rounded bg-gray-50 hover:bg-gray-100 text-gray-700">
                          {t.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <select
                    value={newStaffId}
                    onChange={(e) => {
                      const val = e.target.value;
                      setNewStaffId(val);
                      if (val && val !== "other") {
                        const found = staffOptions.find((st) => String(st.id) === val);
                        if (found?.role) setNewRole(found.role);
                      }
                    }}
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs"
                  >
                    <option value="">— TBC (no staff yet) —</option>
                    {staffOptions.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
                    <option value="other">+ Other (type name)</option>
                  </select>
                  {newStaffId === "other" && (
                    <input value={newStaffName} onChange={(e) => setNewStaffName(e.target.value)} placeholder="Enter name" className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs" />
                  )}
                  <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs">
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <div className="flex gap-2">
                    <input type="time" value={newStart} onChange={(e) => setNewStart(e.target.value)} className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-xs" />
                    <input type="time" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-xs" />
                  </div>
                </div>
              </div>

              {/* Save shift button */}
              <div className="border-t pt-3">
                <button
                  onClick={handleAddShift}
                  disabled={savingShift}
                  className="w-full py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingShift ? "Saving..." : "Save shift"}
                </button>
              </div>

              

              {/* Day notes */}
              <div className="border-t pt-3">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Day notes</div>
                <textarea
                  value={dayNotes[selectedDate] || ""}
                  onChange={(e) => setDayNotes((prev) => ({ ...prev, [selectedDate]: e.target.value }))}
                  placeholder="Notes for this day (manager only)..."
                  rows={3}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs resize-none"
                />
                <button
                  onClick={handleSaveDayNote}
                  disabled={savingDayNote}
                  className="mt-2 w-full py-1.5 text-xs bg-gray-700 text-white rounded hover:bg-gray-800 disabled:opacity-50"
                >
                  {savingDayNote ? "Saving..." : "Save note"}
                </button>
              </div>

            </div>

            {/* Panel footer */}
            <div className="border-t px-4 py-3 shrink-0">
              <button onClick={() => { setSelectedDate(null); handleCancelEdit(); setInlineEdit(null); }} className="w-full px-3 py-1.5 text-xs border rounded hover:bg-gray-50">Close</button>
            </div>
          </div>
        </div>
      )}
      <InlineEditPopup />
   {/* ── Holidays modal ── */}
      {showHolidays && (
        <div className="no-print fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/20" onClick={() => setShowHolidays(false)} />
          <div className="w-full max-w-md bg-white shadow-2xl flex flex-col h-full overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
              <div className="font-semibold text-gray-900 text-sm">📅 Public Holidays</div>
              <button onClick={() => setShowHolidays(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Add Public Holiday</div>
              <div className="space-y-2">
                <input type="date" value={newHolidayDate} onChange={(e) => setNewHolidayDate(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs" />
                <input type="text" value={newHolidayName} onChange={(e) => setNewHolidayName(e.target.value)} placeholder="Holiday name (e.g. Christmas Day)" className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs" />
                <select value={newHolidayKey} onChange={(e) => setNewHolidayKey(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs">
                  <option value="default">🏖️ Generic</option>
                  <option value="newyear">🎆 New Year</option>
                  <option value="australia">🦘 Australia Day</option>
                  <option value="easter">🐣 Easter</option>
                  <option value="anzac">🌺 ANZAC Day</option>
                  <option value="wa">⚓ WA Day</option>
                  <option value="christmas">🎅 Christmas</option>
                </select>
                <button onClick={handleAddHoliday} disabled={savingHoliday} className="w-full py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                  {savingHoliday ? "Saving..." : "Add Holiday"}
                </button>
              </div>
              <div className="border-t pt-3">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Existing Holidays</div>
                <div className="space-y-1.5">
                  {[...holidays].sort((a, b) => a.date.localeCompare(b.date)).map((h) => (
                    <div key={h.id} className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 bg-gray-50">
                      <div>
                        <span className="mr-1">{holidayEmoji[h.image_key] || holidayEmoji.default}</span>
                        <span className="text-xs font-medium text-gray-800">{h.name}</span>
                        <span className="text-[10px] text-gray-400 ml-2">{h.date}</span>
                      </div>
                      <button onClick={() => handleDeleteHoliday(h.id)} className="text-[10px] text-red-500 hover:text-red-700 shrink-0">Delete</button>
                    </div>
                  ))}
                  {holidays.length === 0 && <div className="text-xs text-gray-400">No holidays added yet.</div>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    {/* ── Templates modal ── */}
      {showTemplates && (
        <div className="no-print fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/20" onClick={() => setShowTemplates(false)} />
          <div className="w-full max-w-md bg-white shadow-2xl flex flex-col h-full overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
              <div className="font-semibold text-gray-900 text-sm">📝 Shift Templates</div>
              <button onClick={() => setShowTemplates(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Add Shift Template</div>
              <div className="space-y-2">
                <input type="text" value={newTemplateName} onChange={(e) => setNewTemplateName(e.target.value)} placeholder="Template name (e.g. Early shift)" className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs" />
                <select value={newTemplateRole} onChange={(e) => setNewTemplateRole(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs">
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <div className="flex gap-2">
                  <input type="time" value={newTemplateStart} onChange={(e) => setNewTemplateStart(e.target.value)} className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-xs" />
                  <input type="time" value={newTemplateEnd} onChange={(e) => setNewTemplateEnd(e.target.value)} className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-xs" />
                </div>
                <button onClick={handleAddTemplate} disabled={savingTemplate} className="w-full py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                  {savingTemplate ? "Saving..." : "Add Template"}
                </button>
              </div>
              <div className="border-t pt-3">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Existing Templates</div>
                <div className="space-y-1.5">
                  {templates.map((t) => (
                    <div key={t.id} className="rounded border px-2 py-1.5 bg-gray-50">
                      {editingTemplateId === t.id ? (
                        <div className="space-y-2">
                          <input type="text" value={editTemplateName} onChange={(e) => setEditTemplateName(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1 text-xs" />
                          <select value={editTemplateRole} onChange={(e) => setEditTemplateRole(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1 text-xs">
                            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                          <div className="flex gap-2">
                            <input type="time" value={editTemplateStart} onChange={(e) => setEditTemplateStart(e.target.value)} className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs" />
                            <input type="time" value={editTemplateEnd} onChange={(e) => setEditTemplateEnd(e.target.value)} className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs" />
                          </div>
                          <div className="flex gap-2 justify-end">
                            <button onClick={handleCancelEditTemplate} className="px-2 py-1 text-xs border rounded hover:bg-gray-100">Cancel</button>
                            <button onClick={handleUpdateTemplate} disabled={savingTemplateEdit} className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                              {savingTemplateEdit ? "Saving..." : "Save"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <span className={`text-xs font-medium ${roleColour[t.role] || "text-gray-800"}`}>{t.name}</span>
                            <span className="text-[10px] text-gray-400 ml-2">{formatTime(t.start_time)}–{formatTime(t.end_time)} · {t.role}</span>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button onClick={() => handleStartEditTemplate(t)} className="text-[10px] text-blue-500 hover:text-blue-700">Edit</button>
                            <button onClick={() => handleDeleteTemplate(t.id)} className="text-[10px] text-red-500 hover:text-red-700">Delete</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {templates.length === 0 && <div className="text-xs text-gray-400">No templates added yet.</div>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    {/* ── Issues panel ── */}
      {showIssues && (() => {
        const monthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;
        const monthShifts = shifts.filter((s) => s.shift_date?.startsWith(monthStr));
        const holidayDates = new Set(holidays.map((h) => h.date));

        // Build issue list
        const issues = [];

        // 1. Availability conflicts
        for (const s of monthShifts) {
          const conflict = getShiftConflict(s);
          if (conflict) {
            const name = s.staff?.name || s.staff_name || "?";
            issues.push({ type: "availability", date: s.shift_date, shift: s, label: `${name} — ${conflict}`, sub: `${formatTime(s.start_time)}–${formatTime(s.end_time)}` });
          }
        }

        // 2. TBC shifts
        for (const s of monthShifts) {
          if (!s.staff_id && !s.staff_name) {
            issues.push({ type: "tbc", date: s.shift_date, shift: s, label: `TBC shift — ${s.role}`, sub: `${formatTime(s.start_time)}–${formatTime(s.end_time)}` });
          }
        }

        // 3. Public holiday shifts
        for (const s of monthShifts) {
          if (holidayDates.has(s.shift_date)) {
            const name = s.staff?.name || s.staff_name || "TBC";
            const hol = holidays.find((h) => h.date === s.shift_date);
            issues.push({ type: "ph", date: s.shift_date, shift: s, label: `${name} rostered on ${hol?.name || "public holiday"}`, sub: `${formatTime(s.start_time)}–${formatTime(s.end_time)}` });
          }
        }

        // Sort by date
        issues.sort((a, b) => a.date.localeCompare(b.date));

        const typeLabel = { availability: "Availability conflict", tbc: "TBC shift", ph: "Public holiday" };
        const typeStyle = {
          availability: "bg-amber-50 border-amber-200 text-amber-800",
          tbc: "bg-red-50 border-red-200 text-red-700",
          ph: "bg-orange-50 border-orange-200 text-orange-700",
        };
        const typeIcon = { availability: "⚠️", tbc: "❓", ph: "🏖️" };

        return (
          <div className="no-print fixed inset-0 z-50 flex">
            <div className="flex-1 bg-black/20" onClick={() => setShowIssues(false)} />
            <div className="w-full max-w-md bg-white shadow-2xl flex flex-col h-full overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
                <div className="font-semibold text-gray-900 text-sm">⚠️ Issues <span className="text-gray-400 font-normal">— {monthLabel}</span></div>
                <button onClick={() => setShowIssues(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {issues.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="text-3xl mb-2">✅</div>
                    <div className="text-sm font-medium text-gray-700">No issues this month</div>
                    <div className="text-xs text-gray-400 mt-1">All shifts look good.</div>
                  </div>
                ) : (
                  <>
                    <div className="text-xs text-gray-500 mb-2">{issues.length} issue{issues.length !== 1 ? "s" : ""} found</div>
                    {issues.map((issue, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setSelectedDate(issue.date);
                          setShowIssues(false);
                        }}
                        className={`w-full text-left rounded-lg border px-3 py-2.5 ${typeStyle[issue.type]} hover:opacity-80 transition-opacity`}
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-sm shrink-0">{typeIcon[issue.type]}</span>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold">{typeLabel[issue.type]}</div>
                            <div className="text-xs mt-0.5 font-medium truncate">{issue.label}</div>
                            <div className="text-[11px] opacity-70 mt-0.5">
                              {new Date(issue.date + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })} · {issue.sub}
                            </div>
                            <div className="text-[11px] opacity-60 mt-0.5">Tap to open day →</div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

    {/* ── Availability modal ── */}
      {showAvailability && (() => {
        const AVAIL_DAYS = [
          { dow: 1, label: "Mon" }, { dow: 2, label: "Tue" }, { dow: 3, label: "Wed" },
          { dow: 4, label: "Thu" }, { dow: 5, label: "Fri" }, { dow: 6, label: "Sat" }, { dow: 0, label: "Sun" },
        ];
        const STATUS = {
          all_day: { label: "All day", emoji: "✅", cls: "bg-green-50 text-green-700 border-green-200" },
          am: { label: "AM only", emoji: "🌅", cls: "bg-amber-50 text-amber-700 border-amber-200" },
          pm: { label: "PM only", emoji: "🌆", cls: "bg-amber-50 text-amber-700 border-amber-200" },
          unavailable: { label: "Unavailable", emoji: "❌", cls: "bg-red-50 text-red-600 border-red-200" },
        };
        const patByDow = Object.fromEntries(availPatterns.map((p) => [p.day_of_week, p]));
        const range = availPatterns.find((p) => p.from_date || p.to_date);
        const fmtO = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
        const selectedStaff = staffOptions.find((s) => String(s.id) === String(availStaffId));

        return (
          <div className="no-print fixed inset-0 z-50 flex">
            <div className="flex-1 bg-black/20" onClick={() => setShowAvailability(false)} />
            <div className="w-full max-w-md bg-white shadow-2xl flex flex-col h-full overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
                <div className="font-semibold text-gray-900 text-sm">👥 Availability</div>
                <button onClick={() => setShowAvailability(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
              </div>
              <div className="flex items-center justify-between px-4 py-2 border-b bg-gray-50 shrink-0">
                <button
                  onClick={() => {
                    const newOffset = availMonthOffset - 1;
                    setAvailMonthOffset(newOffset);
                    if (availStaffId) loadStaffAvailability(availStaffId, newOffset);
                  }}
                  className="px-2 py-1 text-xs border rounded hover:bg-white"
                >←</button>
                <span className="text-xs font-medium text-gray-700">
                  {(() => {
                    const d = new Date(today.getFullYear(), today.getMonth() + availMonthOffset, 1);
                    return d.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
                  })()}
                </span>
                <button
                  onClick={() => {
                    const newOffset = availMonthOffset + 1;
                    setAvailMonthOffset(newOffset);
                    if (availStaffId) loadStaffAvailability(availStaffId, newOffset);
                  }}
                  className="px-2 py-1 text-xs border rounded hover:bg-white"
                >→</button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Staff picker */}
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Staff member</div>
                  <select
                    value={availStaffId || ""}
                    onChange={(e) => { if (e.target.value) loadStaffAvailability(e.target.value); else setAvailStaffId(null); }}
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs"
                  >
                    <option value="">— Select staff —</option>
                    {staffOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>

                {!availStaffId ? (
                  <p className="text-xs text-gray-400">Select a staff member to see their availability.</p>
                ) : availLoading ? (
                  <p className="text-xs text-gray-400">Loading…</p>
                ) : availPatterns.length === 0 && availOverrides.length === 0 && availLeave.length === 0 ? (
                  <p className="text-xs text-gray-400">{selectedStaff?.name || "This staff member"} hasn't submitted any availability yet.</p>
                ) : (
                  <>
                    {/* Weekly pattern */}
                    <div className="border-t pt-3">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Weekly availability</div>
                      <div className="space-y-1">
                        {AVAIL_DAYS.map((d) => {
                          const st = patByDow[d.dow]?.status || "all_day";
                          const meta = STATUS[st] || STATUS.all_day;
                          return (
                            <div key={d.dow} className="flex items-center gap-2">
                              <span className="text-xs w-10 text-gray-600">{d.label}</span>
                              <span className={`text-[11px] px-2 py-0.5 rounded-full border ${meta.cls}`}>{meta.emoji} {meta.label}</span>
                            </div>
                          );
                        })}
                      </div>
                      {range && (range.from_date || range.to_date) && (
                        <div className="text-[11px] text-gray-500 mt-2">
                          Applies {range.from_date ? `from ${fmtO(range.from_date)}` : ""}{range.to_date ? ` until ${fmtO(range.to_date)}` : " (ongoing)"}
                        </div>
                      )}
                      {availStaffNote && (
                        <div className="mt-2 text-[11px] text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                          <span className="font-medium">Their note:</span> {availStaffNote}
                        </div>
                      )}
                    </div>

                    {/* Overrides */}
                    <div className="border-t pt-3">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Specific dates</div>
                      {availOverrides.length === 0 ? (
                        <p className="text-xs text-gray-400">None upcoming.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {availOverrides.map((o) => {
                            const meta = STATUS[o.status] || STATUS.all_day;
                            return (
                              <div key={o.id} className="flex items-start gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                                <span>{meta.emoji}</span>
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs text-gray-700">{fmtO(o.override_date)} — {meta.label}</div>
                                  {o.note && <div className="text-[11px] text-gray-500">{o.note}</div>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Approved leave */}
                    <div className="border-t pt-3">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Approved leave</div>
                      {availLeave.length === 0 ? (
                        <p className="text-xs text-gray-400">None this month.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {availLeave.map((lr) => {
                            const same = lr.from_date === lr.to_date;
                            const range = same ? fmtO(lr.from_date) : `${fmtO(lr.from_date)} → ${fmtO(lr.to_date)}`;
                            return (
                              <div key={lr.id} className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2">
                                <span>🏖️</span>
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs font-medium text-red-700">{lr.leave_type}</div>
                                  <div className="text-[11px] text-gray-600">{range}{!lr.all_day && lr.start_time ? ` · ${lr.start_time.slice(0,5)}–${lr.end_time?.slice(0,5)}` : ""}</div>
                                  {lr.note && <div className="text-[11px] text-gray-500">{lr.note}</div>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Manager note */}
                    <div className="border-t pt-3">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Paige's note <span className="text-gray-400 font-normal">— {monthLabel}</span></div>
                      <textarea
                        value={availManagerNote}
                        onChange={(e) => setAvailManagerNote(e.target.value)}
                        placeholder="Your own note for this staff member this month…"
                        rows={3}
                        className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs resize-none"
                      />
                      <button onClick={handleSaveManagerNote} disabled={savingManagerNote} className="mt-2 w-full py-1.5 text-xs bg-gray-700 text-white rounded hover:bg-gray-800 disabled:opacity-50">
                        {savingManagerNote ? "Saving…" : "Save note"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}
{/* ── Requests panel ── */}
      {showRequests && (() => {
        const pending = leaveRequests.filter((lr) => lr.status === "pending");
        const decided = leaveRequests.filter((lr) => lr.status !== "pending");
        const fmtD = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
        const dateRange = (lr) => {
          const same = lr.from_date === lr.to_date;
          const base = same ? fmtD(lr.from_date) : `${fmtD(lr.from_date)} → ${fmtD(lr.to_date)}`;
          return base + (!lr.all_day && lr.start_time ? ` · ${lr.start_time.slice(0,5)}–${lr.end_time?.slice(0,5)}` : "");
        };
        const statusStyle = {
          approved: "bg-green-50 text-green-700 border-green-200",
          declined: "bg-red-50 text-red-600 border-red-200",
        };

        return (
          <div className="no-print fixed inset-0 z-50 flex">
            <div className="flex-1 bg-black/20" onClick={() => setShowRequests(false)} />
            <div className="w-full max-w-md bg-white shadow-2xl flex flex-col h-full overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
                <div className="font-semibold text-gray-900 text-sm">📨 Leave Requests</div>
                <button onClick={() => setShowRequests(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">

                {/* Pending */}
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Pending {pending.length > 0 && <span className="text-red-500">({pending.length})</span>}
                  </div>
                  {pending.length === 0 ? (
                    <p className="text-xs text-gray-400">No pending requests.</p>
                  ) : (
                    <div className="space-y-2">
                      {pending.map((lr) => (
                        <div key={lr.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-gray-800">{lr.staff?.name || "?"}</span>
                            <span className="text-[11px] text-gray-600">{lr.leave_type}</span>
                          </div>
                          <div className="text-xs text-gray-600 mt-0.5">{dateRange(lr)}</div>
                          {lr.note && <div className="text-xs text-gray-500 mt-1 italic">"{lr.note}"</div>}
                          <textarea
                            value={requestManagerNotes[lr.id] || ""}
                            onChange={(e) => setRequestManagerNotes((p) => ({ ...p, [lr.id]: e.target.value }))}
                            placeholder="Note back to staff (optional)…"
                            rows={2}
                            className="w-full mt-2 rounded border border-gray-300 px-2 py-1.5 text-xs resize-none"
                          />
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => handleLeaveDecision(lr, "declined")}
                              disabled={processingLeaveId === lr.id}
                              className="flex-1 py-1.5 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50 disabled:opacity-50"
                            >
                              Decline
                            </button>
                            <button
                              onClick={() => handleLeaveDecision(lr, "approved")}
                              disabled={processingLeaveId === lr.id}
                              className="flex-1 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                            >
                              {processingLeaveId === lr.id ? "..." : "Approve"}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Decided */}
                <div className="border-t pt-3">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Approved / Declined</div>
                  {decided.length === 0 ? (
                    <p className="text-xs text-gray-400">Nothing yet.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {decided.map((lr) => (
                        <div key={lr.id} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-gray-800">{lr.staff?.name || "?"}</span>
                            <span className={`text-[11px] px-2 py-0.5 rounded-full border ${statusStyle[lr.status] || ""}`}>
                              {lr.status === "approved" ? "Approved" : "Declined"}
                            </span>
                          </div>
                          <div className="text-xs text-gray-600 mt-0.5">{lr.leave_type} · {dateRange(lr)}</div>
                          {lr.manager_note && <div className="text-[11px] text-blue-600 mt-0.5">Note: {lr.manager_note}</div>}
                          <button
                            onClick={() => handleLeaveDecision(lr, "pending")}
                            className="mt-1 text-[11px] text-gray-500 hover:text-gray-700 underline"
                          >
                            Reset to pending
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </div>
          </div>
        );
      })()}
    {/* ── Month Notes modal ── */}
      {showMonthNotes && (
        <div className="no-print fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/20" onClick={() => setShowMonthNotes(false)} />
          <div className="w-full max-w-md bg-white shadow-2xl flex flex-col h-full overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
              <div className="font-semibold text-gray-900 text-sm">📓 Month Notes</div>
              <button onClick={() => setShowMonthNotes(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Notes for {monthLabel}
              </div>
              <textarea
                value={monthNote}
                onChange={(e) => setMonthNote(e.target.value)}
                placeholder="General notes for this month (manager only)..."
                rows={6}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs resize-none"
              />
              <button
                onClick={handleSaveMonthNote}
                disabled={savingMonthNote}
                className="w-full py-1.5 text-xs bg-gray-700 text-white rounded hover:bg-gray-800 disabled:opacity-50"
              >
                {savingMonthNote ? "Saving..." : "Save month notes"}
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}