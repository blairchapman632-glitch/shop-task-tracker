import React, { useEffect, useState } from "react";
import Link from "next/link";
import supabase from "../lib/supabaseClient";

export default function RosterPage() {
  const today = new Date();

const [shifts, setShifts] = useState([]);

const formatRosterTime = (time) => {
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

const [monthOffset, setMonthOffset] = React.useState(0);
const [selectedDate, setSelectedDate] = useState(null);
const [staffOptions, setStaffOptions] = useState([]);
const [newShiftStaffId, setNewShiftStaffId] = useState("");
const [newShiftRole, setNewShiftRole] = useState("pharmacist");
const [newShiftStart, setNewShiftStart] = useState("09:00");
const [newShiftEnd, setNewShiftEnd] = useState("17:00");
const [savingShift, setSavingShift] = useState(false);
const [copyingMonth, setCopyingMonth] = useState(false);
const [editingShiftId, setEditingShiftId] = useState(null);
const [editShiftStaffId, setEditShiftStaffId] = useState("");
const [editShiftRole, setEditShiftRole] = useState("pharmacist");
const [editShiftStart, setEditShiftStart] = useState("09:00");
const [editShiftEnd, setEditShiftEnd] = useState("17:00");
const [savingEditShift, setSavingEditShift] = useState(false);

const selectedDayShifts = selectedDate
  ? shifts.filter((s) => s.shift_date === selectedDate)
  : [];

const refreshShifts = async () => {
  const { data: refreshedShifts, error: refreshError } = await supabase
    .from("roster_shifts")
    .select(`
      id,
      shift_date,
      start_time,
      end_time,
      role,
      staff_id,
      staff:staff_id (
        id,
        name
      )
    `);

  if (refreshError) throw refreshError;

  setShifts(refreshedShifts || []);
};

const handleStartEditShift = (shift) => {
  setEditingShiftId(shift.id);
  setEditShiftStaffId(String(shift.staff_id || shift.staff?.id || ""));
  setEditShiftRole(shift.role || "pharmacist");
  setEditShiftStart(shift.start_time || "09:00");
  setEditShiftEnd(shift.end_time || "17:00");
};

const handleCancelEditShift = () => {
  setEditingShiftId(null);
  setEditShiftStaffId("");
  setEditShiftRole("pharmacist");
  setEditShiftStart("09:00");
  setEditShiftEnd("17:00");
};

const handleUpdateShift = async () => {
  if (!editingShiftId) {
    alert("No shift selected.");
    return;
  }

  if (!editShiftStaffId) {
    alert("Please choose a staff member.");
    return;
  }

  if (!editShiftStart || !editShiftEnd) {
    alert("Please enter a start and end time.");
    return;
  }

  try {
    setSavingEditShift(true);

    const { error } = await supabase
      .from("roster_shifts")
      .update({
        staff_id: Number(editShiftStaffId),
        role: editShiftRole,
        start_time: editShiftStart,
        end_time: editShiftEnd,
      })
      .eq("id", editingShiftId);

    if (error) throw error;

    await refreshShifts();
    handleCancelEditShift();
  } catch (err) {
    console.error("Update shift error:", err);
    alert("Couldn't update shift: " + (err?.message || String(err)));
  } finally {
    setSavingEditShift(false);
  }
};



const handleCopyPreviousMonth = async () => {
  try {
    setCopyingMonth(true);

    const targetMonthDate = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`;

    const previousMonth = new Date(currentYear, currentMonth - 1, 1);
    const previousYear = previousMonth.getFullYear();
    const previousMonthIndex = previousMonth.getMonth();
    const previousMonthDate = `${previousYear}-${String(previousMonthIndex + 1).padStart(2, "0")}-01`;

    const targetMonthEndDate = `${currentYear}-${String(currentMonth + 2).padStart(2, "0")}-01`;
    const previousMonthEndDate = `${previousYear}-${String(previousMonthIndex + 2).padStart(2, "0")}-01`;

    const { error: deleteExistingTargetShiftsError } = await supabase
      .from("roster_shifts")
      .delete()
      .gte("shift_date", targetMonthDate)
      .lt("shift_date", targetMonthEndDate);

    if (deleteExistingTargetShiftsError) throw deleteExistingTargetShiftsError;

    const { data: previousShifts, error: previousShiftsError } = await supabase
      .from("roster_shifts")
      .select(`
        id,
        staff_id,
        shift_date,
        start_time,
        end_time,
        role
      `)
      .gte("shift_date", previousMonthDate)
      .lt("shift_date", previousMonthEndDate)
      .order("shift_date", { ascending: true });

    if (previousShiftsError) throw previousShiftsError;

    if (!previousShifts || previousShifts.length === 0) {
      alert("No shifts found in the previous month to copy.");
      return;
    }

    let targetRosterMonthId = null;

    const { data: existingTargetMonth, error: existingTargetMonthError } = await supabase
      .from("roster_months")
      .select("id")
      .eq("month", targetMonthDate)
      .maybeSingle();

    if (existingTargetMonthError) throw existingTargetMonthError;

    if (existingTargetMonth?.id) {
      targetRosterMonthId = existingTargetMonth.id;
    } else {
      const { data: createdTargetMonth, error: createdTargetMonthError } = await supabase
        .from("roster_months")
        .insert([
          {
            month: targetMonthDate,
            status: "draft",
          },
        ])
        .select("id")
        .single();

      if (createdTargetMonthError) throw createdTargetMonthError;

      targetRosterMonthId = createdTargetMonth.id;
    }

    const getWeekdayIndexMondayFirst = (date) => {
      return (date.getDay() + 6) % 7;
    };

    const getWeekdayOccurrenceInMonth = (date) => {
      return Math.floor((date.getDate() - 1) / 7) + 1;
    };

    const findMatchingDateInTargetMonth = (weekdayIndex, occurrence) => {
      const daysInTargetMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
      let count = 0;

      for (let day = 1; day <= daysInTargetMonth; day++) {
        const candidate = new Date(currentYear, currentMonth, day);
        const candidateWeekday = getWeekdayIndexMondayFirst(candidate);

        if (candidateWeekday === weekdayIndex) {
          count += 1;

          if (count === occurrence) {
            return `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          }
        }
      }

      return null;
    };

    const copiedShifts = previousShifts
      .map((shift) => {
        const originalDate = new Date(shift.shift_date);
        const weekdayIndex = getWeekdayIndexMondayFirst(originalDate);
        const occurrence = getWeekdayOccurrenceInMonth(originalDate);
        const newShiftDate = findMatchingDateInTargetMonth(weekdayIndex, occurrence);

        if (!newShiftDate) {
          return null;
        }

        return {
          staff_id: shift.staff_id,
          shift_date: newShiftDate,
          start_time: shift.start_time,
          end_time: shift.end_time,
          role: shift.role,
          roster_month_id: targetRosterMonthId,
        };
      })
      .filter(Boolean);

    if (copiedShifts.length === 0) {
      alert("There were no valid shifts to copy into this month.");
      return;
    }

    const { error: insertCopiedShiftsError } = await supabase
      .from("roster_shifts")
      .insert(copiedShifts);

    if (insertCopiedShiftsError) throw insertCopiedShiftsError;

    await refreshShifts();
    alert("Previous month roster copied by weekday pattern.");
  } catch (err) {
    console.error("Copy month error:", err);
    alert("Couldn't copy previous month roster: " + (err?.message || String(err)));
  } finally {
    setCopyingMonth(false);
  }
};
const handleCopyWeek = async (targetWeek) => {
  try {
    if (!selectedDate) return;

    const sourceDate = new Date(selectedDate);

    // find Monday of the source week
    const monday = new Date(sourceDate);
    const day = monday.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    monday.setDate(monday.getDate() + diff);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const mondayStr = monday.toISOString().slice(0, 10);
    const sundayStr = sunday.toISOString().slice(0, 10);

    const { data: weekShifts, error } = await supabase
      .from("roster_shifts")
      .select("*")
      .gte("shift_date", mondayStr)
      .lte("shift_date", sundayStr);

    if (error) throw error;

    if (!weekShifts || weekShifts.length === 0) {
      alert("No shifts found in this week.");
      return;
    }

    const newShifts = weekShifts.map((shift) => {
      const original = new Date(shift.shift_date);
      const weekday = (original.getDay() + 6) % 7;

      const newDay = (targetWeek - 1) * 7 + 1 + weekday;

      const newDate = new Date(currentYear, currentMonth, newDay);

      return {
        staff_id: shift.staff_id,
        shift_date: newDate.toISOString().slice(0, 10),
        start_time: shift.start_time,
        end_time: shift.end_time,
        role: shift.role,
        roster_month_id: shift.roster_month_id,
      };
    });

    // delete existing shifts in target week
    const targetStart = new Date(currentYear, currentMonth, (targetWeek - 1) * 7 + 1);
    const targetEnd = new Date(targetStart);
    targetEnd.setDate(targetStart.getDate() + 6);

    await supabase
      .from("roster_shifts")
      .delete()
      .gte("shift_date", targetStart.toISOString().slice(0, 10))
      .lte("shift_date", targetEnd.toISOString().slice(0, 10));

    const { error: insertError } = await supabase
      .from("roster_shifts")
      .insert(newShifts);

    if (insertError) throw insertError;

    await refreshShifts();

    alert("Week copied successfully.");
  } catch (err) {
    console.error("Copy week error:", err);
    alert("Couldn't copy week: " + (err?.message || String(err)));
  }
};
const handleAddShift = async () => {
  if (!selectedDate) {
    alert("No date selected.");
    return;
  }

  if (!newShiftStaffId) {
    alert("Please choose a staff member.");
    return;
  }

  if (!newShiftStart || !newShiftEnd) {
    alert("Please enter a start and end time.");
    return;
  }

  try {
    setSavingShift(true);

    const rosterMonthDate = `${selectedDate.slice(0, 7)}-01`;

    let rosterMonthId = null;

    const { data: existingMonth, error: existingMonthError } = await supabase
      .from("roster_months")
      .select("id")
      .eq("month", rosterMonthDate)
      .maybeSingle();

    if (existingMonthError) throw existingMonthError;

    if (existingMonth?.id) {
      rosterMonthId = existingMonth.id;
    } else {
      const { data: createdMonth, error: createMonthError } = await supabase
        .from("roster_months")
        .insert([
          {
            month: rosterMonthDate,
            status: "draft",
          },
        ])
        .select("id")
        .single();

      if (createMonthError) throw createMonthError;

      rosterMonthId = createdMonth.id;
    }

    const { error: insertError } = await supabase
      .from("roster_shifts")
      .insert([
        {
          staff_id: Number(newShiftStaffId),
          shift_date: selectedDate,
          start_time: newShiftStart,
          end_time: newShiftEnd,
          role: newShiftRole,
          roster_month_id: rosterMonthId,
        },
      ]);

    if (insertError) throw insertError;

    const { data: refreshedShifts, error: refreshError } = await supabase
      .from("roster_shifts")
      .select(`
        id,
        shift_date,
        start_time,
        end_time,
        role,
        staff:staff_id (
          id,
          name
        )
      `);

    if (refreshError) throw refreshError;

    setShifts(refreshedShifts || []);
    setNewShiftStaffId("");
    setNewShiftRole("pharmacist");
    setNewShiftStart("09:00");
    setNewShiftEnd("17:00");
  } catch (err) {
    console.error("Add shift error:", err);
    alert("Couldn't save shift: " + (err?.message || String(err)));
  } finally {
    setSavingShift(false);
  }
};

const displayMonth = new Date(
  today.getFullYear(),
  today.getMonth() + monthOffset,
  1
);

const currentYear = displayMonth.getFullYear();
const currentMonth = displayMonth.getMonth();

  const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const startOffset = (firstDayOfMonth.getDay() + 6) % 7;

  const cells = [];

  for (let i = 0; i < startOffset; i++) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(day);
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
useEffect(() => {
  const loadRosterData = async () => {
    const [
      { data: shiftData, error: shiftError },
      { data: staffData, error: staffError },
    ] = await Promise.all([
      supabase
        .from("roster_shifts")
        .select(`
          id,
          shift_date,
          start_time,
          end_time,
          role,
          staff:staff_id (
            id,
            name
          )
        `),
      supabase
        .from("staff")
        .select("id,name,active")
        .order("name", { ascending: true }),
    ]);

    if (shiftError) {
      console.error("Shift load error:", shiftError);
    } else {
      setShifts(shiftData || []);
    }

    if (staffError) {
      console.error("Staff load error:", staffError);
    } else {
      setStaffOptions((staffData || []).filter((s) => s.active !== false));
    }
  };

  loadRosterData();
}, []);
 const formatSelectedDateLabel = (dateStr) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

const getWeekOfMonth = (dateStr) => {
  const d = new Date(dateStr);
  return Math.floor((d.getDate() - 1) / 7) + 1;
};

  return (
    <main className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="card overflow-hidden">

        {/* Header */}
        <div className="px-4 md:px-6 pt-4 md:pt-6 pb-3 border-b-2 border-blue-500">
          <div className="flex items-center justify-between">

            <h1 className="h1-tight">Roster</h1>

            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Home
              </Link>

              <Link
                href="/admin"
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Admin
              </Link>
            </div>

          </div>
        </div>

        {/* Content */}
        <div className="p-4 md:p-6">
        <div className="rounded-xl border bg-white p-4">

<div className="flex items-center justify-between mb-4">

  <button
    className="px-3 py-1 rounded-md border bg-white text-sm hover:bg-gray-50"
    onClick={() => setMonthOffset((m) => m - 1)}
  >
    ←
  </button>

  <div className="flex items-center gap-3">
    <h2 className="section-title">
      {displayMonth.toLocaleString("en-AU", { month: "long", year: "numeric" })}
    </h2>

    <button
      onClick={handleCopyPreviousMonth}
      disabled={copyingMonth}
      className="rounded-md border px-3 py-1 text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
    >
      {copyingMonth ? "Copying..." : "Copy last month"}
    </button>
  </div>

  <button
    className="px-3 py-1 rounded-md border bg-white text-sm hover:bg-gray-50"
    onClick={() => setMonthOffset((m) => m + 1)}
  >
    →
  </button>

</div>

  <div className="grid grid-cols-7 gap-2 text-sm">

    <div className="font-medium text-center">Mon</div>
    <div className="font-medium text-center">Tue</div>
    <div className="font-medium text-center">Wed</div>
    <div className="font-medium text-center">Thu</div>
    <div className="font-medium text-center">Fri</div>
    <div className="font-medium text-center">Sat</div>
    <div className="font-medium text-center">Sun</div>

 {cells.map((day, i) => {
  const dayShifts = day
    ? shifts.filter((s) => {
        const d = new Date(s.shift_date);
        return (
          d.getDate() === day &&
          d.getMonth() === currentMonth &&
          d.getFullYear() === currentYear
        );
      })
    : [];

   const dateString = day
    ? `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    : null;

  return (
 <button
  type="button"
  onClick={() => {
    if (dateString) setSelectedDate(dateString);
  }}
  onContextMenu={(e) => {
    if (!dateString) return;
    e.preventDefault();
    const confirmed = window.confirm("Copy this week to another week?");
    if (!confirmed) return;
    handleCopyWeek(dateString);
  }}
  className={`border rounded-lg min-h-[125px] text-xs text-left w-full ${
    day ? "bg-gray-50 hover:bg-gray-100 cursor-pointer" : "bg-white"
  }`}
  disabled={!day}
>
      {day ? (
        <div className="h-full flex flex-col p-2">
          <div className="text-[12px] font-bold text-blue-700 pb-1 shrink-0">
  {day}
</div>
     <div className="pt-0.5 space-y-[1px] text-[10px] leading-tight flex-1 overflow-hidden">
            {dayShifts.slice(0, 6).map((s) => {
              const roleColour = {
                pharmacist: "border-l-4 border-purple-600 text-purple-700",
                locum: "border-l-4 border-blue-600 text-blue-700",
                DAA: "border-l-4 border-green-600 text-green-700",
                "pharmacy assistant": "border-l-4 border-black text-black",
              };

              const start = formatRosterTime(s.start_time);
              const end = formatRosterTime(s.end_time);

             return (
<div
  key={s.id}
 className={`flex items-center justify-between text-[11px] leading-tight py-0 ${roleColour[s.role] || "text-gray-700"}`}
>
  <span className="truncate pr-1">{s.staff?.name}</span>
  <span className="tabular-nums shrink-0 text-[11px] text-gray-600">
    {start}–{end}
  </span>
</div>
);
            })}

            {dayShifts.length > 6 ? (
              <div className="px-1 text-[10px] text-gray-500">
                +{dayShifts.length - 6} more
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </button>
  );
})}

  </div>

</div>
        </div>

        {selectedDate ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-lg max-h-[90vh] overflow-hidden rounded-xl bg-white shadow-xl flex flex-col">
              <div className="flex items-center justify-between border-b px-4 py-3 shrink-0">
                <div>
                <div className="flex items-center gap-3">
  <h3 className="text-lg font-semibold text-gray-900">
    Day editor
  </h3>

  <div className="flex items-center gap-1">
    <span className="text-xs text-gray-500">Copy week →</span>

    {[1,2,3,4,5,6].map((w) => (
      <button
        key={w}
        onClick={() => handleCopyWeek(w)}
        className="px-2 py-1 text-xs rounded border hover:bg-gray-100"
      >
        {w}
      </button>
    ))}
  </div>
</div>
                  <p className="text-sm text-gray-600">
                    {formatSelectedDateLabel(selectedDate)}
                  </p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {selectedDayShifts.length === 0 ? (
                  <p className="text-sm text-gray-600">
                    No shifts added for this day yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {selectedDayShifts.map((s) => {
                      const roleColour = {
                        pharmacist: "border-l-4 border-purple-600",
                        locum: "border-l-4 border-blue-600",
                        DAA: "border-l-4 border-green-600",
                        "pharmacy assistant": "border-l-4 border-black",
                      };

                      const start = formatRosterTime(s.start_time);
                      const end = formatRosterTime(s.end_time);
                      const isEditingThisShift = editingShiftId === s.id;

                      return (
                        <div
                          key={s.id}
                          className={`rounded-lg bg-gray-50 px-3 py-2 ${roleColour[s.role] || "border-l-4 border-gray-400"}`}
                        >
                          {isEditingThisShift ? (
                            <div className="space-y-3">
                              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <div className="md:col-span-2">
                                  <label className="mb-1 block text-sm text-gray-700">
                                    Staff member
                                  </label>
                                  <select
                                    value={editShiftStaffId}
                                    onChange={(e) => setEditShiftStaffId(e.target.value)}
                                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                                  >
                                    <option value="">Select staff member</option>
                                    {staffOptions.map((staff) => (
                                      <option key={staff.id} value={staff.id}>
                                        {staff.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                <div>
                                  <label className="mb-1 block text-sm text-gray-700">
                                    Role
                                  </label>
                                  <select
                                    value={editShiftRole}
                                    onChange={(e) => setEditShiftRole(e.target.value)}
                                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                                  >
                                    <option value="pharmacist">Pharmacist</option>
                                    <option value="locum">Locum</option>
                                    <option value="DAA">DAA</option>
                                    <option value="pharmacy assistant">Pharmacy assistant</option>
                                  </select>
                                </div>

                                <div>
                                  <label className="mb-1 block text-sm text-gray-700">
                                    Start time
                                  </label>
                                  <input
                                    type="time"
                                    value={editShiftStart}
                                    onChange={(e) => setEditShiftStart(e.target.value)}
                                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                                  />
                                </div>

                                <div>
                                  <label className="mb-1 block text-sm text-gray-700">
                                    End time
                                  </label>
                                  <input
                                    type="time"
                                    value={editShiftEnd}
                                    onChange={(e) => setEditShiftEnd(e.target.value)}
                                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                                  />
                                </div>
                              </div>

                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={handleCancelEditShift}
                                  className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
                                >
                                  Cancel
                                </button>

                                <button
                                  type="button"
                                  onClick={handleUpdateShift}
                                  disabled={savingEditShift}
                                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {savingEditShift ? "Saving..." : "Save changes"}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="font-medium text-gray-900 truncate">
                                    {s.staff?.name}
                                  </div>
                                  <div className="text-sm tabular-nums text-gray-700 shrink-0">
                                    {start}–{end}
                                  </div>
                                </div>
                                <div className="mt-1 flex items-center justify-between gap-3">
                                  <div className="text-sm text-gray-600">
                                    {s.role}
                                  </div>
<div className="flex items-center gap-2">
  <button
    type="button"
    onClick={() => handleStartEditShift(s)}
    className="rounded-md border border-blue-200 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
  >
    Edit
  </button>

  <button
    type="button"
    onClick={async () => {
      const confirmed = window.confirm(`Duplicate shift for ${s.staff?.name}?`);
      if (!confirmed) return;

      try {
        const { error } = await supabase
          .from("roster_shifts")
          .insert([
            {
              staff_id: s.staff_id,
              shift_date: selectedDate,
              start_time: s.start_time,
              end_time: s.end_time,
              role: s.role,
              roster_month_id: s.roster_month_id || null,
            },
          ]);

        if (error) throw error;

        await refreshShifts();
      } catch (err) {
        console.error("Duplicate shift error:", err);
        alert("Couldn't duplicate shift: " + (err?.message || String(err)));
      }
    }}
    className="rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
  >
    Duplicate
  </button>

  <button
    type="button"
    onClick={async () => {
      const confirmed = window.confirm(`Delete shift for ${s.staff?.name}?`);
      if (!confirmed) return;

      try {
        const { error } = await supabase
          .from("roster_shifts")
          .delete()
          .eq("id", s.id);

        if (error) throw error;

        if (editingShiftId === s.id) {
          handleCancelEditShift();
        }

        await refreshShifts();
      } catch (err) {
        console.error("Delete shift error:", err);
        alert("Couldn't delete shift: " + (err?.message || String(err)));
      }
    }}
    className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
  >
    Delete
  </button>
</div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="mt-4 border-t pt-4">
                  <h4 className="text-sm font-semibold text-gray-900">
                    Add shift
                  </h4>

                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-sm text-gray-700">
                        Staff member
                      </label>
                      <select
                        value={newShiftStaffId}
                        onChange={(e) => setNewShiftStaffId(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                      >
                        <option value="">Select staff member</option>
                        {staffOptions.map((staff) => (
                          <option key={staff.id} value={staff.id}>
                            {staff.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm text-gray-700">
                        Role
                      </label>
                      <select
                        value={newShiftRole}
                        onChange={(e) => setNewShiftRole(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                      >
                        <option value="pharmacist">Pharmacist</option>
                        <option value="locum">Locum</option>
                        <option value="DAA">DAA</option>
                        <option value="pharmacy assistant">Pharmacy assistant</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm text-gray-700">
                        Start time
                      </label>
                      <input
                        type="time"
                        value={newShiftStart}
                        onChange={(e) => setNewShiftStart(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm text-gray-700">
                        End time
                      </label>
                      <input
                        type="time"
                        value={newShiftEnd}
                        onChange={(e) => setNewShiftEnd(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t bg-white px-4 py-3 shrink-0">
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedDate(null)}
                    className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    Close
                  </button>

                  <button
                    type="button"
                    onClick={handleAddShift}
                    disabled={savingShift}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingShift ? "Saving..." : "Save shift"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

      </div>
    </main>
  );
}
