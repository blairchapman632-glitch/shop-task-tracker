import React, { useEffect, useMemo, useState } from "react";
import { recordCompletion } from "../lib/recordCompletion.js";

import supabase from "../lib/supabaseClient";


export default function HomePage() {
  const [tasks, setTasks] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);

  // Selection + UX
  const [selectedStaffId, setSelectedStaffId] = useState(null);
  const [completedTaskIds, setCompletedTaskIds] = useState(new Set()); // ticks persisted (loaded from DB)
  const [feed, setFeed] = useState([]); // [{id, taskTitle, staffName, timeStr}]
  const [showConfetti, setShowConfetti] = useState(false);

  // Helper: get local (Perth) start/end of "today" to query completions
  const getTodayBoundsISO = () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return { startISO: start.toISOString(), endISO: end.toISOString() };
    // This uses the device's local time (you run the kiosk in Perth).
  };

  // Load tasks + staff + today's completions on mount
  useEffect(() => {
  const load = async () => {
    setLoading(true);

    // 1) Load tasks + staff
    const [{ data: t, error: te }, { data: s, error: se }] = await Promise.all([
      supabase
        .from("tasks")
        .select("id,title,active,period,due_time")
        .order("title", { ascending: true }),
      supabase
        .from("staff")
        .select("id,name,photo_url,active")
        .order("name", { ascending: true }),
    ]);

    if (te) console.error("Tasks load error:", te.message);
    if (se) console.error("Staff load error:", se.message);

    const activeTasks = (t ?? []).filter((x) => x.active !== false);
    const activeStaff = (s ?? []).filter((x) => x.active !== false);

    setTasks(activeTasks);
    setStaff(activeStaff);

    // 2) Load *today's* completions so ticks + Activity persist on refresh
    const { startISO, endISO } = getTodayBoundsISO();
    const { data: comps, error: ce } = await supabase
      .from("completions")
      .select("task_id, staff_id, completed_at")
      .gte("completed_at", startISO)
      .lt("completed_at", endISO)
      .order("completed_at", { ascending: false });

    if (ce) {
      console.error("Completions load error:", ce.message);
    } else {
      // Ticks
      const doneIds = new Set((comps ?? []).map((c) => c.task_id));
      setCompletedTaskIds(doneIds);

      // Activity (today only)
      const tasksById = Object.fromEntries(activeTasks.map((t) => [t.id, t.title]));
      const staffById = Object.fromEntries(activeStaff.map((st) => [st.id, st.name]));

      const feedItems = (comps ?? []).map((c) => ({
        id: `c_${c.task_id}_${c.staff_id}_${c.completed_at}`,
        taskTitle: tasksById[c.task_id] ?? `Task #${c.task_id}`,
        staffName: staffById[c.staff_id] ?? "Someone",
        timeStr: new Date(c.completed_at).toLocaleTimeString("en-AU", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      }));

      setFeed(feedItems);
    }

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

      // Visual tick immediately
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
        id:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : String(Math.random()),
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
        console.error(err);
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

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">

  {tasks.map((task) => {
    const isDone = completedTaskIds.has(task.id);
    return (
      <button
        key={task.id}
       className={`p-5 rounded-xl border text-left hover:shadow-md active:scale-[0.99] leading-relaxed ${

          isDone ? "bg-green-50 border-green-300" : "bg-white"
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
