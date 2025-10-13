import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { recordCompletion } from "../lib/recordCompletion.js";
import supabase from "../lib/supabaseClient";

export default function HomePage() {
  const [tasks, setTasks] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);

  // Selection + UX
  const [selectedStaffId, setSelectedStaffId] = useState(null);
  const [completedTaskIds, setCompletedTaskIds] = useState(new Set());
  const [feed, setFeed] = useState([]);
  const [showConfetti, setShowConfetti] = useState(false);

  // Local “today” bounds (device time = Perth kiosk)
  // ——— 3.3b helper: decide if a task should show today ———
function isTaskForToday(task, now = new Date()) {
  const dow = now.getDay(); // 0=Sun … 6=Sat
  const todayISO = now.toISOString().slice(0, 10); // "YYYY-MM-DD"
  const freq = task.frequency || "daily";

  switch (freq) {
    case "daily":
      return true;

    case "weekly": {
      // New schema first: array of days; fallback to legacy weekly_day
      const arr = Array.isArray(task.days_of_week) ? task.days_of_week : null;
      if (arr && arr.length) return arr.includes(dow);
      return typeof task.weekly_day === "number" ? task.weekly_day === dow : false;
    }

    case "few_days_per_week": {
      // Back-compat alias of weekly using days_of_week
      const arr = Array.isArray(task.days_of_week) ? task.days_of_week : [];
      return arr.includes(dow);
    }

    case "monthly":
      return Number(task.day_of_month) === now.getDate();

    case "specific_date":
      return typeof task.specific_date === "string" && task.specific_date.slice(0, 10) === todayISO;

    default:
      return true;
  }
}

// ——— 3.3c helper: convert "HH:MM" or "HH:MM:SS" → minutes since midnight ———
function timeToMinutes(t) {
  if (!t) return Number.POSITIVE_INFINITY; // puts "no due time" last
  const parts = String(t).split(":");
  const hh = parseInt(parts[0] || "0", 10);
  const mm = parseInt(parts[1] || "0", 10);
  return (hh * 60) + mm;
}
function isOverdue(task, completedTaskIds, now = new Date()) {
  if (!task.due_time) return false;
  if (completedTaskIds.has(task.id)) return false;

  const minsNow = now.getHours() * 60 + now.getMinutes();
  return timeToMinutes(task.due_time) < minsNow;
}

  const getTodayBoundsISO = () => {
    const start = new Date(); start.setHours(0,0,0,0);
    const end = new Date();   end.setHours(23,59,59,999);
    return { startISO: start.toISOString(), endISO: end.toISOString() };
  };

  // Load tasks + staff + today's completions
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [{ data: t, error: te }, { data: s, error: se }] = await Promise.all([
        supabase
  .from("tasks")
  .select("id,title,active,points,due_time,frequency,days_of_week,weekly_day,day_of_month,specific_date,info")


   .order("due_time", { ascending: true, nullsFirst: false })
  .order("title", { ascending: true }),


        supabase.from("staff").select("id,name,photo_url,active").order("name", { ascending: true }),
      ]);
      if (te) console.error("Tasks load error:", te.message);
      if (se) console.error("Staff load error:", se.message);

      const activeTasks = (t ?? []).filter((x) => x.active !== false);

// NEW: keep only tasks relevant for today (based on frequency rules)
const todayTasks = activeTasks.filter((task) => isTaskForToday(task));

// K1 — Kiosk ordering: due_time ↑ (empty last), then title A→Z
todayTasks.sort((a, b) => {
  const tA = timeToMinutes(a.due_time); // Infinity if empty
  const tB = timeToMinutes(b.due_time);
  if (tA !== tB) return tA - tB;
  return (a.title || "").localeCompare(b.title || "");
});



setTasks(todayTasks);

const activeStaff = (s ?? []).filter((x) => x.active !== false);
setStaff(activeStaff);


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
        const doneIds = new Set((comps ?? []).map((c) => c.task_id));
        setCompletedTaskIds(doneIds);

        const tasksById = Object.fromEntries(activeTasks.map((t) => [t.id, t.title]));
        const staffById = Object.fromEntries(activeStaff.map((st) => [st.id, st.name]));
        const feedItems = (comps ?? []).map((c) => ({
          id: `c_${c.task_id}_${c.staff_id}_${c.completed_at}`,
          taskTitle: tasksById[c.task_id] ?? `Task #${c.task_id}`,
          staffName: staffById[c.staff_id] ?? "Someone",
          timeStr: new Date(c.completed_at).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" }),
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

  const burstConfetti = () => {
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 900);
  };

  const handleTaskTap = async (task) => {
    try {
      if (!selectedStaffId) {
        alert("Tap your photo first (right side), then tap the task.");
        return;
      }
      await recordCompletion(supabase, Number(task.id), Number(selectedStaffId));

      setCompletedTaskIds((prev) => {
        const next = new Set(prev);
        next.add(task.id);
        return next;
      });

      const timeStr = new Date().toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });
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
        console.error(err);
      }
    }
  };

  const formatTime = (t) => {
    if (!t) return null;
    const [hh, mm] = String(t).split(":");
    return `${hh}:${mm}`;
  };

  return (
    <main className="p-4 md:p-6 max-w-7xl mx-auto relative overflow-visible">

      {/* App card on grey backdrop */}
      <div className="card overflow-hidden">
        {/* Confetti overlay */}
        {showConfetti && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="text-5xl md:text-6xl">🎉</div>
          </div>
        )}

    {/* Header */}
        <div className="px-4 md:px-6 pt-4 md:pt-6 pb-3 border-b-2 border-blue-500">
  <div className="flex items-center justify-between">
  <h1 className="h1-tight">Byford Pharmacy Chalkboard</h1>
  <Link
    href="/admin"
    className="ml-4 inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
  >
    Admin
  </Link>
</div>

</div>



        {/* Content grid */}
        {loading ? (
          <div className="p-6">Loading…</div>
        ) : (
          <div className="grid grid-cols-12 gap-4 p-4 md:p-6">
            {/* LEFT: Tasks */}
            <section className="col-span-12 md:col-span-4 divider-r md:pr-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="section-title">Today’s Tasks</h2>
                <span className="progress-chip">
                  {progress.done}/{progress.total} ({progress.pct}%)
                </span>
              </div>
             {selectedStaffId ? (
  <div className="mb-2">
    <span className="text-xs md:text-sm bg-green-100 text-green-800 rounded-full px-2 py-0.5">
      Selected: {selectedStaffName}
    </span>
  </div>
) : (
  <div className="mb-2">
    <span className="text-xs md:text-sm bg-blue-50 text-blue-800 rounded-md px-2 py-1 border border-blue-200">
      Tip: Tap your photo on the right, then tap a task here.
    </span>
  </div>
)}


              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[calc(100vh-220px)] overflow-y-auto overscroll-contain pr-1 nice-scroll">

                {tasks.map((task) => {
                  const isDone = completedTaskIds.has(task.id);
                  return (
                    <button
  key={task.id}
  className={`p-2 rounded-lg border text-left active:scale-[0.99] leading-snug h-16 flex flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
    isDone ? "bg-green-50 border-green-300" : "bg-white"
  } ${selectedStaffId ? "hover:ring-2 hover:ring-blue-300 hover:border-blue-300" : "opacity-100"}`}
  onClick={() => handleTaskTap(task)}
>

                      <div className="flex flex-col flex-1">
                        <div className="flex items-start gap-3">
                          <div
  className="font-medium text-[13px] leading-tight break-words overflow-hidden"
  style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}
>
  {task.title}
</div>

                        </div>

                                  <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
  {/* Left side: due or overdue */}
  {task.due_time ? (
    isOverdue(task, completedTaskIds) ? (
      <span className="inline-flex px-1.5 py-0.5 rounded-md bg-red-100 text-red-600 border border-red-300">
        Overdue
      </span>
    ) : (
      <span>Due: {formatTime(task.due_time)}</span>
    )
  ) : (
    <span>&nbsp;</span>
  )}

  {/* Right side: info button + completed checkmark */}
  <span className="inline-flex items-center gap-2">
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        const msg = (task.info && String(task.info).trim().length)
          ? String(task.info)
          : "No notes for this task.";
        alert(msg);
      }}
      className="h-5 w-5 inline-flex items-center justify-center rounded-full border border-gray-300 bg-white hover:bg-gray-50"
      title="Task info"
    >
      i
    </button>

    {isDone && (
      <span
        className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-white text-[10px]"
        title="Completed"
      >
        ✓
      </span>
    )}
  </span>
</div>


                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* RIGHT: Staff + Activity */}
           <section className="col-span-12 md:col-span-8 grid grid-cols-2 gap-4 overflow-visible min-h-[calc(100vh-220px)]">



              {/* Staff list */}
              <div className="divider-r md:pr-4">
                <h2 className="section-title mb-3">Pharmily</h2>
                <div className="grid grid-cols-2 gap-2 max-h-[calc(100vh-220px)] overflow-y-auto overscroll-contain pr-1 nice-scroll">

                  {staff.map((s) => {
                    const isSelected = s.id === selectedStaffId;
                    return (
                      <button
                        key={s.id}
                        className={`flex flex-col items-center p-1.5 rounded-xl border hover:bg-gray-50 ${
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
                          className="w-14 h-14 rounded-full object-cover"
                        />
                        <span className="text-[11px] mt-1 text-center">{s.name}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 text-[11px] text-gray-500">
                  Tip: Tap your photo once, then tap each task you complete.
                </div>
              </div>

              {/* Right stack: Activity / Leaderboard / Notes */}
             <div className="grid grid-rows-[auto_auto_1fr] min-h-0 max-h-[calc(100vh-220px)] pr-1 gap-4">





  {/* Leaderboard (no scroll needed) */}
  <div className="border rounded-xl p-3 bg-white">
    <div className="flex items-center justify-between mb-2">
      <h3 className="font-medium">Leaderboard (This Month)</h3>
      <span className="text-xs text-gray-500">Top 3</span>
    </div>
    <ol className="text-sm space-y-1">
      <li>1. —</li>
      <li>2. —</li>
      <li>3. —</li>
    </ol>
  </div>

    {/* Notes (capped height, scroll if long) */}
  <div className="border rounded-xl p-3 bg-white min-h-[144px] max-h-[240px] overflow-y-auto nice-scroll">




    <div className="flex items-center justify-between mb-2">
      <h3 className="font-medium">Notes</h3>
      <span className="text-xs text-gray-500">Today</span>
    </div>
    <div className="text-sm text-gray-600">
      <div>- </div>
      <div>- </div>
    </div>
  </div>

  {/* Activity (fills rest of column, scrolls) */}
  <div className="border rounded-xl p-3 bg-white h-[120px] overflow-y-auto nice-scroll">






    <div className="flex items-center justify-between mb-2">
      <h3 className="font-medium">Activity</h3>
      <span className="text-xs text-gray-500">{feed.length} recent</span>
    </div>
    <div className="space-y-2">
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

            </section>
          </div>
        )}
      </div>
    </main>
  );
}
