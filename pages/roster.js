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
const [selectedDate, setSelectedDate] = useState<string | null>(null);

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
  const loadShifts = async () => {
   const { data, error } = await supabase
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

    if (error) {
      console.error("Shift load error:", error);
    } else {
      setShifts(data || []);
    }
  };

  loadShifts();
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
    ? new Date(currentYear, currentMonth, day).toISOString().split("T")[0]
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
                <p className="text-sm text-gray-700">
                  Placeholder modal only for now.
                </p>
                <p className="mt-2 text-sm text-gray-600">
                  Next we will load that day’s shifts here and add the controls
                  for adding, editing, and deleting shifts.
                </p>
              </div>
            </div>
          </div>
        ) : null}

      </div>
    </main>
  );
}
