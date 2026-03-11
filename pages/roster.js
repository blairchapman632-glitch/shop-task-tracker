import React, { useEffect, useState } from "react";
import Link from "next/link";
import supabase from "../lib/supabaseClient";

export default function RosterPage() {
  const today = new Date();

const [shifts, setShifts] = useState([]);

const [monthOffset, setMonthOffset] = React.useState(0);

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
      .select("*");

    if (error) {
      console.error("Shift load error:", error);
    } else {
      setShifts(data || []);
    }
  };

  loadShifts();
}, []);
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

 {cells.map((day, i) => (
  <div
    key={i}
   className={`border rounded-lg min-h-[120px] p-2 text-xs ${day ? "bg-gray-50" : "bg-white"}`}
  >
    {day ? (
  <>
    <div className="font-medium mb-1">{day}</div>

  <div className="space-y-1 text-[11px] leading-tight">
      <div className="rounded bg-blue-100 px-1 py-0.5">Pharmacist</div>
      <div className="rounded bg-green-100 px-1 py-0.5">Dispense</div>
      <div className="rounded bg-purple-100 px-1 py-0.5">Retail</div>
    </div>
  </>
) : null}
  </div>
))}

  </div>

</div>
        </div>

      </div>
    </main>
  );
}
