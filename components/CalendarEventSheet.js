// Kiosk "What's on" — Add / edit an event (the selected person's photo is "Adding as"). Any staff member can add;
// editing / deleting is for the person who added it or a manager (WhatsOn checks before opening). Manager-only
// categories (Closure) and "Jobs for this event" need the admin PIN (unlocked here). Jobs are normal one-off assigned
// jobs (lib/calendar.js syncEventJobs).
import { useState } from "react";
import { createPortal } from "react-dom";
import supabase from "../lib/supabaseClient";
import Avatar from "./Avatar";
import ManagerPinModal from "./qspp/ManagerPinModal";
import { DUE_RULES, dueRuleLabel, dueDateFor, currentOccurrence, jobDefsFrom, syncEventJobs, deleteEvent, shortDate } from "../lib/calendar";
import { todayPerth } from "../lib/performanceReview";

const ROLES = ["Pharmacist", "Intern Pharmacist", "Pharmacy Assistant", "DAA Coordinator", "Retail Manager"];
const inputCls = "w-full h-11 border border-gray-300 rounded-lg px-3 text-sm bg-white";
const blankJob = () => ({ key: null, title: "", assign_type: "anyone", assigned_staff_id: "", assigned_role: "", assigned_staff_ids: [], rule: "before_start", days: 1, points: 1 });

export default function CalendarEventSheet({ event, defaultDate, categories, staff, adder, addedBy, pharmacyId, holidays, existingJobs, manager, onManager, onClose, onSaved }) {
  const isNew = !event;
  const today = todayPerth();
  const usable = categories.filter((c) => c.active !== false || c.id === event?.category_id);
  const [form, setForm] = useState(() => ({
    title: event?.title || "",
    category_id: event?.category_id || usable.find((c) => !c.manager_only)?.id || "",
    range: !!event?.end_date && event.end_date !== event.start_date,
    start: event?.start_date || defaultDate || today,
    end: event?.end_date || event?.start_date || defaultDate || today,
    time: event?.start_time ? String(event.start_time).slice(0, 5) : "",
    note: event?.note || "",
    repeats: !!event?.repeats_yearly,
  }));
  const [jobs, setJobs] = useState(() => jobDefsFrom(existingJobs || []));
  const [jobsTouched, setJobsTouched] = useState(false);
  const [askPin, setAskPin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setJob = (i, patch) => { setJobsTouched(true); setJobs((js) => js.map((j, k) => (k === i ? { ...j, ...patch } : j))); };

  const cat = categories.find((c) => c.id === form.category_id);
  const needsManager = !!cat?.manager_only;
  const holidaySet = new Set((holidays || []).map((h) => h.date));
  const draftEvent = { start_date: form.start, end_date: form.range ? form.end : null, repeats_yearly: form.repeats };
  const occ = form.start ? currentOccurrence(draftEvent, today) : null;

  const save = async () => {
    setError("");
    if (!form.title.trim()) { setError("Enter a title."); return; }
    if (!form.start) { setError("Pick the date."); return; }
    if (form.range && (!form.end || form.end < form.start)) { setError("The end date must be on or after the start."); return; }
    if (needsManager && !manager) { setError(`${cat.name} needs the manager PIN.`); return; }
    if (jobs.some((j) => !j.title.trim())) { setError("Give every job a name (or remove it)."); return; }
    if (jobs.some((j) => j.assign_type === "person" && !j.assigned_staff_id)) { setError("Pick the person for each job assigned to a person."); return; }
    if (jobs.some((j) => j.assign_type === "role" && !j.assigned_role)) { setError("Pick the role for each job assigned to a role."); return; }
    setSaving(true);
    try {
      const row = {
        title: form.title.trim(), category_id: form.category_id || null, start_date: form.start,
        end_date: form.range ? form.end : null, start_time: form.time || null, note: form.note.trim() || null,
        repeats_yearly: form.repeats,
      };
      let saved;
      if (isNew) {
        const { data, error: e } = await supabase.from("calendar_events")
          .insert([{ ...row, pharmacy_id: pharmacyId, created_by_staff_id: Number(adder.id) }]).select("*").single();
        if (e) throw e;
        saved = data;
      } else {
        const { data, error: e } = await supabase.from("calendar_events")
          .update({ ...row, updated_by_staff_id: Number((manager || adder).id), updated_at: new Date().toISOString() })
          .eq("id", event.id).select("*").single();
        if (e) throw e;
        saved = data;
      }
      // Jobs: the manager's list if it was unlocked + changed, otherwise just move not-done jobs to the new dates
      await syncEventJobs(supabase, {
        pharmacyId, event: saved, defs: manager && (jobsTouched || isNew) ? jobs : null,
        existing: existingJobs || [], holidays: holidays || [], managerStaffId: manager?.id, today,
      });
      onSaved(saved);
    } catch (err) {
      setError("Couldn't save: " + (err?.message || String(err)));
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await deleteEvent(supabase, event);
      onSaved(null);
    } catch (err) {
      setError("Couldn't delete: " + (err?.message || String(err)));
      setSaving(false);
    }
  };

  const doneJobs = (existingJobs || []).filter((r) => r.completed_at).length;

  return createPortal(
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={() => !saving && onClose()} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto bg-white rounded-2xl shadow-xl w-full max-w-xl flex flex-col max-h-[92vh]" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b shrink-0">
            <div>
              <h2 className="text-lg font-bold text-gray-800">{isNew ? "Add to calendar" : "Edit event"}</h2>
              {!isNew && addedBy && <div className="text-xs text-gray-500">Added by {addedBy}</div>}
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Avatar name={adder.name} photoUrl={adder.photo_url} className="w-7 h-7 rounded-full" />
              <span>{isNew ? "Adding" : "Editing"} as <span className="font-semibold text-gray-800">{adder.name.split(" ")[0]}</span></span>
            </div>
          </div>

          <div className="px-5 py-4 overflow-y-auto space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Title</label>
              <input value={form.title} onChange={(e) => set({ title: e.target.value })} maxLength={120} className={inputCls} placeholder="e.g. Stocktake after close" autoFocus={isNew} />
            </div>

            <div>
              <div className="text-xs font-semibold text-gray-600 mb-1.5">Category</div>
              <div className="flex flex-wrap gap-2">
                {usable.map((c) => {
                  const on = c.id === form.category_id;
                  const locked = c.manager_only && !manager;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => (locked ? setAskPin(true) : set({ category_id: c.id }))}
                      className={`h-11 px-3.5 rounded-full text-sm flex items-center gap-1.5 ${on ? "font-semibold" : ""} ${locked ? "border border-dashed border-gray-300 bg-gray-50 text-gray-500" : on ? "border-2" : "border border-gray-300 bg-white"}`}
                      style={on && !locked ? { borderColor: c.colour, background: `${c.colour}14` } : undefined}
                    >
                      {locked ? "🔒" : <span className="w-2 h-2 rounded-full" style={{ background: c.colour }} />}
                      {c.name}{locked ? " (manager)" : ""}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-600">When</div>
              <div className="inline-flex bg-gray-100 rounded-lg p-0.5">
                {[{ v: false, l: "One day" }, { v: true, l: "Date range" }].map((o) => (
                  <button key={o.l} type="button" onClick={() => set({ range: o.v, end: o.v && form.end < form.start ? form.start : form.end })}
                    className={`h-10 px-4 rounded-md text-sm ${form.range === o.v ? "bg-white font-semibold shadow-sm" : "text-gray-600"}`}>
                    {o.l}
                  </button>
                ))}
              </div>
              <div className={`grid gap-3 ${form.range ? "grid-cols-2" : "grid-cols-1 max-w-[220px]"}`}>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">{form.range ? "Starts" : "Date"}</label>
                  <input type="date" value={form.start} onChange={(e) => set({ start: e.target.value, end: form.end < e.target.value ? e.target.value : form.end })} className={inputCls} />
                </div>
                {form.range && (
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-1">Ends</label>
                    <input type="date" value={form.end} min={form.start} onChange={(e) => set({ end: e.target.value })} className={inputCls} />
                  </div>
                )}
              </div>
              <div className="max-w-[220px]">
                <label className="block text-[11px] text-gray-500 mb-1">Time (optional)</label>
                <input type="time" value={form.time} onChange={(e) => set({ time: e.target.value })} className={inputCls} />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Note (optional)</label>
              <input value={form.note} onChange={(e) => set({ note: e.target.value })} maxLength={200} className={inputCls} placeholder="Short note, e.g. Bring a plate" />
            </div>

            <label className="flex items-center gap-2.5 text-sm min-h-[44px]">
              <input type="checkbox" checked={form.repeats} onChange={(e) => set({ repeats: e.target.checked })} className="w-5 h-5" />
              Repeats every year
            </label>

            {/* Jobs for this event (manager PIN) */}
            <div className="border rounded-xl p-3.5 bg-gray-50 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-gray-800">Jobs for this event</span>
                {manager
                  ? <span className="text-xs text-green-700">🔓 {manager.name.split(" ")[0]}</span>
                  : <button type="button" onClick={() => setAskPin(true)} className="text-xs text-gray-600 border rounded-lg px-2.5 py-1.5 bg-white">🔒 Manager PIN</button>}
              </div>
              {!manager && jobs.length === 0 && <p className="text-xs text-gray-500">A manager can add jobs (e.g. "Set up promo stands — 2 days before start").</p>}
              {jobs.map((j, i) => (
                <div key={j.key || `new-${i}`} className="bg-white border rounded-lg p-3 space-y-2">
                  {manager ? (
                    <>
                      <div className="flex gap-2">
                        <input value={j.title} onChange={(e) => setJob(i, { title: e.target.value })} placeholder="Job, e.g. Set up promo stands" className={inputCls} />
                        <button type="button" onClick={() => { setJobsTouched(true); setJobs((js) => js.filter((_, k) => k !== i)); }}
                          className="shrink-0 h-11 px-3 text-xs border border-red-200 text-red-600 rounded-lg">Remove</button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] text-gray-500 mb-1">Assign to</label>
                          <select value={j.assign_type} onChange={(e) => setJob(i, { assign_type: e.target.value, assigned_staff_id: "", assigned_role: "", assigned_staff_ids: [] })} className={inputCls}>
                            <option value="anyone">Anyone</option>
                            <option value="person">A person</option>
                            <option value="role">A role</option>
                            <option value="multiple">Several people</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] text-gray-500 mb-1">Due</label>
                          <div className="flex gap-1.5">
                            {j.rule === "before_start" && (
                              <input value={j.days} onChange={(e) => setJob(i, { days: e.target.value.replace(/\D/g, "").slice(0, 3) })} inputMode="numeric" className="w-14 h-11 border border-gray-300 rounded-lg px-2 text-sm text-center" />
                            )}
                            <select value={j.rule} onChange={(e) => setJob(i, { rule: e.target.value })} className={inputCls}>
                              {DUE_RULES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                            </select>
                          </div>
                        </div>
                      </div>
                      {j.assign_type === "person" && (
                        <select value={j.assigned_staff_id} onChange={(e) => setJob(i, { assigned_staff_id: e.target.value })} className={inputCls}>
                          <option value="">Select staff member</option>
                          {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      )}
                      {j.assign_type === "role" && (
                        <select value={j.assigned_role} onChange={(e) => setJob(i, { assigned_role: e.target.value })} className={inputCls}>
                          <option value="">Select role</option>
                          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      )}
                      {j.assign_type === "multiple" && (
                        <div className="max-h-32 overflow-y-auto border rounded-lg p-2 space-y-1">
                          {staff.map((s) => {
                            const on = (j.assigned_staff_ids || []).map(Number).includes(Number(s.id));
                            return (
                              <label key={s.id} className="flex items-center gap-2 text-sm">
                                <input type="checkbox" checked={on} onChange={() => setJob(i, { assigned_staff_ids: on ? j.assigned_staff_ids.filter((x) => Number(x) !== Number(s.id)) : [...(j.assigned_staff_ids || []), Number(s.id)] })} />
                                {s.name}
                              </label>
                            );
                          })}
                        </div>
                      )}
                      {occ && <div className="text-xs text-gray-500">Due {shortDate(dueDateFor(j.rule, j.days, occ, holidaySet))}{form.repeats ? " (this year's)" : ""}</div>}
                    </>
                  ) : (
                    <>
                      <div className="text-sm font-semibold text-gray-800">{j.title}</div>
                      <div className="text-xs text-gray-500">
                        {j.assign_type === "role" ? j.assigned_role : j.assign_type === "person" ? staff.find((s) => Number(s.id) === Number(j.assigned_staff_id))?.name || "—" : j.assign_type === "multiple" ? "Several people" : "Anyone"}
                        {" · "}{dueRuleLabel(j.rule, j.days)}{occ ? ` → ${shortDate(dueDateFor(j.rule, j.days, occ, holidaySet))}` : ""}
                      </div>
                    </>
                  )}
                </div>
              ))}
              {manager && (
                <button type="button" onClick={() => { setJobsTouched(true); setJobs((js) => [...js, blankJob()]); }}
                  className="w-full h-11 border border-dashed border-gray-400 rounded-lg bg-white text-sm font-semibold text-gray-700">
                  + Add job
                </button>
              )}
              <p className="text-xs text-gray-500">
                Jobs go into Tasks → Assigned jobs and show on the kiosk like any other job. Due dates move off public holidays.
                {doneJobs > 0 ? ` ${doneJobs} done job${doneJobs === 1 ? "" : "s"} stay as they are.` : ""}
              </p>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {confirmDelete && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
                <div className="text-sm text-red-800">
                  Delete "{event.title}"?{(existingJobs || []).some((r) => !r.completed_at) ? " Its jobs that aren't done yet are removed too." : ""}{doneJobs ? " Done jobs stay in history." : ""}
                </div>
                <div className="flex gap-2">
                  <button onClick={remove} disabled={saving} className="h-11 px-4 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-50">{saving ? "Deleting…" : "Yes, delete"}</button>
                  <button onClick={() => setConfirmDelete(false)} disabled={saving} className="h-11 px-4 rounded-lg border text-sm">Keep it</button>
                </div>
              </div>
            )}
          </div>

          <div className="px-5 py-3 border-t shrink-0 flex items-center gap-2">
            {!isNew && !confirmDelete && (
              <button onClick={() => setConfirmDelete(true)} disabled={saving} className="h-11 px-4 rounded-lg border border-red-200 text-red-600 text-sm">Delete</button>
            )}
            <div className="flex-1" />
            <button onClick={onClose} disabled={saving} className="h-11 px-4 rounded-lg border border-gray-300 text-sm">Cancel</button>
            <button onClick={save} disabled={saving} className="h-11 px-5 rounded-lg bg-gray-900 text-white text-sm font-semibold disabled:opacity-50">{saving && !confirmDelete ? "Saving…" : "Save"}</button>
          </div>
        </div>
      </div>
      {askPin && <ManagerPinModal onUnlock={(u) => { onManager(u); setAskPin(false); }} onClose={() => setAskPin(false)} />}
    </>,
    document.body,
  );
}
