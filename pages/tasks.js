import React, { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/router";
import supabase from "../lib/supabaseClient";
import Sidebar from "../components/Sidebar";
import ConsumablesAdmin from "../components/ConsumablesAdmin";
import { CHECKLIST_TYPES } from "../lib/consumables";
import { ensureSectionYear, monthsOf, perthYear, perthMonthStart } from "../lib/sectionCleans";
import { hasShowFrom, showFromLabel, LAST_DAY } from "../lib/taskPeriods";

// ─── Helpers ────────────────────────────────────────────────────────────────

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const FREQUENCIES = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly (specific date)" },
  { value: "monthly_anytime", label: "Monthly (anytime)" },
  { value: "specific_date", label: "One-off date" },
];

const ON_LIST_FREQUENCIES = [
  { value: "monthly_anytime", label: "Monthly" },
  { value: "weekly", label: "Weekly" },
  { value: "specific_date", label: "One-off date" },
  { value: "next_shift", label: "Next shift — show when staff member is next rostered" },
];

const freqLabel = (task) => {
  const f = task.frequency;
  if (f === "daily") return "Daily";
  if (f === "weekly") {
    const arr = Array.isArray(task.days_of_week) ? task.days_of_week : [];
    return arr.length ? arr.map((d) => DOW[d]).join("/") : "Weekly";
  }
  if (f === "monthly") return `Day ${task.day_of_month}`;
  if (f === "monthly_anytime") {
    // On the List monthly with a show-from day: "Monthly · from 15th" / "Monthly · last day"
    return hasShowFrom(task) ? `Monthly · ${showFromLabel(task.day_of_month)}` : "Monthly";
  }
  if (f === "specific_date") return task.specific_date?.slice(0, 10) || "One-off";
  return f || "—";
};

const timePretty = (t) => {
  if (!t) return "—";
  const parts = String(t).split(":");
  return `${parts[0]}:${parts[1]}`;
};

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
  const [pinEntered, setPinEntered] = useState(false);
  const [pinStaffId, setPinStaffId] = useState(null);
  // ?tab=consumables&sheet=<id> (link in the owner's push notification) opens that month's checklist
  const [initialSheetId, setInitialSheetId] = useState(null);
  useEffect(() => {
    if (!router.isReady) return;
    if (router.query.tab === "checklists" || router.query.tab === "consumables") setActiveTab("checklists");
    if (router.query.sheet) setInitialSheetId(String(router.query.sheet));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);

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
    assigned_role: "",
    assigned_staff_ids: [],
    assign_type: "anyone",
    show_next_shift: false,
    created_by_staff_id: "",
    checklist_type: "",
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
const handlePinSubmit = async () => {
    const { data, error } = await supabase
      .from("staff")
      .select("id")
      .eq("pharmacy_id", "81ab394f-d642-4246-b896-e71938b25671")
      .eq("pin", pinInput)
      .eq("can_access_tasks", true)
      .single();
    if (data && !error) {
      setPinEntered(true);
      setPinStaffId(data.id); // who's using the page (Consumables: the owner's "Ordered" ticks)
      setPinError(false);
    } else {
      setPinError(true);
      setPinInput("");
    }
  };
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
    t.task_type !== "on_the_list" &&
    (searchQ ? t.title.toLowerCase().includes(searchQ.toLowerCase()) : true)
  ), [tasks, searchQ]);

  // On the List tasks are split across two tabs (organisation only — the kiosk, Insights and completions are unchanged):
  //   "Assigned jobs"   = one-off (a specific date, or next shift)
  //   "Recurring tasks" = monthly / day-of-month / weekly
  const isRecurringOnList = (t) => !t.show_next_shift && ["monthly_anytime", "monthly", "weekly"].includes(t.frequency);
  const matchesSearch = (t) => (searchQ ? t.title.toLowerCase().includes(searchQ.toLowerCase()) : true);
  const assignedJobs = useMemo(() => tasks.filter((t) =>
    t.task_type === "on_the_list" && !isRecurringOnList(t) && matchesSearch(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [tasks, searchQ]);
  const recurringTasks = useMemo(() => tasks.filter((t) =>
    t.task_type === "on_the_list" && isRecurringOnList(t) && matchesSearch(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [tasks, searchQ]);
  // Both On the List tabs share the same form, columns and saving
  const onListTab = activeTab === "assigned" || activeTab === "recurring";

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
  const [dragItem, setDragItem] = useState(null); // { scheduleId, sectionId, fromMonth, fromStaffId, sectionName }
  const [dragOverCell, setDragOverCell] = useState(null); // { month, staffId }

  // Year shown in the Distribution + Schedule grids (‹ › arrows). Defaults to the current year in Perth.
  const [sectionYear, setSectionYear] = useState(() => perthYear());
  const MONTHS = monthsOf(sectionYear);
  const [sectionStaff, setSectionStaff] = useState([]);       // active, non-Locum staff (Sections panel / + Add staff)
  const [sectionsPanel, setSectionsPanel] = useState(null);   // { staffId, name } — the "Sections" panel is open for them
  const [panelTicks, setPanelTicks] = useState(new Set());    // section ids ticked in that panel
  const [savingPanel, setSavingPanel] = useState(false);
  const [tempRows, setTempRows] = useState([]);               // staff added with "+ Add staff" who own nothing yet
  const [showAddStaff, setShowAddStaff] = useState(false);

  const loadSections = async (pharmId) => {
    const pid = pharmId || currentPharmacyId;
    if (!pid) return;
    setSectionsLoading(true);
    // A new year with no schedule yet gets last year's months copied in first (current year only)
    try { await ensureSectionYear(supabase, pid, perthYear()); } catch (err) { console.error("[section year]", err); }
    const [{ data: sectionData }, { data: scheduleData }, { data: staffData }] = await Promise.all([
      supabase.from("sections").select("*, staff:assigned_staff_id(id, name, active)").eq("pharmacy_id", pid).order("name"),
      supabase.from("section_clean_schedule").select("*").eq("pharmacy_id", pid),
      supabase.from("staff").select("id, name, role").eq("pharmacy_id", pid).eq("active", true)
        .or("role.is.null,role.neq.Locum").order("name"),
    ]);

    setSections(sectionData || []);
    setSchedule(scheduleData || []);
    setSectionStaff(staffData || []);
    setSectionsLoading(false);
  };

  // Schedule rows in the year being shown (Distribution grid + Balance)
  const yearSchedule = schedule.filter((s) => String(s.month).startsWith(`${sectionYear}-`));

  // Sections panel: tick = assigned to this person; ticking another person's section moves it here; unticking -> All staff.
  // Schedule months stay with the section (section_clean_schedule isn't touched).
  const openSectionsPanel = (staffId, name) => {
    setSectionsPanel({ staffId, name });
    setPanelTicks(new Set(sections.filter((s) => Number(s.assigned_staff_id) === Number(staffId)).map((s) => s.id)));
  };
  const saveSectionsPanel = async () => {
    if (!sectionsPanel) return;
    const sid = Number(sectionsPanel.staffId);
    const toAssign = sections.filter((s) => panelTicks.has(s.id) && Number(s.assigned_staff_id) !== sid).map((s) => s.id);
    const toClear = sections.filter((s) => !panelTicks.has(s.id) && Number(s.assigned_staff_id) === sid).map((s) => s.id);
    setSavingPanel(true);
    try {
      if (toAssign.length) {
        const { error } = await supabase.from("sections").update({ assigned_staff_id: sid }).in("id", toAssign);
        if (error) throw error;
      }
      if (toClear.length) {
        const { error } = await supabase.from("sections").update({ assigned_staff_id: null }).in("id", toClear);
        if (error) throw error;
      }
      setTempRows((rows) => rows.filter((r) => Number(r.staffId) !== sid)); // a real row from now on (or gone if nothing ticked)
      setSectionsPanel(null);
      await loadSections(currentPharmacyId);
    } catch (err) {
      alert("Couldn't save sections: " + (err?.message || String(err)));
    } finally {
      setSavingPanel(false);
    }
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

  const handleDrop = async (toMonth, toStaffId) => {
    if (!dragItem) return;
    const { scheduleId, sectionId, fromMonth, fromStaffId, sectionName } = dragItem;
    setDragItem(null);
    setDragOverCell(null);
    if (toMonth === fromMonth && toStaffId === fromStaffId) return;

    const changingStaff = toStaffId !== fromStaffId;
    if (changingStaff) {
      const toStaff = staffOptions.find((s) => s.id === toStaffId);
      const fromStaff = staffOptions.find((s) => s.id === fromStaffId);
      const ok = window.confirm(
        `Move "${sectionName}" from ${fromStaff?.name || "current staff"} to ${toStaff?.name || "new staff"}?\n\nThis will also change who the section is assigned to.`
      );
      if (!ok) return;
    }

    try {
      // Update the schedule row's month (one row per section per month — the unique index refuses a duplicate)
      const { error: mErr } = await supabase.from("section_clean_schedule").update({ month: toMonth }).eq("id", scheduleId);
      if (mErr) throw mErr.code === "23505" ? new Error(`"${sectionName}" is already booked in that month.`) : mErr;

      // If changing staff, update the section's assigned_staff_id too
      if (changingStaff) {
        const { error: sErr } = await supabase.from("sections").update({ assigned_staff_id: toStaffId }).eq("id", sectionId);
        if (sErr) throw sErr;
      }

      await loadSections(currentPharmacyId);
    } catch (err) {
      alert("Couldn't move section: " + (err?.message || String(err)));
    }
  };
const handleAutoBalance = async (staffId, staffName) => {
    const staffSchedule = yearSchedule.filter((sch) => {
      const section = sections.find((sec) => sec.id === sch.section_id);
      return section && section.assigned_staff_id === staffId;
    });
    if (staffSchedule.length === 0) {
      alert(`${staffName} has no scheduled sections to balance.`);
      return;
    }
    if (!window.confirm(`Spread ${staffName}'s ${staffSchedule.length} section(s) evenly across ${sectionYear}?\n\nThis will reschedule their existing section cleans. Completed ones won't move.`)) return;

    const movable = staffSchedule.filter((sch) => !sch.completed_at);
    if (movable.length === 0) {
      alert("All of this staff member's sections are already completed — nothing to move.");
      return;
    }

    // Months already locked by completed cleans (can't reuse those slots)
    const lockedMonths = new Set(
      staffSchedule.filter((sch) => sch.completed_at).map((sch) => sch.month)
    );

    // Group movable cleans by section so the same section gets spread apart
    const bySection = {};
    for (const sch of movable) {
      if (!bySection[sch.section_id]) bySection[sch.section_id] = [];
      bySection[sch.section_id].push(sch);
    }

    // Available month slots (exclude months locked by completed cleans)
    const openMonths = MONTHS.map((m) => m.value).filter((mv) => !lockedMonths.has(mv));

    // Round-robin assign: walk months in even strides, giving each successive
    // clean the next slot, so repeats of one section land far apart.
    const ordered = [];
    const sectionIds = Object.keys(bySection);
    let more = true;
    while (more) {
      more = false;
      for (const sid of sectionIds) {
        if (bySection[sid].length) {
          ordered.push(bySection[sid].shift());
          more = true;
        }
      }
    }

    const slotCount = openMonths.length || 1;
    const step = slotCount / ordered.length;
    const assignments = ordered.map((sch, i) => ({
      id: sch.id,
      month: openMonths[Math.min(slotCount - 1, Math.floor(i * step))],
    }));

    try {
      // One row per section per month (unique index): a move can be blocked by another of the same section's cleans
      // that hasn't moved yet, so blocked ones are retried after the rest — until nothing more can move.
      let pending = assignments;
      while (pending.length) {
        const blocked = [];
        for (const a of pending) {
          const { error } = await supabase.from("section_clean_schedule").update({ month: a.month }).eq("id", a.id);
          if (error && error.code === "23505") blocked.push(a);
          else if (error) throw error;
        }
        if (blocked.length === pending.length) break;
        pending = blocked;
      }
      if (pending.length) alert(`${pending.length} clean(s) couldn't move because that section is already booked in the target month.`);
      await loadSections(currentPharmacyId);
    } catch (err) {
      alert("Couldn't balance: " + (err?.message || String(err)));
    }
  };
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

  const thisMonth = perthMonthStart(); // "YYYY-MM-01" in Perth (not toISOString — UTC+8)
  const thisMonthSections = schedule.filter((s) => s.month === thisMonth);

  // ── Open panel ──
  const openAdd = () => {
    setEditingTask(null);
    // Daily tab -> daily; Recurring tasks -> monthly; Assigned jobs -> one-off date
    const freq = activeTab === "general" ? "daily" : activeTab === "recurring" ? "monthly_anytime" : "specific_date";
    setForm({ ...emptyForm, frequency: freq });
    setShowPanel(true);
  };

  const openEdit = (task) => {
    setEditingTask(task);
    setForm({
      title: task.title || "",
      frequency: task.frequency || "daily",
      days_of_week: Array.isArray(task.days_of_week) ? task.days_of_week : [],
      // 0 = "Last day of month" (On the List monthly show-from day)
      day_of_month: Number(task.day_of_month) === LAST_DAY && task.day_of_month !== null ? "last" : (task.day_of_month || ""),
      specific_date: task.specific_date?.slice(0, 10) || "",
      start_date: task.start_date?.slice(0, 10) || "",
      end_date: task.end_date?.slice(0, 10) || "",
      due_time: task.due_time?.slice(0, 5) || "",
      points: task.points ?? 1,
      info: task.info || "",
      active: task.active !== false,
      rollover: task.rollover || false,
      assigned_staff_id: task.assigned_staff_id ? String(task.assigned_staff_id) : "",
      show_next_shift: task.show_next_shift || false,
      created_by_staff_id: task.created_by_staff_id ? String(task.created_by_staff_id) : "",
      checklist_type: task.checklist_type || "",
      assigned_role: task.assigned_role || "",
      assigned_staff_ids: task.assigned_staff_ids || [],
      assign_type: task.assigned_role ? "role" : (task.assigned_staff_ids?.length > 0 ? "multiple" : task.assigned_staff_id ? "person" : "anyone"),
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
        day_of_month: form.frequency === "monthly"
          ? Number(form.day_of_month) || null
          // On the List monthly: optional "Show from day" — 1–31, or 0 = last day of the month (was never saved before)
          : form.frequency === "monthly_anytime" && onListTab
            ? (form.day_of_month === "last" ? LAST_DAY : Number(form.day_of_month) >= 1 && Number(form.day_of_month) <= 31 ? Number(form.day_of_month) : null)
            : null,
        specific_date: form.frequency === "specific_date" ? form.specific_date || null : null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        due_time: form.due_time || null,
        points: Number(form.points) || 1,
        info: form.info.trim() || null,
        active: form.active,
        rollover: form.rollover,
        assigned_staff_id: form.assign_type === "person" && form.assigned_staff_id ? Number(form.assigned_staff_id) : null,
        assigned_role: form.assign_type === "role" ? form.assigned_role || null : null,
        assigned_staff_ids: form.assign_type === "multiple" ? form.assigned_staff_ids : [],
        show_next_shift: form.show_next_shift || false,
        created_by_staff_id: form.created_by_staff_id ? Number(form.created_by_staff_id) : null,
        // Checklist (Recurring tasks only — e.g. the Consumables stock count opens from the kiosk card)
        checklist_type: onListTab && ["monthly_anytime", "monthly", "weekly"].includes(form.frequency) && !form.show_next_shift ? (form.checklist_type || null) : null,
        task_type: onListTab ? "on_the_list" : "daily",
      };

      if (editingTask) {
        // If a completed on_the_list task's schedule changed (date / frequency / next-shift),
        // clear its completion stamp so it reappears on the new date. Its completions-table
        // history rows are left untouched.
        if (
          editingTask.task_type === "on_the_list" &&
          editingTask.completed_at &&
          (
            (editingTask.specific_date?.slice(0, 10) || "") !== (payload.specific_date || "") ||
            editingTask.frequency !== payload.frequency ||
            Boolean(editingTask.show_next_shift) !== Boolean(payload.show_next_shift)
          )
        ) {
          payload.completed_at = null;
          payload.completed_by_staff_id = null;
        }
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

  if (!pinEntered) {
    return (
      <main className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white rounded-xl border shadow-sm p-8 w-full max-w-xs text-center">
          <div className="text-2xl mb-1">🔒</div>
          <h1 className="text-lg font-semibold text-gray-800 mb-1">Tasks</h1>
          <p className="text-xs text-gray-500 mb-4">Enter PIN to continue</p>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={pinInput}
            onChange={(e) => { setPinInput(e.target.value); setPinError(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") handlePinSubmit(); }}
            placeholder="••••"
            autoComplete="off"
            name="tasks_pin_field"
            data-1p-ignore
            data-lpignore="true"
            style={{ WebkitTextSecurity: "disc", textSecurity: "disc" }}
            className="w-full text-center rounded-lg border border-gray-300 px-3 py-2 text-lg tracking-widest mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
            autoFocus
          />
          {pinError && <p className="text-xs text-red-500 mb-3">Incorrect PIN. Try again.</p>}
          <button
            onClick={handlePinSubmit}
            className="w-full py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            Enter
          </button>
        </div>
      </main>
    );
  }

  const staffById = Object.fromEntries(staffOptions.map((s) => [s.id, s]));

  // ── Task row ──
  const TaskRow = ({ task }) => (
    <tr className="border-t border-gray-100 hover:bg-gray-50">
      <td className="px-3 py-2">
        <div className="font-medium text-sm text-gray-800">
          {task.title}
          {task.checklist_type && <span className="ml-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">🧾 Checklist</span>}
        </div>
        {task.info && <div className="text-xs text-gray-400 truncate max-w-[200px]">{task.info}</div>}
      </td>
      {onListTab && (
        <td className="px-3 py-2 text-sm text-gray-600">
          {task.assigned_staff_id ? (
            <span className="font-medium text-blue-700">{staffById[task.assigned_staff_id]?.name || "—"}</span>
          ) : <span className="text-gray-400">Anyone</span>}
        </td>
      )}
      <td className="px-3 py-2 text-sm text-gray-600">{freqLabel(task)}</td>
      <td className="px-3 py-2 text-sm text-gray-600">{timePretty(task.due_time)}</td>
      <td className="px-3 py-2 text-sm text-gray-600">{task.points ?? 1}</td>
      {onListTab && (
        <td className="px-3 py-2 text-xs text-gray-500">
          {task.created_by_staff_id ? staffById[task.created_by_staff_id]?.name || "—" : "—"}
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
      <Sidebar active="tasks" />

      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-white border-b px-6 py-4 shrink-0">
          <h1 className="text-xl font-bold text-gray-800 mb-3">Tasks</h1>

          {/* Tabs + actions */}
          <div className="flex items-center gap-1">
            {[
              { key: "general", label: "Daily Tasks" },
              { key: "assigned", label: "Assigned jobs" },
              { key: "recurring", label: "Recurring tasks" },
              { key: "checklists", label: "Checklists" },
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

            {activeTab === "general" && (
              <button onClick={openAdd} className="px-4 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700">
                + Daily Task
              </button>
            )}
            {activeTab === "assigned" && (
              <button onClick={openAdd} className="px-4 py-1.5 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600">
                + Assigned Job
              </button>
            )}
            {activeTab === "recurring" && (
              <button onClick={openAdd} className="px-4 py-1.5 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600">
                + Recurring Task
              </button>
            )}

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
          ) : activeTab === "checklists" ? (
            <ConsumablesAdmin
              pharmacyId={currentPharmacyId}
              staffOptions={staffOptions}
              tasks={tasks}
              pinStaffId={pinStaffId}
              initialSheetId={initialSheetId}
            />
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

              {/* Staff-first distribution grid */}
              <div className="bg-white rounded-xl border overflow-hidden">
                <div className="px-4 py-3 border-b flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      Distribution by staff —
                      <button type="button" onClick={() => setSectionYear((y) => y - 1)} className="px-1.5 rounded border text-gray-500 hover:bg-gray-50" title="Previous year">‹</button>
                      <span className="tabular-nums">{sectionYear}</span>
                      <button type="button" onClick={() => setSectionYear((y) => y + 1)} className="px-1.5 rounded border text-gray-500 hover:bg-gray-50" title="Next year">›</button>
                      {sectionYear !== perthYear() && (
                        <button type="button" onClick={() => setSectionYear(perthYear())} className="text-[11px] font-normal text-blue-600 hover:underline">This year</button>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">Shows which sections each person is cleaning each month. Bottom row = total sections due that month.</div>
                  </div>
                  <div className="flex items-center gap-2 relative">
                    <button
                      onClick={() => setShowAddStaff((v) => !v)}
                      className="px-3 py-1.5 border border-blue-300 text-blue-700 text-xs font-medium rounded-lg hover:bg-blue-50"
                    >
                      + Add staff
                    </button>
                    {showAddStaff && (() => {
                      const owners = new Set(sections.map((s) => Number(s.assigned_staff_id)).filter(Boolean));
                      const shown = new Set(tempRows.map((r) => Number(r.staffId)));
                      const free = sectionStaff.filter((s) => !owners.has(Number(s.id)) && !shown.has(Number(s.id)));
                      return (
                        <div className="absolute right-0 top-full mt-1 z-20 w-56 max-h-72 overflow-y-auto bg-white border rounded-lg shadow-lg py-1">
                          {free.length === 0 ? (
                            <div className="px-3 py-2 text-xs text-gray-400">Everyone already has sections.</div>
                          ) : free.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => {
                                setTempRows((rows) => [...rows, { staffId: s.id, name: s.name }]);
                                setShowAddStaff(false);
                                openSectionsPanel(s.id, s.name);
                              }}
                              className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                            >
                              {s.name}{s.role ? <span className="text-gray-400"> · {s.role}</span> : null}
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                    <button
                      onClick={() => { setShowAddSection((v) => !v); setNewSectionName(""); setNewSectionStaffId(""); setNewSectionNotes(""); }}
                      className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700"
                    >
                      + Add Section
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600 w-40">Staff</th>
                        {MONTHS.map((m) => (
                          <th key={m.value} className={`px-2 py-2 text-center font-semibold min-w-[72px] ${m.value === thisMonth ? "text-blue-600" : "text-gray-500"}`}>
                            {m.label}
                          </th>
                        ))}
                        <th className="px-2 py-2 text-center font-semibold text-gray-500 w-12">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        // Build: staffId -> { name, perMonth: {monthValue: [sectionName,...]}, total }
                        const rows = {};
                        const ALL_STAFF_KEY = "__all__";
                        const rowFor = (section) => {
                          const sid = section.assigned_staff_id || ALL_STAFF_KEY;
                          const sname = section.assigned_staff_id ? (section.staff?.name || `#${sid}`) : "All staff";
                          if (!rows[sid]) {
                            rows[sid] = {
                              staffId: section.assigned_staff_id || null, name: sname, perMonth: {}, total: 0,
                              inactive: !!section.assigned_staff_id && section.staff?.active === false,
                            };
                          }
                          return rows[sid];
                        };
                        // Everyone who owns a section gets a row (even with nothing scheduled this year)
                        for (const section of sections) if (section.assigned_staff_id) rowFor(section);
                        for (const sch of yearSchedule) {
                          const section = sections.find((sec) => sec.id === sch.section_id);
                          if (!section) continue;
                          const row = rowFor(section);
                          if (!row.perMonth[sch.month]) row.perMonth[sch.month] = [];
                          row.perMonth[sch.month].push({ name: section.name, completed: !!sch.completed_at, scheduleId: sch.id, sectionId: section.id });
                          row.total += 1;
                        }
                        // "+ Add staff" people who don't own anything yet (until their Sections panel is saved)
                        for (const t of tempRows) {
                          if (!rows[t.staffId]) rows[t.staffId] = { staffId: t.staffId, name: t.name, perMonth: {}, total: 0, inactive: false, temp: true };
                        }
                        const ordered = Object.values(rows).sort((a, b) => a.name.localeCompare(b.name));

                        // Month totals across all staff
                        const monthTotals = {};
                        for (const m of MONTHS) {
                          monthTotals[m.value] = Object.values(rows).reduce((sum, r) => sum + (r.perMonth[m.value]?.length || 0), 0);
                        }
                        const maxTotal = Math.max(...Object.values(monthTotals), 1);

                        if (!ordered.length) {
                          return <tr><td colSpan={MONTHS.length + 2} className="px-3 py-6 text-center text-gray-400">No sections assigned to staff yet.</td></tr>;
                        }

                        return (
                          <>
                            {ordered.map((r) => (
                              <tr key={r.name} className="border-t hover:bg-gray-50">
                                <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                    <span>{r.name} <span className="text-gray-400 font-normal">({r.staffId ? sections.filter((s) => Number(s.assigned_staff_id) === Number(r.staffId)).length : new Set(Object.values(r.perMonth).flat().map((it) => it.sectionId)).size})</span></span>
                                    {r.inactive && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200 font-medium">Inactive — reassign</span>}
                                    {r.temp && <span className="text-[10px] text-gray-400 font-normal">new — tick sections to keep</span>}
                                    {r.staffId && (
                                      <button
                                        onClick={() => openSectionsPanel(r.staffId, r.name)}
                                        title="Choose which sections this person cleans"
                                        className="text-[10px] px-1.5 py-0.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                                      >
                                        Sections
                                      </button>
                                    )}
                                    {!r.temp && (
                                      <button
                                        onClick={() => handleAutoBalance(r.staffId, r.name)}
                                        title="Spread evenly across the year"
                                        className="text-[10px] px-1.5 py-0.5 rounded border border-blue-200 text-blue-600 hover:bg-blue-50"
                                      >
                                        Balance
                                      </button>
                                    )}
                                  </div>
                                </td>
                                {MONTHS.map((m) => {
                                  const items = r.perMonth[m.value] || [];
                                  const isOver = dragOverCell?.month === m.value && dragOverCell?.staffId === r.staffId;
                                  return (
                                    <td
                                      key={m.value}
                                      className={`px-2 py-1.5 text-center align-top transition-colors ${m.value === thisMonth ? "bg-blue-50" : ""} ${isOver ? "bg-yellow-50 ring-2 ring-inset ring-yellow-300" : ""}`}
                                      onDragOver={(e) => { e.preventDefault(); setDragOverCell({ month: m.value, staffId: r.staffId }); }}
                                      onDragLeave={() => setDragOverCell(null)}
                                      onDrop={() => handleDrop(m.value, r.staffId)}
                                    >
                                      {items.length === 0 ? (
                                        <span className="text-gray-200">·</span>
                                      ) : (
                                        <div className="flex flex-col gap-0.5">
                                          {items.map((item, i) => (
                                            <span
                                              key={i}
                                              draggable
                                              onDragStart={() => setDragItem({
                                                scheduleId: item.scheduleId,
                                                sectionId: item.sectionId,
                                                fromMonth: m.value,
                                                fromStaffId: r.staffId,
                                                sectionName: item.name,
                                              })}
                                              onDragEnd={() => { setDragItem(null); setDragOverCell(null); }}
                                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] leading-tight font-medium cursor-grab active:cursor-grabbing ${item.completed ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}
                                            >
                                              <span className="opacity-40 select-none">⠿</span>
                                              {item.name}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </td>
                                  );
                                })}
                                <td className="px-2 py-2 text-center font-semibold text-gray-600 tabular-nums">{r.total}</td>
                              </tr>
                            ))}
                            {/* Totals row */}
                            <tr className="border-t-2 border-gray-200 bg-gray-50">
                              <td className="px-3 py-2 font-semibold text-gray-600 text-[11px] uppercase tracking-wide">Total/month</td>
                              {MONTHS.map((m) => {
                                const count = monthTotals[m.value] || 0;
                                const ratio = count / maxTotal;
                                const bg = count === 0 ? "" : ratio <= 0.4 ? "bg-green-100 text-green-700" : ratio <= 0.7 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";
                                return (
                                  <td key={m.value} className={`px-2 py-2 text-center font-bold tabular-nums ${m.value === thisMonth ? "ring-1 ring-inset ring-blue-300" : ""} ${bg}`}>
                                    {count || <span className="text-gray-300 font-normal">·</span>}
                                  </td>
                                );
                              })}
                              <td className="px-2 py-2 text-center font-bold text-gray-600 tabular-nums">
                                {Object.values(monthTotals).reduce((a, b) => a + b, 0)}
                              </td>
                            </tr>
                          </>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Sections panel — which sections one person cleans (applies on Save) */}
              {sectionsPanel && (
                <div className="fixed inset-0 z-40 bg-black/30 flex items-center justify-center p-4" onClick={() => !savingPanel && setSectionsPanel(null)}>
                  <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                    <div className="px-4 py-3 border-b">
                      <div className="text-sm font-semibold text-gray-800">Sections — {sectionsPanel.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">Ticked = cleaned by {sectionsPanel.name}. Ticking someone else's section moves it here; unticking makes it All staff. Scheduled months stay with the section.</div>
                    </div>
                    <div className="flex-1 overflow-y-auto divide-y">
                      {sections.length === 0 ? (
                        <div className="px-4 py-6 text-sm text-gray-400 text-center">No sections yet.</div>
                      ) : sections.map((s) => {
                        const ticked = panelTicks.has(s.id);
                        const mine = Number(s.assigned_staff_id) === Number(sectionsPanel.staffId);
                        const owner = s.assigned_staff_id ? (s.staff?.name || `#${s.assigned_staff_id}`) : "All staff";
                        return (
                          <label key={s.id} className="flex items-center gap-3 px-4 py-2 text-sm cursor-pointer hover:bg-gray-50">
                            <input
                              type="checkbox"
                              checked={ticked}
                              onChange={() => setPanelTicks((cur) => {
                                const n = new Set(cur);
                                if (n.has(s.id)) n.delete(s.id); else n.add(s.id);
                                return n;
                              })}
                            />
                            <span className="flex-1 text-gray-800">{s.name}</span>
                            <span className={`text-xs ${mine ? "text-blue-600" : "text-gray-400"}`}>
                              {owner}
                              {s.assigned_staff_id && s.staff?.active === false && <span className="ml-1 text-red-500">(inactive)</span>}
                              {ticked && !mine && <span className="ml-1 text-amber-600">→ moves here</span>}
                              {!ticked && mine && <span className="ml-1 text-amber-600">→ All staff</span>}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    <div className="px-4 py-3 border-t flex justify-end gap-2">
                      <button type="button" onClick={() => setSectionsPanel(null)} disabled={savingPanel} className="px-3 py-1.5 text-xs border rounded hover:bg-gray-50">Cancel</button>
                      <button type="button" onClick={saveSectionsPanel} disabled={savingPanel} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                        {savingPanel ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Year schedule grid */}
              <div className="bg-white rounded-xl border overflow-hidden">
                <div className="px-4 py-3 border-b flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-gray-700">{sectionYear} Schedule</div>
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
                                <td className="px-2 py-1.5 text-gray-500">
                                  {section.staff?.name || <span className="text-gray-300">All staff</span>}
                                  {section.assigned_staff_id && section.staff?.active === false && (
                                    <span className="block mt-0.5 text-[10px] px-1 py-0.5 rounded bg-red-50 text-red-600 border border-red-200 font-medium w-fit">Inactive — reassign</span>
                                  )}
                                </td>
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
                    {onListTab && <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Assigned To</th>}
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Frequency</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Due Time</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Points</th>
                    {onListTab && <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Added By</th>}
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
                    assignedJobs.length === 0
                      ? <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400 text-sm">No one-off assigned jobs yet.</td></tr>
                      : assignedJobs.map((t) => <TaskRow key={t.id} task={t} />)
                  )}
                  {activeTab === "recurring" && (
                    recurringTasks.length === 0
                      ? <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400 text-sm">No recurring tasks yet.</td></tr>
                      : recurringTasks.map((t) => <TaskRow key={t.id} task={t} />)
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

              {/* Checklist — recurring On the List tasks only (the kiosk card opens the checklist; set up in Checklists) */}
              {onListTab && ["monthly_anytime", "monthly", "weekly"].includes(form.frequency) && !form.show_next_shift && (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={!!form.checklist_type}
                      onChange={(e) => setForm((f) => ({ ...f, checklist_type: e.target.checked ? CHECKLIST_TYPES[0].key : "" }))}
                    />
                    Checklist
                  </label>
                  {form.checklist_type && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Checklist type</label>
                      <select
                        value={form.checklist_type}
                        onChange={(e) => setForm((f) => ({ ...f, checklist_type: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      >
                        {CHECKLIST_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                      </select>
                      <p className="text-[11px] text-gray-400 mt-1">Tapping the card on the kiosk opens the checklist. Set up its items in the Checklists tab.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Assignment — On the List only */}
              {onListTab && (
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Assign to</label>
                    <select
                      value={form.assign_type || "anyone"}
                      onChange={(e) => setForm((f) => ({ ...f, assign_type: e.target.value, assigned_staff_id: "", assigned_role: "", assigned_staff_ids: [] }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="anyone">Anyone</option>
                      <option value="person">Specific person</option>
                      <option value="role">Role</option>
                      <option value="multiple">Multiple people</option>
                    </select>
                  </div>
                  {form.assign_type === "person" && (
                    <select
                      value={form.assigned_staff_id}
                      onChange={(e) => setForm((f) => ({ ...f, assigned_staff_id: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="">Select staff member</option>
                      {staffOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  )}
                  {form.assign_type === "role" && (
                    <select
                      value={form.assigned_role || ""}
                      onChange={(e) => setForm((f) => ({ ...f, assigned_role: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="">Select role</option>
                      <option value="Pharmacist">Pharmacist</option>
                      <option value="Pharmacy Assistant">Pharmacy Assistant</option>
                      <option value="DAA Coordinator">DAA Coordinator</option>
                      <option value="Retail Manager">Retail Manager</option>
                      <option value="Locum">Locum</option>
                    </select>
                  )}
                  {form.assign_type === "multiple" && (
                    <div className="space-y-1 max-h-40 overflow-y-auto border rounded-lg p-2">
                      {staffOptions.map((s) => {
                        const selected = (form.assigned_staff_ids || []).includes(s.id);
                        return (
                          <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => setForm((f) => ({
                                ...f,
                                assigned_staff_ids: selected
                                  ? (f.assigned_staff_ids || []).filter((id) => id !== s.id)
                                  : [...(f.assigned_staff_ids || []), s.id],
                              }))}
                              className="h-3.5 w-3.5 rounded border-gray-300"
                            />
                            {s.name}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Assign to staff — Daily Tasks only */}
              {activeTab === "general" && (
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
              )}

              {/* Frequency */}
              {activeTab === "general" && (
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
              )}
              {onListTab && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Type</label>
                  <select
                    value={form.show_next_shift ? "next_shift" : form.frequency}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "next_shift") {
                        setForm((f) => ({ ...f, frequency: "specific_date", show_next_shift: true }));
                      } else {
                        setForm((f) => ({ ...f, frequency: val, show_next_shift: false }));
                      }
                    }}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    {ON_LIST_FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
              )}

              {/* Weekly days */}
              {form.frequency === "weekly" && activeTab === "general" && (
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

              {/* On the List — Weekly days */}
              {form.frequency === "weekly" && onListTab && (
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
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Start from (optional)</label>
                      <input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Ends on (optional)</label>
                      <input type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Due time (optional)</label>
                    <input type="time" value={form.due_time} onChange={(e) => setForm((f) => ({ ...f, due_time: e.target.value }))} className="w-40 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                </div>
              )}

              {/* On the List — Monthly */}
              {form.frequency === "monthly_anytime" && onListTab && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Show from day (optional)</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min={1}
                        max={31}
                        value={form.day_of_month === "last" ? "" : form.day_of_month}
                        disabled={form.day_of_month === "last"}
                        onChange={(e) => setForm((f) => ({ ...f, day_of_month: e.target.value }))}
                        placeholder="e.g. 15"
                        className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
                      />
                      <label className="flex items-center gap-1.5 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={form.day_of_month === "last"}
                          onChange={(e) => setForm((f) => ({ ...f, day_of_month: e.target.checked ? "last" : "" }))}
                        />
                        Last day of month
                      </label>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">
                      Blank = shows from the 1st. With a day, the card appears that day and turns red once it's passed; if it's still
                      not done at month end it carries into next month in red. Days 29–31 count as the last day in shorter months.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Start from (optional)</label>
                      <input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Ends on (optional)</label>
                      <input type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                    </div>
                  </div>
                </div>
              )}

              {/* On the List — One-off date */}
              {form.frequency === "specific_date" && !form.show_next_shift && onListTab && (
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

              {/* On the List — Next shift — no date needed */}
              {form.show_next_shift && onListTab && (
                <div className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                  This task will appear on the home screen on the day this staff member is next rostered.
                </div>
              )}

              {/* General — Monthly specific day */}
              {form.frequency === "monthly" && activeTab === "general" && (
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

              {/* General — Specific date */}
              {form.frequency === "specific_date" && activeTab === "general" && (
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

              {/* General — Start + End date + Due time */}
              {activeTab === "general" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Start date (optional)</label>
                      <input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">End/due date (optional)</label>
                      <input type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Due time (optional)</label>
                    <input type="time" value={form.due_time} onChange={(e) => setForm((f) => ({ ...f, due_time: e.target.value }))} className="w-40 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                </>
              )}

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
{/* Added by — On the List only */}
              {onListTab && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Added by</label>
                  <select
                    value={form.created_by_staff_id}
                    onChange={(e) => setForm((f) => ({ ...f, created_by_staff_id: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">Select name</option>
                    {staffOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}
              {/* Rollover — daily tasks only */}
              {activeTab === "general" && (
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
              )}

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