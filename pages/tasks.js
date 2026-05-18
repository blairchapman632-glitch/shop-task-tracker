import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import supabase from "../lib/supabaseClient";

// ─── Helpers ────────────────────────────────────────────────────────────────

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const FREQUENCIES = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly (specific date)" },
  { value: "monthly_anytime", label: "Monthly (anytime)" },
  { value: "specific_date", label: "One-off date" },
];

const freqLabel = (task) => {
  const f = task.frequency;
  if (f === "daily") return "Daily";
  if (f === "weekly") {
    const arr = Array.isArray(task.days_of_week) ? task.days_of_week : [];
    return arr.length ? arr.map((d) => DOW[d]).join("/") : "Weekly";
  }
  if (f === "monthly") return `Day ${task.day_of_month}`;
  if (f === "monthly_anytime") return "Monthly";
  if (f === "specific_date") return task.specific_date?.slice(0, 10) || "One-off";
  return f || "—";
};

const timePretty = (t) => {
  if (!t) return "—";
  const parts = String(t).split(":");
  return `${parts[0]}:${parts[1]}`;
};

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function Sidebar() {
  return (
    <aside className="w-[200px] min-w-[200px] h-screen bg-white border-r flex flex-col py-4 px-3 gap-1 shrink-0">
      <div className="text-sm font-bold text-gray-800 px-2 mb-3">Byford Pharmacy</div>
      <NavLink href="/" icon="🏠" label="Home" />
      <NavLink href="/roster" icon="📅" label="Roster" />
      <NavLink href="/insights" icon="📊" label="Insights" />
      <NavLink href="/tasks" icon="✅" label="Tasks" active />
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

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({ message }) {
  return <div className="text-sm text-gray-400 py-8 text-center">{message}</div>;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TasksPage() {
  const router = useRouter();

  // ── Auth ──
  const [authChecked, setAuthChecked] = useState(false);
  const [currentPharmacyId, setCurrentPharmacyId] = useState(null);

  // ── Data ──
  const [tasks, setTasks] = useState([]);
  const [staffOptions, setStaffOptions] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── UI ──
  const [activeTab, setActiveTab] = useState("general");
  const [searchQ, setSearchQ] = useState("");
  const [showPanel, setShowPanel] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // ── Form state ──
  const emptyForm = {
    title: "",
    frequency: "daily",
    days_of_week: [],
    day_of_month: "",
    specific_date: "",
    start_date: "",
    end_date: "",
    due_time: "",
    points: 1,
    info: "",
    active: true,
    rollover: false,
    assigned_staff_id: "",
  };
  const [form, setForm] = useState(emptyForm);

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

  // ── Load data ──
  useEffect(() => {
    if (!authChecked || !currentPharmacyId) return;
    const load = async () => {
      setLoading(true);
      const [{ data: taskData }, { data: staffData }] = await Promise.all([
        supabase.from("tasks").select("*").eq("pharmacy_id", currentPharmacyId).order("title", { ascending: true }),
        supabase.from("staff").select("id, name").eq("pharmacy_id", currentPharmacyId).eq("active", true).order("name"),
      ]);
      setTasks(taskData || []);
      setStaffOptions(staffData || []);
      setLoading(false);
    };
    load();
  }, [authChecked, currentPharmacyId]);

  const refreshTasks = async () => {
    const { data } = await supabase.from("tasks").select("*").eq("pharmacy_id", currentPharmacyId).order("title", { ascending: true });
    setTasks(data || []);
  };

  // Pre-load sections when pharmacy is available
  useEffect(() => {
    if (currentPharmacyId) {
      loadSections(currentPharmacyId);
    }
  }, [currentPharmacyId]);

  // ── Filtered tasks ──
  const generalTasks = useMemo(() => tasks.filter((t) =>
    !t.assigned_staff_id &&
    (t.frequency === "daily" || t.frequency === "weekly") &&
    (searchQ ? t.title.toLowerCase().includes(searchQ.toLowerCase()) : true)
  ), [tasks, searchQ]);

  const assignedTasks = useMemo(() => tasks.filter((t) =>
    (t.assigned_staff_id || t.frequency === "monthly_anytime" || t.frequency === "specific_date" || t.start_date) &&
    !(t.frequency === "daily" || t.frequency === "weekly") &&
    (searchQ ? t.title.toLowerCase().includes(searchQ.toLowerCase()) : true)
  ), [tasks, searchQ]);

  // ── Section cleans state ──
  const [sections, setSections] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [editingSection, setEditingSection] = useState(null);
  const [editSectionName, setEditSectionName] = useState("");
  const [editSectionStaffId, setEditSectionStaffId] = useState("");
  const [editSectionNotes, setEditSectionNotes] = useState("");
  const [editSectionPoints, setEditSectionPoints] = useState(3);
  const [savingSection, setSavingSection] = useState(false);
  const [deletingSection, setDeletingSection] = useState(null);
  const [togglingCell, setTogglingCell] = useState(null);
  const [showAddSection, setShowAddSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [newSectionStaffId, setNewSectionStaffId] = useState("");
  const [newSectionNotes, setNewSectionNotes] = useState("");
  const [newSectionPoints, setNewSectionPoints] = useState(3);
  const [savingNewSection, setSavingNewSection] = useState(false);

  const MONTHS = [
    { label: "Jan", value: "2026-01-01" },
    { label: "Feb", value: "2026-02-01" },
    { label: "Mar", value: "2026-03-01" },
    { label: "Apr", value: "2026-04-01" },
    { label: "May", value: "2026-05-01" },
    { label: "Jun", value: "2026-06-01" },
    { label: "Jul", value: "2026-07-01" },
    { label: "Aug", value: "2026-08-01" },
    { label: "Sep", value: "2026-09-01" },
    { label: "Oct", value: "2026-10-01" },
    { label: "Nov", value: "2026-11-01" },
    { label: "Dec", value: "2026-12-01" },
  ];

  const loadSections = async (pharmId) => {
    const pid = pharmId || currentPharmacyId;
    if (!pid) return;
    setSectionsLoading(true);
    const [{ data: sectionData }, { data: scheduleData }] = await Promise.all([
      supabase.from("sections").select("*, staff:assigned_staff_id(id, name)").eq("pharmacy_id", pid).order("name"),
      supabase.from("section_clean_schedule").select("*").eq("pharmacy_id", pid),
    ]);
    
    setSections(sectionData || []);
    setSchedule(scheduleData || []);
    setSectionsLoading(false);
  };

  useEffect(() => {
    if (activeTab === "sections" && currentPharmacyId) {
      loadSections(currentPharmacyId);
    }
  }, [activeTab, currentPharmacyId]);

  const isScheduled = (sectionId, month) =>
    schedule.some((s) => s.section_id === sectionId && s.month === month);

  const isCompleted = (sectionId, month) =>
    schedule.some((s) => s.section_id === sectionId && s.month === month && s.completed_at);

  const handleToggleSchedule = async (sectionId, month) => {
    const key = `${sectionId}-${month}`;
    setTogglingCell(key);
    try {
      const existing = schedule.find((s) => s.section_id === sectionId && s.month === month);
      if (existing) {
        if (existing.completed_at) {
          if (!window.confirm("This section is already completed. Remove it from the schedule?")) return;
        }
        await supabase.from("section_clean_schedule").delete().eq("id", existing.id);
        setSchedule((prev) => prev.filter((s) => s.id !== existing.id));
      } else {
        const { data } = await supabase.from("section_clean_schedule").insert([{
          section_id: sectionId,
          month,
          pharmacy_id: currentPharmacyId,
        }]).select().single();
        setSchedule((prev) => [...prev, data]);
      }
    } catch (err) {
      alert("Couldn't update schedule: " + (err?.message || String(err)));
    } finally {
      setTogglingCell(null);
    }
  };

  const handleUpdateSection = async () => {
    if (!editingSection) return;
    if (!editSectionName.trim()) { alert("Please enter a section name."); return; }
    try {
      setSavingSection(true);
      await supabase.from("sections").update({
        name: editSectionName.trim(),
        assigned_staff_id: editSectionStaffId ? Number(editSectionStaffId) : null,
        notes: editSectionNotes.trim() || null,
        points: Number(editSectionPoints) || 3,
      }).eq("id", editingSection.id);
      await loadSections(currentPharmacyId);
      setEditingSection(null);
    } catch (err) {
      alert("Couldn't update section: " + (err?.message || String(err)));
    } finally {
      setSavingSection(false);
    }
  };

  const handleDeleteSection = async (section) => {
    if (!window.confirm(`Delete "${section.name}"? This will also remove it from all schedules.`)) return;
    try {
      setDeletingSection(section.id);
      await supabase.from("section_clean_schedule").delete().eq("section_id", section.id);
      await supabase.from("sections").delete().eq("id", section.id);
      await loadSections(currentPharmacyId);
    } catch (err) {
      alert("Couldn't delete section: " + (err?.message || String(err)));
    } finally {
      setDeletingSection(null);
    }
  };

  const handleAddSection = async () => {
    if (!newSectionName.trim()) { alert("Please enter a section name."); return; }
    try {
      setSavingNewSection(true);
      await supabase.from("sections").insert([{
        name: newSectionName.trim(),
        assigned_staff_id: newSectionStaffId ? Number(newSectionStaffId) : null,
        notes: newSectionNotes.trim() || null,
        points: Number(newSectionPoints) || 3,
        pharmacy_id: currentPharmacyId,
        active: true,
      }]);
      await loadSections(currentPharmacyId);
      setNewSectionName("");
      setNewSectionStaffId("");
      setNewSectionNotes("");
      setShowAddSection(false);
    } catch (err) {
      alert("Couldn't add section: " + (err?.message || String(err)));
    } finally {
      setSavingNewSection(false);
    }
  };

  const thisMonth = new Date().toISOString().slice(0, 7) + "-01";
  const thisMonthSections = schedule.filter((s) => s.month === thisMonth);

  // ── Open panel ──
  const openAdd = () => {
    setEditingTask(null);
    setForm({ ...emptyForm, frequency: activeTab === "general" ? "daily" : "monthly_anytime" });
    setShowPanel(true);
  };

  const openEdit = (task) => {
    setEditingTask(task);
    setForm({
      title: task.title || "",
      frequency: task.frequency || "daily",
      days_of_week: Array.isArray(task.days_of_week) ? task.days_of_week : [],
      day_of_month: task.day_of_month || "",
      specific_date: task.specific_date?.slice(0, 10) || "",
      start_date: task.start_date?.slice(0, 10) || "",
      end_date: task.end_date?.slice(0, 10) || "",
      due_time: task.due_time?.slice(0, 5) || "",
      points: task.points ?? 1,
      info: task.info || "",
      active: task.active !== false,
      rollover: task.rollover || false,
      assigned_staff_id: task.assigned_staff_id ? String(task.assigned_staff_id) : "",
    });
    setShowPanel(true);
  };

  const closePanel = () => {
    setShowPanel(false);
    setEditingTask(null);
    setForm(emptyForm);
  };

  // ── Save task ──
  const handleSave = async () => {
    if (!form.title.trim()) { alert("Please enter a title."); return; }
    try {
      setSaving(true);
      const payload = {
        title: form.title.trim(),
        frequency: form.frequency,
        days_of_week: form.frequency === "weekly" ? form.days_of_week : [],
        day_of_month: form.frequency === "monthly" ? Number(form.day_of_month) || null : null,
        specific_date: form.frequency === "specific_date" ? form.specific_date || null : null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        due_time: form.due_time || null,
        points: Number(form.points) || 1,
        info: form.info.trim() || null,
        active: form.active,
        rollover: form.rollover,
        assigned_staff_id: form.assigned_staff_id ? Number(form.assigned_staff_id) : null,
      };

      if (editingTask) {
        const { error } = await supabase.from("tasks").update(payload).eq("id", editingTask.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tasks").insert([{ ...payload, pharmacy_id: currentPharmacyId }]);
        if (error) throw error;
      }
      await refreshTasks();
      closePanel();
    } catch (err) {
      alert("Couldn't save task: " + (err?.message || String(err)));
    } finally {
      setSaving(false);
    }
  };

  // ── Delete task ──
  const handleDelete = async (task) => {
    if (!window.confirm(`Delete "${task.title}"? This cannot be undone.`)) return;
    try {
      setDeletingId(task.id);
      await supabase.from("completions").delete().eq("task_id", task.id);
      const { error } = await supabase.from("tasks").delete().eq("id", task.id);
      if (error) throw error;
      await refreshTasks();
    } catch (err) {
      alert("Couldn't delete task: " + (err?.message || String(err)));
    } finally {
      setDeletingId(null);
    }
  };

  // ── Toggle active ──
  const handleToggleActive = async (task) => {
    try {
      await supabase.from("tasks").update({ active: !task.active }).eq("id", task.id);
      await refreshTasks();
    } catch (err) {
      alert("Couldn't update task: " + (err?.message || String(err)));
    }
  };

  if (!authChecked || !currentPharmacyId) {
    return <div className="p-6 text-sm text-gray-500">Loading...</div>;
  }

  const staffById = Object.fromEntries(staffOptions.map((s) => [s.id, s]));

  // ── Task row ──
  const TaskRow = ({ task }) => (
    <tr className="border-t border-gray-100 hover:bg-gray-50">
      <td className="px-3 py-2">
        <div className="font-medium text-sm text-gray-800">{task.title}</div>
        {task.info && <div className="text-xs text-gray-400 truncate max-w-[200px]">{task.info}</div>}
      </td>
      {activeTab === "assigned" && (
        <td className="px-3 py-2 text-sm text-gray-600">
          {task.assigned_staff_id ? (
            <span className="font-medium text-blue-700">{staffById[task.assigned_staff_id]?.name || "—"}</span>
          ) : <span className="text-gray-400">Anyone</span>}
        </td>
      )}
      <td className="px-3 py-2 text-sm text-gray-600">{freqLabel(task)}</td>
      <td className="px-3 py-2 text-sm text-gray-600">{timePretty(task.due_time)}</td>
      <td className="px-3 py-2 text-sm text-gray-600">{task.points ?? 1}</td>
      {activeTab === "assigned" && (
        <td className="px-3 py-2 text-xs">
          {task.rollover ? <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded-full">Rollover</span> : "—"}
        </td>
      )}
      <td className="px-3 py-2">
        <button
          onClick={() => handleToggleActive(task)}
          className={`text-xs px-2 py-0.5 rounded-full border ${task.active ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-100 text-gray-500 border-gray-200"}`}
        >
          {task.active ? "Active" : "Inactive"}
        </button>
      </td>
      <td className="px-3 py-2">
        <div className="flex gap-1">
          <button onClick={() => openEdit(task)} className="px-2 py-1 text-xs border border-blue-200 text-blue-600 rounded hover:bg-blue-50">Edit</button>
          <button onClick={() => handleDelete(task)} disabled={deletingId === task.id} className="px-2 py-1 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50 disabled:opacity-50">
            {deletingId === task.id ? "..." : "Delete"}
          </button>
        </div>
      </td>
    </tr>
  );

  // ── Render ──
  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-white border-b px-6 py-4 shrink-0">
          <h1 className="text-xl font-bold text-gray-800 mb-3">Tasks</h1>

          {/* Tabs + actions */}
          <div className="flex items-center gap-1">
            {[
              { key: "general", label: "General Tasks" },
              { key: "assigned", label: "Assigned & Monthly" },
              { key: "sections", label: "Section Cleans" },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.key ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
              >
                {tab.label}
              </button>
            ))}

            <button onClick={openAdd} className="px-4 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700">
              + New Task
            </button>

            <div className="ml-auto">
              <input
                type="text"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Search tasks..."
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white w-48 focus:outline-none focus:ring-1 focus:ring-blue-300"
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {loading && activeTab !== "sections" ? (
            <div className="text-sm text-gray-400 py-8 text-center">Loading tasks...</div>
          ) : activeTab === "sections" ? (
            <div className="space-y-4">

              {/* This month summary */}
              <div className="bg-white rounded-xl border p-4">
                <div className="text-sm font-semibold text-gray-700 mb-3">
                  This Month — {new Date().toLocaleString("en-AU", { month: "long", year: "numeric" })}
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    {thisMonthSections.filter((s) => s.completed_at).length}/{thisMonthSections.length} completed
                  </span>
                </div>
                {thisMonthSections.length === 0 ? (
                  <div className="text-sm text-gray-400">No sections scheduled this month.</div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {thisMonthSections.map((s) => {
                      const section = sections.find((sec) => sec.id === s.section_id);
                      if (!section) return null;
                      return (
                        <div key={s.id} className={`px-2 py-1 rounded-lg border text-xs ${s.completed_at ? "bg-green-50 border-green-200 text-green-700" : "bg-blue-50 border-blue-200 text-blue-700"}`}>
                          {s.completed_at ? "✓ " : ""}{section.name}
                          {section.staff?.name && <span className="text-[10px] ml-1 opacity-70">({section.staff.name})</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Year schedule grid */}
              <div className="bg-white rounded-xl border overflow-hidden">
                <div className="px-4 py-3 border-b flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-gray-700">2026 Schedule</div>
                    <div className="text-xs text-gray-400 mt-0.5">Click a cell to add/remove a section from that month</div>
                  </div>
                  <button
                    onClick={() => { setShowAddSection((v) => !v); setNewSectionName(""); setNewSectionStaffId(""); setNewSectionNotes(""); }}
                    className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700"
                  >
                    + Add Section
                  </button>
                </div>

                {/* Add section form */}
                {showAddSection && (
                  <div className="px-4 py-3 border-b bg-green-50 space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newSectionName}
                        onChange={(e) => setNewSectionName(e.target.value)}
                        placeholder="Section name"
                        className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
                      />
                      <select
                        value={newSectionStaffId}
                        onChange={(e) => setNewSectionStaffId(e.target.value)}
                        className="rounded border border-gray-300 px-2 py-1.5 text-sm"
                      >
                        <option value="">All staff</option>
                        {staffOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                    <textarea
                      value={newSectionNotes}
                      onChange={(e) => setNewSectionNotes(e.target.value)}
                      placeholder="Notes (optional) — shown to staff when cleaning"
                      rows={2}
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm resize-none"
                    />
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-600 font-medium">Points:</label>
                      <input
                        type="number"
                        min={0}
                        value={newSectionPoints}
                        onChange={(e) => setNewSectionPoints(e.target.value)}
                        className="w-20 rounded border border-gray-300 px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setShowAddSection(false)} className="px-3 py-1.5 text-xs border rounded hover:bg-gray-50">Cancel</button>
                      <button onClick={handleAddSection} disabled={savingNewSection} className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
                        {savingNewSection ? "Saving..." : "Add Section"}
                      </button>
                    </div>
                  </div>
                )}
                {sectionsLoading ? (
                  <div className="text-sm text-gray-400 py-8 text-center">Loading...</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-gray-600 w-48">Section</th>
                          <th className="px-2 py-2 text-left font-semibold text-gray-500 w-24">Assigned To</th>
                          {MONTHS.map((m) => (
                            <th key={m.value} className={`px-1 py-2 text-center font-semibold w-10 ${m.value === thisMonth ? "text-blue-600" : "text-gray-500"}`}>
                              {m.label}
                            </th>
                          ))}
                          <th className="px-3 py-2 text-left font-semibold text-gray-500">Staff</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sections.map((section) => {
                          const isEditingThis = editingSection?.id === section.id;
                          return (
                            <React.Fragment key={section.id}>
                              <tr className={`border-t ${isEditingThis ? "bg-blue-50" : "hover:bg-gray-50"}`}>
                                <td className="px-3 py-1.5 font-medium text-gray-800">{section.name}</td>
                                <td className="px-2 py-1.5 text-gray-500">{section.staff?.name || <span className="text-gray-300">All staff</span>}</td>
                                {MONTHS.map((m) => {
                                  const scheduled = isScheduled(section.id, m.value);
                                  const completed = isCompleted(section.id, m.value);
                                  const key = `${section.id}-${m.value}`;
                                  const isToggling = togglingCell === key;
                                  return (
                                    <td key={m.value} className="px-1 py-1.5 text-center">
                                      <button
                                        onClick={() => handleToggleSchedule(section.id, m.value)}
                                        disabled={isToggling}
                                        className={`w-7 h-7 rounded text-[10px] font-medium transition-colors ${
                                          completed ? "bg-green-500 text-white" :
                                          scheduled ? "bg-blue-400 text-white" :
                                          "bg-gray-100 text-gray-300 hover:bg-gray-200"
                                        } ${m.value === thisMonth ? "ring-1 ring-blue-300" : ""}`}
                                      >
                                        {isToggling ? "..." : completed ? "✓" : scheduled ? "●" : ""}
                                      </button>
                                    </td>
                                  );
                                })}
                                <td className="px-3 py-1.5">
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => {
                                        if (isEditingThis) { setEditingSection(null); return; }
                                        setEditingSection(section);
                                        setEditSectionName(section.name);
                                        setEditSectionStaffId(section.assigned_staff_id ? String(section.assigned_staff_id) : "");
                                        setEditSectionNotes(section.notes || "");
                                        setEditSectionPoints(section.points ?? 3);
                                      }}
                                      className={`text-[10px] font-medium ${isEditingThis ? "text-gray-500 hover:text-gray-700" : "text-blue-500 hover:text-blue-700"}`}
                                    >
                                      {isEditingThis ? "Cancel" : "Edit"}
                                    </button>
                                    {!isEditingThis && (
                                      <button
                                        onClick={() => handleDeleteSection(section)}
                                        disabled={deletingSection === section.id}
                                        className="text-[10px] text-red-400 hover:text-red-600 disabled:opacity-50"
                                      >
                                        {deletingSection === section.id ? "..." : "Del"}
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>

                              {/* Inline edit row */}
                              {isEditingThis && (
                                <tr className="bg-blue-50 border-t border-blue-100">
                                  <td colSpan={15} className="px-4 py-3">
                                    <div className="space-y-2">
                                      <div className="flex gap-2">
                                        <input
                                          type="text"
                                          value={editSectionName}
                                          onChange={(e) => setEditSectionName(e.target.value)}
                                          placeholder="Section name"
                                          className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
                                          autoFocus
                                        />
                                        <select
                                          value={editSectionStaffId}
                                          onChange={(e) => setEditSectionStaffId(e.target.value)}
                                          className="rounded border border-gray-300 px-2 py-1.5 text-sm"
                                        >
                                          <option value="">All staff</option>
                                          {staffOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                        </select>
                                      </div>
                                      <textarea
                                        value={editSectionNotes}
                                        onChange={(e) => setEditSectionNotes(e.target.value)}
                                        placeholder="Notes (optional) — shown to staff when cleaning"
                                        rows={2}
                                        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm resize-none"
                                      />
                                      <div className="flex items-center gap-2">
                                        <label className="text-xs text-gray-600 font-medium">Points:</label>
                                        <input
                                          type="number"
                                          min={0}
                                          value={editSectionPoints}
                                          onChange={(e) => setEditSectionPoints(e.target.value)}
                                          className="w-20 rounded border border-gray-300 px-2 py-1.5 text-sm"
                                        />
                                      </div>
                                      <div className="flex gap-2 justify-end">
                                        <button onClick={() => setEditingSection(null)} className="px-3 py-1.5 text-xs border rounded bg-white hover:bg-gray-50">Cancel</button>
                                        <button onClick={handleUpdateSection} disabled={savingSection} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                                          {savingSection ? "Saving..." : "Save changes"}
                                        </button>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>

                    
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Task</th>
                    {activeTab === "assigned" && <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Assigned To</th>}
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Frequency</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Due Time</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Points</th>
                    {activeTab === "assigned" && <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Rollover</th>}
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {activeTab === "general" && (
                    generalTasks.length === 0
                      ? <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400 text-sm">No general tasks yet.</td></tr>
                      : generalTasks.map((t) => <TaskRow key={t.id} task={t} />)
                  )}
                  {activeTab === "assigned" && (
                    assignedTasks.length === 0
                      ? <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400 text-sm">No assigned or monthly tasks yet.</td></tr>
                      : assignedTasks.map((t) => <TaskRow key={t.id} task={t} />)
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Side panel ── */}
      {showPanel && (
        <div className="fixed inset-0 z-40 flex">
          <div className="flex-1 bg-black/20" onClick={closePanel} />
          <div className="w-full max-w-md bg-white shadow-2xl flex flex-col h-full overflow-hidden">

            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
              <h2 className="font-semibold text-gray-900">{editingTask ? "Edit Task" : "New Task"}</h2>
              <button onClick={closePanel} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">

              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Clean OTC section"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>

              {/* Assign to staff */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Assign to staff (optional)</label>
                <select
                  value={form.assigned_staff_id}
                  onChange={(e) => setForm((f) => ({ ...f, assigned_staff_id: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Anyone (unassigned)</option>
                  {staffOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              {/* Frequency */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Frequency</label>
                <select
                  value={form.frequency}
                  onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>

              {/* Weekly days */}
              {form.frequency === "weekly" && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Days of week</label>
                  <div className="grid grid-cols-7 gap-1">
                    {DOW.map((d, idx) => {
                      const selected = form.days_of_week.includes(idx);
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setForm((f) => ({
                            ...f,
                            days_of_week: selected
                              ? f.days_of_week.filter((x) => x !== idx)
                              : [...f.days_of_week, idx],
                          }))}
                          className={`rounded-lg border py-1 text-xs ${selected ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600"}`}
                        >
                          {d.slice(0, 2)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Monthly specific day */}
              {form.frequency === "monthly" && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Day of month (1–31)</label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={form.day_of_month}
                    onChange={(e) => setForm((f) => ({ ...f, day_of_month: e.target.value }))}
                    className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              )}

              {/* Specific date */}
              {form.frequency === "specific_date" && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Date</label>
                  <input
                    type="date"
                    value={form.specific_date}
                    onChange={(e) => setForm((f) => ({ ...f, specific_date: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              )}

              {/* Start + End date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Start date (optional)</label>
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">End/due date (optional)</label>
                  <input
                    type="date"
                    value={form.end_date}
                    onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {/* Due time */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Due time (optional)</label>
                <input
                  type="time"
                  value={form.due_time}
                  onChange={(e) => setForm((f) => ({ ...f, due_time: e.target.value }))}
                  className="w-40 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>

              {/* Points */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Points</label>
                <input
                  type="number"
                  min={0}
                  value={form.points}
                  onChange={(e) => setForm((f) => ({ ...f, points: e.target.value }))}
                  className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Notes / description</label>
                <textarea
                  value={form.info}
                  onChange={(e) => setForm((f) => ({ ...f, info: e.target.value }))}
                  rows={3}
                  placeholder="Description shown to staff when they tap ℹ️"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none"
                />
              </div>

              {/* Rollover */}
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.rollover}
                    onChange={(e) => setForm((f) => ({ ...f, rollover: e.target.checked }))}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="text-gray-700">Roll over if not completed</span>
                </label>
              </div>

              {/* Active */}
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="text-gray-700">Active</span>
                </label>
              </div>

            </div>

            {/* Panel footer */}
            <div className="border-t px-4 py-3 shrink-0 flex justify-between gap-2">
              <button onClick={closePanel} className="px-3 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? "Saving..." : editingTask ? "Save changes" : "Add task"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}