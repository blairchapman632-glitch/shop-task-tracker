// Add / edit an "other training" record (course, in-house session or drill — not S2/S3 hours). lib/otherTraining.
//   mode "manager" (/qspp manager mode): any attendees, edit, remove attachment, delete.
//   mode "self" (/training): add your own completed course — you're the attendee; optional certificate (PIN-checked).
import { useState } from "react";
import supabase from "../lib/supabaseClient";
import { todayPerth } from "../lib/performanceReview";
import {
  KINDS, OTHER_TOPIC, saveOtherTraining, attachOtherTrainingFile, openOtherTrainingFile, removeOtherTrainingFile, deleteOtherTraining,
} from "../lib/otherTraining";

// record: edit this one (manager); topics: active training_topics; staffList: [{ id, name, active }]
// self: { id, name } on /training; kiosk: { staffId, pin } on /training
export default function OtherTrainingForm({ mode = "manager", record = null, topics, staffList = [], self = null, kiosk = null, pharmacyId, onClose, onSaved, onDeleted }) {
  const isSelf = mode === "self";
  const knownTopic = record ? topics.find((t) => t.id === record.topic_id && t.name !== OTHER_TOPIC) : null;
  const [topicId, setTopicId] = useState(record ? (knownTopic ? knownTopic.id : "other") : "");
  const [otherText, setOtherText] = useState(record && !knownTopic ? record.topic : "");
  const [kind, setKind] = useState(record?.kind || (isSelf ? "course" : ""));
  const [date, setDate] = useState(record?.training_date || todayPerth());
  const [provider, setProvider] = useState(record?.provider || "");
  const [hours, setHours] = useState(record?.duration_hours ?? "");
  const [outcome, setOutcome] = useState(record?.outcome || "");
  const [attendees, setAttendees] = useState(new Set(record?.attendee_ids || (self ? [Number(self.id)] : [])));
  const [file, setFile] = useState(null);
  const [current, setCurrent] = useState(record); // for the attachment shown while editing
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const otherTopicRow = topics.find((t) => t.name === OTHER_TOPIC);
  const pickable = topics.filter((t) => t.name !== OTHER_TOPIC);
  const people = staffList.filter((s) => s.active !== false || attendees.has(Number(s.id)));
  const toggle = (id) => setAttendees((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const save = async () => {
    const topicRow = topicId && topicId !== "other" ? topics.find((t) => t.id === topicId) : null;
    const topicName = topicRow ? topicRow.name : otherText.trim();
    if (!topicName) { setError(topicId === "other" ? "Type the topic." : "Choose a topic."); return; }
    if (!kind) { setError("Choose Course, In-house session or Drill."); return; }
    if (!date) { setError("Enter the date."); return; }
    if (hours !== "" && !(Number(hours) >= 0)) { setError("Duration must be a number of hours."); return; }
    if (!attendees.size) { setError("Pick at least one attendee."); return; }
    setSaving(true);
    setError("");
    try {
      let saved = await saveOtherTraining(supabase, pharmacyId, {
        id: record?.id || null,
        staffId: self?.id || null,
        values: {
          topic_id: topicRow ? topicRow.id : otherTopicRow?.id || null, topic: topicName, kind, training_date: date,
          provider, duration_hours: hours, outcome, attendee_ids: [...attendees],
        },
      });
      if (file) {
        try {
          const withFile = await attachOtherTrainingFile(saved, file, kiosk);
          saved = { ...withFile, attendee_ids: saved.attendee_ids };
        } catch (e) {
          onSaved(saved);
          alert(`Saved, but the file couldn't be uploaded: ${e?.message || e}. You can try attaching it again.`);
          return;
        }
      }
      onSaved(saved);
    } catch (err) {
      setError(err?.message || String(err));
      setSaving(false);
    }
  };

  const removeFile = async () => {
    if (!window.confirm("Remove the attached file?")) return;
    try {
      const r = await removeOtherTrainingFile(current);
      setCurrent({ ...r, attendee_ids: current.attendee_ids });
      onSaved({ ...r, attendee_ids: current.attendee_ids }, { keepOpen: true });
    } catch (err) { setError(err?.message || String(err)); }
  };
  const remove = async () => {
    if (!window.confirm("Delete this training record (and its file) for everyone who attended? This can't be undone.")) return;
    try { await deleteOtherTraining(record); onDeleted?.(record.id); } catch (err) { setError(err?.message || String(err)); }
  };

  const field = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm";
  const label = "block text-xs font-semibold text-slate-500 mb-1";
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-[14px] w-full max-w-lg max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-lg font-bold text-slate-800">{record ? "Edit training" : isSelf ? "Add a course I've done" : "Add training"}</h2>
          <button onClick={onClose} className="w-10 h-10 text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <p className="text-[11px] text-slate-400">Other training doesn't count towards S2/S3 hours.</p>
          <div><label className={label}>Topic *</label>
            <select value={topicId} onChange={(e) => setTopicId(e.target.value)} className={field}>
              <option value="">Choose…</option>
              {pickable.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              <option value="other">Other…</option>
            </select>
            {topicId === "other" && <input value={otherText} onChange={(e) => setOtherText(e.target.value)} placeholder="What was it?" className={`${field} mt-2`} />}
          </div>
          <div><label className={label}>Kind *</label>
            <div className="flex gap-2">
              {KINDS.map((k) => (
                <button key={k.key} type="button" onClick={() => setKind(k.key)}
                  className={`flex-1 min-h-[40px] rounded-lg border text-sm ${kind === k.key ? "bg-[#EFF6FF] border-[#BFDBFE] text-[#1E3A8A] font-semibold" : "bg-white border-slate-200 text-slate-600"}`}>
                  {k.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={label}>Date *</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} /></div>
            <div><label className={label}>Duration (hours)</label><input inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Optional" className={field} /></div>
          </div>
          <div><label className={label}>Provider / presenter</label><input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="Optional" className={field} /></div>
          {!isSelf && (
            <div><label className={label}>Attendees * <span className="font-normal text-slate-400">({attendees.size} picked)</span></label>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                {people.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 px-3 min-h-[40px] text-sm text-slate-700">
                    <input type="checkbox" checked={attendees.has(Number(s.id))} onChange={() => toggle(Number(s.id))} />
                    {s.name}
                  </label>
                ))}
              </div>
              <div className="flex gap-3 mt-1">
                <button type="button" onClick={() => setAttendees(new Set(staffList.filter((s) => s.active !== false).map((s) => Number(s.id))))} className="text-xs text-[#1D4ED8]">Select everyone</button>
                <button type="button" onClick={() => setAttendees(new Set())} className="text-xs text-slate-500">Clear</button>
              </div>
            </div>
          )}
          <div><label className={label}>Outcome / notes</label>
            <textarea value={outcome} onChange={(e) => setOutcome(e.target.value)} rows={3}
              placeholder={kind === "drill" ? "What happened, anything to improve" : "Optional"} className={field} /></div>
          <div><label className={label}>{isSelf ? "Certificate" : "Attachment"} <span className="font-normal text-slate-400">(optional — PDF, JPG or PNG)</span></label>
            {current?.attachment_path && (
              <div className="flex items-center gap-3 mb-1.5 text-sm">
                <button type="button" onClick={() => openOtherTrainingFile(current, kiosk)} className="text-[#1D4ED8] hover:underline truncate">📎 {current.attachment_name || "Attached file"}</button>
                {!isSelf && <button type="button" onClick={removeFile} className="text-xs text-red-500">Remove</button>}
              </div>
            )}
            <input type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full text-sm" />
            {current?.attachment_path && file && <p className="text-[11px] text-amber-700 mt-1">This replaces the current file.</p>}
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
        <div className="px-5 py-3 border-t flex items-center gap-3">
          {record && !isSelf && <button onClick={remove} className="min-h-[44px] px-1 text-xs font-medium text-red-600 hover:underline">Delete</button>}
          <button onClick={onClose} className="min-h-[44px] px-4 rounded-lg text-sm text-slate-600 bg-slate-100">Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 min-h-[44px] rounded-lg text-sm font-semibold text-white bg-[#1D4ED8] disabled:opacity-40">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
