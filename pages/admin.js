// pages/admin.js
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import supabase from "../lib/supabaseClient"; // works for .js or .ts client

const FREQ_LABELS = {
  daily: "Daily",
  few_days_per_week: "Few days / week",
  weekly: "Weekly",
  monthly: "Monthly",
  specific_date: "Specific date",
};

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function freqPretty(task) {
  const f = task.frequency || null;
  if (!f || !FREQ_LABELS[f]) return "—";
  return FREQ_LABELS[f];
}

function freqDetail(task) {
  const f = task.frequency || null;
  if (!f) return "—";

  if (f === "few_days_per_week") {
    const arr = Array.isArray(task.days_of_week) ? task.days_of_week : [];
    return arr.length ? arr.map((n) => DOW[n] ?? "?").join(", ") : "—";
  }
  if (f === "weekly") {
    const n = typeof task.weekly_day === "number" ? task.weekly_day : null;
    return n != null ? DOW[n] : "—";
  }
  if (f === "monthly") {
    const d = task.day_of_month;
    return d ? `Day ${d}` : "—";
  }
  if (f === "specific_date") {
    return task.specific_date ?? "—";
  }
  return "—";
}

function timePretty(t) {
  if (!t) return "—";
  // Accepts "HH:MM" or "HH:MM:SS" strings; display HH:MM
  const parts = String(t).split(":");
  return parts.length >= 2 ? `${parts[0]}:${parts[1]}` : t;
}

function Chip({ children, tone = "gray" }) {
  const tones = {
    gray: "bg-gray-100 text-gray-700 border-gray-200",
    green: "bg-green-100 text-green-700 border-green-200",
    red: "bg-red-100 text-red-700 border-red-200",
    blue: "bg-blue-100 text-blue-700 border-blue-200",
    amber: "bg-amber-100 text-amber-800 border-amber-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${tones[tone] || tones.gray}`}
    >
      {children}
    </span>
  );
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState("tasks");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [tasks, setTasks] = useState([]);

  // Filters
  const [q, setQ] = useState("");
  const [freqFilter, setFreqFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState("all");

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);
      setErr("");

      // We SELECT * defensively so it won't error if some columns don't exist yet.
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .order("title", { ascending: true });

      if (!isMounted) return;

      if (error) {
        setErr(error.message || "Failed to load tasks");
        setTasks([]);
      } else {
        // Normalise with safe defaults
        const normalized = (data || []).map((t) => ({
          id: t.id,
          title: t.title ?? "",
          active: typeof t.active === "boolean" ? t.active : true,
          points: Number.isFinite(t.points) ? t.points : 1,
          due_time: t.due_time ?? null,
          frequency: t.frequency ?? null,
          days_of_week: t.days_of_week ?? null,
          weekly_day: typeof t.weekly_day === "number" ? t.weekly_day : null,
          day_of_month: t.day_of_month ?? null,
          specific_date: t.specific_date ?? null,
          sort_index: Number.isFinite(t.sort_index) ? t.sort_index : 1000,
        }));

        // Sort primarily by sort_index, then title
        normalized.sort((a, b) => {
          const si = (a.sort_index ?? 1000) - (b.sort_index ?? 1000);
          if (si !== 0) return si;
          return (a.title || "").localeCompare(b.title || "");
        });

        setTasks(normalized);
      }
      setLoading(false);
    }

    load();
    return () => {
      isMounted = false;
    };
  }, []);

  const filtered = useMemo(() => {
    return tasks
      .filter((t) => {
        // text search
        const okQ = q
          ? (t.title || "").toLowerCase().includes(q.trim().toLowerCase())
          : true;

        // frequency filter
        const okF =
          freqFilter === "all"
            ? true
            : (t.frequency || "none") === freqFilter;

        // active filter
        const okA =
          activeFilter === "all"
            ? true
            : activeFilter === "active"
            ? !!t.active
            : !t.active;

        return okQ && okF && okA;
      })
      .map((t) => t);
  }, [tasks, q, freqFilter, activeFilter]);

  const TabButton = ({ id, children, disabled }) => {
    const isActive = activeTab === id;
    const base = "px-4 py-2 rounded-xl text-sm font-medium transition border";
    const onClass = "bg-blue-600 text-white border-blue-600";
    const offClass = "bg-white text-gray-700 border-gray-200 hover:bg-gray-50";
    const disabledClass =
      "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed";
    return (
      <button
        type="button"
        onClick={() => !disabled && setActiveTab(id)}
        className={`${base} ${
          disabled ? disabledClass : isActive ? onClass : offClass
        }`}
        aria-pressed={isActive}
        aria-disabled={disabled}
      >
        {children}
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200">
        <div className="mx-auto max-w-7xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-blue-600 text-white grid place-items-center font-bold">
              BP
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                Byford Pharmacy — Admin
              </h1>
              <p className="text-xs text-gray-500">
                Tasks, points & notes management
              </p>
            </div>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            ← Back to Chalkboard
          </Link>
        </div>
      </header>

      {/* Main container */}
      <main className="mx-auto max-w-7xl p-4 sm:p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 sm:p-6">
          {/* Tabs */}
          <div className="flex flex-wrap gap-2">
            <TabButton id="tasks">Tasks</TabButton>
            <TabButton id="points" disabled>
              Points / Leaderboard
            </TabButton>
            <TabButton id="notes" disabled>
              Notes
            </TabButton>
            <TabButton id="export" disabled>
              Export / Import
            </TabButton>
          </div>

          {/* Tab content */}
          <div className="mt-6">
            {activeTab === "tasks" && (
              <section>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-800">
                      Tasks
                    </h2>
                    <p className="text-sm text-gray-500">
                      Read-only list for now. Next milestone adds create/edit.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Search tasks…"
                      className="w-[220px] rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <select
                      className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800"
                      value={freqFilter}
                      onChange={(e) => setFreqFilter(e.target.value)}
                      title="Filter by frequency"
                    >
                      <option value="all">All frequencies</option>
                      <option value="daily">Daily</option>
                      <option value="few_days_per_week">Few days / week</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="specific_date">Specific date</option>
                    </select>
                    <select
                      className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800"
                      value={activeFilter}
                      onChange={(e) => setActiveFilter(e.target.value)}
                      title="Filter by status"
                    >
                      <option value="all">All statuses</option>
                      <option value="active">Active only</option>
                      <option value="inactive">Inactive only</option>
                    </select>
                  </div>
                </div>

                {/* Status / errors */}
                <div className="mt-4">
                  {loading && (
                    <div className="rounded-xl border border-gray-200 p-4 text-sm text-gray-600">
                      Loading tasks…
                    </div>
                  )}
                  {!loading && err && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                      {err}
                    </div>
                  )}
                </div>

                {/* Table */}
                {!loading && !err && (
                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-600">
                          <th className="w-10 p-2">#</th>
                          <th className="p-2">Title</th>
                          <th className="p-2">Frequency</th>
                          <th className="p-2">Days / Date</th>
                          <th className="p-2">Due</th>
                          <th className="p-2">Points</th>
                          <th className="p-2">Active</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.length === 0 && (
                          <tr>
                            <td colSpan={7} className="p-6 text-center text-gray-500">
                              No tasks found.
                            </td>
                          </tr>
                        )}
                        {filtered.map((t, i) => (
                          <tr
                            key={t.id || `row-${i}`}
                            className="border-t border-gray-100 hover:bg-gray-50"
                          >
                            <td className="p-2 align-top text-gray-400">
                              {(t.sort_index ?? 1000) === 1000 ? i + 1 : t.sort_index}
                            </td>
                            <td className="p-2 align-top">
                              <div className="font-medium text-gray-900">{t.title || "Untitled"}</div>
                            </td>
                            <td className="p-2 align-top">
                              <Chip tone="blue">{freqPretty(t)}</Chip>
                            </td>
                            <td className="p-2 align-top text-gray-700">{freqDetail(t)}</td>
                            <td className="p-2 align-top text-gray-700">{timePretty(t.due_time)}</td>
                            <td className="p-2 align-top">
                              <Chip tone="amber">{Number.isFinite(t.points) ? t.points : 1}</Chip>
                            </td>
                            <td className="p-2 align-top">
                              {t.active ? (
                                <Chip tone="green">Active</Chip>
                              ) : (
                                <Chip tone="gray">Inactive</Chip>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}

                {/* Legend */}
                <div className="mt-6 inline-flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  <span>Legend:</span>
                  <Chip tone="blue">Frequency</Chip>
                  <Chip tone="amber">Points</Chip>
                  <Chip tone="green">Active</Chip>
                  <Chip tone="gray">Inactive</Chip>
                </div>
              </section>
            )}

            {activeTab !== "tasks" && (
              <section className="rounded-2xl border border-dashed border-gray-200 p-8 text-center">
                <h3 className="text-base font-semibold text-gray-800">
                  Coming Soon
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  This tab will be enabled in a later milestone.
                </p>
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
