import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { createPortal } from "react-dom";

import { recordCompletion, undoCompletion } from "../lib/recordCompletion.js";

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
  // Small popover for task info
  const [infoOpenId, setInfoOpenId] = useState(null);
    // Leaderboard state
  const [leadersWeek, setLeadersWeek] = useState([]);
  const [leadersMonth, setLeadersMonth] = useState([]);
  const [leadersPeriod, setLeadersPeriod] = useState("week"); // "week" | "month"
  const [showLeadersModal, setShowLeadersModal] = useState(false);
  const [leadersRefreshKey, setLeadersRefreshKey] = useState(0);
// Notes state
const [notes, setNotes] = useState([]);

// Replies state (noteId -> array of replies)
const [repliesByNote, setRepliesByNote] = useState({});

// Reply composer state (per-note)
const [replyTextByNote, setReplyTextByNote] = useState({});
const [replySavingNoteId, setReplySavingNoteId] = useState(null);


// Notes UI: expand/collapse (one open at a time)

const [expandedNoteId, setExpandedNoteId] = useState(null);
  // Notes filter: show/hide resolved notes
const [showResolved, setShowResolved] = useState(false);
const [showResolvedSection, setShowResolvedSection] = useState(false);

// Refs so we can scroll an expanded note into view inside the Notes panel
const noteItemRefs = useRef({});
// Small helper for note previews
const truncate = (text, max = 180) => {
  const s = String(text || "").trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
};

// Reactions
const REACTIONS = ["👍", "❤️", "🙂"];
const [reactionsByNote, setReactionsByNote] = useState({});



  // Keep pinned notes at top automatically whenever notes change
useEffect(() => {
  if (!notes.length) return;
setNotes((prev) =>
  [...prev].sort((a, b) => {
    // 1) pinned first
    const pinDiff = (b.pinned === true) - (a.pinned === true);
    if (pinDiff) return pinDiff;

    // 2) most recent activity first (fallback to created_at)
    const aAct = new Date(a.last_activity_at || a.created_at).getTime();
    const bAct = new Date(b.last_activity_at || b.created_at).getTime();
    if (aAct !== bAct) return bAct - aAct;

    // 3) newest note first
    return new Date(b.created_at) - new Date(a.created_at);
  })
);

  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [notes.length]);

const [noteText, setNoteText] = useState("");
const [notesSaving, setNotesSaving] = useState(false);
  // Post a reply to a note
  // Resolve / reopen a note (records who did it)
const toggleResolved = async (note) => {
  if (!selectedStaffId) {
    alert("Tap your photo first to sign this action.");
    return;
  }

  const nextResolved = !note.resolved;

  try {
    const patch = nextResolved
      ? {
          resolved: true,
          resolved_at: new Date().toISOString(),
          resolved_by_staff_id: Number(selectedStaffId),
          last_activity_at: new Date().toISOString(),
        }
      : {
          resolved: false,
          resolved_at: null,
          resolved_by_staff_id: null,
          last_activity_at: new Date().toISOString(),
        };

    const { data, error } = await supabase
      .from("kiosk_notes")
      .update(patch)
      .eq("id", Number(note.id))
      .select("id, body, staff_id, created_at, pinned, deleted, last_activity_at, resolved, resolved_at, resolved_by_staff_id")
      .single();

    if (error) throw error;
    // Keep this note expanded so the user sees the result immediately
    setExpandedNoteId(Number(note.id));

    // Update local list and re-sort
    setNotes((prev) => {
      const next = prev
        .map((n) => (n.id === note.id ? { ...n, ...data } : n))
        .filter((n) => (showResolved ? true : n.resolved !== true));

      return [...next].sort((a, b) => {
        const pinDiff = (b.pinned === true) - (a.pinned === true);
        if (pinDiff) return pinDiff;

        const resDiff = (a.resolved === true) - (b.resolved === true);
        if (resDiff) return resDiff;

        const aAct = new Date(a.last_activity_at || a.created_at).getTime();
        const bAct = new Date(b.last_activity_at || b.created_at).getTime();
        if (aAct !== bAct) return bAct - aAct;

        return new Date(b.created_at) - new Date(a.created_at);
      });
    });
  } catch (err) {
    console.error(err);
    alert("Couldn't update resolved status: " + (err?.message || String(err)));
  }
};

const postReply = async (noteId) => {
  const body = String(replyTextByNote[noteId] || "").trim();
  if (!body) return;

  if (!selectedStaffId) {
    alert("Tap your photo first to sign your reply.");
    return;
  }

  setReplySavingNoteId(noteId);
  try {
    const { data, error } = await supabase
      .from("kiosk_note_replies")
      .insert({
        note_id: Number(noteId),
        staff_id: Number(selectedStaffId),
        body,
      })
      .select("id, note_id, staff_id, body, created_at")
      .single();

    if (error) throw error;

    // Add to local state immediately (newest at bottom to match ascending order)
    setRepliesByNote((prev) => {
      const next = { ...prev };
      const arr = next[noteId] ? [...next[noteId]] : [];
      arr.push(data);
      next[noteId] = arr;
      return next;
    });
// Bump note activity locally so it jumps up immediately (DB trigger also does this)
setNotes((prev) => {
  const next = prev.map((n) =>
    n.id === noteId ? { ...n, last_activity_at: new Date().toISOString() } : n
  );
  // Re-sort to reflect the bump right away
  return [...next].sort((a, b) => {
    const pinDiff = (b.pinned === true) - (a.pinned === true);
    if (pinDiff) return pinDiff;
        // Unresolved first (only matters when showResolved=true)
    const resDiff = (a.resolved === true) - (b.resolved === true);
    if (resDiff) return resDiff;

    const aAct = new Date(a.last_activity_at || a.created_at).getTime();
    const bAct = new Date(b.last_activity_at || b.created_at).getTime();
    if (aAct !== bAct) return bAct - aAct;
    return new Date(b.created_at) - new Date(a.created_at);
  });
});

    // Clear input
    setReplyTextByNote((prev) => ({ ...prev, [noteId]: "" }));
  } catch (err) {
    console.error(err);
    alert("Couldn't post reply: " + (err?.message || String(err)));
  } finally {
    setReplySavingNoteId(null);
  }
};

  // When a note expands, scroll it into view (helps a lot once replies exist)
useEffect(() => {
  if (!expandedNoteId) return;
  const el = noteItemRefs.current?.[expandedNoteId];
  if (!el) return;

  // Let the DOM update first (so expanded content exists)
  const t = setTimeout(() => {
    try {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch {
      // Fallback for older browsers
      el.scrollIntoView();
    }
  }, 50);

  return () => clearTimeout(t);
}, [expandedNoteId]);

// Toggle a reaction on a note (ONE reaction per staff per note)
const toggleReaction = async (noteId, reaction) => {
  if (!selectedStaffId) {
    alert("Tap your photo first to react.");
    return;
  }

  const mine = reactionsByNote[noteId]?.mine || null;

  try {
    if (mine === reaction) {
      // Tap the same reaction again = remove it
      const { error } = await supabase
        .from("kiosk_note_reactions")
        .delete()
        .eq("note_id", Number(noteId))
        .eq("staff_id", Number(selectedStaffId));

      if (error) throw error;
    } else {
      // Set/replace reaction (one per staff per note)
      const { error } = await supabase
        .from("kiosk_note_reactions")
        .upsert(
          {
            note_id: Number(noteId),
            staff_id: Number(selectedStaffId),
            reaction,
          },
          { onConflict: "note_id,staff_id" }
        );

      if (error) throw error;
    }

       // Instant UI update (no full refresh)
    setReactionsByNote((prev) => {
      const next = { ...prev };
      const entry = next[noteId] || { counts: {}, mine: null };
      const counts = { ...entry.counts };
      const mineNow = entry.mine; // current mine (single emoji or null)

      // If we removed our reaction
      if (mine === reaction) {
        counts[reaction] = Math.max(0, (counts[reaction] || 0) - 1);
        next[noteId] = { counts, mine: null };
        return next;
      }

      // Otherwise we set/replaced our reaction
      if (mineNow && mineNow !== reaction) {
        counts[mineNow] = Math.max(0, (counts[mineNow] || 0) - 1);
      }
      counts[reaction] = (counts[reaction] || 0) + 1;

      next[noteId] = { counts, mine: reaction };
      return next;
    });

    // Optional: keep this if you want other kiosk screens to sync via reloads
    // setLeadersRefreshKey((k) => k + 1);

  } catch (err) {
    console.error(err);
    alert("Couldn't update reaction: " + (err?.message || String(err)));
  }
};

  // Date helpers: start of week (Mon) and start of month, in local time
  const getWeekStart = (d = new Date()) => {
    const x = new Date(d);
    const day = x.getDay(); // 0=Sun..6=Sat
    const diff = (day === 0 ? -6 : 1 - day); // shift so Monday is first day
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

  // Close on Esc
useEffect(() => {
  if (!infoOpenId) return;
  const onKey = (e) => { if (e.key === "Escape") setInfoOpenId(null); };
  window.addEventListener("keydown", onKey, { capture: true });
  return () => window.removeEventListener("keydown", onKey, { capture: true });
}, [infoOpenId]);



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
  // Load leaderboard data (current week + current month)
  useEffect(() => {
    // Only run once tasks & staff are available
    if (!tasks.length || !staff.length) return;

    const loadLeaders = async () => {
      try {
        const monthStart = getMonthStart();
        const { data: comps, error } = await supabase
          .from("completions")
          .select("task_id,staff_id,completed_at")
          .gte("completed_at", monthStart.toISOString())
          .lte("completed_at", new Date().toISOString());
        if (error) throw error;

        // Build lookups
        const tasksById = Object.fromEntries(tasks.map(t => [t.id, t]));
        const staffById = Object.fromEntries(staff.map(s => [s.id, s]));

        // Aggregate points per staff for month
        const monthTotals = new Map(); // staffId -> points
        for (const c of comps || []) {
          const t = tasksById[c.task_id];
          if (!t) continue;
          const pts = Number.isFinite(t.points) ? t.points : 1;
          monthTotals.set(c.staff_id, (monthTotals.get(c.staff_id) || 0) + pts);
        }

        // Compute week subset (from local Monday 00:00)
        const weekStart = getWeekStart();
        const weekTotals = new Map();
        for (const c of comps || []) {
          if (new Date(c.completed_at) < weekStart) continue;
          const t = tasksById[c.task_id];
          if (!t) continue;
          const pts = Number.isFinite(t.points) ? t.points : 1;
          weekTotals.set(c.staff_id, (weekTotals.get(c.staff_id) || 0) + pts);
        }

        // Convert to arrays with names, sort desc
        const toRows = (totals) =>
          Array.from(totals.entries())
            .map(([staff_id, points]) => ({
              staff_id,
              name: staffById[staff_id]?.name || `#${staff_id}`,
              points,
            }))
            .sort((a, b) => b.points - a.points);

        setLeadersMonth(toRows(monthTotals));
        setLeadersWeek(toRows(weekTotals));
      } catch (err) {
        console.error("Leaderboard load failed:", err);
      }
    };

    loadLeaders();
  }, [tasks, staff, leadersRefreshKey]);
// Load kiosk notes: last 7 days or pinned
useEffect(() => {
  const loadNotes = async () => {
    try {
    let q = supabase
  .from("kiosk_notes")
  .select("id, body, staff_id, created_at, pinned, deleted, last_activity_at, resolved, resolved_at, resolved_by_staff_id")
  .or("deleted.is.null,deleted.eq.false") // show only non-deleted (treat null as false)
  .order("pinned", { ascending: false })
  .order("last_activity_at", { ascending: false, nullsFirst: false })
  .order("created_at", { ascending: false })
  .limit(200);

// Only hide resolved when the toggle is OFF
if (!showResolved) {
  q = q.eq("resolved", false);
}

const { data, error } = await q;


      if (error) throw error;
      setNotes(data || []);
            // Load replies for these notes (visible to everyone)
      const noteIdsForReplies = (data || []).map((n) => n.id);

      if (noteIdsForReplies.length) {
        const { data: repData, error: repErr } = await supabase
          .from("kiosk_note_replies")
          .select("id, note_id, staff_id, body, created_at")
          .in("note_id", noteIdsForReplies)
          .order("created_at", { ascending: true });

        if (repErr) throw repErr;

        const grouped = {};
        for (const r of repData || []) {
          if (!grouped[r.note_id]) grouped[r.note_id] = [];
          grouped[r.note_id].push(r);
        }
        setRepliesByNote(grouped);
      } else {
        setRepliesByNote({});
      }

   // Load reactions for these notes
const noteIds = (data || []).map(n => n.id);

if (noteIds.length) {
  const { data: rdata, error: rerr } = await supabase
    .from("kiosk_note_reactions")
    .select("note_id, staff_id, reaction")
    .in("note_id", noteIds);

  if (rerr) throw rerr;

  const by = {};
  for (const row of rdata || []) {
    if (!by[row.note_id]) {
      by[row.note_id] = { counts: {}, mine: null };
    }

    by[row.note_id].counts[row.reaction] =
      (by[row.note_id].counts[row.reaction] || 0) + 1;

    // ONE reaction per staff per note → store as a single string
    if (selectedStaffId && Number(row.staff_id) === Number(selectedStaffId)) {
      by[row.note_id].mine = row.reaction;
    }
  }

  setReactionsByNote(by);
} else {
  setReactionsByNote({});
}

    } catch (err) {
      console.error("Notes load failed:", err);
    }
  };

  loadNotes();
}, [staff.length, leadersRefreshKey, selectedStaffId, showResolved]);




  const selectedStaff = staff.find((s) => s.id === selectedStaffId) || null;
  const selectedStaffName = selectedStaff ? selectedStaff.name : null;

  const progress = useMemo(() => {
    const total = tasks.length;
    const done = completedTaskIds.size;
    const pct = total ? Math.round((done / total) * 100) : 0;
    return { done, total, pct };
  }, [tasks, completedTaskIds]);
// Lookup: staffId -> staff object (for note author info)
const staffById = useMemo(
  () => Object.fromEntries(staff.map(s => [s.id, s])),
  [staff]
);

  const burstConfetti = () => {
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 900);
  };

  const handleTaskTap = async (task) => {
    try {
      // If an info popover is open, a tile tap only closes it — no completion.
      if (infoOpenId) {
        setInfoOpenId(null);
        return;
      }

      // If already completed today: offer to undo
      if (completedTaskIds.has(task.id)) {
        const ok = typeof window !== "undefined" &&
          window.confirm(`Undo completion for “${task.title}” today?`);
        if (!ok) return;

        // Delete today's completion row
        await undoCompletion(supabase, Number(task.id));

        // Update local state
        setCompletedTaskIds((prev) => {
          const next = new Set(prev);
          next.delete(task.id);
          return next;
        });

        // Feed entry for undo
        const timeStr = new Date().toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" });
        const entry = {
          id: (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : String(Math.random()),
          taskTitle: task.title,
          staffName: selectedStaffName ?? "Someone",
          timeStr,
        };
        setFeed((f) => [
          { ...entry, taskTitle: `Undid: ${task.title}` },
          ...f,
        ].slice(0, 25));
                setLeadersRefreshKey((k) => k + 1);

        return;
      }

      // Otherwise: complete it
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
      setLeadersRefreshKey((k) => k + 1);

      burstConfetti();
    } catch (err) {
      // Race-safe fallbacks:
      if (err?.message?.includes("completions_one_per_day")) {
        // Another kiosk beat us to it; just mark as done locally
        setCompletedTaskIds((prev) => {
          const next = new Set(prev);
          next.add(task.id);
          return next;
        });
        return;
      }
      alert("Error: " + (err?.message ?? String(err)));
      console.error(err);
    }
  };

// Post a new note
const postNote = async () => {
  const body = noteText.trim();
  if (!body) return;
  if (!selectedStaffId) {
    alert("Tap your photo first to sign your note.");
    return;
  }
  setNotesSaving(true);
  try {
   const { data, error } = await supabase
  .from("kiosk_notes")
  .insert({
    body,
    staff_id: Number(selectedStaffId),
    deleted: false, // explicit for safety if no DB default
  })
 .select("id, body, staff_id, created_at, pinned, deleted, last_activity_at")

  .single();

    if (error) throw error;

    setNotes((prev) => [data, ...prev].slice(0, 100));
    setNoteText("");
  } catch (err) {
    alert("Couldn't post note: " + (err?.message || String(err)));
    console.error(err);
  } finally {
    setNotesSaving(false);
  }
};

// Pin / unpin a note
const togglePin = async (note) => {

 



  const nextPinned = !note.pinned;
  try {
    const { error } = await supabase
      .from("kiosk_notes")
      .update({ pinned: nextPinned })
      .eq("id", note.id);
    if (error) throw error;

    setNotes((prev) =>
      [...prev.map((n) => (n.id === note.id ? { ...n, pinned: nextPinned } : n))]
        .sort(
          (a, b) =>
            (b.pinned === true) - (a.pinned === true) ||
            new Date(b.created_at) - new Date(a.created_at)
        )
    );
  } catch (err) {
    alert("Couldn't update pin: " + (err?.message || String(err)));
    console.error(err);
  }
};

// Permanently delete a note (author-only from kiosk)
async function deleteNote(note) {
  const ok =
    typeof window !== "undefined" &&
    window.confirm("Delete this note? (It will be hidden, not permanently removed.)");
  if (!ok) return;

  try {
    // Soft delete: mark deleted=true (keeps history and avoids accidental permanent loss)
    const { data, error } = await supabase
      .from("kiosk_notes")
      .update({ deleted: true })
      .eq("id", Number(note.id))
      .select("id");


    if (error) throw error;
    if (!data || data.length === 0) {
      alert("Delete didn't update any rows — check the id/permissions.");
      return;
    }

    // Remove from local list immediately
    setNotes((prev) => prev.filter((n) => n.id !== note.id));
  } catch (err) {
    console.error(err);
    alert("Couldn't delete note: " + (err?.message || String(err)));
  }
}




   


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
  onClick={() => {
  // If an info popover is open, a tile tap only closes it — no completion.
  if (infoOpenId) {
    setInfoOpenId(null);
    return;
  }
  handleTaskTap(task);
}}


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
    <span className="relative inline-flex items-center gap-2">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          // Toggle this task’s popover
          setInfoOpenId((prev) => (prev === task.id ? null : task.id));
        }}
        className="h-5 w-5 inline-flex items-center justify-center rounded-full border border-gray-300 bg-white hover:bg-gray-50"
        title="Task info"
        aria-haspopup="dialog"
        aria-expanded={infoOpenId === task.id}
        aria-label="Task info"
      >
        i
      </button>

      {/* Info popover (portal, modal-style to avoid clipping) */}
{infoOpenId === task.id &&
  createPortal(
    <>
      {/* Backdrop (click to close) */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={() => setInfoOpenId(null)}
        aria-hidden="true"
      />

      {/* Centered container */}
      <div
  className="fixed inset-0 z-50 flex items-start justify-center p-4 md:p-6"
  role="dialog"
  aria-modal="true"
  aria-label="Task notes"
  onClick={() => setInfoOpenId(null)}
>
  <div
    className="mt-16 w-full max-w-xl max-h-[85vh] overflow-auto rounded-2xl border border-gray-200 bg-white shadow-xl"
    onClick={(e) => e.stopPropagation()}
  >

          {/* Accent bar */}
          <div className="h-1 rounded-t-2xl bg-blue-500" />

          {/* Header with title + close */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="min-w-0 pr-3">
              <div className="truncate font-medium text-gray-900">{task.title}</div>
              {task.due_time && (
                <div className="text-xs text-gray-500">
                  Due {formatTime(task.due_time)}
                </div>
              )}
            </div>

            <button
              type="button"
              className="h-10 w-10 inline-flex items-center justify-center rounded-full hover:bg-gray-100"
              aria-label="Close"
              onClick={() => setInfoOpenId(null)}
            >
              ✕
            </button>
          </div>

          {/* Body */}
          <div className="px-4 pb-4 text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">
  {(() => {
    const txt = String(task?.info ?? "").trim();
    return txt ? txt : "No notes yet.";
  })()}
</div>

        </div>
      </div>
    </>,
    document.body
  )
}

        {/* (old anchored popover removed — using portal modal above) */}


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






    {/* Leaderboard */}
    <div className="border rounded-xl p-3 bg-white">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-medium">Leaderboard</h3>
        <div className="inline-flex items-center gap-2">
          <button
            type="button"
            className={`text-xs rounded-md border px-2 py-0.5 ${leadersPeriod === "week" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-700 border-gray-200"}`}
            onClick={() => setLeadersPeriod("week")}
          >
            This week
          </button>
          <button
            type="button"
            className={`text-xs rounded-md border px-2 py-0.5 ${leadersPeriod === "month" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-700 border-gray-200"}`}
            onClick={() => setLeadersPeriod("month")}
          >
            This month
          </button>
        </div>
      </div>

     {(() => {
  const rows = leadersPeriod === "week" ? leadersWeek : leadersMonth;
  // Take top 3, then pad with placeholders to always show 3 rows
  const top = rows.slice(0, 3);
  const padded = [...top];
  for (let i = padded.length; i < 3; i++) {
    padded.push({ staff_id: `pad-${i}`, name: "—", points: null });
  }

  return (
    <>
      <ol className="text-sm space-y-1">
        {padded.map((r, i) => (
          <li key={r.staff_id} className="flex items-center justify-between">
            <span className="truncate">
              <span className="mr-2 text-gray-500">#{i + 1}</span>
              <span className="font-medium">{r.name}</span>
            </span>
            {r.points == null ? (
              <span className="text-gray-300">—</span>
            ) : (
              <span className="tabular-nums">{r.points} pts</span>
            )}
          </li>
        ))}
      </ol>
      {rows.length > 3 && (
        <div className="mt-2">
          <button
            type="button"
            className="text-xs rounded-md border border-gray-200 px-2 py-1 hover:bg-gray-50"
            onClick={() => setShowLeadersModal(true)}
          >
            View all
          </button>
        </div>
      )}
    </>
  );
})()}

    </div>

{/* Notes (taller so expanded notes + replies have room) */}
<div className="border rounded-xl p-3 bg-white min-h-[200px] max-h-[420px] overflow-y-auto nice-scroll">

  <div className="flex items-center justify-between mb-2">
  <h3 className="font-medium">Notes</h3>

  <div className="flex items-center gap-2">
    <button
      type="button"
      className="text-xs rounded-md border border-gray-200 px-2 py-1 hover:bg-gray-50"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        // Toggle showing resolved notes by reloading notes
        setShowResolved((v) => {
          const next = !v;
          if (next) setShowResolvedSection(false); // collapse resolved list when turning it on
          return next;
        });

      }}
      title={showResolved ? "Hide resolved notes" : "Show resolved notes"}
    >
      {showResolved ? "Hide resolved" : "Show resolved"}
    </button>
    <span className="text-xs text-gray-500">{showResolved ? "All" : "Open"}</span>
  </div>
</div>


    {/* Composer (textarea so handover notes + replies feel natural) */}
  <div className="flex gap-2 mb-2 items-start">
    <textarea
      value={noteText}
      onChange={(e) => setNoteText(e.target.value)}
      maxLength={500}
      rows={2}
      placeholder={
        selectedStaffName
          ? `Note from ${selectedStaffName}…`
          : "Tap your photo, then write a note…"
      }
      className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none leading-snug"
      onKeyDown={(e) => {
        // Enter = post, Shift+Enter = new line (kiosk-friendly)
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          postNote();
        }
      }}
    />

    <button
      type="button"
      onClick={postNote}
      disabled={!noteText.trim() || notesSaving || !selectedStaffId}
      className="rounded-lg px-3 py-2 text-sm border border-blue-600 bg-blue-600 text-white disabled:opacity-50"
    >
      Post
    </button>
  </div>

    {/* List */}
  {notes.length === 0 ? (
    <div className="text-xs text-gray-500">No notes yet.</div>
  ) : (
    (() => {
      const openNotes = (notes || []).filter((n) => n.resolved !== true);

      // When showResolved is ON, show resolved in a separate section.
      // Resolved ordering ignores pin and is sorted by resolved_at (newest first).
      const resolvedNotes = showResolved
        ? (notes || [])
            .filter((n) => n.resolved === true)
            .slice()
            .sort((a, b) => {
              const aT = new Date(a.resolved_at || a.created_at).getTime();
              const bT = new Date(b.resolved_at || b.created_at).getTime();
              return bT - aT;
            })
        : [];

      const renderNote = (n) => {
        const author = staffById[n.staff_id];
        const when = new Date(n.created_at).toLocaleString("en-AU", {
          month: "short",
          day: "numeric",
          weekday: "short",
          hour: "2-digit",
          minute: "2-digit",
        });

        const resolvedWho = n.resolved_by_staff_id != null
          ? staffById[Number(n.resolved_by_staff_id)]
          : null;

        const resolvedWhen = n.resolved_at
          ? new Date(n.resolved_at).toLocaleString("en-AU", {
              month: "short",
              day: "numeric",
              weekday: "short",
              hour: "2-digit",
              minute: "2-digit",
            })
          : null;

        return (
          <li
            key={n.id}
            ref={(el) => {
              if (el) noteItemRefs.current[n.id] = el;
            }}
                    className={`flex items-start gap-2 rounded-lg ${
  n.resolved
    ? "bg-gray-50 border border-gray-200 px-2 py-1.5 border-l-4 border-l-gray-300"
    : ""
}`}


          >


            <img
              src={author?.photo_url || "/placeholder.png"}
              alt={author?.name || "Staff"}
              className={`rounded-full object-cover mt-0.5 ${n.resolved ? "w-7 h-7" : "w-8 h-8"}`}

              loading="lazy"
              decoding="async"
            />
            <div className="min-w-0 flex-1">



              <div className="flex items-center gap-2 flex-wrap">

                <span className="text-sm font-medium">
  {author?.name ?? "Someone"}
</span>
<span className="text-[11px] text-gray-500">{when}</span>

{n.resolved ? (
  <span className="inline-flex items-center gap-1 text-[11px] rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700">
    <span aria-hidden="true">✅</span>
    Resolved
  </span>
) : null}


{n.resolved && expandedNoteId === n.id ? (
  <div className="mt-0.5 text-[11px] text-gray-600">
    {(() => {
      const who = n.resolved_by_staff_id != null ? staffById[Number(n.resolved_by_staff_id)] : null;
      const whenRes = n.resolved_at
        ? new Date(n.resolved_at).toLocaleString("en-AU", {
            month: "short",
            day: "numeric",
            weekday: "short",
            hour: "2-digit",
            minute: "2-digit",
          })
        : null;

      if (!who?.name && !whenRes) return null;

      return (
        <>
          Resolved{who?.name ? ` by ${who.name}` : ""}{whenRes ? ` • ${whenRes}` : ""}
        </>
      );
    })()}
  </div>
) : null}



  
                {/* pinned badge removed — icon now indicates state */}

              </div>
  <div
  role="button"
  tabIndex={0}
  onClick={(e) => {
  // If the user taps a control inside the note row (buttons, inputs, textarea),
  // don't toggle expand/collapse.
  if (e?.target?.closest?.("button, textarea, input, select, a, label")) return;
  setExpandedNoteId((prev) => (prev === n.id ? null : n.id));
}}

  onKeyDown={(e) => {
  // If the keypress originated inside a control (eg typing in the reply box),
  // do not toggle expand/collapse.
  if (e?.target?.closest?.("textarea, input, select, button, a, label")) return;

  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    setExpandedNoteId((prev) => (prev === n.id ? null : n.id));
  }
}}

  className={`cursor-pointer ${
    expandedNoteId === n.id
      ? "mt-1 rounded-lg border border-gray-100 bg-gray-50 p-2"
      : ""
  }`}
  title={expandedNoteId === n.id ? "Click to collapse" : "Click to expand"}
>
  {/* Body: preview when collapsed, full when expanded */}
 <div className={`${n.resolved && expandedNoteId !== n.id ? "text-xs text-gray-500" : "text-sm text-gray-800"} whitespace-pre-wrap break-words`}>


   {expandedNoteId === n.id
  ? n.body
  : truncate(n.body, n.resolved ? 110 : 160)}

  </div>
{expandedNoteId === n.id && n.resolved ? (
  <div className="mt-2 text-xs text-gray-600">
    Resolved
    {resolvedWho?.name ? ` by ${resolvedWho.name}` : (n.resolved_by_staff_id != null ? ` by #${n.resolved_by_staff_id}` : "")}
    {resolvedWhen ? ` • ${resolvedWhen}` : ""}.
  </div>
) : null}


  {/* Expanded area (Replies will render here next) */}
 {expandedNoteId === n.id && (
  <div className="mt-2 rounded-lg border border-gray-200 bg-white p-2">
    <div className="text-[11px] font-medium text-gray-600 mb-1">
      Replies
    </div>

    {(() => {
      const reps = repliesByNote[n.id] || [];
      const draft = replyTextByNote[n.id] || "";
      const saving = replySavingNoteId === n.id;

      return (
        <>
          {/* Reply list */}
          {!reps.length ? (
            <div className="text-xs text-gray-500">No replies yet.</div>
          ) : (
            <div className="space-y-2">
              {reps.map((r) => {
                const who = staffById[r.staff_id];
                const whenR = new Date(r.created_at).toLocaleString("en-AU", {
                  month: "short",
                  day: "numeric",
                  weekday: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                });
                return (
                  <div key={r.id} className="flex items-start gap-2">
                    <img
                      src={who?.photo_url || "/placeholder.png"}
                      alt={who?.name || "Staff"}
                      className="w-6 h-6 rounded-full object-cover mt-0.5"
                      loading="lazy"
                      decoding="async"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-medium text-gray-900">
                          {who?.name ?? "Someone"}
                        </span>
                        <span className="text-[11px] text-gray-500">{whenR}</span>
                      </div>
                      <div className="text-sm whitespace-pre-wrap break-words">
                        {r.body}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

         {/* Reply composer (blocked while resolved) */}
{n.resolved ? (
  <div className="mt-3 border-t border-gray-100 pt-2 text-xs text-gray-600">
    This note is resolved. Reopen it to reply.
  </div>
) : (
  <div className="mt-3 border-t border-gray-100 pt-2">

            <textarea
  value={draft}
  onClick={(e) => {
    e.preventDefault();
    e.stopPropagation();
  }}
  onPointerDown={(e) => {
    e.stopPropagation();
  }}

              onChange={(e) =>
                setReplyTextByNote((prev) => ({ ...prev, [n.id]: e.target.value }))
              }
              rows={2}
              maxLength={500}
              placeholder={
                selectedStaffName
                  ? `Reply as ${selectedStaffName}…`
                  : "Tap your photo, then reply…"
              }
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none leading-snug"
              onKeyDown={(e) => {
                // Enter = post, Shift+Enter = new line
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  postReply(n.id);
                }
              }}
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[11px] text-gray-500">
                Shift+Enter for a new line
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  postReply(n.id);
                }}
                disabled={!draft.trim() || saving || !selectedStaffId}
                className="rounded-lg px-3 py-2 text-sm border border-blue-600 bg-blue-600 text-white disabled:opacity-50"
              >
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

{/* Footer row: comments + reactions */}
<div className="mt-1 flex items-center gap-2 overflow-x-auto whitespace-nowrap">

  {/* Comments / expand toggle */}
  <button
    type="button"
    className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${
      expandedNoteId === n.id
        ? "border-blue-600 bg-blue-50 text-blue-700"
        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
    }`}
    title={expandedNoteId === n.id ? "Hide replies" : "Show replies"}
    aria-label={expandedNoteId === n.id ? "Hide replies" : "Show replies"}
    onClick={(e) => {
      e.preventDefault();
      e.stopPropagation();
      setExpandedNoteId((prev) => (prev === n.id ? null : n.id));
    }}
  >
    <span aria-hidden="true">💬</span>
    <span className="tabular-nums">{(repliesByNote[n.id]?.length || 0)}</span>
  </button>

  {/* Reactions (only when open/unresolved) */}
  {!n.resolved &&
    REACTIONS.map((rx) => {
      const counts = reactionsByNote[n.id]?.counts || {};
      const mine = reactionsByNote[n.id]?.mine || null;
      const active = mine === rx;
      const count = counts[rx] || 0;

      return (
        <button
          key={rx}
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleReaction(n.id, rx);
          }}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${
            active ? "border-blue-600 bg-blue-50" : "border-gray-200 bg-white"
          }`}
        >
          <span>{rx}</span>
          <span className="tabular-nums text-gray-600">{count}</span>
        </button>
      );
    })}
</div>


            </div>
{/* Resolve / Reopen */}
<button
  type="button"
  className={`h-6 inline-flex items-center justify-center rounded-full border px-2 text-[11px] self-start disabled:opacity-40 ${
    n.resolved
      ? "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
      : "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700"
  }`}
  title={n.resolved ? "Reopen note" : "Mark resolved"}
  aria-label={n.resolved ? "Reopen note" : "Mark note resolved"}
  onClick={(e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleResolved(n);
  }}
  disabled={!selectedStaffId}
>
  {n.resolved ? "Reopen" : "Resolve"}
</button>

      {/* Pin / Unpin (SVG icon: green = not pinned, red = pinned) */}
<button
  type="button"
  className={`h-6 w-6 inline-flex items-center justify-center rounded-none self-start disabled:opacity-40 ${
    n.pinned ? "text-red-600 hover:bg-red-50" : "text-green-600 hover:bg-green-50"
  }`}
  title={n.pinned ? "Unpin" : "Pin to top"}
  aria-label={n.pinned ? "Unpin note" : "Pin note"}
  onClick={(e) => {
    e.preventDefault();
    e.stopPropagation();
    togglePin(n);
  }}
  disabled={!selectedStaffId}
>

  {/* Simple pushpin SVG using currentColor */}
 <svg
  viewBox="0 0 24 24"
  aria-hidden="true"
  className="h-3.5 w-3.5"
  fill="currentColor"
>
  {/* Teardrop pin (clearly reads as a pin) */}
  <path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/>
</svg>

</button>




      <button
  type="button"
  className="h-6 w-6 inline-flex items-center justify-center rounded-none text-red-600 self-start hover:bg-red-50 ml-1 disabled:opacity-40"
  title="Delete note"
  aria-label="Delete note"
  onClick={(e) => {
    e.preventDefault();
    e.stopPropagation();
    deleteNote(n);
  }}
  // Only allow the author (current selected staff) to delete from the kiosk
  disabled={!selectedStaffId || selectedStaffId !== n.staff_id}
>

  <span className="text-[13px] leading-none">🗑️</span>
</button>




              </li>
        );
      };

      return (
        <div className="space-y-3">
          {/* Open */}
          <div>
            {showResolved && (
              <div className="mb-2 text-[11px] font-medium text-gray-600">
                Open
              </div>
            )}
            <ul className="space-y-2">
              {openNotes.map(renderNote)}
            </ul>
          </div>

          {/* Resolved */}
                   {showResolved && (
            <div>
              <button
                type="button"
                className="mb-2 w-full flex items-center justify-between text-[11px] font-medium text-gray-600 hover:text-gray-800"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowResolvedSection((v) => !v);
                }}
                aria-expanded={showResolvedSection}
              >
                <span>Resolved ({resolvedNotes.length})</span>
                <span aria-hidden="true">{showResolvedSection ? "▾" : "▸"}</span>
              </button>

              {showResolvedSection && (
                <ul className="space-y-2">
                  {resolvedNotes.map(renderNote)}
                </ul>
              )}
            </div>
          )}

        </div>
      );
    })()
  )}

</div>


  {/* Activity (fills rest of column, scrolls) */}
 <div className="border rounded-xl p-3 bg-white h-[96px] overflow-y-auto nice-scroll">







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
              {showLeadersModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/40" onClick={() => setShowLeadersModal(false)} />
        {/* Card */}
        <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-4 shadow-xl max-h-[85vh] overflow-y-auto">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold">
              Leaderboard — {leadersPeriod === "week" ? "This week" : "This month"}
            </h3>
            <button
              type="button"
              className="h-8 w-8 inline-flex items-center justify-center rounded-full hover:bg-gray-100"
              aria-label="Close"
              onClick={() => setShowLeadersModal(false)}
            >
              ×
            </button>
          </div>

          {(() => {
            const rows = leadersPeriod === "week" ? leadersWeek : leadersMonth;
            if (!rows.length) return <div className="text-sm text-gray-500">No points yet.</div>;
            return (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-600">
                    <th className="py-1 pr-2">#</th>
                    <th className="py-1 pr-2">Name</th>
                    <th className="py-1 text-right">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.staff_id} className="border-t border-gray-100">
                      <td className="py-1 pr-2 text-gray-500">{i + 1}</td>
                      <td className="py-1 pr-2">{r.name}</td>
                      <td className="py-1 text-right tabular-nums">{r.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()}
        </div>
      </div>
    )}

      </div>
    </main>
  );
}
