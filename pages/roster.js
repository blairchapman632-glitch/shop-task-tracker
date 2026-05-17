import React, { useEffect, useState, useCallback } from "react";
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
  locum: "text-blue-700",
  DAA: "text-orange-600",
  "pharmacy assistant": "text-teal-700",
};

const roleBorder = {
  pharmacist: "border-purple-400",
  locum: "border-blue-400",
  DAA: "border-orange-400",
  "pharmacy assistant": "border-teal-400",
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

const ROLES = ["pharmacist", "locum", "DAA", "pharmacy assistant"];

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

  const handlePinSubmit = () => {
    if (pinInput === "2105") {
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
      if (role === "pharmacy assistant" || role === "DAA") return 0;
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

  const refreshShifts = useCallback(async () => {
    const { data, error } = await supabase
      .from("roster_shifts")
      .select(`id, shift_date, start_time, end_time, role, staff_id, staff_name, notes, pharmacy_id, staff:staff_id(id, name)`);
    if (!error) {
      setShifts(data || []);
      const foundPharmacyId = (data || []).find((s) => s.pharmacy_id)?.pharmacy_id || null;
      if (foundPharmacyId) setPharmacyId(foundPharmacyId);
    }
  }, []);

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
      ] = await Promise.all([
        supabase.from("roster_shifts").select(`id, shift_date, start_time, end_time, role, staff_id, staff_name, notes, pharmacy_id, staff:staff_id(id, name)`),
        supabase.from("staff").select("id,name,active").order("name"),
        supabase.from("shift_templates").select("*").order("name"),
        supabase.from("public_holidays").select("*"),
        supabase.from("roster_day_notes").select("*").gte("date", startDate).lt("date", endDate),
        supabase.from("roster_month_notes").select("*").eq("month", monthDate).maybeSingle(),
      ]);

      setShifts(shiftData || []);
      setStaffOptions((staffData || []).filter((s) => s.active !== false));
      setTemplates(templateData || []);
      setHolidays(holidayData || []);

      const foundPharmacyId = (shiftData || []).find((s) => s.pharmacy_id)?.pharmacy_id || null;
      
      if (foundPharmacyId) setPharmacyId(foundPharmacyId);

      const map = {};
      (dayNoteData || []).forEach((n) => { map[n.date] = n.note; });
      setDayNotes(map);
      setMonthNote(monthNoteData?.note || "");
    };
    load();
  }, [monthOffset]);

  // ── Hours summary ──
  const monthHours = () => {
    const monthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;
    const monthShifts = shifts.filter((s) => s.shift_date?.startsWith(monthStr));
    const map = {};
    monthShifts.forEach((s) => {
      const name = s.staff?.name || s.staff_name || "Unknown";
      const mins = toMinutes(s.end_time) - toMinutes(s.start_time);
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
    const resolvedStaffId = newStaffId === "other" ? null : newStaffId ? Number(newStaffId) : null;
    const resolvedStaffName = newStaffId === "other" ? newStaffName.trim() : null;
    if (!resolvedStaffId && !resolvedStaffName) { alert("Please choose or enter a staff member."); return; }
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

      <main className="min-h-screen bg-gray-100 p-2">
        <div className="print-outer max-w-[1400px] mx-auto">

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

          {/* ── Top bar ── */}
          <div className="no-print flex items-center gap-2 mb-2 flex-wrap">
            <button onClick={() => setMonthOffset((m) => m - 1)} className="px-3 py-1.5 rounded-lg border bg-white text-sm hover:bg-gray-50">←</button>
            <h1 className="text-base font-bold text-gray-800 min-w-[140px] text-center">{monthLabel}</h1>
            <button onClick={() => setMonthOffset((m) => m + 1)} className="px-3 py-1.5 rounded-lg border bg-white text-sm hover:bg-gray-50">→</button>

            <button onClick={handleCopyPreviousMonth} className="px-3 py-1.5 rounded-lg border bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100">Copy last month</button>

            <select value={printImage} onChange={(e) => setPrintImage(e.target.value)} className="px-2 py-1.5 rounded-lg border bg-white text-xs">
              {printImageOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>

            <button onClick={handlePrint} className="px-3 py-1.5 rounded-lg border bg-white text-xs font-medium hover:bg-gray-50">🖨️ Print</button>

            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => setShowSettings(true)} className="px-3 py-1.5 rounded-lg border bg-white text-xs font-medium text-gray-700 hover:bg-gray-50">⚙️ Settings</button>
              <Link href="/" className="px-3 py-1.5 rounded-lg border bg-white text-xs font-medium text-gray-700 hover:bg-gray-50">Home</Link>
              <Link href="/admin" className="px-3 py-1.5 rounded-lg border bg-white text-xs font-medium text-gray-700 hover:bg-gray-50">Admin</Link>
            </div>
          </div>

          {/* ── Role legend ── */}
          <div className="no-print flex items-center gap-4 mb-2 text-xs text-gray-600 flex-wrap">
            {[
              { label: "Pharmacist", cls: "text-purple-700" },
              { label: "Locum", cls: "text-blue-700" },
              { label: "DAA", cls: "text-orange-600" },
              { label: "Pharmacy Assistant", cls: "text-teal-700" },
            ].map(({ label, cls }) => (
              <span key={label} className={`font-medium ${cls}`}>{label}</span>
            ))}
            <span className="text-gray-400 ml-2">Drag to move · Alt+drag to copy</span>
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
                            return (
                              <div
                                key={s.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, s)}
                                onDragEnd={handleDragEnd}
                                onClick={(e) => { e.stopPropagation(); setSelectedDate(dateString); }}
                                className={`print-shift-line text-[10px] leading-tight truncate ${roleColour[s.role] || "text-gray-700"} ${isDragging ? "opacity-30" : ""}`}
                                style={{
                                  fontSize: dayShifts.length > 7 ? "8px" : dayShifts.length > 5 ? "9px" : "10px"
                                }}
                                title={`${name} ${start}–${end} (${s.role})`}
                              >
                                {name} <span className="opacity-70">{start}–{end}</span>
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
      </main>

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
                              <select value={editStaffId} onChange={(e) => setEditStaffId(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1 text-xs">
                                <option value="">Select staff</option>
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
                                <div className={`text-xs font-medium truncate ${roleColour[s.role] || "text-gray-800"}`}>{name}</div>
                                <div className="text-[10px] text-gray-500">{start}–{end} · {s.role}</div>
                              </div>
                              <div className="flex gap-1 shrink-0">
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
                  <select value={newStaffId} onChange={(e) => setNewStaffId(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs">
                    <option value="">Select staff member</option>
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
            <div className="border-t px-4 py-3 shrink-0 flex justify-between gap-2">
              <button onClick={() => { setSelectedDate(null); handleCancelEdit(); }} className="px-3 py-1.5 text-xs border rounded hover:bg-gray-50">Close</button>
              <button onClick={handleAddShift} disabled={savingShift} className="px-4 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                {savingShift ? "Saving..." : "Save shift"}
              </button>
            </div>
          </div>
        </div>
      )}
    {/* ── Settings panel ── */}
      {showSettings && (
        <div className="no-print fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/20" onClick={() => setShowSettings(false)} />
          <div className="w-full max-w-md bg-white shadow-2xl flex flex-col h-full overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
              <div className="font-semibold text-gray-900 text-sm">Roster Settings</div>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            {/* Tabs */}
            <div className="flex border-b shrink-0">
              {[
                { key: "holidays", label: "📅 Holidays" },
                { key: "templates", label: "⏱️ Templates" },
                { key: "monthnotes", label: "📝 Month Notes" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setSettingsTab(tab.key)}
                  className={`flex-1 py-2 text-xs font-medium border-b-2 transition-colors ${
                    settingsTab === tab.key
                      ? "border-blue-500 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">

              {/* ── Holidays tab ── */}
              {settingsTab === "holidays" && (
                <>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Add Public Holiday</div>
                  <div className="space-y-2">
                    <input
                      type="date"
                      value={newHolidayDate}
                      onChange={(e) => setNewHolidayDate(e.target.value)}
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs"
                    />
                    <input
                      type="text"
                      value={newHolidayName}
                      onChange={(e) => setNewHolidayName(e.target.value)}
                      placeholder="Holiday name (e.g. Christmas Day)"
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs"
                    />
                    <select
                      value={newHolidayKey}
                      onChange={(e) => setNewHolidayKey(e.target.value)}
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs"
                    >
                      <option value="default">🏖️ Generic</option>
                      <option value="newyear">🎆 New Year</option>
                      <option value="australia">🦘 Australia Day</option>
                      <option value="easter">🐣 Easter</option>
                      <option value="anzac">🌺 ANZAC Day</option>
                      <option value="wa">⚓ WA Day</option>
                      <option value="christmas">🎅 Christmas</option>
                    </select>
                    <button
                      onClick={handleAddHoliday}
                      disabled={savingHoliday}
                      className="w-full py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                    >
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
                          <button
                            onClick={() => handleDeleteHoliday(h.id)}
                            className="text-[10px] text-red-500 hover:text-red-700 shrink-0"
                          >
                            Delete
                          </button>
                        </div>
                      ))}
                      {holidays.length === 0 && <div className="text-xs text-gray-400">No holidays added yet.</div>}
                    </div>
                  </div>
                </>
              )}

              {/* ── Month notes tab ── */}
              {settingsTab === "monthnotes" && (
                <>
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
                </>
              )}

              {/* ── Templates tab ── */}
              {settingsTab === "templates" && (
                <>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Add Shift Template</div>
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={newTemplateName}
                      onChange={(e) => setNewTemplateName(e.target.value)}
                      placeholder="Template name (e.g. Early shift)"
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs"
                    />
                    <select
                      value={newTemplateRole}
                      onChange={(e) => setNewTemplateRole(e.target.value)}
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs"
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <div className="flex gap-2">
                      <input
                        type="time"
                        value={newTemplateStart}
                        onChange={(e) => setNewTemplateStart(e.target.value)}
                        className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-xs"
                      />
                      <input
                        type="time"
                        value={newTemplateEnd}
                        onChange={(e) => setNewTemplateEnd(e.target.value)}
                        className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-xs"
                      />
                    </div>
                    <button
                      onClick={handleAddTemplate}
                      disabled={savingTemplate}
                      className="w-full py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                    >
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
                              <input
                                type="text"
                                value={editTemplateName}
                                onChange={(e) => setEditTemplateName(e.target.value)}
                                className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                              />
                              <select
                                value={editTemplateRole}
                                onChange={(e) => setEditTemplateRole(e.target.value)}
                                className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                              >
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
                </>
              )}

            </div>
          </div>
        </div>
      )}

    </>
  );
}