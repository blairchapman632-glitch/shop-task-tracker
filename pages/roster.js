import React from "react";
import Link from "next/link";

export default function RosterPage() {
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

  <h2 className="section-title mb-4">
  {new Date().toLocaleString("en-AU", { month: "long" })} {new Date().getFullYear()}
</h2>

  <div className="grid grid-cols-7 gap-2 text-sm">

    <div className="font-medium text-center">Mon</div>
    <div className="font-medium text-center">Tue</div>
    <div className="font-medium text-center">Wed</div>
    <div className="font-medium text-center">Thu</div>
    <div className="font-medium text-center">Fri</div>
    <div className="font-medium text-center">Sat</div>
    <div className="font-medium text-center">Sun</div>

  {Array.from({ length: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() }).map((_, i) => (
  <div
    key={i}
    className="border rounded-lg h-24 p-2 text-xs bg-gray-50"
  >
    <div className="font-medium">{i + 1}</div>
  </div>
))}

  </div>

</div>
        </div>

      </div>
    </main>
  );
}
