import React, { useEffect, useState } from "react";
import Link from "next/link";
import supabase from "../lib/supabaseClient";

export default function RosterPage() {
  const today = new Date();

const [shifts, setShifts] = useState([]);

const formatRosterTime = (time) => {
  if (!time) return "";

  const [hourStr, minuteStr] = String(time).split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);

  if (minute === 0) return String(hour);
  return `${hour}.${String(minute).padStart(2, "0")}`;
};

const [monthOffset, setMonthOffset] = React.useState(0);
const [selectedDate, setSelectedDate] = useState(null);
const [staffOptions, setStaffOptions] = useState([]);
const [newShiftStaffId, setNewShiftStaffId] = useState("");
const [newShiftRole, setNewShiftRole] = useState("pharmacist");
const [newShiftStart, setNewShiftStart] = useState("09:00");
const [newShiftEnd, setNewShiftEnd] = useState("17:00");
const [savingShift, setSavingShift] = useState(false);

const selectedDayShifts = selectedDate
  ? shifts.filter((s) => s.shift_date === selectedDate)
  : [];

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

  <h2 className="section-title">
    {displayMonth.toLocaleString("en-AU", { month: "long", year: "numeric" })}
  </h2>

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
      key={i}
      type="button"
      onClick={() => {
        if (dateString) setSelectedDate(dateString);
      }}
      className={`border rounded-lg min-h-[150px] text-xs text-left w-full ${
        day ? "bg-gray-50 hover:bg-gray-100 cursor-pointer" : "bg-white"
      }`}
      disabled={!day}
    >
      {day ? (
        <div className="h-full flex flex-col p-2">
          <div className="font-medium text-[12px] leading-none pb-2 border-b border-gray-200 shrink-0">
            {day}
          </div>

          <div className="pt-2 space-y-1 text-[11px] leading-tight flex-1 overflow-hidden">
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
                  className={`rounded bg-white px-2 py-1 ${roleColour[s.role] || "border-l-4 border-gray-400 text-gray-700"}`}
                >
                  <div className="truncate font-medium">{s.staff?.name}</div>
                  <div className="tabular-nums text-[10px] text-gray-600">
                    {start}–{end}
                  </div>
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
            <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Day editor
                  </h3>
                  <p className="text-sm text-gray-600">
                    {formatSelectedDateLabel(selectedDate)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedDate(null)}
                  className="rounded-md border px-3 py-1 text-sm hover:bg-gray-50"
                >
                  Close
                </button>
              </div>

                           <div className="p-4">
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

                      return (
                        <div
                          key={s.id}
                          className={`rounded-lg bg-gray-50 px-3 py-2 ${roleColour[s.role] || "border-l-4 border-gray-400"}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-medium text-gray-900">
                                {s.staff?.name}
                              </div>
                              <div className="text-sm text-gray-600">
                                {s.role}
                              </div>
                            </div>

                            <div className="text-sm tabular-nums text-gray-700">
                              {start}–{end}
                            </div>
                          </div>
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

                  <div className="mt-4 flex justify-end">
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
          </div>
        ) : null}

      </div>
    </main>
  );
}
