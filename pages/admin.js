// pages/admin.js
import React, { useState } from "react";
import Link from "next/link";

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState("tasks");

  const TabButton = ({ id, children, disabled }) => {
    const isActive = activeTab === id;
    const base =
      "px-4 py-2 rounded-xl text-sm font-medium transition border";
    const onClass = "bg-blue-600 text-white border-blue-600";
    const offClass =
      "bg-white text-gray-700 border-gray-200 hover:bg-gray-50";
    const disabledClass =
      "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed";
    return (
      <button
        type="button"
        onClick={() => !disabled && setActiveTab(id)}
        className={`${base} ${disabled ? disabledClass : isActive ? onClass : offClass}`}
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
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-800">
                      Tasks
                    </h2>
                    <p className="text-sm text-gray-500">
                      Create, edit, deactivate tasks and set frequency, due time,
                      and points.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-xl bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700"
                      disabled
                      title="Coming soon in Milestone 2"
                    >
                      + New Task
                    </button>
                    <button
                      type="button"
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      disabled
                      title="Coming soon in Milestone 2"
                    >
                      Bulk Actions
                    </button>
                  </div>
                </div>

                {/* Empty state placeholder */}
                <div className="mt-6 rounded-2xl border border-dashed border-gray-200 p-8 text-center">
                  <div className="mx-auto mb-3 h-10 w-10 rounded-full bg-gray-100 grid place-items-center">
                    <span className="text-gray-500">🗂️</span>
                  </div>
                  <h3 className="text-base font-semibold text-gray-800">
                    Tasks Admin Shell Ready
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    This is the shell for managing tasks. In{" "}
                    <strong>Milestone 2</strong> we’ll wire up the live list,
                    add/edit drawer, and saving.
                  </p>

                  <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gray-100 px-3 py-1.5 text-xs text-gray-700">
                    <span>Frequencies planned:</span>
                    <code className="rounded bg-white px-1.5 py-0.5 border border-gray-200">
                      daily
                    </code>
                    <code className="rounded bg-white px-1.5 py-0.5 border border-gray-200">
                      few_days_per_week
                    </code>
                    <code className="rounded bg-white px-1.5 py-0.5 border border-gray-200">
                      weekly
                    </code>
                    <code className="rounded bg-white px-1.5 py-0.5 border border-gray-200">
                      monthly
                    </code>
                    <code className="rounded bg-white px-1.5 py-0.5 border border-gray-200">
                      specific_date
                    </code>
                  </div>
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
