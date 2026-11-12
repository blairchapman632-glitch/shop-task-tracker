// QSPP → Incidents: report an incident, list of open / resolved incidents. Every save goes through /api/qspp/register
// (lib/qsppClient.js) — manager fields are re-checked there against the manager PIN; field lists in lib/qspp.js.
//   Staff (no PIN): report an incident (the report + action taken / actioned by / follow-up); on an OPEN incident add
//   or edit the action taken, actioned by and follow-up until it's actioned (locked once "actioned by" is saved). The
//   manager review section is shown read-only once filled in, and not at all while empty.
//   Manager mode (manager = { id, name, pin }): ManagerIncidentModal — every field: quality improvements, clinical /
//   non-clinical, third parties, open disclosure, feedback to staff, follow-up assigned to, date resolved (close /
//   reopen), Hide / Unhide, Delete. Opening one stamps manager_opened_at (clears "New incident to review" in Needs
//   attention). List badges: NEW (never opened in manager mode), "Open X days" (past the stale-days setting). The list
//   includes hidden incidents ("Show hidden"), the annual incident & feedback review, Export PDF.
//   openId: open this incident once it's loaded (?incident=<id> — /qspp asks for the manager PIN first).
// Extra sections (clinical / non-clinical, third parties, open disclosure, feedback to staff): ./IncidentExtras.
import { useEffect, useState } from "react";
import supabase from "../../lib/supabaseClient";
import IncidentExtras, { extrasFrom, extrasPatch, clinicalLabel, thirdPartySummary, disclosureSummary, CLINICAL_TYPES } from "./IncidentExtras";
import AnnualReviews from "./AnnualReviews";
import { buildRegisterPdf, downloadPdf } from "../../lib/registerPdf";
import { todayPerth } from "../../lib/performanceReview";
import { qsppCall } from "../../lib/qsppClient";
import { reviewStatus } from "../../lib/qspp";
import FollowUpDone from "./FollowUpDone";

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";

// The manager review section, read-only for staff — only the parts that have been filled in. Third parties, open
// disclosure and feedback to staff are never shown to staff (the server leaves them out of the staff list).
function ReviewReadOnly({ incident, staffName }) {
  const rows = [
    ["Quality improvements", incident.quality_improvement],
    ["Clinical / non-clinical", clinicalLabel(incident.clinical_type)],
    ["Follow-up assigned to", incident.assigned_to_staff_id ? staffName(incident.assigned_to_staff_id) : ""],
    ["Date resolved", incident.date_resolved],
  ].filter(([, v]) => v);
  if (!rows.length) return null;
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2.5 space-y-1.5">
      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Manager review</div>
      {rows.map(([k, v]) => (
        <div key={k}>
          <div className="text-xs font-semibold text-slate-500">{k}</div>
          <div className="text-sm text-slate-700 whitespace-pre-line">{v}</div>
        </div>
      ))}
    </div>
  );
}

// Staff: action taken / actioned by / follow-up on an open incident, until it's actioned
function EditIncidentModal({ incident, staffList, onClose, onSaved, onRowChanged }) {
  const resolved = !!incident.date_resolved;
  const actionLocked = resolved || !!incident.actioned_by_staff_id;
  const [actionNeeded, setActionNeeded] = useState(incident.action_needed || "");
  const [actionedById, setActionedById] = useState(incident.actioned_by_staff_id || "");
  const [followUpRequired, setFollowUpRequired] = useState(incident.follow_up_required || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const staffName = (id) => staffList.find((s) => Number(s.id) === Number(id))?.name || "";
  const reporterName = staffName(incident.reporter_staff_id) || "Unknown";
  const field = `w-full border border-slate-200 rounded-lg px-3 py-2 text-sm ${actionLocked ? "bg-slate-50 text-slate-500" : ""}`;

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const { row } = await qsppCall({
        action: "staff-update", kind: "incident", id: incident.id,
        patch: { action_needed: actionNeeded.trim() || null, actioned_by_staff_id: actionedById ? Number(actionedById) : null, follow_up_required: followUpRequired.trim() || null },
      });
      onSaved(row);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-800">Incident #{incident.report_number}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        <div className="bg-slate-50 rounded-lg p-3 mb-4 space-y-1">
          <p className="text-xs text-slate-400">Reported by {reporterName} · {incident.incident_date}</p>
          <p className="text-sm text-slate-800">{incident.nature_of_incident}</p>
        </div>

        <div className="space-y-3">
          {resolved && (
            <p className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">Resolved {incident.date_resolved} — a manager can reopen it (🔒 Manager).</p>
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Specific action taken</label>
            <textarea value={actionNeeded} onChange={(e) => setActionNeeded(e.target.value)} rows={2} placeholder="What was done" disabled={actionLocked} className={field} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Actioned by</label>
            <select value={actionedById} onChange={(e) => setActionedById(e.target.value)} disabled={actionLocked} className={field}>
              <option value="">Not yet actioned</option>
              {staffList.filter((s) => s.active !== false || Number(s.id) === Number(actionedById)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Follow-up required</label>
            <textarea value={followUpRequired} onChange={(e) => setFollowUpRequired(e.target.value)} rows={2} placeholder="Anything still needing to happen" disabled={actionLocked} className={field} />
          </div>
          {!resolved && actionLocked && <p className="text-[11px] text-slate-400">The action is recorded — a manager can change it (🔒 Manager).</p>}

          <FollowUpDone kind="incident" row={incident} staffName={staffName} onDone={onRowChanged} />

          <ReviewReadOnly incident={incident} staffName={staffName} />

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
              {actionLocked ? "Close" : "Cancel"}
            </button>
            {!actionLocked && (
              <button onClick={handleSave} disabled={saving}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-[#1D4ED8] hover:bg-blue-800 disabled:opacity-40 transition-colors">
                {saving ? "Saving…" : "Save"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Report an incident. Staff: the report + action taken / actioned by / follow-up. Manager mode also: clinical /
// non-clinical, assign follow-up to, quality improvements.
function ReportIncidentForm({ staffList, manager, onClose, onSaved }) {
  const [reporterId, setReporterId] = useState(manager ? String(manager.id) : "");
  const [incidentDate, setIncidentDate] = useState(() => todayPerth()); // Perth date (UTC would be yesterday before 8am)
  const [natureOfIncident, setNatureOfIncident] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [incidentTime, setIncidentTime] = useState("");
  const [personName, setPersonName] = useState("");
  const [personDob, setPersonDob] = useState("");
  const [personOccupation, setPersonOccupation] = useState("");
  const [personAddress, setPersonAddress] = useState("");
  const [personPostcode, setPersonPostcode] = useState("");
  const [personPhoneH, setPersonPhoneH] = useState("");
  const [personPhoneB, setPersonPhoneB] = useState("");
  const [personPhoneM, setPersonPhoneM] = useState("");
  const [witnesses, setWitnesses] = useState("");
  const [actionNeeded, setActionNeeded] = useState("");
  const [actionedById, setActionedById] = useState("");
  const [qualityImprovement, setQualityImprovement] = useState("");
  const [followUpRequired, setFollowUpRequired] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [clinicalType, setClinicalType] = useState("");

  const canSubmit = reporterId && incidentDate && natureOfIncident.trim().length > 0;
  const activeStaff = staffList.filter((s) => s.active !== false);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError("");
    try {
      const fields = {
        reporter_staff_id: Number(reporterId),
        incident_date: incidentDate,
        incident_time: incidentTime || null,
        nature_of_incident: natureOfIncident.trim(),
        person_name: personName || null,
        person_dob: personDob || null,
        person_occupation: personOccupation || null,
        person_address: personAddress || null,
        person_postcode: personPostcode || null,
        person_phone_h: personPhoneH || null,
        person_phone_b: personPhoneB || null,
        person_phone_m: personPhoneM || null,
        witnesses: witnesses || null,
        action_needed: actionNeeded || null,
        actioned_by_staff_id: actionedById ? Number(actionedById) : null,
        follow_up_required: followUpRequired || null,
        ...(manager ? {
          quality_improvement: qualityImprovement || null,
          assigned_to_staff_id: assignedToId ? Number(assignedToId) : null,
          clinical_type: clinicalType || null,
        } : {}),
      };
      const { row } = await qsppCall({ action: "report", kind: "incident", fields, ...(manager ? { pin: manager.pin } : {}) });
      onSaved(row);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const field = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm";
  const label = "block text-xs font-semibold text-slate-500 mb-1";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-800">Report an incident</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className={label}>Your name *</label>
            <select value={reporterId} onChange={(e) => setReporterId(e.target.value)} className={field}>
              <option value="">Select your name…</option>
              {activeStaff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div>
            <label className={label}>Date of incident *</label>
            <input type="date" value={incidentDate} onChange={(e) => setIncidentDate(e.target.value)} className={field} />
          </div>

          <div>
            <label className={label}>What happened *</label>
            <textarea value={natureOfIncident} onChange={(e) => setNatureOfIncident(e.target.value)} rows={3} className={field} placeholder="Describe the incident…" />
          </div>

          {manager && (
            <div>
              <label className={label}>Clinical / non-clinical</label>
              <div className="flex gap-2">
                {CLINICAL_TYPES.map((c) => (
                  <button key={c.key} type="button" onClick={() => setClinicalType(clinicalType === c.key ? "" : c.key)}
                    className={`flex-1 min-h-[40px] rounded-lg border text-sm ${clinicalType === c.key ? "bg-[#EFF6FF] border-[#BFDBFE] text-[#1E3A8A] font-semibold" : "bg-white border-slate-200 text-slate-600"}`}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide pt-1">Action</div>

          <div>
            <label className={label}>Specific action taken</label>
            <textarea value={actionNeeded} onChange={(e) => setActionNeeded(e.target.value)} rows={2} placeholder="What was done" className={field} />
          </div>

          <div>
            <label className={label}>Actioned by</label>
            <select value={actionedById} onChange={(e) => setActionedById(e.target.value)} className={field}>
              <option value="">Not yet actioned</option>
              {activeStaff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div>
            <label className={label}>Follow-up required</label>
            <textarea value={followUpRequired} onChange={(e) => setFollowUpRequired(e.target.value)} rows={2} placeholder="Anything still needing to happen" className={field} />
          </div>

          {manager && (
            <>
              <div>
                <label className={label}>Assign follow-up to</label>
                <select value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)} className={field}>
                  <option value="">No one yet</option>
                  {activeStaff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className={label}>Quality improvements</label>
                <textarea value={qualityImprovement} onChange={(e) => setQualityImprovement(e.target.value)} rows={2} placeholder="Quality improvements resulting from this incident" className={field} />
              </div>
            </>
          )}

          <button onClick={() => setShowMore((v) => !v)} className="text-sm font-medium text-slate-500 hover:text-slate-700">
            {showMore ? "− Hide more details" : "+ Add more details (optional)"}
          </button>

          {showMore && (
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div>
                <label className={label}>Time of incident</label>
                <input type="time" value={incidentTime} onChange={(e) => setIncidentTime(e.target.value)} className={field} />
              </div>

              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide pt-1">Person / patient involved</div>

              <input value={personName} onChange={(e) => setPersonName(e.target.value)} placeholder="Name" className={field} />
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={personDob} onChange={(e) => setPersonDob(e.target.value)} placeholder="Date of birth" className={field} />
                <input value={personOccupation} onChange={(e) => setPersonOccupation(e.target.value)} placeholder="Occupation" className={field} />
              </div>
              <input value={personAddress} onChange={(e) => setPersonAddress(e.target.value)} placeholder="Address" className={field} />
              <input value={personPostcode} onChange={(e) => setPersonPostcode(e.target.value)} placeholder="Postcode" className={field} />
              <div className="grid grid-cols-3 gap-2">
                <input value={personPhoneH} onChange={(e) => setPersonPhoneH(e.target.value)} placeholder="Phone (H)" className={field} />
                <input value={personPhoneB} onChange={(e) => setPersonPhoneB(e.target.value)} placeholder="Phone (B)" className={field} />
                <input value={personPhoneM} onChange={(e) => setPersonPhoneM(e.target.value)} placeholder="Phone (M)" className={field} />
              </div>

              <textarea value={witnesses} onChange={(e) => setWitnesses(e.target.value)} rows={2} placeholder="Witnesses" className={field} />
            </div>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">Cancel</button>
            <button onClick={handleSubmit} disabled={!canSubmit || saving}
              className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-[#1D4ED8] hover:bg-blue-800 disabled:opacity-40 transition-colors">
              {saving ? "Saving…" : "Submit"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Manager mode: every field (incl. the review section, reassign, close / reopen), Hide / Unhide, Delete
function ManagerIncidentModal({ incident, staffList, manager, onClose, onUpdate, onDelete }) {
  const [actionNeeded, setActionNeeded] = useState(incident.action_needed || "");
  const [actionedById, setActionedById] = useState(incident.actioned_by_staff_id || "");
  const [qualityImprovement, setQualityImprovement] = useState(incident.quality_improvement || "");
  const [followUpRequired, setFollowUpRequired] = useState(incident.follow_up_required || "");
  const [assignedToId, setAssignedToId] = useState(incident.assigned_to_staff_id || "");
  const [dateResolved, setDateResolved] = useState(incident.date_resolved || "");
  const [extras, setExtras] = useState(extrasFrom(incident));
  const [saving, setSaving] = useState(false);

  const staffName = (id) => staffList.find((s) => Number(s.id) === Number(id))?.name || "";
  const reporterName = staffName(incident.reporter_staff_id) || "Unknown";
  // Given by: as saved, or the person in manager mode once a date is entered (the server records it on save)
  const givenBy = extras.staff_feedback_date
    ? (incident.staff_feedback_by_staff_id && extras.staff_feedback_date === incident.staff_feedback_date ? staffName(incident.staff_feedback_by_staff_id) : manager?.name || "")
    : "";
  const field = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#BFDBFE]";
  const label = "block text-xs font-semibold text-slate-500 mb-1";

  const handleSave = async () => {
    setSaving(true);
    const ok = await onUpdate(incident.id, {
      action_needed: actionNeeded || null,
      actioned_by_staff_id: actionedById ? Number(actionedById) : null,
      quality_improvement: qualityImprovement || null,
      follow_up_required: followUpRequired || null,
      assigned_to_staff_id: assignedToId ? Number(assignedToId) : null,
      date_resolved: dateResolved || null,
      ...extrasPatch(extras),
    });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-[14px] max-w-lg w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-b">
          <h2 className="text-lg font-bold text-slate-800">Incident #{incident.report_number}</h2>
          <div className="flex items-center gap-1">
            <button onClick={() => onUpdate(incident.id, { hidden: !incident.hidden })}
              className="min-h-[40px] px-3 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50">
              {incident.hidden ? "Unhide" : "Hide"}
            </button>
            <button onClick={onClose} className="w-10 h-10 text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div className="bg-slate-50 rounded-lg p-3 space-y-1">
            <p className="text-xs text-slate-400">Reported by {reporterName} · {incident.incident_date}{incident.incident_time ? ` · ${incident.incident_time}` : ""}</p>
            <p className="text-sm text-slate-800">{incident.nature_of_incident}</p>
          </div>
          {(incident.person_name || incident.witnesses) && (
            <div className="bg-slate-50 rounded-lg p-3 space-y-1 text-xs text-slate-600">
              {incident.person_name && <p><span className="font-medium">Person involved:</span> {incident.person_name}</p>}
              {incident.witnesses && <p><span className="font-medium">Witnesses:</span> {incident.witnesses}</p>}
            </div>
          )}
          <div><label className={label}>Specific action taken</label>
            <textarea value={actionNeeded} onChange={(e) => setActionNeeded(e.target.value)} rows={2} placeholder="What was done" className={field} /></div>
          <div><label className={label}>Follow-up required</label>
            <textarea value={followUpRequired} onChange={(e) => setFollowUpRequired(e.target.value)} rows={2} placeholder="Anything still needing to happen" className={field} /></div>
          <div><label className={label}>Actioned by</label>
            <select value={actionedById} onChange={(e) => setActionedById(e.target.value)} className={field}>
              <option value="">Not yet actioned</option>
              {staffList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></div>

          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide pt-2 border-t">Manager review</div>
          <div><label className={label}>Quality improvements</label>
            <textarea value={qualityImprovement} onChange={(e) => setQualityImprovement(e.target.value)} rows={2} className={field} /></div>
          <IncidentExtras value={extras} onChange={setExtras} staffList={staffList} manager givenBy={givenBy} />
          {/* The saved follow-up's state (assigned / done note); reassigning below clears "Follow-up done" */}
          <FollowUpDone kind="incident" row={incident} staffName={staffName} readOnly />
          <div className="grid grid-cols-2 gap-3">
            <div><label className={label}>Follow-up assigned to</label>
              <select value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)} className={field}>
                <option value="">No one yet</option>
                {staffList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select></div>
            <div><label className={label}>Date resolved</label>
              <input type="date" value={dateResolved} onChange={(e) => setDateResolved(e.target.value)} className={field} />
              {incident.date_resolved && (
                <button type="button" onClick={() => setDateResolved("")} className="mt-1 text-xs font-medium text-[#1D4ED8] hover:underline">Reopen</button>
              )}</div>
          </div>
        </div>
        <div className="px-5 py-3 border-t flex items-center gap-3">
          <button onClick={() => onDelete(incident.id)} className="min-h-[44px] px-1 text-xs font-medium text-red-600 hover:underline">Delete</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 min-h-[44px] rounded-lg text-sm font-semibold text-white bg-[#1D4ED8] hover:bg-blue-800 disabled:opacity-40">
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// viewId: open this incident in the staff view without a PIN (the kiosk's "follow-up to do" job: ?view=incident&id=)
export default function StaffIncidents({ manager = null, openId = null, onOpenedId, viewId = null, onViewedId, staleDays = null, onChanged }) {
  const isManager = !!manager;
  const [incidents, setIncidents] = useState([]);
  const [incidentsLoading, setIncidentsLoading] = useState(true);
  const [staffList, setStaffList] = useState([]);
  const [showReportForm, setShowReportForm] = useState(false);
  const [openIncident, setOpenIncident] = useState(null);
  const [showHidden, setShowHidden] = useState(false); // manager only
  const [statusFilter, setStatusFilter] = useState("all"); // all | open | resolved
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState("");

  // Staff: the server's staff list (no hidden incidents, no third parties / open disclosure / feedback to staff).
  // Manager mode: everything, hidden ones too (shown with "Show hidden").
  const refreshIncidents = async () => {
    let inc = [];
    if (isManager) {
      const { data } = await supabase.from("incidents").select("*").eq("pharmacy_id", PHARMACY_ID).order("incident_date", { ascending: false });
      inc = data || [];
    } else {
      try { inc = (await qsppCall({ action: "list", kind: "incident" })).rows || []; } catch (err) { setNotice(err.message); }
    }
    setIncidents(inc);
    return inc;
  };

  useEffect(() => {
    const loadIncidents = async () => {
      const { data: staff } = await supabase
        .from("staff")
        .select("id, name, active")
        .eq("pharmacy_id", PHARMACY_ID)
        .or("role.is.null,role.neq.Locum")
        .order("name");
      setStaffList(staff || []);
      await refreshIncidents();
      setIncidentsLoading(false);
    };
    setOpenIncident(null);
    loadIncidents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManager]);

  const replaceRow = (row) => { setIncidents((prev) => prev.map((i) => (i.id === row.id ? row : i))); onChanged?.(); };

  // First opened in manager mode -> manager_opened_at (clears "New incident to review")
  const openOne = async (inc) => {
    setOpenIncident(inc);
    if (!isManager || inc.manager_opened_at) return;
    try {
      const { row } = await qsppCall({ action: "manager-open", kind: "incident", id: inc.id, pin: manager.pin });
      replaceRow(row);
      setOpenIncident((cur) => (cur && cur.id === row.id ? { ...cur, manager_opened_at: row.manager_opened_at } : cur));
    } catch (err) {
      setNotice(err.message);
    }
  };

  // ?incident=<id>: open it once the list is loaded (manager mode)
  useEffect(() => {
    if (!openId || incidentsLoading || !isManager) return;
    const inc = incidents.find((i) => String(i.id) === String(openId));
    if (inc) openOne(inc);
    else setNotice("That incident wasn't found.");
    onOpenedId?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, incidentsLoading, isManager]);

  // ?view=incident&id=<id>: open it (staff view, or the manager editor if manager mode is already on)
  useEffect(() => {
    if (!viewId || incidentsLoading) return;
    const inc = incidents.find((i) => String(i.id) === String(viewId));
    if (inc) openOne(inc);
    else setNotice("That incident wasn't found.");
    onViewedId?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewId, incidentsLoading]);

  const staffName = (id) => staffList.find((s) => Number(s.id) === Number(id))?.name || "";
  const term = search.trim().toLowerCase();
  const visible = incidents
    .filter((i) => !i.hidden || (isManager && showHidden))
    .filter((i) => statusFilter === "all" || (statusFilter === "resolved" ? !!i.date_resolved : !i.date_resolved))
    .filter((i) => !term || [i.nature_of_incident, i.action_needed, i.person_name, String(i.report_number)].some((v) => String(v || "").toLowerCase().includes(term)));

  // Incident register PDF (what the list is showing)
  const exportPdf = async () => {
    setExporting(true);
    try {
      const { data: ps } = await supabase.from("pharmacy_settings").select("name").eq("pharmacy_id", PHARMACY_ID).maybeSingle();
      const { bytes, warnings } = await buildRegisterPdf({
        heading: "Incident Register", pharmacyName: ps?.name || "", generatedOn: todayPerth(), generatedBy: manager?.name || "",
        filterLabel: [statusFilter === "all" ? "All incidents" : statusFilter === "open" ? "Open" : "Resolved", term ? `search "${search.trim()}"` : "", isManager && showHidden ? "incl. hidden" : ""].filter(Boolean).join(", "),
        itemWord: "incident",
        // Third parties / disclosure / staff told: manager mode only
        columns: [
          { key: "no", label: "#", w: 32 },
          { key: "date", label: "Date", w: 62 },
          { key: "type", label: "Type", w: 62 },
          { key: "what", label: "What happened", w: isManager ? 205 : 285 },
          { key: "action", label: "Action / improvement", w: isManager ? 175 : 255 },
          ...(isManager ? [{ key: "reported", label: "Third parties / disclosure / staff told", w: 160 }] : []),
          { key: "status", label: "Status", w: 73 },
        ],
        rows: visible.map((i) => ({
          no: String(i.report_number ?? ""),
          date: i.incident_date || "",
          type: clinicalLabel(i.clinical_type),
          what: i.nature_of_incident || "",
          action: [i.action_needed, i.quality_improvement ? `Improvement: ${i.quality_improvement}` : ""].filter(Boolean).join(" — "),
          reported: [thirdPartySummary(i) ? `Reported: ${thirdPartySummary(i)}` : "", disclosureSummary(i, staffName),
            i.staff_feedback_date ? `Staff told ${i.staff_feedback_date}${i.staff_feedback_how ? ` (${i.staff_feedback_how})` : ""}${i.staff_feedback_by_staff_id && staffName(i.staff_feedback_by_staff_id) ? ` by ${staffName(i.staff_feedback_by_staff_id)}` : ""}` : ""].filter(Boolean).join(" · "),
          status: i.date_resolved ? `Resolved ${i.date_resolved}` : "Open",
          _red: i.date_resolved ? [] : ["status"],
        })),
      });
      downloadPdf(bytes, `incident_register_${todayPerth()}.pdf`);
      if (warnings.length) alert(warnings.join("\n"));
    } catch (err) {
      alert("Couldn't create the PDF: " + (err?.message || String(err)));
    } finally {
      setExporting(false);
    }
  };
  const hiddenCount = incidents.filter((i) => i.hidden).length;

  const handleUpdate = async (id, patch) => {
    try {
      const { row } = await qsppCall({ action: "manager-update", kind: "incident", id, patch, pin: manager.pin });
      replaceRow(row);
      setOpenIncident(row);
      return true;
    } catch (err) {
      alert("Save failed: " + err.message);
      return false;
    }
  };
  const handleDelete = async (id) => {
    if (!window.confirm("Delete this incident permanently? This cannot be undone.")) return;
    try {
      await qsppCall({ action: "delete", kind: "incident", id, pin: manager.pin });
      setIncidents((prev) => prev.filter((i) => i.id !== id));
      setOpenIncident(null);
      onChanged?.();
    } catch (err) {
      alert("Delete failed: " + err.message);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-5">
      <button onClick={() => setShowReportForm(true)}
        className="w-full min-h-[44px] mb-4 px-4 rounded-[12px] text-sm font-semibold text-white bg-[#1D4ED8] hover:bg-blue-800 transition-colors">
        + Report an incident
      </button>
      {notice && <p className="mb-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">{notice}</p>}
      {isManager && <AnnualReviews manager={manager} staffList={staffList} />}
      <div className="mb-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {[{ k: "all", l: "All" }, { k: "open", l: "Open" }, { k: "resolved", l: "Resolved" }].map((o) => (
            <button key={o.k} onClick={() => setStatusFilter(o.k)}
              className={`min-h-[36px] px-3 rounded-full text-sm border ${statusFilter === o.k ? "bg-[#EFF6FF] border-[#BFDBFE] text-[#1E3A8A] font-semibold" : "bg-white border-[#E5E7EB] text-slate-600 hover:bg-slate-50"}`}>
              {o.l}
            </button>
          ))}
          {isManager && hiddenCount > 0 && (
            <button onClick={() => setShowHidden((v) => !v)} className="min-h-[36px] px-3 text-xs text-slate-500 hover:text-slate-700">
              {showHidden ? "Hide hidden incidents" : `Show hidden (${hiddenCount})`}
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search incidents…"
            className="flex-1 min-h-[44px] border border-[#E5E7EB] rounded-[12px] px-4 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#BFDBFE]" />
          <button onClick={exportPdf} disabled={exporting}
            className="min-h-[44px] px-4 rounded-[12px] text-sm font-medium bg-white border border-[#E5E7EB] text-slate-700 hover:bg-slate-50 disabled:opacity-40 shrink-0">
            {exporting ? "Creating…" : "↓ Export PDF"}
          </button>
        </div>
      </div>
      {showReportForm && (
        <ReportIncidentForm
          staffList={staffList}
          manager={manager}
          onClose={() => setShowReportForm(false)}
          onSaved={async () => {
            setShowReportForm(false);
            await refreshIncidents();
            onChanged?.();
          }}
        />
      )}
      {incidentsLoading ? (
        <p className="text-sm text-slate-400 py-10">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-slate-400 px-1 py-12 text-center">{incidents.length ? "No incidents match." : "No incidents logged yet."}</p>
      ) : (
        <div className="space-y-2">
          {visible.map((inc) => {
            const resolved = !!inc.date_resolved;
            const st = isManager ? reviewStatus("incident", inc, staleDays) : null;
            return (
              <button key={inc.id} onClick={() => openOne(inc)}
                className={`w-full text-left bg-white rounded-[14px] border border-[#E5E7EB] px-4 py-3 hover:bg-slate-50 transition-colors ${inc.hidden ? "opacity-60" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-400">#{inc.report_number} · {inc.incident_date}</span>
                  <span className="flex flex-wrap items-center justify-end gap-1">
                    {st?.isNew && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-600 text-white">NEW</span>}
                    {st?.stale && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">Open {st.days} days</span>}
                    {inc.hidden && <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Hidden</span>}
                    {inc.clinical_type && <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{clinicalLabel(inc.clinical_type)}</span>}
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      resolved ? "bg-green-50 text-green-700 border-green-200" : "bg-amber-50 text-amber-700 border-amber-200"
                    }`}>
                      {resolved ? "RESOLVED" : "OPEN"}
                    </span>
                  </span>
                </div>
                <p className="text-sm text-slate-700 mt-1.5 line-clamp-2">{inc.nature_of_incident}</p>
                {inc.assigned_to_staff_id && (
                  <div className="mt-1.5 text-[11px] text-[#475569]">Assigned: {staffName(inc.assigned_to_staff_id)}</div>
                )}
              </button>
            );
          })}
        </div>
      )}
      {openIncident && (isManager ? (
        <ManagerIncidentModal
          key={openIncident.id}
          incident={openIncident}
          staffList={staffList}
          manager={manager}
          onClose={() => setOpenIncident(null)}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      ) : (
        <EditIncidentModal
          key={openIncident.id}
          incident={openIncident}
          staffList={staffList}
          onClose={() => setOpenIncident(null)}
          onSaved={(row) => {
            replaceRow(row);
            setOpenIncident(null);
          }}
          onRowChanged={(row) => { replaceRow(row); setOpenIncident(row); }}
        />
      ))}
    </div>
  );
}
