import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { recordCompletion } from "../lib/recordCompletion"; // JS helper you just made

// --- Supabase browser client ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function HomePage() {
  const [tasks, setTasks] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);

  // Selection + UX
  const [selectedStaffId, setSelectedStaffId] = useState(null);
  const [completedTaskIds, setCompletedTaskIds] = useState(new Set()); // show ticks this session
  const [feed, setFeed] = useState([]); // [{id, taskTitle, staffName, timeStr}]
  const [showConfetti, setShowConfetti] = useState(false);

  // Load tasks + staff on mount
  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const [{ data: t, error: te }, { data: s, error: se }] = await Promise.all([
        supabase
          .from("tasks")
          .select("id,title,period,due_time,active")
          .order("period", { ascending: true })
          .order("due_time", { ascending: true })
          .order("title", { ascending: true }),
        supabase
          .from("staff")
          .select("id,name,photo_url,active")
          .order("name", { ascending: true }),
      ]);

      if (te) console.error("Tasks load error:", te.message);
      if (se) console.error("Staff load error:", se.message);

      setTasks((t ?? []).filter((x) => x.active !== false));
      setStaff((s ?? []).filter((x) => x.active !== false));
      setLoading(false);
    };

    load();
  }, []);

  const selectedStaff = staff.find((s) => s.id === selectedStaffId) || null;
  const selectedStaffName = selectedStaff ? selectedStaff.name : null;

  const progress = useMemo(() => {
    const total = tasks.length;
    const done = completedTaskIds.size;
    const pct = total ? Math.round((done / total) * 100) : 0;
    return { done, total, pct };
  }, [tasks, completedTaskIds]);

  // Tiny confetti burst
  const burstConfetti = () => {
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 900);
  };

  // Tap a task (after selecting a staff member)
  const handleTaskTap = async (task) => {
    try {
      if (!selectedStaffId) {
        alert("Tap your photo first (right side), then tap the task.");
        return;
      }

      await recordCompletion(supabase, Number(task.id), Number(selectedStaffId));

      // Visual tick for this session
      setCompletedTaskIds((prev) => {
        const next = new Set(prev);
        next.add(task.id);
        return next;
      });

      // Add to Activity feed (keep last 25)
      const timeStr = new Date().toLocaleTimeString("en-AU", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const entry = {
        id: (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : String(Math.random()),
        taskTitle: task.title,
        staffName: selectedStaffName ?? "Someone",
        timeStr,
      };
      setFeed((f) => [entry, ...f].slice(0, 25));

      burstConfetti();
    } catch (err) {
  if (err?.message?.includes("completions_one_per_day")) {
    alert("Already recorded today.");
  } else {
    alert("Error: " + (err?.message ?? String(err)));
  }
}

  };

  return (
    <main className="p-4 md:p-6 max-w-7xl mx-auto relative overflow-hidden">
      {/* Confetti overlay */}
      {showConfetti && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="text-5xl md:text-6xl">🎉</div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Byford Pharmacy Chalkboard</h1>
        <div className="text-sm">
          <span className="px-2 py-1 rounded border">
            Progress: {progress.done}/{progress.total} ({progress.pct}%)
          </span>
        </div>
      </div>

      {loading ? (
        <div className="p-6 border rounded-xl">Loading…</div>
      ) : (
        <div className="grid grid-cols-12 gap-4">
          {/* LEFT: Task list */}
          <div className="col-span-12 md:col-span-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-semibold">Today’s Tasks</h2>
              <div className="text-sm">
                {selectedStaffId ? (
                  <span className="px-2 py-1 rounded bg-green-100 border">
                    Selected: {selectedStaffName}
                  </span>
                ) : (
                  <span className="px-2 py-1 rounded bg-yellow-100 border">
                    Tap your photo →
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-3">
              {tasks.map((task) => {
                const isDone = completedTaskIds.has(task.id);
                return (
                  <button
                    key={task.id}
                    className={`w-full text-left p-3 rounded-xl border hover:shadow-sm active:scale-[0.99] ${
                      isDone ? "bg-green-50 border-green-300" : ""
                    }`}
                    onClick={() => handleTaskTap(task)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-sm ${
                            isDone ? "bg-green-500 text-white border-green-500" : ""
                          }`}
                          title={isDone ? "Completed" : "Tap to complete"}
                        >
                          {isDone ? "✓" : "•"}
                        </span>
                        <div>
                          <div className="font-medium">{task.title}</div>
                          {task.due_time ? (
                            <div className="text-xs text-gray-500">Due: {task.due_time}</div>
                          ) : null}
                        </div>
                      </div>
                      <div className="text-xs text-gray-500">{task.period ?? ""}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* RIGHT: Staff panel + Activity feed */}
          <div className="col-span-12 md:col-span-4 space-y-4">
            <div>
              <h2 className="text-xl font-semibold mb-3">Who’s doing it?</h2>

              <div className="grid grid-cols-3 gap-3">
                {staff.map((s) => {
                  const isSelected = s.id === selectedStaffId;
                  return (
                    <button
                      key={s.id}
                      className={`flex flex-col items-center p-2 rounded-2xl border hover:bg-gray-50 ${
                        isSelected ? "ring-2 ring-green-500" : ""
                      }`}
                      onClick={() => setSelectedStaffId(s.id)}
                    >
                      <img
                        src={s.photo_url || "/placeholder.png"}
                        alt={s.name}
                        width={64}
                        height={64}
                        loading="lazy"
                        decoding="async"
                        className="w-16 h-16 rounded-full object-cover"
                      />
                      <span className="text-xs mt-1 text-center">{s.name}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 text-xs text-gray-500">
                Tip: Tap your photo once, then tap each task you complete.
              </div>
            </div>

            {/* Activity feed */}
            <div className="border rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium">Activity</h3>
                <span className="text-xs text-gray-500">{feed.length} recent</span>
              </div>
              <div className="space-y-2 max-h-64 overflow-auto">
                {feed.length === 0 ? (
                  <div className="text-xs text-gray-500">No activity yet.</div>
                ) : (
                  feed.map((e) => (
                    <div key={e.id} className="text-sm">
                      <span className="font-medium">{e.staffName}</span>{" "}
                      completed <span className="font-medium">“{e.taskTitle}”</span>{" "}
                      at <span className="text-gray-600">{e.timeStr}</span>.
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
