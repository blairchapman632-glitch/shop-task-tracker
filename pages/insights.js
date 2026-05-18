import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import supabase from "../lib/supabaseClient";

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function Sidebar() {
  return (
    <aside className="w-[200px] min-w-[200px] h-screen bg-white border-r flex flex-col py-4 px-3 gap-1 shrink-0">
      <div className="text-sm font-bold text-gray-800 px-2 mb-3">Byford Pharmacy</div>
      <NavLink href="/" icon="🏠" label="Home" />
      <NavLink href="/roster" icon="📅" label="Roster" />
      <NavLink href="/insights" icon="📊" label="Insights" active />
      <NavLink href="/tasks" icon="✅" label="Tasks" />
      <NavLink href="#" icon="💰" label="Wages" disabled />
      <NavLink href="#" icon="🏖️" label="Leave" disabled />
      <NavLink href="#" icon="⚙️" label="Admin" disabled />
    </aside>
  );
}

function NavLink({ href, icon, label, disabled, active }) {
  if (disabled) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-gray-400 cursor-not-allowed">
        <span>{icon}</span> {label}
        <span className="ml-auto text-[9px] text-gray-300">Soon</span>
      </div>
    );
  }
  return (
    <Link href={href} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm ${active ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700 hover:bg-gray-100"}`}>
      <span>{icon}</span> {label}
    </Link>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const pct = (done, total) => total ? Math.round((done / total) * 100) : 0;

const PctBar = ({ value, color = "bg-blue-500" }) => (
  <div className="flex items-center gap-2">
    <div className="flex-1 bg-gray-100 rounded-full h-1.5">
      <div className={`${color} h-1.5 rounded-full`} style={{ width: `${value}%` }} />
    </div>
    <span className="text-xs text-gray-600 w-8 text-right">{value}%</span>
  </div>
);

const SectionHeader = ({ title, subtitle }) => (
  <div className="mb-3">
    <h2 className="text-base font-semibold text-gray-800">{title}</h2>
    {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
  </div>
);

const Card = ({ label, value, sub, color = "text-gray-800" }) => (
  <div className="bg-white rounded-xl border p-4">
    <div className="text-xs text-gray-500 mb-1">{label}</div>
    <div className={`text-2xl font-bold ${color}`}>{value}</div>
    {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

export default function InsightsPage() {
  const router = useRouter();

  // ── Auth ──
  const [authChecked, setAuthChecked] = useState(false);
  const [currentPharmacyId, setCurrentPharmacyId] = useState(null);

  // ── Data ──
  const [staff, setStaff] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [completions, setCompletions] = useState([]);
  const [rosterShifts, setRosterShifts] = useState([]);
  const [sections, setSections] = useState([]);
  const [sectionSchedule, setSectionSchedule] = useState([]);
  const [notes, setNotes] = useState([]);
  const [noteReplies, setNoteReplies] = useState([]);
  const [noteReactions, setNoteReactions] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── Filters ──
  const [period, setPeriod] = useState("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [filterStaffId, setFilterStaffId] = useState("all");

  // ── UI ──
  const [activeSection, setActiveSection] = useState("staff");

  // ── Auth check ──
  useEffect(() => {
    let mounted = true;
    async function checkAuth() {
      const { data, error } = await supabase.auth.getUser();
      if (!mounted) return;
      if (error || !data?.user) { router.replace("/login"); return; }
      const { data: profile } = await supabase.from("profiles").select("pharmacy_id").eq("id", data.user.id).single();
      if (!mounted) return;
      if (!profile?.pharmacy_id) return;
      setCurrentPharmacyId(profile.pharmacy_id);
      setAuthChecked(true);
    }
    checkAuth();
    return () => { mounted = false; };
  }, [router]);

  // ── Date range ──
  const dateRange = useMemo(() => {
    const now = new Date();
    let start, end;
    if (period === "week") {
      const day = now.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      start = new Date(now); start.setDate(now.getDate() + diff); start.setHours(0, 0, 0, 0);
      end = new Date();
    } else if (period === "month") {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date();
    } else if (period === "lastmonth") {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === "custom" && customStart && customEnd) {
      start = new Date(customStart);
      end = new Date(customEnd);
      end.setHours(23, 59, 59, 999);
    } else {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date();
    }
    return { start, end };
  }, [period, customStart, customEnd]);

  // ── Load data ──
  useEffect(() => {
    if (!authChecked || !currentPharmacyId) return;
    const load = async () => {
      setLoading(true);
      const { start, end } = dateRange;

      const [
        { data: staffData },
        { data: taskData },
        { data: completionData },
        { data: shiftData },
        { data: sectionData },
        { data: scheduleData },
        { data: noteData },
        { data: replyData },
        { data: reactionData },
      ] = await Promise.all([
        supabase.from("staff").select("id, name, active").eq("pharmacy_id", currentPharmacyId).order("name"),
        supabase.from("tasks").select("id, title, frequency, points, assigned_staff_id, active").eq("pharmacy_id", currentPharmacyId),
        supabase.from("completions").select("id, task_id, section_clean_id, staff_id, completed_at").eq("pharmacy_id", currentPharmacyId).gte("completed_at", start.toISOString()).lte("completed_at", end.toISOString()),
        supabase.from("roster_shifts").select("id, shift_date, staff_id").eq("pharmacy_id", currentPharmacyId).gte("shift_date", start.toISOString().slice(0, 10)).lte("shift_date", end.toISOString().slice(0, 10)),
        supabase.from("sections").select("id, name, assigned_staff_id").eq("pharmacy_id", currentPharmacyId),
        supabase.from("section_clean_schedule").select("id, month, completed_at, completed_by_staff_id, section_id").eq("pharmacy_id", currentPharmacyId),
        supabase.from("kiosk_notes").select("id, staff_id, created_at").eq("pharmacy_id", currentPharmacyId).or("deleted.is.null,deleted.eq.false"),
        supabase.from("kiosk_note_replies").select("id, note_id, staff_id, created_at").eq("pharmacy_id", currentPharmacyId),
        supabase.from("kiosk_note_reactions").select("note_id, staff_id, reaction").eq("pharmacy_id", currentPharmacyId),
      ]);

      setStaff(staffData || []);
      setTasks(taskData || []);
      setCompletions(completionData || []);
      setRosterShifts(shiftData || []);
      setSections(sectionData || []);
      setSectionSchedule(scheduleData || []);
      setNotes(noteData || []);
      setNoteReplies(replyData || []);
      setNoteReactions(reactionData || []);
      setLoading(false);
    };
    load();
  }, [authChecked, currentPharmacyId, dateRange]);

  if (!authChecked || !currentPharmacyId) return <div className="p-6 text-sm text-gray-500">Loading...</div>;

  // ── Derived data ──
  const staffById = Object.fromEntries(staff.map((s) => [s.id, s]));
  const tasksById = Object.fromEntries(tasks.map((t) => [t.id, t]));
  const sectionsById = Object.fromEntries(sections.map((s) => [s.id, s]));

  const filteredCompletions = filterStaffId === "all"
    ? completions
    : completions.filter((c) => c.staff_id === Number(filterStaffId));

  const taskCompletions = filteredCompletions.filter((c) => c.task_id);
  const sectionCompletions = filteredCompletions.filter((c) => c.section_clean_id);

  // Summary stats
  const totalCompletions = filteredCompletions.length;
  const topPerformer = (() => {
    const map = new Map();
    for (const c of taskCompletions) {
      const pts = tasksById[c.task_id]?.points ?? 1;
      map.set(c.staff_id, (map.get(c.staff_id) || 0) + pts);
    }
    let best = null, bestPts = 0;
    for (const [id, pts] of map.entries()) {
      if (pts > bestPts) { best = id; bestPts = pts; }
    }
    return best ? { name: staffById[best]?.name, pts: bestPts } : null;
  })();

  const mostMissedTask = (() => {
    const eligibleTasks = tasks.filter((t) => (t.frequency === "daily" || t.frequency === "weekly") && t.active !== false);
    const { start, end } = dateRange;
    const days = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)));
    let worst = null, worstRate = 100;
    for (const t of eligibleTasks) {
      const expected = t.frequency === "daily" ? days : Math.floor(days / 7) * (Array.isArray(t.days_of_week) ? t.days_of_week.length : 1);
      if (expected === 0) continue;
      const done = taskCompletions.filter((c) => c.task_id === t.id).length;
      const rate = pct(done, expected);
      if (rate < worstRate) { worstRate = rate; worst = t; }
    }
    return (worst && worstRate < 100) ? { title: worst.title, rate: worstRate } : null;
  })();

  const scheduleById = Object.fromEntries(sectionSchedule.map((s) => [s.id, s]));

  // ── Staff performance ──
  const staffPerformance = staff.map((s) => {
    const myComps = taskCompletions.filter((c) => c.staff_id === s.id);
    const taskPoints = myComps.reduce((sum, c) => sum + (tasksById[c.task_id]?.points ?? 1), 0);
    const mySectionComps = sectionCompletions.filter((c) => c.staff_id === s.id);
    const sectionPoints = mySectionComps.reduce((sum, c) => {
      const sc = scheduleById[c.section_clean_id];
      const sec = sc ? sectionsById[sc.section_id] : null;
      return sum + (sec ? (Number.isFinite(sec.points) ? sec.points : 3) : 3);
    }, 0);
    const points = taskPoints + sectionPoints;
    const assignedTasks = tasks.filter((t) => t.assigned_staff_id === s.id && t.active !== false);
    const myShifts = rosterShifts.filter((sh) => sh.staff_id === s.id);
    let assignedMissed = 0;
    for (const t of assignedTasks) {
      for (const sh of myShifts) {
        const done = taskCompletions.some((c) => c.task_id === t.id && c.staff_id === s.id && c.completed_at.slice(0, 10) === sh.shift_date);
        if (!done) assignedMissed++;
      }
    }
    const sectionsDone = sectionCompletions.filter((c) => c.staff_id === s.id).length;
    return { ...s, points, completions: myComps.length, assignedMissed, sectionsDone };
  }).filter((s) => s.active !== false).sort((a, b) => b.points - a.points);

  // ── Task health ──
  const taskHealth = tasks.filter((t) => (t.frequency === "daily" || t.frequency === "weekly") && t.active !== false).map((t) => {
    const { start, end } = dateRange;
    const days = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)));
    const expected = t.frequency === "daily" ? days : Math.floor(days / 7);
    const done = taskCompletions.filter((c) => c.task_id === t.id).length;
    const missed = Math.max(0, expected - done);
    const rate = pct(done, expected);
    return { ...t, done, missed, expected, rate };
  }).sort((a, b) => a.rate - b.rate);

  // ── Assigned task compliance ──
  const assignedCompliance = (() => {
    const rows = [];
    const assignedTasks = tasks.filter((t) => t.assigned_staff_id && t.active !== false);
    for (const t of assignedTasks) {
      const s = staffById[t.assigned_staff_id];
      if (!s) continue;
      const myShifts = rosterShifts.filter((sh) => sh.staff_id === t.assigned_staff_id);
      let done = 0, missed = 0;
      for (const sh of myShifts) {
        const completed = taskCompletions.some((c) => c.task_id === t.id && c.staff_id === t.assigned_staff_id && c.completed_at.slice(0, 10) === sh.shift_date);
        if (completed) done++; else missed++;
      }
      const total = done + missed;
      const rate = pct(done, total);
      rows.push({ task: t, staff: s, done, missed, total, rate });
    }
    return rows.sort((a, b) => a.rate - b.rate);
  })();

  // ── Section clean health ──
  const sectionHealth = (() => {
    const { start, end } = dateRange;
    const now = new Date();

    // Determine which months fall in the selected period
    const relevantMonths = sectionSchedule
      .map((s) => s.month)
      .filter((m, i, arr) => arr.indexOf(m) === i) // unique
      .filter((m) => {
        const monthDate = new Date(m);
        const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
        return monthDate <= end && monthEnd >= start;
      });

    return sections.map((sec) => {
      const scheduled = sectionSchedule.filter((s) => s.section_id === sec.id && relevantMonths.includes(s.month));
      const completed = scheduled.filter((s) => s.completed_at);
      const missed = scheduled.filter((s) => !s.completed_at && new Date(s.month) < new Date(now.getFullYear(), now.getMonth(), 1));
      const rate = pct(completed.length, scheduled.length);
      return { ...sec, scheduled: scheduled.length, completed: completed.length, missed: missed.length, rate, staffName: staffById[sec.assigned_staff_id]?.name || "All staff" };
    })
    .filter((s) => s.scheduled > 0) // only show sections scheduled in this period
    .sort((a, b) => a.rate - b.rate);
  })();

  // ── Notes activity ──
  const notesActivity = staff.filter((s) => s.active !== false).map((s) => {
    const { start, end } = dateRange;
    const myNotes = notes.filter((n) => n.staff_id === s.id && new Date(n.created_at) >= start && new Date(n.created_at) <= end);
    const myReplies = noteReplies.filter((r) => r.staff_id === s.id && new Date(r.created_at) >= start && new Date(r.created_at) <= end);
    const myReactions = noteReactions.filter((r) => r.staff_id === s.id);
    return { ...s, noteCount: myNotes.length, replyCount: myReplies.length, reactionCount: myReactions.length };
  }).sort((a, b) => (b.noteCount + b.replyCount) - (a.noteCount + a.replyCount));

  const SECTIONS = [
    { key: "staff", label: "Staff Performance" },
    { key: "tasks", label: "Task Health" },
    { key: "assigned", label: "Assigned Tasks" },
    { key: "sections", label: "Section Cleans" },
    { key: "notes", label: "Notes Activity" },
  ];

  // ── Render ──
  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-white border-b px-6 py-4 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-bold text-gray-800">Insights</h1>
          </div>

          {/* Period filter */}
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { value: "week", label: "This Week" },
              { value: "month", label: "This Month" },
              { value: "lastmonth", label: "Last Month" },
              { value: "custom", label: "Custom" },
            ].map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${period === p.value ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
              >
                {p.label}
              </button>
            ))}
            {period === "custom" && (
              <div className="flex items-center gap-2">
                <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg" />
                <span className="text-gray-400 text-sm">to</span>
                <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg" />
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto px-6 py-4 space-y-6">
          {loading ? (
            <div className="text-sm text-gray-400 py-8 text-center">Loading insights...</div>
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-4 gap-4">
                <Card label="Total Completions" value={totalCompletions} sub={`in selected period`} />
                <Card label="Top Performer" value={topPerformer?.name || "—"} sub={topPerformer ? `${topPerformer.pts} points` : ""} color="text-blue-700" />
                <Card label="Most Missed Task" value={mostMissedTask?.title || "All tasks completed ✓"} sub={mostMissedTask ? `${mostMissedTask.rate}% completion rate` : ""} color={mostMissedTask ? "text-red-600" : "text-green-600"} />
                <Card
                  label="Section Cleans"
                  value={(() => {
                    if (period === "week") {
                      const { start, end } = dateRange;
                      const done = sectionCompletions.filter((c) => new Date(c.completed_at) >= start && new Date(c.completed_at) <= end).length;
                      return `${done} completed`;
                    }
                    const monthStr = period === "lastmonth"
                      ? `${new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().slice(0, 7)}-01`
                      : new Date().toISOString().slice(0, 7) + "-01";
                    const scheduled = sectionSchedule.filter((s) => s.month === monthStr);
                    const done = scheduled.filter((s) => s.completed_at).length;
                    return `${done}/${scheduled.length}`;
                  })()}
                  sub={period === "week" ? "this week" : period === "lastmonth"
                    ? new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toLocaleString("en-AU", { month: "long", year: "numeric" })
                    : new Date().toLocaleString("en-AU", { month: "long", year: "numeric" })}
                  color="text-green-700"
                />
              </div>

              {/* Section nav */}
              <div className="flex gap-1 flex-wrap">
                {SECTIONS.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setActiveSection(s.key)}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeSection === s.key ? "bg-blue-600 text-white" : "bg-white border text-gray-600 hover:bg-gray-50"}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {/* ── Staff Performance ── */}
              {activeSection === "staff" && (
                <div className="bg-white rounded-xl border overflow-hidden">
                  <div className="px-4 py-3 border-b">
                    <SectionHeader title="Staff Performance" subtitle="Points, completions and missed assigned tasks in selected period" />
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Staff</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Points</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Completions</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Assigned Missed</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Section Cleans</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staffPerformance.map((s) => (
                        <tr key={s.id} className="border-t hover:bg-gray-50">
                          <td className="px-4 py-2 font-medium text-gray-800">{s.name}</td>
                          <td className="px-4 py-2 text-blue-700 font-semibold">{s.points}</td>
                          <td className="px-4 py-2 text-gray-600">{s.completions}</td>
                          <td className="px-4 py-2">
                            {s.assignedMissed > 0
                              ? <span className="text-red-600 font-medium">{s.assignedMissed}</span>
                              : <span className="text-green-600">0</span>}
                          </td>
                          <td className="px-4 py-2 text-gray-600">{s.sectionsDone}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── Task Health ── */}
              {activeSection === "tasks" && (
                <div className="bg-white rounded-xl border overflow-hidden">
                  <div className="px-4 py-3 border-b">
                    <SectionHeader title="Task Health" subtitle="Daily and weekly tasks sorted by lowest completion rate" />
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Task</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Frequency</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Expected</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Done</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Missed</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase w-40">Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {taskHealth.map((t) => (
                        <tr key={t.id} className={`border-t hover:bg-gray-50 ${t.rate === 0 ? "bg-red-50" : ""}`}>
                          <td className="px-4 py-2 font-medium text-gray-800">{t.title}</td>
                          <td className="px-4 py-2 text-gray-500 capitalize">{t.frequency}</td>
                          <td className="px-4 py-2 text-gray-600">{t.expected}</td>
                          <td className="px-4 py-2 text-green-700 font-medium">{t.done}</td>
                          <td className="px-4 py-2 text-red-600 font-medium">{t.missed}</td>
                          <td className="px-4 py-2 w-40">
                            <PctBar value={t.rate} color={t.rate < 50 ? "bg-red-500" : t.rate < 80 ? "bg-orange-400" : "bg-green-500"} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── Assigned Task Compliance ── */}
              {activeSection === "assigned" && (
                <div className="bg-white rounded-xl border overflow-hidden">
                  <div className="px-4 py-3 border-b">
                    <SectionHeader title="Assigned Task Compliance" subtitle="How often assigned staff complete their tasks on days they are rostered" />
                  </div>
                  {assignedCompliance.length === 0 ? (
                    <div className="px-4 py-8 text-center text-gray-400 text-sm">No assigned tasks found.</div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Task</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Staff</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Shifts</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Done</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Missed</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase w-40">Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {assignedCompliance.map((r, i) => (
                          <tr key={i} className={`border-t hover:bg-gray-50 ${r.rate < 50 ? "bg-red-50" : ""}`}>
                            <td className="px-4 py-2 font-medium text-gray-800">{r.task.title}</td>
                            <td className="px-4 py-2 text-blue-700 font-medium">{r.staff.name}</td>
                            <td className="px-4 py-2 text-gray-600">{r.total}</td>
                            <td className="px-4 py-2 text-green-700 font-medium">{r.done}</td>
                            <td className="px-4 py-2 text-red-600 font-medium">{r.missed}</td>
                            <td className="px-4 py-2 w-40">
                              <PctBar value={r.rate} color={r.rate < 50 ? "bg-red-500" : r.rate < 80 ? "bg-orange-400" : "bg-green-500"} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* ── Section Clean Health ── */}
              {activeSection === "sections" && (
                <div className="space-y-4">
                  <div className="bg-white rounded-xl border overflow-hidden">
                    <div className="px-4 py-3 border-b">
                      <SectionHeader title="Section Clean Health" subtitle="All time completion rate per section" />
                    </div>
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Section</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Staff</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Scheduled</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Completed</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Missed</th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase w-40">Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sectionHealth.map((s) => (
                          <tr key={s.id} className={`border-t hover:bg-gray-50 ${s.missed > 0 ? "bg-red-50" : ""}`}>
                            <td className="px-4 py-2 font-medium text-gray-800">{s.name}</td>
                            <td className="px-4 py-2 text-blue-700">{s.staffName}</td>
                            <td className="px-4 py-2 text-gray-600">{s.scheduled}</td>
                            <td className="px-4 py-2 text-green-700 font-medium">{s.completed}</td>
                            <td className="px-4 py-2 text-red-600 font-medium">{s.missed}</td>
                            <td className="px-4 py-2 w-40">
                              <PctBar value={s.rate} color={s.rate < 50 ? "bg-red-500" : s.rate < 80 ? "bg-orange-400" : "bg-green-500"} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Year grid */}
                  <div className="bg-white rounded-xl border overflow-hidden">
                    <div className="px-4 py-3 border-b">
                      <SectionHeader title="2026 Section Clean Grid" subtitle="Green = completed, Red = missed, Orange = scheduled" />
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold text-gray-600 w-48">Section</th>
                            <th className="px-2 py-2 text-left font-semibold text-gray-500">Staff</th>
                            {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m, i) => {
                              const isCurrentMonth = i === new Date().getMonth();
                              return (
                                <th key={m} className={`px-1 py-2 text-center font-semibold w-10 ${isCurrentMonth ? "text-blue-600" : "text-gray-500"}`}>{m}</th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {sections.map((sec) => (
                            <tr key={sec.id} className="border-t hover:bg-gray-50">
                              <td className="px-3 py-1.5 font-medium text-gray-800">{sec.name}</td>
                              <td className="px-2 py-1.5 text-gray-500">{staffById[sec.assigned_staff_id]?.name || "All"}</td>
                              {Array.from({ length: 12 }, (_, i) => {
                                const month = `2026-${String(i + 1).padStart(2, "0")}-01`;
                                const entry = sectionSchedule.find((s) => s.section_id === sec.id && s.month === month);
                                const isPast = i < new Date().getMonth();
                                if (!entry) return <td key={i} className="px-1 py-1.5 text-center"><div className="w-7 h-7 mx-auto rounded bg-gray-100" /></td>;
                                if (entry.completed_at) return <td key={i} className="px-1 py-1.5 text-center"><div className="w-7 h-7 mx-auto rounded bg-green-500 flex items-center justify-center text-white text-[10px]">✓</div></td>;
                                if (isPast) return <td key={i} className="px-1 py-1.5 text-center"><div className="w-7 h-7 mx-auto rounded bg-red-400 flex items-center justify-center text-white text-[10px]">✗</div></td>;
                                return <td key={i} className="px-1 py-1.5 text-center"><div className="w-7 h-7 mx-auto rounded bg-orange-300 flex items-center justify-center text-white text-[10px]">●</div></td>;
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Notes Activity ── */}
              {activeSection === "notes" && (
                <div className="bg-white rounded-xl border overflow-hidden">
                  <div className="px-4 py-3 border-b">
                    <SectionHeader title="Notes Activity" subtitle="Staff engagement with the notes board in selected period" />
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Staff</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Notes Posted</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Replies</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Reactions Given</th>
                      </tr>
                    </thead>
                    <tbody>
                      {notesActivity.map((s) => (
                        <tr key={s.id} className="border-t hover:bg-gray-50">
                          <td className="px-4 py-2 font-medium text-gray-800">{s.name}</td>
                          <td className="px-4 py-2 text-gray-600">{s.noteCount}</td>
                          <td className="px-4 py-2 text-gray-600">{s.replyCount}</td>
                          <td className="px-4 py-2 text-gray-600">{s.reactionCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}