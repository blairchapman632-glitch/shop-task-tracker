import React, { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
// Import the helper you created earlier
import { recordCompletion } from "../lib/recordCompletion";

// --- Supabase browser client ---
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function HomePage() {
  const [tasks, setTasks] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStaffId, setSelectedStaffId] = useState(null);

  // Load tasks + staff
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

  const selectedStaff = staff.find((s) => s.id === selectedStaffId);
  const selectedStaffName = selectedStaff ? selectedStaff.name : null;

  return (
    <main className="p-4 md:p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Byford Pharmacy Chalkboard</h1>

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
              {tasks.map((task) => (
                <button
                  key={task.id}
                  className="w-full text-left p-3 rounded-xl border hover:shadow-sm active:scale-[0.99]"
                  onClick={async () => {
                    try {
                      if (!selectedStaffId) {
                        alert("Tap your photo first (right side), then tap the task.");
                        return;
                      }
                      await recordCompletion({
                        supabase,
                        taskId: task.id, // bigint in DB → number here
                        staffId: selectedStaffId, // bigint in DB → number here
                      });
                      alert(`${selectedStaffName ?? "Someone"} completed “${task.title}”.`);
                      // Next steps (later):
                      // - show a tick on the task
                      // - update activity feed
                      // - confetti
                    } catch (err) {
                      alert("Error: " + (err?.message ?? String(err)));
                    }
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border text-sm">
                        ✓
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
              ))}
            </div>
          </div>

          {/* RIGHT: Staff panel */}
          <div className="col-span-12 md:col-span-4">
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
        </div>
      )}
    </main>
  );
}
