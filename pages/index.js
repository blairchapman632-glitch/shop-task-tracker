import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { createPortal } from "react-dom";
import { recordCompletion, undoCompletion } from "../lib/recordCompletion.js";
import supabase from "../lib/supabaseClient";

// ─── Helpers ────────────────────────────────────────────────────────────────

const formatTime = (t) => {
  if (!t) return null;
  const [hh, mm] = String(t).split(":");
  return `${hh}:${mm}`;
};

const formatRosterTime = (time) => {
  if (!time) return "";
  const [hourStr, minuteStr] = String(time).split(":");
  let hour = Number(hourStr);
  const minute = Number(minuteStr);
  const suffix = hour >= 12 ? "pm" : "am";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  if (minute === 0) return `${hour}${suffix}`;
  return `${hour}.${String(minute).padStart(2, "0")}${suffix}`;
};

const timeToMinutes = (t) => {
  if (!t) return Number.POSITIVE_INFINITY;
  const parts = String(t).split(":");
  return parseInt(parts[0] || "0", 10) * 60 + parseInt(parts[1] || "0", 10);
};

const isTaskForToday = (task, now = new Date()) => {
  const dow = now.getDay();
  const todayISO = now.toISOString().slice(0, 10);
  const freq = task.frequency || "daily";
  switch (freq) {
    case "daily": return true;
    case "monthly_anytime": return true;
    case "weekly": {
      const arr = Array.isArray(task.days_of_week) ? task.days_of_week : [];
      if (arr.length) return arr.includes(dow);
      return typeof task.weekly_day === "number" ? task.weekly_day === dow : false;
    }
    case "monthly": return Number(task.day_of_month) === now.getDate();
    case "specific_date": return typeof task.specific_date === "string" && task.specific_date.slice(0, 10) === todayISO;
    default: return true;
  }
};

const isOverdue = (task, completedTaskIds, now = new Date()) => {
  if (task.frequency === "monthly_anytime") {
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return now.getDate() === lastDay && !completedTaskIds.has(task.id);
  }
  if (!task.due_time) return false;
  if (completedTaskIds.has(task.id)) return false;
  const minsNow = now.getHours() * 60 + now.getMinutes();
  return timeToMinutes(task.due_time) < minsNow;
};

const getTaskBadge = (task) => {
  const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const freq = task.frequency || "daily";
  if (freq === "daily") return { label: "Daily", cls: "bg-gray-100 text-gray-600" };
  if (freq === "monthly_anytime") return { label: "Monthly", cls: "bg-orange-100 text-orange-700" };
  if (freq === "monthly") return { label: `Day ${task.day_of_month}`, cls: "bg-orange-100 text-orange-700" };
  if (freq === "specific_date") return { label: task.specific_date?.slice(0, 10) || "Date", cls: "bg-purple-100 text-purple-700" };
  if (freq === "weekly") {
    const arr = Array.isArray(task.days_of_week) ? task.days_of_week : [];
    return { label: arr.map((d) => DOW_SHORT[d]).join("/"), cls: "bg-blue-100 text-blue-700" };
  }
  return { label: freq, cls: "bg-gray-100 text-gray-600" };
};

const holidayEmoji = {
  newyear: "🎆", australia: "🦘", easter: "🐣", anzac: "🌺",
  wa: "⚓", christmas: "🎅", default: "🏖️",
};

const roleColour = {
  pharmacist: "text-purple-700",
  locum: "text-blue-700",
  DAA: "text-orange-600",
  "pharmacy assistant": "text-teal-700",
};

const REACTIONS = ["👍", "❤️", "🙂"];

const truncate = (text, max = 180) => {
  const s = String(text || "").trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
};

const getWeekStart = (d = new Date()) => {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
};

const getMonthStart = (d = new Date()) => {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
};

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function Sidebar({ onViewRoster, onViewLeaderboard, onViewActivity, leaderboardOpen, activityOpen, leadersWeek, leadersMonth, leadersPeriod, setLeadersPeriod, feed, onLogout }) {
  return (
    <aside className="w-[200px] min-w-[200px] h-screen bg-white border-r flex flex-col py-4 px-3 gap-1 shrink-0">
      <div className="text-sm font-bold text-gray-800 px-2 mb-3 leading-tight">
        Byford Pharmacy
      </div>

      {/* Nav links */}
      <NavLink href="/" icon="🏠" label="Home" />
      <NavLink href="/roster" icon="📅" label="Roster" />
      <button
        onClick={onViewRoster}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-gray-700 hover:bg-gray-100 w-full text-left"
      >
        <span>📋</span> View Roster
      </button>
      <NavLink href="/insights" icon="📊" label="Insights" />
      <NavLink href="#" icon="💰" label="Wages" disabled />
      <NavLink href="#" icon="🏖️" label="Leave" disabled />
      <NavLink href="/tasks" icon="✅" label="Tasks" />
      <NavLink href="#" icon="⚙️" label="Admin" disabled />

      <div className="border-t my-2" />

      {/* Leaderboard */}
      <SidebarSection
        label="🏆 Leaderboard"
        open={leaderboardOpen}
        onToggle={onViewLeaderboard}
      >
        <div className="flex gap-1 mb-2">
          {["week", "month"].map((p) => (
            <button
              key={p}
              onClick={() => setLeadersPeriod(p)}
              className={`flex-1 text-[10px] rounded border px-1 py-0.5 ${leadersPeriod === p ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600"}`}
            >
              {p === "week" ? "Week" : "Month"}
            </button>
          ))}
        </div>
        {(leadersPeriod === "week" ? leadersWeek : leadersMonth).slice(0, 5).map((r, i) => (
          <div key={r.staff_id} className="flex items-center justify-between text-xs py-0.5">
            <span className="text-gray-500 mr-1">#{i + 1}</span>
            <span className="flex-1 truncate font-medium text-gray-800">{r.name}</span>
            <span className="tabular-nums text-gray-600">{r.points}pt</span>
          </div>
        ))}
        {(leadersPeriod === "week" ? leadersWeek : leadersMonth).length === 0 && (
          <div className="text-xs text-gray-400">No points yet.</div>
        )}
      </SidebarSection>

      {/* Activity */}
      <SidebarSection
        label="📋 Activity"
        open={activityOpen}
        onToggle={onViewActivity}
      >
        {feed.length === 0 ? (
          <div className="text-xs text-gray-400">No activity yet.</div>
        ) : (
          feed.slice(0, 8).map((e) => (
            <div key={e.id} className="text-[11px] text-gray-600 py-0.5 leading-tight">
              <span className="font-medium text-gray-800">{e.staffName}</span> completed{" "}
              <span className="font-medium">"{e.taskTitle}"</span> at {e.timeStr}
            </div>
          ))
        )}
      </SidebarSection>

      <div className="flex-1" />

      <button
        onClick={onLogout}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-red-600 hover:bg-red-50 w-full text-left mt-2"
      >
        <span>🚪</span> Logout
      </button>
    </aside>
  );
}

function NavLink({ href, icon, label, disabled }) {
  if (disabled) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-gray-400 cursor-not-allowed">
        <span>{icon}</span> {label}
        <span className="ml-auto text-[9px] text-gray-300">Soon</span>
      </div>
    );
  }
  return (
    <Link href={href} className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-gray-700 hover:bg-gray-100">
      <span>{icon}</span> {label}
    </Link>
  );
}

function SidebarSection({ label, open, onToggle, children }) {
  return (
    <div className="rounded-lg border border-gray-100 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-2 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
      >
        {label}
        <svg className={`w-3 h-3 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="px-2 pb-2 pt-1 space-y-0.5 border-t border-gray-100">{children}</div>}
    </div>
  );
}

// ─── Roster Modal ─────────────────────────────────────────────────────────────

function RosterModal({ onClose }) {
  const [publishedMonths, setPublishedMonths] = useState([]);
  const [monthIndex, setMonthIndex] = useState(0);
  const [shifts, setShifts] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [{ data: months }, { data: holidayData }] = await Promise.all([
        supabase.from("roster_months").select("*").eq("status", "published").order("month", { ascending: true }),
        supabase.from("public_holidays").select("*"),
      ]);
      const all = months || [];
      setHolidays(holidayData || []);

      const todayMonth = new Date().toISOString().slice(0, 7) + "-01";
      const currentIdx = all.findIndex((x) => x.month === todayMonth);

      // Filter to current + 1 previous + 1 next only
      const filtered = all.filter((_, i) => {
        if (currentIdx === -1) return i >= all.length - 2;
        return i >= currentIdx - 1 && i <= currentIdx + 1;
      });

      setPublishedMonths(filtered);

      const newCurrentIdx = filtered.findIndex((x) => x.month === todayMonth);
      setMonthIndex(newCurrentIdx >= 0 ? newCurrentIdx : filtered.length - 1);
      setLoading(false);
    };
    load();
  }, []);

  useEffect(() => {
    if (!publishedMonths[monthIndex]) return;
    const m = publishedMonths[monthIndex];
    const start = m.month;
    const end = new Date(new Date(start).getFullYear(), new Date(start).getMonth() + 1, 1).toISOString().slice(0, 10);
    supabase.from("roster_shifts")
      .select(`id, shift_date, start_time, end_time, role, staff_id, staff_name, staff:staff_id(id, name)`)
      .gte("shift_date", start)
      .lt("shift_date", end)
      .then(({ data }) => setShifts(data || []));
  }, [monthIndex, publishedMonths]);

  if (loading) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl p-8 text-sm text-gray-600">Loading roster...</div>
    </div>
  );

  if (!publishedMonths.length) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl p-8 text-center">
        <div className="text-lg font-semibold text-gray-800 mb-2">Roster not yet available</div>
        <div className="text-sm text-gray-500 mb-4">The roster hasn't been published yet.</div>
        <button onClick={onClose} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">Close</button>
      </div>
    </div>
  );

  const currentMonth = publishedMonths[monthIndex];
  const monthDate = new Date(currentMonth.month);
  const currentYear = monthDate.getFullYear();
  const currentMonthIdx = monthDate.getMonth();
  const monthLabel = monthDate.toLocaleString("en-AU", { month: "long", year: "numeric" });

  const firstDay = new Date(currentYear, currentMonthIdx, 1);
  const daysInMonth = new Date(currentYear, currentMonthIdx + 1, 0).getDate();
  const startOffset = (firstDay.getDay() + 6) % 7;

  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const todayStr = new Date().toISOString().slice(0, 10);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0">
          <button onClick={() => setMonthIndex((i) => Math.max(0, i - 1))} disabled={monthIndex === 0} className="px-2 py-1 rounded border text-sm disabled:opacity-30">←</button>
          <h2 className="text-base font-semibold text-gray-800 flex-1 text-center">{monthLabel}</h2>
          <button onClick={() => setMonthIndex((i) => Math.min(publishedMonths.length - 1, i + 1))} disabled={monthIndex === publishedMonths.length - 1} className="px-2 py-1 rounded border text-sm disabled:opacity-30">→</button>
          <button onClick={onClose} className="ml-4 text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 px-4 py-2 border-b text-xs shrink-0">
          {[
            { label: "Pharmacist", cls: "text-purple-700" },
            { label: "Locum", cls: "text-blue-700" },
            { label: "DAA", cls: "text-orange-600" },
            { label: "Pharmacy Assistant", cls: "text-teal-700" },
          ].map(({ label, cls }) => (
            <span key={label} className={`font-medium ${cls}`}>{label}</span>
          ))}
        </div>

        {/* Calendar */}
        <div className="flex-1 overflow-auto">
          <div className="grid grid-cols-7 border-b text-xs">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => (
              <div key={d} className={`text-center font-semibold py-1.5 ${i >= 5 ? "text-purple-600" : "text-gray-600"} ${i < 6 ? "border-r" : ""}`}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((day, i) => {
              const col = i % 7;
              const isWeekend = col >= 5;
              const isLastCol = col === 6;
              const isLastRow = i >= cells.length - 7;
              const dateString = day ? `${currentYear}-${String(currentMonthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` : null;
              const isToday = dateString === todayStr;
              const holiday = dateString ? holidays.find((h) => h.date === dateString) : null;
              const dayShifts = day ? shifts.filter((s) => s.shift_date === dateString) : [];

              return (
                <div
                  key={i}
                  className={`${isLastCol ? "" : "border-r"} ${isLastRow ? "" : "border-b"} min-h-[90px] p-1 text-xs
                    ${isToday ? "bg-amber-50" : holiday ? "bg-red-50" : isWeekend ? "bg-purple-50" : "bg-white"}`}
                >
                  {day ? (
                    <>
                      <div className="flex items-start justify-between mb-0.5">
                        <span className={`text-xs font-bold ${isToday ? "text-amber-600" : isWeekend ? "text-purple-600" : "text-gray-700"}`}>{day}</span>
                        {holiday && <span title={holiday.name} className="text-sm">{holidayEmoji[holiday.image_key] || holidayEmoji.default}</span>}
                      </div>
                      {holiday && <div className="text-[9px] text-red-600 font-medium mb-0.5">{holiday.name}</div>}
                      <div className="space-y-px">
                        {dayShifts.map((s) => {
                          const name = s.staff?.name || s.staff_name || "?";
                          return (
                            <div key={s.id} className={`text-[10px] leading-tight truncate ${roleColour[s.role] || "text-gray-700"}`}>
                              {name} <span className="opacity-70">{formatRosterTime(s.start_time)}–{formatRosterTime(s.end_time)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();

  // ── Auth ──
  const [authChecked, setAuthChecked] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentPharmacyId, setCurrentPharmacyId] = useState(null);

  // ── Data ──
  const [tasks, setTasks] = useState([]);
  const [staff, setStaff] = useState([]);
  const [onShiftStaff, setOnShiftStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [completedTaskIds, setCompletedTaskIds] = useState(new Set());
  const [feed, setFeed] = useState([]);

  // ── Staff selection ──
  const [selectedStaffId, setSelectedStaffId] = useState(null);

  // ── Notes ──
  const [notes, setNotes] = useState([]);
  const [noteText, setNoteText] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [repliesByNote, setRepliesByNote] = useState({});
  const [replyTextByNote, setReplyTextByNote] = useState({});
  const [replySavingNoteId, setReplySavingNoteId] = useState(null);
  const [expandedNoteId, setExpandedNoteId] = useState(null);
  const [showResolved, setShowResolved] = useState(false);
  const [reactionsByNote, setReactionsByNote] = useState({});
  const noteItemRefs = useRef({});

  // ── UI ──
  const [infoOpenId, setInfoOpenId] = useState(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showRosterModal, setShowRosterModal] = useState(false);
  const [monthlyCompletions, setMonthlyCompletions] = useState({});
  const [sectionCleans, setSectionCleans] = useState([]);
  const [sectionCleansExpanded, setSectionCleansExpanded] = useState(false);
  const [completingSection, setCompletingSection] = useState(null);
  const [todayRosteredIds, setTodayRosteredIds] = useState(new Set());

  // ── Leaderboard ──
  const [leadersWeek, setLeadersWeek] = useState([]);
  const [leadersMonth, setLeadersMonth] = useState([]);
  const [leadersPeriod, setLeadersPeriod] = useState("week");
  const [leadersRefreshKey, setLeadersRefreshKey] = useState(0);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);

  // ── Auth check ──
  useEffect(() => {
    let mounted = true;
    async function checkAuth() {
      const { data, error } = await supabase.auth.getUser();
      if (!mounted) return;
      if (error || !data?.user) { router.replace("/login"); return; }
      setCurrentUser(data.user);
      const { data: profile } = await supabase.from("profiles").select("pharmacy_id").eq("id", data.user.id).single();
      if (!mounted) return;
      if (!profile?.pharmacy_id) return;
      setCurrentPharmacyId(profile.pharmacy_id);
      setAuthChecked(true);
    }
    checkAuth();
    return () => { mounted = false; };
  }, [router]);

  // ── Load data ──
  useEffect(() => {
    if (!authChecked || !currentPharmacyId) return;
    const load = async () => {
      setLoading(true);

      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

      const [
        { data: t },
        { data: s },
        { data: rosterShifts },
        { data: monthlyComps },
        { data: sectionCleanData },
      ] = await Promise.all([
        supabase.from("tasks").select("*").eq("pharmacy_id", currentPharmacyId).order("due_time", { ascending: true, nullsFirst: false }).order("title", { ascending: true }),
        supabase.from("staff").select("*").eq("pharmacy_id", currentPharmacyId).order("name", { ascending: true }),
        supabase.from("roster_shifts").select(`id, shift_date, start_time, end_time, staff_id, staff_name, staff:staff_id(id, name, photo_url)`).eq("shift_date", todayStr),
        supabase.from("completions").select("task_id, staff_id, completed_at").eq("pharmacy_id", currentPharmacyId).gte("completed_at", monthStart).lt("completed_at", monthEnd),
        supabase.from("section_clean_schedule").select(`id, month, completed_at, completed_by_staff_id, section:section_id(id, name, assigned_staff_id, notes, staff:assigned_staff_id(id, name))`).eq("month", `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`),
      ]);

      const activeStaff = (s || []).filter((x) => x.active !== false);
      setStaff(activeStaff);

      // Build monthly completions map: taskId -> { completedAt, staffName }
      const staffById2 = Object.fromEntries((s || []).map((st) => [st.id, st]));
      const monthlyCompMap = {};
      for (const c of monthlyComps || []) {
        if (!monthlyCompMap[c.task_id]) {
          monthlyCompMap[c.task_id] = {
            completedAt: c.completed_at,
            staffName: staffById2[c.staff_id]?.name || "Someone",
          };
        }
      }
      setMonthlyCompletions(monthlyCompMap);
      setSectionCleans(sectionCleanData || []);

      // On shift staff
      const onShift = (rosterShifts || []).map((sh) => ({
        id: sh.staff?.id || sh.staff_id,
        name: sh.staff?.name || sh.staff_name || "?",
        photo_url: sh.staff?.photo_url || null,
        start_time: sh.start_time,
        end_time: sh.end_time,
      })).filter((x) => x.id);

      // Deduplicate by staff id
      const seen = new Set();
      const uniqueOnShift = onShift.filter((x) => {
        if (seen.has(x.id)) return false;
        seen.add(x.id);
        return true;
      });

      setOnShiftStaff(uniqueOnShift.length > 0 ? uniqueOnShift : activeStaff);
      setTodayRosteredIds(new Set(uniqueOnShift.map((s) => s.id)));

      const activeStaffIds = new Set(uniqueOnShift.map((s) => s.id));

      const activeTasks = (t || []).filter((x) => x.active !== false);
      const todayTasks = activeTasks.filter((task) => {
        if (!isTaskForToday(task, now)) return false;
        // If assigned to someone, only show if they are rostered today
        if (task.assigned_staff_id) {
          return activeStaffIds.has(task.assigned_staff_id);
        }
        return true;
      });
      todayTasks.sort((a, b) => {
        const tA = timeToMinutes(a.due_time);
        const tB = timeToMinutes(b.due_time);
        if (tA !== tB) return tA - tB;
        return (a.title || "").localeCompare(b.title || "");
      });
      setTasks(todayTasks);

      const start = new Date(); start.setHours(0, 0, 0, 0);
      const end = new Date(); end.setHours(23, 59, 59, 999);
      const { data: comps } = await supabase.from("completions").select("task_id, staff_id, completed_at").eq("pharmacy_id", currentPharmacyId).gte("completed_at", start.toISOString()).lt("completed_at", end.toISOString()).order("completed_at", { ascending: false });

      const doneIds = new Set((comps || []).map((c) => c.task_id));
      setCompletedTaskIds(doneIds);

      const tasksById = Object.fromEntries(activeTasks.map((t) => [t.id, t.title]));
      const staffById = Object.fromEntries(activeStaff.map((st) => [st.id, st.name]));
      setFeed((comps || []).map((c) => ({
        id: `c_${c.task_id}_${c.staff_id}_${c.completed_at}`,
        taskTitle: tasksById[c.task_id] ?? `Task #${c.task_id}`,
        staffName: staffById[c.staff_id] ?? "Someone",
        timeStr: new Date(c.completed_at).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" }),
      })));

      setLoading(false);
    };
    load();
  }, [authChecked, currentPharmacyId]);

  // ── Leaderboard ──
  useEffect(() => {
    if (!tasks.length || !staff.length) return;
    const loadLeaders = async () => {
      try {
        const monthStart = getMonthStart();
        const { data: comps } = await supabase.from("completions").select("task_id,staff_id,completed_at").gte("completed_at", monthStart.toISOString()).lte("completed_at", new Date().toISOString());
        const tasksById = Object.fromEntries(tasks.map((t) => [t.id, t]));
        const staffById = Object.fromEntries(staff.map((s) => [s.id, s]));
        const monthTotals = new Map();
        for (const c of comps || []) {
          const t = tasksById[c.task_id];
          if (!t) continue;
          const pts = Number.isFinite(t.points) ? t.points : 1;
          monthTotals.set(c.staff_id, (monthTotals.get(c.staff_id) || 0) + pts);
        }
        const weekStart = getWeekStart();
        const weekTotals = new Map();
        for (const c of comps || []) {
          if (new Date(c.completed_at) < weekStart) continue;
          const t = tasksById[c.task_id];
          if (!t) continue;
          const pts = Number.isFinite(t.points) ? t.points : 1;
          weekTotals.set(c.staff_id, (weekTotals.get(c.staff_id) || 0) + pts);
        }
        const toRows = (totals) => Array.from(totals.entries()).map(([staff_id, points]) => ({ staff_id, name: staffById[staff_id]?.name || `#${staff_id}`, points })).sort((a, b) => b.points - a.points);
        setLeadersMonth(toRows(monthTotals));
        setLeadersWeek(toRows(weekTotals));
      } catch (err) {
        console.error("Leaderboard load failed:", err);
      }
    };
    loadLeaders();
  }, [tasks, staff, leadersRefreshKey]);

  // ── Notes ──
  useEffect(() => {
    if (!authChecked || !currentPharmacyId) return;
    const loadNotes = async () => {
      try {
        const { data, error } = await supabase.from("kiosk_notes").select("id, body, staff_id, created_at, pinned, deleted, last_activity_at, resolved, resolved_at, resolved_by_staff_id, pharmacy_id").eq("pharmacy_id", currentPharmacyId).or("deleted.is.null,deleted.eq.false").order("pinned", { ascending: false }).order("last_activity_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(200);
        if (error) throw error;
        setNotes(data || []);

        const noteIds = (data || []).map((n) => n.id);
        if (noteIds.length) {
          const [{ data: repData }, { data: rdata }] = await Promise.all([
            supabase.from("kiosk_note_replies").select("id, note_id, staff_id, body, created_at").eq("pharmacy_id", currentPharmacyId).in("note_id", noteIds).order("created_at", { ascending: true }),
            supabase.from("kiosk_note_reactions").select("note_id, staff_id, reaction").eq("pharmacy_id", currentPharmacyId).in("note_id", noteIds),
          ]);
          const grouped = {};
          for (const r of repData || []) {
            if (!grouped[r.note_id]) grouped[r.note_id] = [];
            grouped[r.note_id].push(r);
          }
          setRepliesByNote(grouped);
          const by = {};
          for (const row of rdata || []) {
            if (!by[row.note_id]) by[row.note_id] = { counts: {}, mine: null };
            by[row.note_id].counts[row.reaction] = (by[row.note_id].counts[row.reaction] || 0) + 1;
            if (selectedStaffId && Number(row.staff_id) === Number(selectedStaffId)) by[row.note_id].mine = row.reaction;
          }
          setReactionsByNote(by);
        }
      } catch (err) {
        console.error("Notes load failed:", err);
      }
    };
    loadNotes();
  }, [authChecked, currentPharmacyId, selectedStaffId, showResolved, leadersRefreshKey]);

  // ── Derived ──
  const selectedStaff = staff.find((s) => s.id === selectedStaffId) || null;
  const selectedStaffName = selectedStaff?.name || null;
  const staffById = useMemo(() => Object.fromEntries(staff.map((s) => [s.id, s])), [staff]);

  const progress = useMemo(() => {
    const total = tasks.length;
    const done = completedTaskIds.size;
    const pct = total ? Math.round((done / total) * 100) : 0;
    return { done, total, pct };
  }, [tasks, completedTaskIds]);

  // ── Handlers ──
  const burstConfetti = () => { setShowConfetti(true); setTimeout(() => setShowConfetti(false), 900); };

  const handleTaskTap = async (task) => {
    try {
      if (infoOpenId) { setInfoOpenId(null); return; }
      if (completedTaskIds.has(task.id)) {
        const ok = window.confirm(`Undo completion for "${task.title}" today?`);
        if (!ok) return;
        undoCompletion(supabase, task.id, currentPharmacyId);
        setCompletedTaskIds((prev) => { const next = new Set(prev); next.delete(task.id); return next; });
        setFeed((f) => [{ id: crypto.randomUUID(), taskTitle: `Undid: ${task.title}`, staffName: selectedStaffName ?? "Someone", timeStr: new Date().toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" }) }, ...f].slice(0, 25));
        setLeadersRefreshKey((k) => k + 1);
        return;
      }
      if (!selectedStaffId) { alert("Tap your photo first, then tap the task."); return; }
      recordCompletion(supabase, task.id, selectedStaff.id, currentPharmacyId);
      setCompletedTaskIds((prev) => { const next = new Set(prev); next.add(task.id); return next; });
      setFeed((f) => [{ id: crypto.randomUUID(), taskTitle: task.title, staffName: selectedStaffName ?? "Someone", timeStr: new Date().toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" }) }, ...f].slice(0, 25));
      setLeadersRefreshKey((k) => k + 1);
      burstConfetti();
    } catch (err) {
      if (err?.message?.includes("completions_one_per_day")) {
        setCompletedTaskIds((prev) => { const next = new Set(prev); next.add(task.id); return next; });
        return;
      }
      alert("Error: " + (err?.message ?? String(err)));
    }
  };

  const postNote = async () => {
    const body = noteText.trim();
    if (!body) return;
    if (!selectedStaffId) { alert("Tap your photo first to sign your note."); return; }
    setNotesSaving(true);
    try {
      const { data, error } = await supabase.from("kiosk_notes").insert({ body, staff_id: Number(selectedStaffId), deleted: false, pharmacy_id: currentPharmacyId }).select("id, body, staff_id, created_at, pinned, deleted, last_activity_at").single();
      if (error) throw error;
      setNotes((prev) => [data, ...prev].slice(0, 100));
      setNoteText("");
    } catch (err) {
      alert("Couldn't post note: " + (err?.message || String(err)));
    } finally {
      setNotesSaving(false);
    }
  };

  const togglePin = async (note) => {
    const nextPinned = !note.pinned;
    try {
      const { error } = await supabase.from("kiosk_notes").update({ pinned: nextPinned }).eq("id", note.id);
      if (error) throw error;
      setNotes((prev) => [...prev.map((n) => (n.id === note.id ? { ...n, pinned: nextPinned } : n))].sort((a, b) => (b.pinned === true) - (a.pinned === true) || new Date(b.created_at) - new Date(a.created_at)));
    } catch (err) { alert("Couldn't update pin: " + (err?.message || String(err))); }
  };

  const deleteNote = async (note) => {
    if (!window.confirm("Delete this note?")) return;
    try {
      const { error } = await supabase.from("kiosk_notes").update({ deleted: true }).eq("id", Number(note.id));
      if (error) throw error;
      setNotes((prev) => prev.filter((n) => n.id !== note.id));
    } catch (err) { alert("Couldn't delete note: " + (err?.message || String(err))); }
  };

  const toggleResolved = async (note) => {
    if (!selectedStaffId) { alert("Tap your photo first."); return; }
    const nextResolved = !note.resolved;
    try {
      const patch = nextResolved
        ? { resolved: true, resolved_at: new Date().toISOString(), resolved_by_staff_id: Number(selectedStaffId), last_activity_at: new Date().toISOString() }
        : { resolved: false, resolved_at: null, resolved_by_staff_id: null, last_activity_at: new Date().toISOString() };
      const { data, error } = await supabase.from("kiosk_notes").update(patch).eq("id", Number(note.id)).select("id, body, staff_id, created_at, pinned, deleted, last_activity_at, resolved, resolved_at, resolved_by_staff_id").single();
      if (error) throw error;
      setExpandedNoteId(Number(note.id));
      setNotes((prev) => [...prev.map((n) => (n.id === note.id ? { ...n, ...data } : n)).filter((n) => showResolved ? true : n.resolved !== true)].sort((a, b) => (b.pinned === true) - (a.pinned === true) || (a.resolved === true) - (b.resolved === true) || new Date(b.last_activity_at || b.created_at) - new Date(a.last_activity_at || a.created_at)));
    } catch (err) { alert("Couldn't update resolved status: " + (err?.message || String(err))); }
  };

  const postReply = async (noteId) => {
    const body = String(replyTextByNote[noteId] || "").trim();
    if (!body) return;
    if (!selectedStaffId) { alert("Tap your photo first."); return; }
    setReplySavingNoteId(noteId);
    try {
      const { data, error } = await supabase.from("kiosk_note_replies").insert({ note_id: Number(noteId), staff_id: Number(selectedStaffId), body, pharmacy_id: currentPharmacyId }).select("id, note_id, staff_id, body, created_at").single();
      if (error) throw error;
      setRepliesByNote((prev) => { const next = { ...prev }; const arr = next[noteId] ? [...next[noteId]] : []; arr.push(data); next[noteId] = arr; return next; });
      setReplyTextByNote((prev) => ({ ...prev, [noteId]: "" }));
    } catch (err) { alert("Couldn't post reply: " + (err?.message || String(err))); } finally { setReplySavingNoteId(null); }
  };

  const toggleReaction = async (noteId, reaction) => {
    if (!selectedStaffId) { alert("Tap your photo first."); return; }
    const mine = reactionsByNote[noteId]?.mine || null;
    try {
      if (mine === reaction) {
        await supabase.from("kiosk_note_reactions").delete().eq("note_id", Number(noteId)).eq("staff_id", Number(selectedStaffId));
      } else {
        await supabase.from("kiosk_note_reactions").upsert({ note_id: Number(noteId), staff_id: Number(selectedStaffId), reaction }, { onConflict: "note_id,staff_id" });
      }
      setReactionsByNote((prev) => {
        const next = { ...prev };
        const entry = next[noteId] || { counts: {}, mine: null };
        const counts = { ...entry.counts };
        const mineNow = entry.mine;
        if (mine === reaction) { counts[reaction] = Math.max(0, (counts[reaction] || 0) - 1); next[noteId] = { counts, mine: null }; return next; }
        if (mineNow && mineNow !== reaction) counts[mineNow] = Math.max(0, (counts[mineNow] || 0) - 1);
        counts[reaction] = (counts[reaction] || 0) + 1;
        next[noteId] = { counts, mine: reaction };
        return next;
      });
    } catch (err) { alert("Couldn't update reaction: " + (err?.message || String(err))); }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  useEffect(() => {
    if (!expandedNoteId) return;
    const el = noteItemRefs.current?.[expandedNoteId];
    if (!el) return;
    const t = setTimeout(() => { try { el.scrollIntoView({ behavior: "smooth", block: "nearest" }); } catch { el.scrollIntoView(); } }, 50);
    return () => clearTimeout(t);
  }, [expandedNoteId]);

  useEffect(() => {
    if (!infoOpenId) return;
    const onKey = (e) => { if (e.key === "Escape") setInfoOpenId(null); };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [infoOpenId]);

  if (!authChecked || !currentPharmacyId) {
    return <main className="p-6 text-sm text-gray-600">Loading...</main>;
  }

  // ── Render ──
  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">

      {/* Confetti */}
      {showConfetti && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
          <div className="text-6xl">🎉</div>
        </div>
      )}

      {/* Roster Modal */}
      {showRosterModal && <RosterModal onClose={() => setShowRosterModal(false)} />}

      {/* Sidebar */}
      <Sidebar
        onViewRoster={() => setShowRosterModal(true)}
        onViewLeaderboard={() => setLeaderboardOpen((o) => !o)}
        onViewActivity={() => setActivityOpen((o) => !o)}
        leaderboardOpen={leaderboardOpen}
        activityOpen={activityOpen}
        leadersWeek={leadersWeek}
        leadersMonth={leadersMonth}
        leadersPeriod={leadersPeriod}
        setLeadersPeriod={setLeadersPeriod}
        feed={feed}
        onLogout={handleLogout}
      />

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">

        {/* Tasks column */}
        <div className="w-[52%] min-w-[380px] flex flex-col border-r bg-white overflow-hidden">

          {/* Date heading */}
          <div className="px-4 pt-4 pb-3 border-b shrink-0">
            <div className="text-xl font-bold text-gray-800">
              {new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}
            </div>
          </div>

          {/* Task grid */}
          <div className="flex-1 overflow-y-auto px-3 pb-3 pt-2">
            {loading ? (
              <div className="text-sm text-gray-500 p-4">Loading tasks...</div>
            ) : (() => {
              const regularTasks = tasks.filter((t) => t.frequency !== "monthly_anytime");
              const monthlyTasks = tasks.filter((t) => t.frequency === "monthly_anytime");

              const dailyDone = regularTasks.filter((t) => completedTaskIds.has(t.id)).length;
              const dailyTotal = regularTasks.length;
              const dailyPct = dailyTotal ? Math.round((dailyDone / dailyTotal) * 100) : 0;

              const monthlyDone = monthlyTasks.filter((t) => Boolean(monthlyCompletions[t.id])).length;
              const monthlyTotal = monthlyTasks.length;
              const monthlyPct = monthlyTotal ? Math.round((monthlyDone / monthlyTotal) * 100) : 0;

              const renderTaskCard = (task, isMonthly = false) => {
                const isDone = isMonthly
                  ? Boolean(monthlyCompletions[task.id])
                  : completedTaskIds.has(task.id);
                const overdue = isOverdue(task, completedTaskIds);
                const badge = getTaskBadge(task);
                const monthlyComp = monthlyCompletions[task.id];
                const borderColour = isDone
                  ? "border-l-green-500"
                  : overdue
                  ? "border-l-red-500"
                  : isMonthly
                  ? "border-l-orange-400"
                  : "border-l-blue-400";

                const assignedStaff = task.assigned_staff_id
                  ? staffById[task.assigned_staff_id]
                  : null;

                return (
                  <button
                    key={task.id}
                    onClick={() => { if (infoOpenId) { setInfoOpenId(null); return; } handleTaskTap(task); }}
                    className={`relative pl-3 pr-2 py-2 rounded-lg border border-gray-200 border-l-4 ${borderColour} text-left bg-white shadow-sm hover:shadow-md transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${selectedStaffId ? "active:scale-[0.98]" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="font-medium text-[11px] leading-tight break-words line-clamp-2 flex-1 text-gray-800">{task.title}</div>
                      {isDone && <span className="shrink-0 inline-flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-white text-[9px]">✓</span>}
                    </div>
                    {isMonthly && (
                      <div className="text-[10px] text-blue-600 font-medium truncate">
                        {assignedStaff ? assignedStaff.name : "All staff"}
                      </div>
                    )}
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-[10px] text-gray-400">
                        {overdue ? (
                          <span className="text-red-500 font-medium">Overdue</span>
                        ) : isMonthly && monthlyComp ? (
                          <span className="text-green-600">by {monthlyComp.staffName}</span>
                        ) : task.due_time ? (
                          `${formatTime(task.due_time)}`
                        ) : ""}
                      </span>
                      <div className="flex items-center gap-1">
                        <span className={`text-[9px] px-1 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setInfoOpenId((prev) => prev === task.id ? null : task.id); }}
                          className="h-4 w-4 inline-flex items-center justify-center rounded-full border border-gray-300 bg-white hover:bg-gray-50 text-[9px] text-gray-500"
                        >i</button>
                      </div>
                    </div>
                  </button>
                );
              };

              // Section cleans logic
              const myTodaySections = sectionCleans.filter((sc) => {
                if (sc.completed_at) return false;
                const assignedId = sc.section?.assigned_staff_id;
                if (!assignedId) return true; // OTC = all staff
                return todayRosteredIds.has(assignedId);
              });

              const sectionDone = sectionCleans.filter((sc) => sc.completed_at).length;
              const sectionTotal = sectionCleans.length;

              const handleSectionComplete = async (sc) => {
                if (!selectedStaffId) { alert("Tap your photo first."); return; }
                if (sc.completed_at) {
                  const ok = window.confirm(`Undo completion for "${sc.section?.name}"?`);
                  if (!ok) return;
                  try {
                    setCompletingSection(sc.id);
                    await supabase.from("section_clean_schedule").update({ completed_at: null, completed_by_staff_id: null }).eq("id", sc.id);
                    setSectionCleans((prev) => prev.map((s) => s.id === sc.id ? { ...s, completed_at: null, completed_by_staff_id: null } : s));
                  } catch (err) { alert("Error: " + err.message); }
                  finally { setCompletingSection(null); }
                  return;
                }
                try {
                  setCompletingSection(sc.id);
                  const now2 = new Date().toISOString();
                  await supabase.from("section_clean_schedule").update({ completed_at: now2, completed_by_staff_id: Number(selectedStaffId) }).eq("id", sc.id);
                  setSectionCleans((prev) => prev.map((s) => s.id === sc.id ? { ...s, completed_at: now2, completed_by_staff_id: Number(selectedStaffId) } : s));
                  burstConfetti();
                } catch (err) { alert("Error: " + err.message); }
                finally { setCompletingSection(null); }
              };

              return (
                <div className="space-y-4">
                  {/* Daily Tasks section */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Daily Tasks</div>
                      <span className="text-[11px] font-semibold text-blue-700">{dailyDone}/{dailyTotal} ({dailyPct}%)</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1 mb-2">
                      <div className="bg-blue-500 h-1 rounded-full transition-all" style={{ width: `${dailyPct}%` }} />
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {regularTasks.map((task) => renderTaskCard(task, false))}
                    </div>
                  </div>

                  {/* This Month section */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-[11px] font-semibold text-orange-600 uppercase tracking-wide">This Month</div>
                      <span className="text-[11px] font-semibold text-orange-600">{monthlyDone}/{monthlyTotal} ({monthlyPct}%)</span>
                    </div>
                    <div className="w-full bg-orange-50 rounded-full h-1 mb-2">
                      <div className="bg-orange-400 h-1 rounded-full transition-all" style={{ width: `${monthlyPct}%` }} />
                    </div>
                    {monthlyTotal === 0 ? (
                      <div className="text-xs text-gray-400 py-2">No monthly tasks added yet.</div>
                    ) : (
                      <div className="grid grid-cols-4 gap-1.5">
                        {monthlyTasks.map((task) => renderTaskCard(task, true))}
                      </div>
                    )}
                  </div>

                  {/* Section Cleans */}
                  {sectionCleans.length > 0 && (
                    <div>
                      {/* Today's sections — rostered staff, incomplete */}
                      {myTodaySections.length > 0 && (
                        <div className="grid grid-cols-4 gap-1.5 mb-2">
                          {myTodaySections.map((sc) => (
                            <button
                              key={sc.id}
                              onClick={() => handleSectionComplete(sc)}
                              disabled={completingSection === sc.id}
                              className="relative pl-3 pr-2 py-2 rounded-lg border border-gray-200 border-l-4 border-l-blue-400 text-left bg-white shadow-sm hover:shadow-md transition-shadow"
                            >
                              <div className="font-medium text-[11px] leading-tight text-gray-800 line-clamp-2">{sc.section?.name}</div>
                              <div className="text-[10px] text-blue-600 mt-0.5">{sc.section?.staff?.name || "All staff"}</div>
                              <div className="mt-1 flex items-center justify-between">
                                <span className="text-[9px] px-1 py-0.5 rounded-full bg-blue-100 text-blue-700">Section</span>
                                {sc.section?.notes && (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setInfoOpenId(`section-${sc.id}`); }}
                                    className="h-4 w-4 inline-flex items-center justify-center rounded-full border border-gray-300 bg-white text-[9px] text-gray-500"
                                  >i</button>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Collapsible all sections */}
                      <button
                        onClick={() => setSectionCleansExpanded((e) => !e)}
                        className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-100"
                      >
                        <span>Section Cleans {sectionDone}/{sectionTotal}</span>
                        <span>{sectionCleansExpanded ? "▲" : "▼"}</span>
                      </button>

                      {sectionCleansExpanded && (
                        <div className="grid grid-cols-4 gap-1.5 mt-2">
                          {[...sectionCleans]
                            .sort((a, b) => (a.completed_at ? 1 : -1) - (b.completed_at ? 1 : -1))
                            .map((sc) => {
                              const isDone = Boolean(sc.completed_at);
                              const completedBy = isDone ? staffById[sc.completed_by_staff_id]?.name : null;
                              return (
                                <button
                                  key={sc.id}
                                  onClick={() => handleSectionComplete(sc)}
                                  disabled={completingSection === sc.id}
                                  className={`relative pl-3 pr-2 py-2 rounded-lg border border-gray-200 border-l-4 ${isDone ? "border-l-green-500" : "border-l-blue-400"} text-left bg-white shadow-sm hover:shadow-md transition-shadow`}
                                >
                                  <div className="flex items-start justify-between gap-1">
                                    <div className="font-medium text-[11px] leading-tight text-gray-800 line-clamp-2 flex-1">{sc.section?.name}</div>
                                    {isDone && <span className="shrink-0 inline-flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-white text-[9px]">✓</span>}
                                  </div>
                                  <div className="text-[10px] text-blue-600 mt-0.5">{sc.section?.staff?.name || "All staff"}</div>
                                  <div className="mt-1 text-[10px] text-gray-400">
                                    {isDone ? <span className="text-green-600">by {completedBy || "staff"}</span> : <span className="text-[9px] px-1 py-0.5 rounded-full bg-blue-100 text-blue-700">Section</span>}
                                  </div>
                                </button>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Staff + Notes column */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">

          {/* Staff section */}
          <div className="border-b shrink-0 px-4 pt-3 pb-3 bg-white">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-gray-700">Today's Staff</h2>
              
            </div>

            {/* Staff photos with times */}
            <div className="flex flex-wrap gap-3">
              {onShiftStaff.map((s) => {
                const isSelected = s.id === selectedStaffId;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSelectedStaffId(s.id)}
                    className={`flex flex-col items-center p-1.5 rounded-xl border transition-all hover:shadow-md ${isSelected ? "ring-2 ring-green-500 border-green-300" : "border-gray-200"}`}
                  >
                    <img
                      src={s.photo_url || "/placeholder.png"}
                      alt={s.name}
                      className="w-14 h-14 rounded-full object-cover"
                      loading="lazy"
                    />
                    <span className="text-[11px] mt-1 text-center max-w-[72px] truncate text-gray-700 font-medium">{s.name}</span>
                    {s.start_time && s.end_time && (
                      <span className="text-[10px] text-gray-400 text-center">{formatRosterTime(s.start_time)}–{formatRosterTime(s.end_time)}</span>
                    )}
                  </button>
                );
              })}
              {onShiftStaff.length === 0 && (
                <div className="text-xs text-gray-400">No staff rostered today.</div>
              )}
            </div>

            {/* Staff tip */}
            <div className="mt-2 text-xs text-gray-400">
              {selectedStaffId
                ? <span className="text-green-700 font-medium">✓ {selectedStaffName} selected</span>
                : "Tap your photo, then tap each task you complete."}
            </div>
          </div>

          {/* Notes section */}
          <div className="flex-1 overflow-hidden flex flex-col px-4 py-3 min-h-0">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <h2 className="text-sm font-semibold text-gray-700">Notes</h2>
            </div>

            {/* Note composer */}
            <div className="flex gap-2 mb-3 shrink-0 items-end">
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                maxLength={500}
                rows={2}
                placeholder={selectedStaffName ? `Note from ${selectedStaffName}…` : "Tap your photo, then write a note…"}
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-300"
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); postNote(); } }}
              />
              <button
                onClick={postNote}
                disabled={!noteText.trim() || notesSaving || !selectedStaffId}
                className="rounded-lg px-3 py-1.5 text-xs font-medium border border-blue-500 bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {notesSaving ? "..." : "Post"}
              </button>
            </div>

            {/* Notes list */}
            <div className="flex-1 overflow-y-auto space-y-2 nice-scroll">
              {(() => {
                const openNotes = notes.filter((n) => n.resolved !== true);
                const resolvedNotes = notes.filter((n) => n.resolved === true).sort((a, b) => new Date(b.resolved_at || b.created_at) - new Date(a.resolved_at || a.created_at));

                const renderNote = (n) => {
                  const author = staffById[n.staff_id];
                  const when = new Date(n.created_at).toLocaleString("en-AU", { month: "short", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });

                  return (
                    <div
                      key={n.id}
                      ref={(el) => { if (el) noteItemRefs.current[n.id] = el; }}
                      className={`flex items-start gap-2 rounded-lg ${n.resolved ? "bg-gray-50 border border-gray-200 px-2 py-1.5 border-l-4 border-l-gray-300" : ""}`}
                    >
                      <img src={author?.photo_url || "/placeholder.png"} alt={author?.name || "Staff"} className="w-8 h-8 rounded-full object-cover mt-0.5 shrink-0" loading="lazy" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{author?.name ?? "Someone"}</span>
                          <span className="text-[11px] text-gray-500">{when}</span>
                          {n.resolved && <span className="text-[11px] rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700">✅ Resolved</span>}
                        </div>

                        <div
                          role="button"
                          tabIndex={0}
                          onClick={(e) => { if (e?.target?.closest?.("button, textarea, input")) return; setExpandedNoteId((prev) => prev === n.id ? null : n.id); }}
                          onKeyDown={(e) => { if (e?.target?.closest?.("textarea, input, button")) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpandedNoteId((prev) => prev === n.id ? null : n.id); } }}
                          className={`cursor-pointer ${expandedNoteId === n.id ? "mt-1 rounded-lg border border-gray-100 bg-gray-50 p-2" : ""}`}
                        >
                          <div className="text-sm text-gray-800 whitespace-pre-wrap break-words">
                            {expandedNoteId === n.id ? n.body : truncate(n.body, 160)}
                          </div>

                          {expandedNoteId === n.id && (
                            <div className="mt-2 rounded-lg border border-gray-200 bg-white p-2">
                              <div className="text-[11px] font-medium text-gray-600 mb-1">Replies</div>
                              {(() => {
                                const reps = repliesByNote[n.id] || [];
                                const draft = replyTextByNote[n.id] || "";
                                const saving = replySavingNoteId === n.id;
                                return (
                                  <>
                                    {!reps.length ? <div className="text-xs text-gray-500">No replies yet.</div> : (
                                      <div className="space-y-2">
                                        {reps.map((r) => {
                                          const who = staffById[r.staff_id];
                                          return (
                                            <div key={r.id} className="flex items-start gap-2">
                                              <img src={who?.photo_url || "/placeholder.png"} alt={who?.name || "Staff"} className="w-6 h-6 rounded-full object-cover mt-0.5" loading="lazy" />
                                              <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                  <span className="text-[12px] font-medium">{who?.name ?? "Someone"}</span>
                                                  <span className="text-[11px] text-gray-500">{new Date(r.created_at).toLocaleString("en-AU", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                                                </div>
                                                <div className="text-sm whitespace-pre-wrap break-words">{r.body}</div>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                    {n.resolved ? (
                                      <div className="mt-3 border-t pt-2 text-xs text-gray-600">This note is resolved. Reopen to reply.</div>
                                    ) : (
                                      <div className="mt-3 border-t pt-2">
                                        <textarea
                                          value={draft}
                                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                          onPointerDown={(e) => e.stopPropagation()}
                                          onChange={(e) => setReplyTextByNote((prev) => ({ ...prev, [n.id]: e.target.value }))}
                                          rows={2}
                                          maxLength={500}
                                          placeholder={selectedStaffName ? `Reply as ${selectedStaffName}…` : "Tap your photo, then reply…"}
                                          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none"
                                          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); postReply(n.id); } }}
                                        />
                                        <div className="mt-2 flex justify-end">
                                          <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); postReply(n.id); }} disabled={!draft.trim() || saving || !selectedStaffId} className="rounded-lg px-3 py-2 text-sm border border-blue-600 bg-blue-600 text-white disabled:opacity-50">
                                            {saving ? "Posting…" : "Reply"}
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          )}
                        </div>

                        {/* Footer */}
                        <div className="mt-1 flex items-center gap-1 flex-wrap">
                          <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExpandedNoteId((prev) => prev === n.id ? null : n.id); }}
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${expandedNoteId === n.id ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}
                          >
                            💬 <span>{repliesByNote[n.id]?.length || 0}</span>
                          </button>
                          {!n.resolved && REACTIONS.map((rx) => {
                            const counts = reactionsByNote[n.id]?.counts || {};
                            const mine = reactionsByNote[n.id]?.mine || null;
                            const active = mine === rx;
                            return (
                              <button key={rx} onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); toggleReaction(n.id, rx); }} className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${active ? "border-blue-600 bg-blue-50" : "border-gray-200 bg-white"}`}>
                                {rx} <span className="tabular-nums text-gray-600">{counts[rx] || 0}</span>
                              </button>
                            );
                          })}
                          <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleResolved(n); }} disabled={!selectedStaffId} className={`h-6 inline-flex items-center justify-center rounded-full border px-2 text-[11px] disabled:opacity-40 ${n.resolved ? "border-gray-200 bg-gray-50 text-gray-700" : "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"}`}>
                            {n.resolved ? "Reopen" : "Resolve"}
                          </button>
                          <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); togglePin(n); }} disabled={!selectedStaffId} className={`h-6 w-6 inline-flex items-center justify-center rounded-full disabled:opacity-40 ${n.pinned ? "text-red-600 hover:bg-red-50" : "text-green-600 hover:bg-green-50"}`} title={n.pinned ? "Unpin" : "Pin"}>
                            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor"><path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" /></svg>
                          </button>
                          <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteNote(n); }} disabled={!selectedStaffId || selectedStaffId !== n.staff_id} className="h-6 w-6 inline-flex items-center justify-center rounded-full text-red-600 hover:bg-red-50 disabled:opacity-40" title="Delete">
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                };

                return (
                  <div className="space-y-3">
                    <ul className="space-y-2">{openNotes.map(renderNote)}</ul>
                    {showResolved && (
                      <div>
                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowResolved(false); }} className="mb-2 w-full text-xs rounded-md border border-gray-200 px-3 py-2 text-gray-600 hover:bg-gray-50">Hide resolved</button>
                        <ul className="space-y-2">{resolvedNotes.map(renderNote)}</ul>
                      </div>
                    )}
                    {!showResolved && resolvedNotes.length > 0 && (
                      <div className="pt-2 border-t border-gray-100">
                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowResolved(true); }} className="w-full text-xs rounded-md border border-gray-200 px-3 py-2 text-gray-600 hover:bg-gray-50">
                          Resolved ({resolvedNotes.length})
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Section info modal */}
      {infoOpenId && String(infoOpenId).startsWith("section-") && createPortal(
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setInfoOpenId(null)} />
          <div className="fixed inset-0 z-50 flex items-start justify-center p-4" onClick={() => setInfoOpenId(null)}>
            <div className="mt-16 w-full max-w-xl rounded-2xl border border-gray-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="h-1 rounded-t-2xl bg-blue-500" />
              <div className="flex items-center justify-between px-4 py-3">
                <div className="font-medium text-gray-900">
                  {sectionCleans.find((sc) => `section-${sc.id}` === infoOpenId)?.section?.name}
                </div>
                <button onClick={() => setInfoOpenId(null)} className="h-10 w-10 inline-flex items-center justify-center rounded-full hover:bg-gray-100">✕</button>
              </div>
              <div className="px-4 pb-4 text-sm text-gray-700 whitespace-pre-wrap">
                {sectionCleans.find((sc) => `section-${sc.id}` === infoOpenId)?.section?.notes || "No notes."}
              </div>
            </div>
          </div>
        </>,
        document.body
      )}

      {/* Info modal */}
      {infoOpenId && !String(infoOpenId).startsWith("section-") && createPortal(
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setInfoOpenId(null)} />
          <div className="fixed inset-0 z-50 flex items-start justify-center p-4 md:p-6" onClick={() => setInfoOpenId(null)}>
            <div className="mt-16 w-full max-w-xl max-h-[85vh] overflow-auto rounded-2xl border border-gray-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="h-1 rounded-t-2xl bg-blue-500" />
              <div className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0 pr-3">
                  <div className="truncate font-medium text-gray-900">{tasks.find((t) => t.id === infoOpenId)?.title}</div>
                  {tasks.find((t) => t.id === infoOpenId)?.due_time && <div className="text-xs text-gray-500">Due {formatTime(tasks.find((t) => t.id === infoOpenId)?.due_time)}</div>}
                </div>
                <button onClick={() => setInfoOpenId(null)} className="h-10 w-10 inline-flex items-center justify-center rounded-full hover:bg-gray-100">✕</button>
              </div>
              <div className="px-4 pb-4 text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">
                {String(tasks.find((t) => t.id === infoOpenId)?.info ?? "").trim() || "No notes yet."}
              </div>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}