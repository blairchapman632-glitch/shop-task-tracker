// pages/admin.js
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import supabase from "../lib/supabaseClient"; // works for .js or .ts client

const FREQ_LABELS = {
  daily: "Daily",
  weekly: "Weekly (one or many days)",
  monthly: "Monthly",
  specific_date: "Specific date",
};


const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// --- VALIDATION: all returns stay inside this function ---
function validateTaskForm(f) {
  if (!f.title?.trim()) return { ok: false, msg: "Title is required" };
  if (!f.frequency) return { ok: false, msg: "Frequency is required" };
  if (!f.due_time) return { ok: false, msg: "Due time is required" };

  switch (f.frequency) {
    case "weekly":
      if (!Array.isArray(f.days_of_week) || f.days_of_week.length === 0) {
        return { ok: false, msg: "Choose at least one weekday" };
      }
      break;

    case "monthly":
      if (
        !f.day_of_month ||
        Number(f.day_of_month) < 1 ||
        Number(f.day_of_month) > 31
      ) {
        return { ok: false, msg: "Enter a day of month (1–31)" };
      }
      break;

    case "specific_date":
      if (!f.specific_date) {
        return { ok: false, msg: "Pick a date" };
      }
      break;

    default:
      // daily has no extra fields
      break;
  }

  return { ok: true };
}

// --- VALIDATION (insert below your constants/helpers) ---

// Normalize form → row (omit irrelevant fields)
// Normalize form → DB row (weekly uses days_of_week only)
function mapFormToRow(f) {
  const base = {
    title: f.title.trim(),
    frequency: f.frequency,          // "daily" | "weekly" | "monthly" | "specific_date"
    due_time: f.due_time || null,    // "HH:MM"
    points: Number.isFinite(f.points) ? f.points : 0,
    active: !!f.active,
  };

  if (f.frequency === "weekly") {
    // ONE OR MANY days in a single field
    base.days_of_week = Array.isArray(f.days_of_week) ? f.days_of_week : [];
    base.weekly_day = null;      // no longer used
    base.day_of_month = null;
    base.specific_date = null;
  } else if (f.frequency === "monthly") {
    base.day_of_month = f.day_of_month ? Number(f.day_of_month) : null;
    base.days_of_week = [];
    base.weekly_day = null;
    base.specific_date = null;
  } else if (f.frequency === "specific_date") {
    base.specific_date = f.specific_date || null; // "YYYY-MM-DD"
    base.days_of_week = [];
    base.weekly_day = null;
    base.day_of_month = null;
  } else {
    // daily
    base.days_of_week = [];
    base.weekly_day = null;
    base.day_of_month = null;
    base.specific_date = null;
  }

  return base;
}

function freqPretty(task) {
  const f = task.frequency || null;
  if (!f || !FREQ_LABELS[f]) return "—";
  return FREQ_LABELS[f];
}

function freqDetail(task) {
  const f = task.frequency || null;
  if (!f) return "—";

  if (f === "weekly") {
    const arr = Array.isArray(task.days_of_week) ? task.days_of_week : [];
    return arr.length ? arr.map((n) => DOW[n] ?? "?").join(", ") : "—";
  }
  if (f === "monthly") {
    const d = task.day_of_month;
    return d ? `Day ${d}` : "—";
  }
  if (f === "specific_date") {
    return task.specific_date ?? "—";
  }
  // daily or anything else
  return "—";
}


function timePretty(t) {
  if (!t) return "—";
  // Accepts "HH:MM" or "HH:MM:SS" strings; display HH:MM
  const parts = String(t).split(":");
  return parts.length >= 2 ? `${parts[0]}:${parts[1]}` : t;
}

function Chip({ children, tone = "gray" }) {
  const tones = {
    gray: "bg-gray-100 text-gray-700 border-gray-200",
    green: "bg-green-100 text-green-700 border-green-200",
    red: "bg-red-100 text-red-700 border-red-200",
    blue: "bg-blue-100 text-blue-700 border-blue-200",
    amber: "bg-amber-100 text-amber-800 border-amber-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${tones[tone] || tones.gray}`}
    >
      {children}
    </span>
  );
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState("tasks");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [tasks, setTasks] = useState([]);
  // A4 — Bulk selection
const [selectedIds, setSelectedIds] = useState(new Set());
const [bulkBusy, setBulkBusy] = useState(false);

// 3.3a — Edit modal state
const [editingTask, setEditingTask] = useState(null);   // the row being edited
const [draft, setDraft] = useState({});                 // form values for the modal
const [editSaving, setEditSaving] = useState(false);
const [deletingId, setDeletingId] = useState(null);     // row.id currently being deleted
const [confirmDelete, setConfirmDelete] = useState(null); // holds the row to confirm-delete


  // Filters
  const [q, setQ] = useState("");
  const [freqFilter, setFreqFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState("all");
  
// Modal + form state
const [showTaskModal, setShowTaskModal] = useState(false);
const [taskForm, setTaskForm] = useState({
  id: null,                 // null = new; number/string = editing (later)
  title: "",
  frequency: "daily",       // daily | few_days_per_week | weekly | monthly | specific_date
  days_of_week: [],         // for few_days_per_week: array of [0..6]
  weekly_day: null,         // for weekly: number [0..6]
  day_of_month: "",         // for monthly: 1..31
  specific_date: "",        // for specific_date: "YYYY-MM-DD"
  due_time: "",             // "HH:MM"
  points: 1,
  active: true,
});
useEffect(() => {
  if (!showTaskModal) return;
  const onKey = (e) => e.key === "Escape" && setShowTaskModal(false);
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, [showTaskModal]);
// --- SAVE HANDLER (insert below modal state/effects) ---
const [saving, setSaving] = useState(false);

async function handleSaveTask() {
  // Safe-mode validation: require a title
if (!taskForm?.title || !taskForm.title.trim()) {
  alert("Please enter a task title before saving.");
  return;
}

  const v = validateTaskForm(taskForm);
  if (!v.ok) {
    alert(v.msg); // simple + visible; we’ll replace with a toast later
    return;
  }

  const row = mapFormToRow(taskForm);

  try {
    setSaving(true);

    if (taskForm.id) {
      // EDIT (future step) — not used yet
      const { error } = await supabase
        .from("tasks")
        .update(row)
        .eq("id", taskForm.id);
      if (error) throw error;
    } else {
      // INSERT (this milestone)
      const { error } = await supabase
        .from("tasks")
        .insert([row]);
      if (error) throw error;
    }

    // Close modal and hard refresh to re-query (simple + robust)
    setShowTaskModal(false);
    window.location.reload();
  } catch (err) {
    console.error(err);
    alert(err.message || "Failed to save task");
  } finally {
    setSaving(false);
  }
}

  
  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);
      setErr("");

      // We SELECT * defensively so it won't error if some columns don't exist yet.
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .order("title", { ascending: true });

      if (!isMounted) return;

      if (error) {
        setErr(error.message || "Failed to load tasks");
        setTasks([]);
      } else {
        // Normalise with safe defaults
        const normalized = (data || []).map((t) => ({
          id: t.id,
          title: t.title ?? "",
          active: typeof t.active === "boolean" ? t.active : true,
          points: Number.isFinite(t.points) ? t.points : 1,
          due_time: t.due_time ?? null,
          frequency: t.frequency ?? null,
          days_of_week: t.days_of_week ?? null,
          weekly_day: typeof t.weekly_day === "number" ? t.weekly_day : null,
          day_of_month: t.day_of_month ?? null,
          specific_date: t.specific_date ?? null,
          sort_index: Number.isFinite(t.sort_index) ? t.sort_index : 1000,
        }));

        // Sort primarily by sort_index, then title
        normalized.sort((a, b) => {
          const si = (a.sort_index ?? 1000) - (b.sort_index ?? 1000);
          if (si !== 0) return si;
          return (a.title || "").localeCompare(b.title || "");
        });

        setTasks(normalized);
      }
      setLoading(false);
    }

    load();
    return () => {
      isMounted = false;
    };
  }, []);
// 3.3a — open editor for a row
function openEdit(row) {
  setEditingTask(row);
  setDraft({
    title: row.title || "",
    active: !!row.active,
    points: Number.isFinite(row.points) ? row.points : 1,
    due_time: row.due_time || "",
    frequency: row.frequency || "daily",
    days_of_week: Array.isArray(row.days_of_week) ? row.days_of_week : [],
    weekly_day: typeof row.weekly_day === "number" ? row.weekly_day : null,
    day_of_month: row.day_of_month || null,
    specific_date: row.specific_date || "",
    sort_index: Number.isFinite(row.sort_index) ? row.sort_index : 1000,
  });
}

function closeEdit() {
  setEditingTask(null);
  setDraft({});
}

async function saveEdit() {
  if (!editingTask) return;
  try {
    setEditSaving(true);


    const payload = {
      title: draft.title,
      active: !!draft.active,
      points: Number(draft.points) || 1,
      due_time: draft.due_time || null,
      frequency: draft.frequency || null,
      days_of_week: draft.frequency === "few_days_per_week" ? draft.days_of_week : null,
      weekly_day: draft.frequency === "weekly" ? (draft.weekly_day ?? null) : null,
      day_of_month: draft.frequency === "monthly" ? (Number(draft.day_of_month) || null) : null,
      specific_date: draft.frequency === "specific_date" ? (draft.specific_date || null) : null,
      sort_index: Number.isFinite(Number(draft.sort_index)) ? Number(draft.sort_index) : 1000,
    };
// A3.3b — delete a row with confirm
async function handleDelete(row) {
  if (!row || !row.id) return;
  

  try {
    setDeletingId(row.id);

    const { error } = await supabase.from("tasks").delete().eq("id", row.id);
    if (error) {
      // Friendlier message if there are linked completions blocking delete
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("foreign key") || msg.includes("violates")) {
        alert("Cannot delete this task because it has linked history (completions). Consider deactivating it instead.");
      } else {
        alert(error.message || "Delete failed");
      }
      return;
    }

    // Refresh rows (same normalise/sort as initial load)
    const { data, error: e2 } = await supabase.from("tasks").select("*").order("title", { ascending: true });
    if (e2) throw e2;

    const normalized = (data || []).map((t) => ({
      id: t.id,
      title: t.title ?? "",
      active: typeof t.active === "boolean" ? t.active : true,
      points: Number.isFinite(t.points) ? t.points : 1,
      due_time: t.due_time ?? null,
      frequency: t.frequency ?? null,
      days_of_week: t.days_of_week ?? null,
      weekly_day: typeof t.weekly_day === "number" ? t.weekly_day : null,
      day_of_month: t.day_of_month ?? null,
      specific_date: t.specific_date ?? null,
      sort_index: Number.isFinite(t.sort_index) ? t.sort_index : 1000,
    }));
    normalized.sort((a, b) => {
      const si = (a.sort_index ?? 1000) - (b.sort_index ?? 1000);
      if (si !== 0) return si;
      return (a.title || "").localeCompare(b.title || "");
    });
    setTasks(normalized);
  } catch (err) {
    console.error(err);
    alert(err.message || "Delete failed");
 } finally {
  setDeletingId(null);
  setConfirmDelete(null);
}

}

    const { error } = await supabase.from("tasks").update(payload).eq("id", editingTask.id);
    if (error) throw error;

    // Quick refresh: requery and normalise like initial load
    const { data, error: e2 } = await supabase.from("tasks").select("*").order("title", { ascending: true });
    if (e2) throw e2;

    const normalized = (data || []).map((t) => ({
      id: t.id,
      title: t.title ?? "",
      active: typeof t.active === "boolean" ? t.active : true,
      points: Number.isFinite(t.points) ? t.points : 1,
      due_time: t.due_time ?? null,
      frequency: t.frequency ?? null,
      days_of_week: t.days_of_week ?? null,
      weekly_day: typeof t.weekly_day === "number" ? t.weekly_day : null,
      day_of_month: t.day_of_month ?? null,
      specific_date: t.specific_date ?? null,
      sort_index: Number.isFinite(t.sort_index) ? t.sort_index : 1000,
    }));
    normalized.sort((a, b) => {
      const si = (a.sort_index ?? 1000) - (b.sort_index ?? 1000);
      if (si !== 0) return si;
      return (a.title || "").localeCompare(b.title || "");
    });
    setTasks(normalized);

    closeEdit();
  } catch (err) {
    alert(err.message || String(err));
  } finally {
   setEditSaving(false);
  }
}
// A3.3b — delete by id; return deleted rows so we know it ran
async function handleDeleteTask(taskId) {
  if (!taskId) return;
  try {
    setDeletingId(taskId);

    // Ask PostgREST to return the deleted rows so we can verify
    const { data, error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", taskId)
      .select("id"); // <- IMPORTANT: ensures we get rows back if deletion happened

    if (error) {
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("foreign key") || msg.includes("violates")) {
        alert("Cannot delete this task because it has linked history (completions). Consider deactivating it instead.");
      } else {
        alert(error.message || "Delete failed");
      }
      return;
    }

    // If no row was returned, nothing was deleted (id mismatch / policy)
    if (!data || data.length === 0) {
      alert(`Delete did not remove any rows (id: ${taskId}). Check the id type/permissions.`);
      return;
    }

    // Refresh rows (same normalise/sort as initial load)
    const { data: refreshed, error: e2 } = await supabase
      .from("tasks")
      .select("*")
      .order("title", { ascending: true });
    if (e2) throw e2;

    const normalized = (refreshed || []).map((t) => ({
      id: t.id,
      title: t.title ?? "",
      active: typeof t.active === "boolean" ? t.active : true,
      points: Number.isFinite(t.points) ? t.points : 1,
      due_time: t.due_time ?? null,
      frequency: t.frequency ?? null,
      days_of_week: t.days_of_week ?? null,
      weekly_day: typeof t.weekly_day === "number" ? t.weekly_day : null,
      day_of_month: t.day_of_month ?? null,
      specific_date: t.specific_date ?? null,
      sort_index: Number.isFinite(t.sort_index) ? t.sort_index : 1000,
    }));
    normalized.sort((a, b) => {
      const si = (a.sort_index ?? 1000) - (b.sort_index ?? 1000);
      if (si !== 0) return si;
      return (a.title || "").localeCompare(b.title || "");
    });
    setTasks(normalized);
  } catch (err) {
    console.error(err);
    alert(err.message || "Delete failed");
  } finally {
    setDeletingId(null);
    setConfirmDelete(null);
  }
}

  const filtered = useMemo(() => {
    return tasks
      .filter((t) => {
        // text search
        const okQ = q
          ? (t.title || "").toLowerCase().includes(q.trim().toLowerCase())
          : true;

        // frequency filter
        const okF =
          freqFilter === "all"
            ? true
            : (t.frequency || "none") === freqFilter;

        // active filter
        const okA =
          activeFilter === "all"
            ? true
            : activeFilter === "active"
            ? !!t.active
            : !t.active;

        return okQ && okF && okA;
      })
      .map((t) => t);
  }, [tasks, q, freqFilter, activeFilter]);
// A4 — selection helpers
function toggleOne(id) {
  setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
}
function clearSelection() {
  setSelectedIds(new Set());
}
function toggleSelectAllCurrent() {
  // Uses the current filtered rows (shown in the table)
  setSelectedIds((prev) => {
    const allIds = filtered.map((t) => t.id);
    const allSelected = allIds.length > 0 && allIds.every((id) => prev.has(id));
    if (allSelected) {
      const next = new Set(prev);
      for (const id of allIds) next.delete(id);
      return next;
    } else {
      const next = new Set(prev);
      for (const id of allIds) next.add(id);
      return next;
    }
  });
}

// A4 — common refresh after bulk update
async function refreshTasks() {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .order("title", { ascending: true });
  if (error) throw error;

  const normalized = (data || []).map((t) => ({
    id: t.id,
    title: t.title ?? "",
    active: typeof t.active === "boolean" ? t.active : true,
    points: Number.isFinite(t.points) ? t.points : 1,
    due_time: t.due_time ?? null,
    frequency: t.frequency ?? null,
    days_of_week: t.days_of_week ?? null,
    weekly_day: typeof t.weekly_day === "number" ? t.weekly_day : null,
    day_of_month: t.day_of_month ?? null,
    specific_date: t.specific_date ?? null,
    sort_index: Number.isFinite(t.sort_index) ? t.sort_index : 1000,
  }));
  normalized.sort((a, b) => {
    const si = (a.sort_index ?? 1000) - (b.sort_index ?? 1000);
    if (si !== 0) return si;
    return (a.title || "").localeCompare(b.title || "");
  });
  setTasks(normalized);
}

// A4 — bulk actions
async function handleBulkActivate(activeFlag) {
  const ids = Array.from(selectedIds);
  if (ids.length === 0) { alert("Select at least one task."); return; }
  try {
    setBulkBusy(true);
    const { error } = await supabase.from("tasks").update({ active: !!activeFlag }).in("id", ids);
    if (error) throw error;
    await refreshTasks();
    clearSelection();
  } catch (err) {
    console.error(err);
    alert(err.message || "Bulk update failed");
  } finally {
    setBulkBusy(false);
  }
}

async function handleBulkSetPoints() {
  const ids = Array.from(selectedIds);
  if (ids.length === 0) { alert("Select at least one task."); return; }
  const val = prompt("Set points for selected tasks (number):", "1");
  if (val === null) return; // cancelled
  const points = Number(val);
  if (!Number.isFinite(points) || points < 0) {
    alert("Please enter a valid number (0 or more).");
    return;
  }
  try {
    setBulkBusy(true);
    const { error } = await supabase.from("tasks").update({ points }).in("id", ids);
    if (error) throw error;
    await refreshTasks();
    clearSelection();
  } catch (err) {
    console.error(err);
    alert(err.message || "Bulk update failed");
  } finally {
    setBulkBusy(false);
  }
}
// A4 — bulk set frequency (prompt-driven)
async function handleBulkSetFrequency() {
  const ids = Array.from(selectedIds);
  if (ids.length === 0) { alert("Select at least one task."); return; }

  // 1) Choose frequency
  const freq = prompt(
    'Set frequency: enter one of\n- daily\n- few_days_per_week\n- weekly\n- monthly\n- specific_date',
    'daily'
  );
  if (freq === null) return; // cancel
  const f = String(freq).trim();

  // 2) Collect extra values based on frequency
  let payload = { frequency: f, days_of_week: null, weekly_day: null, day_of_month: null, specific_date: null };

  if (f === 'few_days_per_week') {
    const inp = prompt('Enter days 0-6 separated by commas (0=Sun…6=Sat). Example: 1,3,5 for Mon,Wed,Fri', '1,3,5');
    if (inp === null) return;
    const parts = String(inp).split(',').map(s => s.trim()).filter(Boolean);
    const arr = Array.from(new Set(parts.map(n => parseInt(n,10)).filter(n => Number.isInteger(n) && n>=0 && n<=6))).sort((a,b)=>a-b);
    if (arr.length === 0) { alert('No valid days entered.'); return; }
    payload.days_of_week = arr;
  } else if (f === 'weekly') {
    const d = prompt('Enter weekly day 0-6 (0=Sun…6=Sat)', '1');
    if (d === null) return;
    const val = parseInt(String(d).trim(), 10);
    if (!Number.isInteger(val) || val < 0 || val > 6) { alert('Invalid day.'); return; }
    payload.weekly_day = val;
  } else if (f === 'monthly') {
    const m = prompt('Enter day of month (1–31)', '1');
    if (m === null) return;
    const val = parseInt(String(m).trim(), 10);
    if (!Number.isInteger(val) || val < 1 || val > 31) { alert('Invalid day of month.'); return; }
    payload.day_of_month = val;
  } else if (f === 'specific_date') {
    const dt = prompt('Enter date as YYYY-MM-DD', new Date().toISOString().slice(0,10));
    if (dt === null) return;
    const s = String(dt).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) { alert('Invalid date format.'); return; }
    payload.specific_date = s;
  } else if (f !== 'daily') {
    alert('Unsupported frequency value.');
    return;
  }

  try {
    setBulkBusy(true);
    const { error } = await supabase
      .from('tasks')
      .update(payload)
      .in('id', ids);
    if (error) throw error;

    await refreshTasks();
    clearSelection();
  } catch (err) {
    console.error(err);
    alert(err.message || 'Bulk update failed');
  } finally {
    setBulkBusy(false);
  }
}
// A4 — bulk delete selected
async function handleBulkDelete() {
  const ids = Array.from(selectedIds);
  if (ids.length === 0) { alert("Select at least one task."); return; }

  const ok = typeof window !== 'undefined' &&
             window.confirm(`Delete ${ids.length} selected task(s)? This cannot be undone.`);
  if (!ok) return;

  try {
    setBulkBusy(true);
    const { data, error } = await supabase
      .from('tasks')
      .delete()
      .in('id', ids)
      .select('id'); // return deleted rows so we can verify

    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('foreign key') || msg.includes('violates')) {
        alert('Cannot delete one or more selected tasks because they have linked history (completions). Try deactivating instead.');
      } else {
        alert(error.message || 'Bulk delete failed');
      }
      return;
    }

    if (!data || data.length === 0) {
      alert('No rows were deleted. Check permissions.');
      return;
    }

    await refreshTasks();
    clearSelection();
  } catch (err) {
    console.error(err);
    alert(err.message || 'Bulk delete failed');
  } finally {
    setBulkBusy(false);
  }
}

  const TabButton = ({ id, children, disabled }) => {
    const isActive = activeTab === id;
    const base = "px-4 py-2 rounded-xl text-sm font-medium transition border";
    const onClass = "bg-blue-600 text-white border-blue-600";
    const offClass = "bg-white text-gray-700 border-gray-200 hover:bg-gray-50";
    const disabledClass =
      "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed";
    return (
      <button
        type="button"
        onClick={() => !disabled && setActiveTab(id)}
        className={`${base} ${
          disabled ? disabledClass : isActive ? onClass : offClass
        }`}
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
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-800">
                      Tasks
                    </h2>
                    <p className="text-sm text-gray-500">
                      Read-only list for now. Next milestone adds create/edit.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
             <button
  type="button"
  onClick={() => {
    setTaskForm({
      id: null,
      title: "",
      frequency: "daily",
      days_of_week: [],
      weekly_day: null,
      day_of_month: "",
      specific_date: "",
      due_time: "",
      points: 1,
      active: true,
    });
    setShowTaskModal(true);
  }}
  className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
>
  + New Task
</button>

                    <input
                      type="text"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Search tasks…"
                      className="w-[220px] rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <select
                      className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800"
                      value={freqFilter}
                      onChange={(e) => setFreqFilter(e.target.value)}
                      title="Filter by frequency"
                    >
                      <option value="all">All frequencies</option>
                      <option value="daily">Daily</option>
                      <option value="few_days_per_week">Few days / week</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="specific_date">Specific date</option>
                    </select>
                    <select
                      className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800"
                      value={activeFilter}
                      onChange={(e) => setActiveFilter(e.target.value)}
                      title="Filter by status"
                    >
                      <option value="all">All statuses</option>
                      <option value="active">Active only</option>
                      <option value="inactive">Inactive only</option>
                    </select>
                  </div>
                </div>

                {/* Status / errors */}
                <div className="mt-4">
                  {loading && (
                    <div className="rounded-xl border border-gray-200 p-4 text-sm text-gray-600">
                      Loading tasks…
                    </div>
                  )}
                  {!loading && err && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                      {err}
                    </div>
                  )}
                </div>
{/* A4 — Bulk toolbar */}
{selectedIds.size > 0 && !loading && !err && (
  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm">
    <span className="font-medium">
      {selectedIds.size} selected
    </span>
    <button
      type="button"
      disabled={bulkBusy}
      onClick={() => handleBulkActivate(true)}
      className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 disabled:opacity-60"
    >
      Activate
    </button>
    <button
      type="button"
      disabled={bulkBusy}
      onClick={() => handleBulkActivate(false)}
      className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 disabled:opacity-60"
    >
      Deactivate
    </button>
    <button
      type="button"
      disabled={bulkBusy}
      onClick={handleBulkSetPoints}
<button
  type="button"
  disabled={bulkBusy}
  onClick={handleBulkSetFrequency}
<button
  type="button"
  disabled={bulkBusy}
  onClick={handleBulkDelete}
  className="rounded-lg border border-red-300 bg-white px-2.5 py-1 text-red-700 hover:bg-red-50 disabled:opacity-60"
>
  Delete…
</button>

  className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 disabled:opacity-60"
>
  Set Frequency…
</button>

      className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 disabled:opacity-60"
    >
      Set Points…
    </button>
    <button
      type="button"
      disabled={bulkBusy}
      onClick={clearSelection}
      className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 disabled:opacity-60"
    >
      Clear
    </button>
  </div>
)}

                {/* Table */}
                {!loading && !err && (
                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-600">
                  <th className="w-8 p-2">
  <input
    type="checkbox"
    onChange={() => toggleSelectAllCurrent()}
    checked={filtered.length > 0 && filtered.every((t) => selectedIds.has(t.id))}
    aria-label="Select all on page"
  />
</th>

                          <th className="w-10 p-2">#</th>
                          <th className="p-2">Title</th>
                          <th className="p-2">Frequency</th>
                          <th className="p-2">Days / Date</th>
                          <th className="p-2">Due</th>
                          <th className="p-2">Points</th>
                          <th className="p-2">Active</th>
                  <th className="p-2">Actions</th>

                        </tr>
                      </thead>
                      <tbody>
                        {filtered.length === 0 && (
                          <tr>
                            <td colSpan={7} className="p-6 text-center text-gray-500">
                              No tasks found.
                            </td>
                          </tr>
                        )}
                        {filtered.map((t, i) => (
                          <tr
                            key={t.id || `row-${i}`}
                            className="border-t border-gray-100 hover:bg-gray-50"
                          >
                            <td className="p-2 align-top">
  <input
    type="checkbox"
    checked={selectedIds.has(t.id)}
    onChange={() => toggleOne(t.id)}
    aria-label={`Select ${t.title || "Untitled"}`}
  />
</td>

                              <td className="p-2 align-top text-gray-400">
                              {(t.sort_index ?? 1000) === 1000 ? i + 1 : t.sort_index}
                            </td>
                            <td className="p-2 align-top">
                              <div className="font-medium text-gray-900">{t.title || "Untitled"}</div>
                            </td>
                            <td className="p-2 align-top">
                              <Chip tone="blue">{freqPretty(t)}</Chip>
                            </td>
                            <td className="p-2 align-top text-gray-700">{freqDetail(t)}</td>
                            <td className="p-2 align-top text-gray-700">{timePretty(t.due_time)}</td>
                            <td className="p-2 align-top">
                              <Chip tone="amber">{Number.isFinite(t.points) ? t.points : 1}</Chip>
                            </td>
                            <td className="p-2 align-top">
                              {t.active ? (
                                <Chip tone="green">Active</Chip>
                              ) : (
                                <Chip tone="gray">Inactive</Chip>
                              )}
                            </td>
                               <td className="p-2 align-top whitespace-nowrap">
  <button
    type="button"
    onClick={(e) => { e.preventDefault(); e.stopPropagation(); openEdit(t); }}
    className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
    title="Edit this task"
  >
    Edit
  </button>
  <button
    type="button"
  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmDelete(t); }}


    disabled={deletingId === t.id}
    className="ml-2 rounded-lg border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
    title="Delete this task"
  >
    {deletingId === t.id ? "Deleting…" : "Delete"}
  </button>
</td>

                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Legend */}
                <div className="mt-6 inline-flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  <span>Legend:</span>
                  <Chip tone="blue">Frequency</Chip>
                  <Chip tone="amber">Points</Chip>
                  <Chip tone="green">Active</Chip>
                  <Chip tone="gray">Inactive</Chip>
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
            {showTaskModal && (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center"
    aria-modal="true"
    role="dialog"
  >
    {/* Backdrop */}
    <div
      className="absolute inset-0 bg-black/40"
      onClick={() => setShowTaskModal(false)}
    />

    {/* Modal card */}
    <div className="relative z-10 w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {taskForm.id ? "Edit Task" : "New Task"}
        </h2>
        <button
          className="rounded-md p-1 hover:bg-gray-100"
          onClick={() => setShowTaskModal(false)}
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {/* Form */}
      <div className="space-y-4">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Title</label>
          <input
            value={taskForm.title}
            onChange={(e) => setTaskForm((f) => ({ ...f, title: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
            placeholder="e.g., Mop front area"
          />
        </div>

        {/* Frequency */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Frequency</label>
          <select
  value={taskForm.frequency}
  onChange={(e) => setTaskForm((f) => ({ ...f, frequency: e.target.value }))}
  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
>
  <option value="daily">Daily</option>
  <option value="weekly">Weekly (pick one or many days)</option>
  <option value="monthly">Monthly (choose a date)</option>
  <option value="specific_date">Specific date</option>
</select>

        </div>

        {/* Few days per week: multi-select buttons */}
       

        {/* Weekly: single day select */}
        {taskForm.frequency === "weekly" && (
  <div>
    <label className="block text-sm font-medium text-gray-700">Days of week</label>
    <div className="mt-2 grid grid-cols-7 gap-2 text-sm">
      {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d, idx) => {
        const selected = taskForm.days_of_week.includes(idx);
        return (
          <button
            key={d}
            type="button"
            onClick={() =>
              setTaskForm((f) => ({
                ...f,
                days_of_week: selected
                  ? f.days_of_week.filter((x) => x !== idx)
                  : [...f.days_of_week, idx],
              }))
            }
            className={`rounded-lg border px-2 py-1 ${selected ? "bg-blue-600 text-white border-blue-600" : "bg-white"}`}
          >
            {d}
          </button>
        );
      })}
    </div>
    <p className="mt-1 text-xs text-gray-500">Tip: pick one day for “once a week”, or several days for “multiple days per week”.</p>
  </div>
)}

        {/* Monthly: day number */}
        {taskForm.frequency === "monthly" && (
          <div>
            <label className="block text-sm font-medium text-gray-700">Day of month</label>
            <input
              type="number"
              min={1}
              max={31}
              value={taskForm.day_of_month}
              onChange={(e) => setTaskForm((f) => ({ ...f, day_of_month: e.target.value }))}
              className="mt-1 w-32 rounded-lg border border-gray-300 px-3 py-2"
              placeholder="e.g., 15"
            />
          </div>
        )}

        {/* Specific date */}
        {taskForm.frequency === "specific_date" && (
          <div>
            <label className="block text-sm font-medium text-gray-700">Date</label>
            <input
              type="date"
              value={taskForm.specific_date}
              onChange={(e) => setTaskForm((f) => ({ ...f, specific_date: e.target.value }))}
              className="mt-1 w-56 rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>
        )}

        {/* Due time */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Due time</label>
          <input
            type="time"
            value={taskForm.due_time}
            onChange={(e) => setTaskForm((f) => ({ ...f, due_time: e.target.value }))}
            className="mt-1 w-40 rounded-lg border border-gray-300 px-3 py-2"
          />
        </div>

        {/* Points + Active */}
        <div className="flex items-center gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Points</label>
            <input
              type="number"
              min={0}
              value={taskForm.points}
              onChange={(e) => setTaskForm((f) => ({ ...f, points: Number(e.target.value || 0) }))}
              className="mt-1 w-28 rounded-lg border border-gray-300 px-3 py-2"
            />
          </div>

          <label className="mt-6 inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={taskForm.active}
              onChange={(e) => setTaskForm((f) => ({ ...f, active: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300"
            />
            Active
          </label>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
          onClick={() => setShowTaskModal(false)}
        >
          Cancel
        </button>
        <button
  type="button"
  onClick={handleSaveTask}
  className={`rounded-lg px-3 py-2 text-sm font-medium text-white ${saving ? "bg-blue-400 cursor-wait" : "bg-blue-600 hover:bg-blue-700"}`}
  disabled={saving}
>
  {saving ? "Saving..." : "Save"}
</button>

      </div>
    </div>
  </div>
)}
{/* 3.3a — Edit Modal */}
{editingTask && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <div className="w-full max-w-xl rounded-2xl bg-white shadow-lg">
      <div className="border-b p-4 flex items-center justify-between">
        <h3 className="text-base font-semibold">Edit task</h3>
        <button type="button" onClick={closeEdit} className="rounded-md border px-2 py-1 text-sm">
          Close
        </button>
      </div>

      <div className="p-4 space-y-3">
        {/* Title */}
        <label className="block text-sm">
          <span className="text-gray-700">Title</span>
          <input
            type="text"
            value={draft.title || ""}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>

        {/* Active + Points */}
        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!draft.active}
              onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))}
            />
            Active
          </label>
          <label className="block text-sm">
            <span className="text-gray-700">Points</span>
            <input
              type="number"
              min="0"
              value={draft.points ?? 1}
              onChange={(e) => setDraft((d) => ({ ...d, points: e.target.value }))}
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>
        </div>

        {/* Due time */}
        <label className="block text-sm">
          <span className="text-gray-700">Due time</span>
          <input
            type="time"
            value={draft.due_time || ""}
            onChange={(e) => setDraft((d) => ({ ...d, due_time: e.target.value }))}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>

        {/* Frequency */}
        <label className="block text-sm">
          <span className="text-gray-700">Frequency</span>
          <select
            value={draft.frequency || "daily"}
            onChange={(e) => setDraft((d) => ({ ...d, frequency: e.target.value }))}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          >
            <option value="daily">Daily</option>
            <option value="few_days_per_week">Few days / week</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="specific_date">Specific date</option>
          </select>
        </label>

        {/* Conditional fields */}
        {draft.frequency === "few_days_per_week" && (
          <div className="text-sm">
            <span className="text-gray-700">Days of week</span>
            <div className="mt-1 grid grid-cols-7 gap-2">
              {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((label, idx) => (
                <label key={idx} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Array.isArray(draft.days_of_week) ? draft.days_of_week.includes(idx) : false}
                    onChange={(e) => {
                      setDraft((d) => {
                        const arr = Array.isArray(d.days_of_week) ? [...d.days_of_week] : [];
                        if (e.target.checked) {
                          if (!arr.includes(idx)) arr.push(idx);
                        } else {
                          const pos = arr.indexOf(idx);
                          if (pos >= 0) arr.splice(pos, 1);
                        }
                        return { ...d, days_of_week: arr.sort((a,b)=>a-b) };
                      });
                    }}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        )}

        {draft.frequency === "weekly" && (
          <label className="block text-sm">
            <span className="text-gray-700">Weekly day</span>
            <select
              value={draft.weekly_day ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, weekly_day: e.target.value === "" ? null : Number(e.target.value) }))}
              className="mt-1 w-full rounded-lg border px-3 py-2"
            >
              <option value="">—</option>
              {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((label, idx) => (
                <option key={idx} value={idx}>{label}</option>
              ))}
            </select>
          </label>
        )}

        {draft.frequency === "monthly" && (
          <label className="block text-sm">
            <span className="text-gray-700">Day of month (1–31)</span>
            <input
              type="number"
              min="1" max="31"
              value={draft.day_of_month ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, day_of_month: e.target.value ? Number(e.target.value) : null }))}
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>
        )}

        {draft.frequency === "specific_date" && (
          <label className="block text-sm">
            <span className="text-gray-700">Specific date</span>
            <input
              type="date"
              value={draft.specific_date ? String(draft.specific_date).slice(0,10) : ""}
              onChange={(e) => setDraft((d) => ({ ...d, specific_date: e.target.value }))}
              className="mt-1 w-full rounded-lg border px-3 py-2"
            />
          </label>
        )}

        {/* sort_index */}
        <label className="block text-sm">
          <span className="text-gray-700">Sort index (smaller = higher)</span>
          <input
            type="number"
            value={draft.sort_index ?? 1000}
            onChange={(e) => setDraft((d) => ({ ...d, sort_index: Number(e.target.value) }))}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
      </div>

      <div className="border-t p-4 flex items-center justify-end gap-2">
        <button type="button" onClick={closeEdit} className="rounded-lg border px-3 py-2 text-sm">
          Cancel
        </button>
        <button
          type="button"
          disabled={editSaving}
          onClick={saveEdit}
          className="rounded-lg bg-blue-600 text-white px-3 py-2 text-sm disabled:opacity-60"
        >
          {editSaving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  </div>
)}
{/* A3.3b — Confirm Delete Modal */}
{confirmDelete && (
  <div className="fixed inset-0 z-50 flex items-center justify-center">
    {/* Backdrop */}
    <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmDelete(null)} />

    {/* Dialog */}
    <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-4 shadow-lg">
      <h3 className="text-base font-semibold">Delete task?</h3>
      <p className="mt-2 text-sm text-gray-600">
        “{confirmDelete.title || "Untitled"}” will be permanently removed.
      </p>

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setConfirmDelete(null)}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => handleDeleteTask(confirmDelete.id)}

          disabled={deletingId === confirmDelete.id}
          className="rounded-lg bg-red-600 text-white px-3 py-2 text-sm disabled:opacity-60"
        >
          {deletingId === confirmDelete.id ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  </div>
)}

      </main>
    </div>
  );
}
