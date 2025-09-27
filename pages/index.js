// pages/index.js — Today (tasks) + Staff grid (photos only, no actions yet)
// Uses named export { supabase } from ../lib/supabaseClient

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

const TZ = "Australia/Perth";

function getPerthNow() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
}

function formatTodayPerth() {
  const perthNow = getPerthNow();
  const label = perthNow.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const ymd = perthNow.toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD
  const dow = perthNow.getDay(); // 0=Sun..6=Sat
  return { label, ymd, dow };
}

function initials(name) {
  if (!name) return "";
  const parts = String(name).trim().split(/\s+/);
  const first = parts[0]?.[0] || "";
  const second = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + second).toUpperCase();
}

export default function HomePage() {
  const [{ label: todayLabel, ymd: todayYMD, dow }, setToday] = useState(formatTodayPerth());

  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [tasksError, setTasksError] = useState(null);

  const [staffLoading, setStaffLoading] = useState(true);
  const [staff, setStaff] = useState([]);
  const [staffError, setStaffError] = useState(null);

  // Keep the date header fresh if the iPad stays open
  useEffect(() => {
    const t = setInterval(() => setToday(formatTodayPerth()), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // Load tasks for "today"
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setTasksLoading(true);
      setTasksError(null);

      const { data, error } = await supabase
        .from("tasks")
        .select("id,title,recurrence,days_of_week,due_time,due_date,points,active")
        .eq("active", true);

      if (cancelled) return;

      if (error) {
        setTasksError(error.message);
        setTasksLoading(false);
        return;
      }

      const filtered = (data || []).filter((t) => {
        if (!t?.active) return false;
        if (t.recurrence === "daily") return true;
        if (t.recurrence === "weekly") {
          if (!Array.isArray(t.days_of_week)) return false;
          return t.days_of_week.includes(dow);
        }
        if (t.recurrence === "dated") {
          return t.due_date === todayYMD;
        }
        return false;
      });

      filtered.sort((a, b) => String(a.due_time).localeCompare(String(b.due_time)));
      setTasks(filtered);
      setTasksLoading(false);
    })();

    return () => { cancelled = true; };
  }, [todayYMD, dow]);

  // Load active staff (with photos)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStaffLoading(true);
      setStaffError(null);

      const { data, error } = await supabase
        .from("staff")
        .select("id,name,photo_url,active")
        .eq("active", true)
        .order("name", { ascending: true });

      if (cancelled) return;

      if (error) {
        setStaffError(error.message);
        setStaffLoading(false);
        return;
      }

      setStaff(data || []);
      setStaffLoading(false);
    })();

    return () => { cancelled = true; };
  }, []);

  return (
    <main className="min-h-screen w-full bg-white text-slate-900">
      {/* Top bar */}
      <div className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Byford Pharmacy Chalkboard</h1>
          <div className="text-sm text-slate-600">{todayLabel}</div>
        </div>
      </div>

      {/* Content: two columns on iPad/desktop */}
      <div className="mx-auto max-w-6xl px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* LEFT: Today’s Tasks */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Today’s Tasks</h2>
            <span className="text-xs text-slate-500">Ordered by time • Perth</span>
          </div>

          {tasksLoading && <div className="text-slate-500 text-sm">Loading tasks…</div>}
          {tasksError && <div className="text-red-600 text-sm">Error: {tasksError}</div>}
          {!tasksLoading && !tasksError && tasks.length === 0 && (
            <div className="text-slate-500 text-sm">No tasks scheduled for today.</div>
          )}

          <ul className="divide-y rounded-xl border overflow-hidden">
            {tasks.map((t) => {
              const timeLabel = String(t.due_time || "").slice(0, 5);
              const isDated = t.recurrence === "dated";
              return (
                <li
                  key={t.id}
                  className={[
                    "flex items-center justify-between px-3 py-2",
                    isDated ? "bg-amber-50" : "bg-white",
                  ].join(" ")}
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{t.title}</div>
                    <div className="text-xs text-slate-500">
                      {isDated ? "Specific date" : t.recurrence === "weekly" ? "Weekly" : "Daily"}
                    </div>
                  </div>
                  <div className="shrink-0 rounded-md border px-2 py-1 text-sm tabular-nums">
                    {timeLabel}
                  </div>
                </li>
              );
            })}
          </ul>

          <p className="mt-3 text-xs text-slate-500">Dated tasks are highlighted to stand out.</p>
        </section>

        {/* RIGHT: Staff grid (photos) */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Staff</h2>
            <span className="text-xs text-slate-500">Tap later to assign tasks</span>
          </div>

          {staffLoading && <div className="text-slate-500 text-sm">Loading staff…</div>}
          {staffError && <div className="text-red-600 text-sm">Error: {staffError}</div>}
          {!staffLoading && !staffError && staff.length === 0 && (
            <div className="text-slate-500 text-sm">No active staff.</div>
          )}

          <div className="grid grid-cols-3 gap-3">
            {staff.map((s) => {
              const hasPhoto = !!s.photo_url;
              return (
                <div
                  key={s.id}
                  className="flex flex-col items-center justify-center rounded-2xl border p-3 text-center bg-white"
                >
                  <div className="relative h-20 w-20 rounded-full overflow-hidden border">
                    {hasPhoto ? (
                      <img
                        src={s.photo_url}
                        alt={s.name}
                        className="h-full w-full object-cover"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                    ) : null}
                    {!hasPhoto && (
                      <div className="flex h-full w-full items-center justify-center bg-slate-100">
                        <span className="text-lg font-medium text-slate-600">
                          {initials(s.name)}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="mt-2 w-full truncate text-sm font-medium">{s.name}</div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}

// Prevent Vercel from prerendering this at build time
export async function getServerSideProps() {
  return { props: {} };
}
