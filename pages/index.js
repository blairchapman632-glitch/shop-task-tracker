// pages/index.js — Today view (date header + compact, time-ordered tasks)
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

export default function HomePage() {
  const [{ label: todayLabel, ymd: todayYMD, dow }, setToday] = useState(formatTodayPerth());
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    const t = setInterval(() => setToday(formatTodayPerth()), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("tasks")
        .select("id,title,recurrence,days_of_week,due_time,due_date,points,active")
        .eq("active", true);

      if (cancelled) return;
      if (error) {
        setError(error.message);
        setLoading(false);
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
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [todayYMD, dow]);

  return (
    <main className="min-h-screen w-full bg-white text-slate-900">
      {/* Top bar */}
      <div className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Byford Pharmacy Chalkboard</h1>
          <div className="text-sm text-slate-600">{todayLabel}</div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-5xl px-4 py-4 grid grid-cols-1 gap-4">
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Today’s Tasks</h2>
            <span className="text-xs text-slate-500">Ordered by time • Perth</span>
          </div>

          {loading && <div className="text-slate-500 text-sm">Loading tasks…</div>}
          {error && <div className="text-red-600 text-sm">Error: {error}</div>}
          {!loading && !error && tasks.length === 0 && (
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
      </div>
    </main>
  );
}

// Prevents Vercel from trying to prerender this at build time
export async function getServerSideProps() {
  return { props: {} };
}
