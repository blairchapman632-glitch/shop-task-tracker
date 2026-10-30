// /qspp → Incidents: the extra incident sections (QSPP 1.2 / 2.7 / 4.7) shared by the staff and manager editors:
//   Clinical / non-clinical · Reported to third parties (several) · Open disclosure · Feedback to staff.
// Staff (no PIN): fill what's still empty — sections already saved are read-only (like incident actions), and saved
// third-party reports can't be removed. Manager mode: everything editable.
import { useState } from "react";
import { todayPerth } from "../../lib/performanceReview";

export const CLINICAL_TYPES = [
  { key: "clinical", label: "Clinical" },
  { key: "non_clinical", label: "Non-clinical" },
];
export const THIRD_PARTIES = ["PDL (insurer)", "TGA", "Manufacturer", "Pharmacy Board", "Other"];
export const clinicalLabel = (k) => CLINICAL_TYPES.find((c) => c.key === k)?.label || "";

// Incident row -> editable values
export const extrasFrom = (inc = {}) => ({
  clinical_type: inc.clinical_type || "",
  third_party_reports: Array.isArray(inc.third_party_reports) ? inc.third_party_reports : [],
  patient_harmed: inc.patient_harmed === true ? "yes" : inc.patient_harmed === false ? "no" : "",
  disclosure_date: inc.disclosure_date || "",
  disclosure_by_staff_id: inc.disclosure_by_staff_id || "",
  disclosure_notes: inc.disclosure_notes || "",
  staff_feedback_date: inc.staff_feedback_date || "",
  staff_feedback_how: inc.staff_feedback_how || "",
});
// Editable values -> incident columns
export const extrasPatch = (x) => {
  const harmed = x.patient_harmed === "yes" ? true : x.patient_harmed === "no" ? false : null;
  return {
    clinical_type: x.clinical_type || null,
    third_party_reports: (x.third_party_reports || []).filter((r) => r.to),
    patient_harmed: harmed,
    disclosure_date: harmed ? x.disclosure_date || null : null,
    disclosure_by_staff_id: harmed && x.disclosure_by_staff_id ? Number(x.disclosure_by_staff_id) : null,
    disclosure_notes: harmed ? String(x.disclosure_notes || "").trim() || null : null,
    staff_feedback_date: x.staff_feedback_date || null,
    staff_feedback_how: String(x.staff_feedback_how || "").trim() || null,
  };
};
// One-line summaries (register list / PDF)
export const thirdPartySummary = (inc) => (Array.isArray(inc.third_party_reports) ? inc.third_party_reports : [])
  .map((r) => `${r.to}${r.date ? ` ${r.date}` : ""}`).join("; ");
export const disclosureSummary = (inc, staffName) => (inc.patient_harmed === true
  ? `Patient harmed — discussed ${inc.disclosure_date || "(no date)"}${inc.disclosure_by_staff_id && staffName(inc.disclosure_by_staff_id) ? ` by ${staffName(inc.disclosure_by_staff_id)}` : ""}`
  : inc.patient_harmed === false ? "No patient harm" : "");

// saved: the incident as saved (staff lock what's already filled); manager: everything editable
export default function IncidentExtras({ value, onChange, staffList, saved = null, manager = false }) {
  const [newReport, setNewReport] = useState({ to: "", date: todayPerth(), notes: "" });
  const set = (patch) => onChange({ ...value, ...patch });
  const s = saved || {};
  const lock = {
    clinical: !manager && !!s.clinical_type,
    disclosure: !manager && (s.patient_harmed === false || (s.patient_harmed === true && !!s.disclosure_date)),
    staffFeedback: !manager && !!s.staff_feedback_date,
  };
  const savedReports = !manager && Array.isArray(s.third_party_reports) ? s.third_party_reports.length : 0;

  const field = (locked) => `w-full border border-slate-200 rounded-lg px-3 py-2 text-sm ${locked ? "bg-slate-50 text-slate-500" : ""}`;
  const label = "block text-xs font-semibold text-slate-500 mb-1";
  const section = "rounded-lg border border-slate-200 p-3 space-y-2";
  const active = staffList.filter((x) => x.active !== false || String(x.id) === String(value.disclosure_by_staff_id));

  const addReport = () => {
    if (!newReport.to) return;
    set({ third_party_reports: [...value.third_party_reports, { to: newReport.to, date: newReport.date || null, notes: newReport.notes.trim() || null }] });
    setNewReport({ to: "", date: todayPerth(), notes: "" });
  };

  return (
    <div className="space-y-3">
      <div>
        <label className={label}>Clinical / non-clinical</label>
        <div className="flex gap-2">
          {CLINICAL_TYPES.map((c) => (
            <button key={c.key} type="button" disabled={lock.clinical}
              onClick={() => set({ clinical_type: value.clinical_type === c.key ? "" : c.key })}
              className={`flex-1 min-h-[40px] rounded-lg border text-sm ${value.clinical_type === c.key ? "bg-[#EFF6FF] border-[#BFDBFE] text-[#1E3A8A] font-semibold" : "bg-white border-slate-200 text-slate-600"} disabled:opacity-60`}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className={section}>
        <div className="text-xs font-semibold text-slate-500">Reported to third parties</div>
        {value.third_party_reports.length === 0 ? (
          <p className="text-xs text-slate-400">Not reported to anyone.</p>
        ) : (
          <div className="space-y-1">
            {value.third_party_reports.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <span className="flex-1">
                  <span className="font-medium">{r.to}</span>{r.date ? ` · ${r.date}` : ""}
                  {r.notes && <span className="block text-xs text-slate-500">{r.notes}</span>}
                </span>
                {i >= savedReports && (
                  <button type="button" onClick={() => set({ third_party_reports: value.third_party_reports.filter((_, j) => j !== i) })}
                    className="text-xs text-red-500 px-1">Remove</button>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <select value={newReport.to} onChange={(e) => setNewReport({ ...newReport, to: e.target.value })} className={field(false)}>
            <option value="">Add — reported to…</option>
            {THIRD_PARTIES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input type="date" value={newReport.date} onChange={(e) => setNewReport({ ...newReport, date: e.target.value })} className={field(false)} />
          <input value={newReport.notes} onChange={(e) => setNewReport({ ...newReport, notes: e.target.value })} placeholder="Notes (optional)" className={`${field(false)} col-span-2`} />
        </div>
        {newReport.to && (
          <button type="button" onClick={addReport} className="text-sm font-medium text-[#1D4ED8]">+ Add this report</button>
        )}
      </div>

      <div className={section}>
        <div className="text-xs font-semibold text-slate-500">Open disclosure — was a patient harmed?</div>
        <div className="flex gap-2">
          {[{ k: "yes", l: "Yes" }, { k: "no", l: "No" }].map((o) => (
            <button key={o.k} type="button" disabled={lock.disclosure}
              onClick={() => set({ patient_harmed: value.patient_harmed === o.k ? "" : o.k })}
              className={`flex-1 min-h-[40px] rounded-lg border text-sm ${value.patient_harmed === o.k ? "bg-[#EFF6FF] border-[#BFDBFE] text-[#1E3A8A] font-semibold" : "bg-white border-slate-200 text-slate-600"} disabled:opacity-60`}>
              {o.l}
            </button>
          ))}
        </div>
        {value.patient_harmed === "yes" && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={label}>Date discussed with patient</label>
                <input type="date" value={value.disclosure_date} disabled={lock.disclosure} onChange={(e) => set({ disclosure_date: e.target.value })} className={field(lock.disclosure)} />
              </div>
              <div>
                <label className={label}>Discussed by</label>
                <select value={value.disclosure_by_staff_id} disabled={lock.disclosure} onChange={(e) => set({ disclosure_by_staff_id: e.target.value })} className={field(lock.disclosure)}>
                  <option value="">Choose…</option>
                  {active.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </div>
            </div>
            <textarea value={value.disclosure_notes} disabled={lock.disclosure} onChange={(e) => set({ disclosure_notes: e.target.value })}
              rows={2} placeholder="What was discussed" className={field(lock.disclosure)} />
          </div>
        )}
      </div>

      <div className={section}>
        <div className="text-xs font-semibold text-slate-500">Feedback to staff</div>
        <div className="grid grid-cols-[9rem_1fr] gap-2">
          <input type="date" value={value.staff_feedback_date} disabled={lock.staffFeedback} onChange={(e) => set({ staff_feedback_date: e.target.value })} className={field(lock.staffFeedback)} />
          <input value={value.staff_feedback_how} disabled={lock.staffFeedback} onChange={(e) => set({ staff_feedback_how: e.target.value })}
            placeholder="How it was shared (staff meeting, message, Wall…)" className={field(lock.staffFeedback)} />
        </div>
      </div>
    </div>
  );
}
