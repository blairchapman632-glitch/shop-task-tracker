// QSPP → Incidents: report an incident, list of open / resolved incidents.
//   Staff (no PIN): open an incident to update its actions and mark their part done (action taken, actioned by,
//   follow-up, quality improvements — locked once filled, as before). Reassigning and closing (date resolved) are
//   shown read-only.
//   Manager mode (manager = { id, name }): ManagerIncidentModal — every field incl. reassign / close, Hide / Unhide,
//   Delete; the list includes hidden incidents ("Show hidden").
import { useEffect, useState } from "react";
import supabase from "../../lib/supabaseClient";

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";

function EditIncidentModal({ incident, staffList, onClose, onSaved }) {
  const [actionNeeded, setActionNeeded] = useState(incident.action_needed || "");
  const [actionedById, setActionedById] = useState(incident.actioned_by_staff_id || "");
  const [qualityImprovement, setQualityImprovement] = useState(incident.quality_improvement || "");
  const actionLocked = !!incident.actioned_by_staff_id;
  const resolvedLocked = !!incident.date_resolved;
  const [followUpRequired, setFollowUpRequired] = useState(incident.follow_up_required || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const reporterName = staffList.find((s) => s.id === incident.reporter_staff_id)?.name || "Unknown";

  const handleSave = async () => {
    setSaving(true);
    setError("");
    const { error: err } = await supabase
      .from("incidents")
      .update({
        action_needed: actionNeeded || null,
        actioned_by_staff_id: actionedById || null,
        quality_improvement: qualityImprovement || null,
        follow_up_required: followUpRequired || null,
        updated_at: new Date().toISOString(), // reassigning / closing are manager-only (ManagerIncidentModal)
      })
      .eq("id", incident.id);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    onSaved();
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
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Specific action taken</label>
            <textarea
              value={actionNeeded}
              onChange={(e) => setActionNeeded(e.target.value)}
              rows={2}
              placeholder="What was done"
              disabled={actionLocked}
              className={`w-full border border-slate-200 rounded-lg px-3 py-2 text-sm ${actionLocked ? "bg-slate-50 text-slate-500" : ""}`}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Actioned by</label>
            <select
              value={actionedById}
              onChange={(e) => setActionedById(e.target.value)}
              disabled={actionLocked}
              className={`w-full border border-slate-200 rounded-lg px-3 py-2 text-sm ${actionLocked ? "bg-slate-50 text-slate-500" : ""}`}
            >
              <option value="">Not yet actioned</option>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Follow-up required</label>
            <textarea
              value={followUpRequired}
              onChange={(e) => setFollowUpRequired(e.target.value)}
              rows={2}
              placeholder="Anything still needing to happen"
              disabled={actionLocked}
              className={`w-full border border-slate-200 rounded-lg px-3 py-2 text-sm ${actionLocked ? "bg-slate-50 text-slate-500" : ""}`}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Quality improvements</label>
            <textarea
              value={qualityImprovement}
              onChange={(e) => setQualityImprovement(e.target.value)}
              rows={2}
              placeholder="Quality improvements resulting from this incident"
              disabled={resolvedLocked}
              className={`w-full border border-slate-200 rounded-lg px-3 py-2 text-sm ${resolvedLocked ? "bg-slate-50 text-slate-500" : ""}`}
            />
          </div>

          {/* Reassigning and closing are manager-only — shown read-only here */}
          <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
            <div>
              <div className="text-xs font-semibold text-slate-500">Follow-up assigned to</div>
              <div className="text-sm text-slate-700 mt-0.5">{staffList.find((s) => s.id === incident.assigned_to_staff_id)?.name || "No one yet"}</div>
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-500">Date resolved</div>
              <div className="text-sm text-slate-700 mt-0.5">{incident.date_resolved || "Not closed yet"}</div>
            </div>
            <p className="col-span-2 text-[11px] text-slate-400">A manager reassigns and closes incidents (🔒 Manager).</p>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-[#1D4ED8] hover:bg-blue-800 disabled:opacity-40 transition-colors"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReportIncidentForm({ staffList, onClose, onSaved }) {
  const [reporterId, setReporterId] = useState("");
  const [incidentDate, setIncidentDate] = useState(() => new Date().toISOString().slice(0, 10));
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

  const canSubmit = reporterId && incidentDate && natureOfIncident.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError("");
    const { error: err } = await supabase.from("incidents").insert({
      pharmacy_id: PHARMACY_ID,
      reporter_staff_id: reporterId,
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
      actioned_by_staff_id: actionedById || null,
      quality_improvement: qualityImprovement || null,
      follow_up_required: followUpRequired || null,
      assigned_to_staff_id: assignedToId || null,
    });
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-800">Report an incident</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Your name *</label>
            <select
              value={reporterId}
              onChange={(e) => setReporterId(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Select your name…</option>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Date of incident *</label>
            <input
              type="date"
              value={incidentDate}
              onChange={(e) => setIncidentDate(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">What happened *</label>
            <textarea
              value={natureOfIncident}
              onChange={(e) => setNatureOfIncident(e.target.value)}
              rows={3}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              placeholder="Describe the incident…"
            />
          </div>

          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide pt-1">Action &amp; improvement</div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Specific action taken</label>
            <textarea
              value={actionNeeded}
              onChange={(e) => setActionNeeded(e.target.value)}
              rows={2}
              placeholder="What was done"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Actioned by</label>
            <select
              value={actionedById}
              onChange={(e) => setActionedById(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Not yet actioned</option>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Follow-up required</label>
            <textarea
              value={followUpRequired}
              onChange={(e) => setFollowUpRequired(e.target.value)}
              rows={2}
              placeholder="Anything still needing to happen"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Assign follow-up to</label>
            <select
              value={assignedToId}
              onChange={(e) => setAssignedToId(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">No one yet</option>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Quality improvements</label>
            <textarea
              value={qualityImprovement}
              onChange={(e) => setQualityImprovement(e.target.value)}
              rows={2}
              placeholder="Quality improvements resulting from this incident"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <button
            onClick={() => setShowMore((v) => !v)}
            className="text-sm font-medium text-slate-500 hover:text-slate-700"
          >
            {showMore ? "− Hide more details" : "+ Add more details (optional)"}
          </button>

          {showMore && (
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Time of incident</label>
                <input
                  type="time"
                  value={incidentTime}
                  onChange={(e) => setIncidentTime(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide pt-1">Person / patient involved</div>

              <input value={personName} onChange={(e) => setPersonName(e.target.value)} placeholder="Name" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={personDob} onChange={(e) => setPersonDob(e.target.value)} placeholder="Date of birth" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                <input value={personOccupation} onChange={(e) => setPersonOccupation(e.target.value)} placeholder="Occupation" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <input value={personAddress} onChange={(e) => setPersonAddress(e.target.value)} placeholder="Address" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              <input value={personPostcode} onChange={(e) => setPersonPostcode(e.target.value)} placeholder="Postcode" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              <div className="grid grid-cols-3 gap-2">
                <input value={personPhoneH} onChange={(e) => setPersonPhoneH(e.target.value)} placeholder="Phone (H)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                <input value={personPhoneB} onChange={(e) => setPersonPhoneB(e.target.value)} placeholder="Phone (B)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                <input value={personPhoneM} onChange={(e) => setPersonPhoneM(e.target.value)} placeholder="Phone (M)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              </div>

              <textarea value={witnesses} onChange={(e) => setWitnesses(e.target.value)} rows={2} placeholder="Witnesses" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || saving}
              className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-[#1D4ED8] hover:bg-blue-800 disabled:opacity-40 transition-colors"
            >
              {saving ? "Saving…" : "Submit"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Manager mode: every field (incl. reassign + close), Hide / Unhide, Delete (moved from Admin → QSPP → Incidents)
function ManagerIncidentModal({ incident, staffList, onClose, onUpdate, onDelete }) {
  const [actionNeeded, setActionNeeded] = useState(incident.action_needed || "");
  const [actionedById, setActionedById] = useState(incident.actioned_by_staff_id || "");
  const [qualityImprovement, setQualityImprovement] = useState(incident.quality_improvement || "");
  const [followUpRequired, setFollowUpRequired] = useState(incident.follow_up_required || "");
  const [assignedToId, setAssignedToId] = useState(incident.assigned_to_staff_id || "");
  const [dateResolved, setDateResolved] = useState(incident.date_resolved || "");
  const [saving, setSaving] = useState(false);

  const reporterName = staffList.find((s) => s.id === incident.reporter_staff_id)?.name || "Unknown";
  const field = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#BFDBFE]";
  const label = "block text-xs font-semibold text-slate-500 mb-1";

  const handleSave = async () => {
    setSaving(true);
    const ok = await onUpdate(incident.id, {
      action_needed: actionNeeded || null,
      actioned_by_staff_id: actionedById || null,
      quality_improvement: qualityImprovement || null,
      follow_up_required: followUpRequired || null,
      assigned_to_staff_id: assignedToId || null,
      date_resolved: dateResolved || null,
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
          <div><label className={label}>Quality improvements</label>
            <textarea value={qualityImprovement} onChange={(e) => setQualityImprovement(e.target.value)} rows={2} className={field} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={label}>Assigned to</label>
              <select value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)} className={field}>
                <option value="">No one yet</option>
                {staffList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select></div>
            <div><label className={label}>Date resolved</label>
              <input type="date" value={dateResolved} onChange={(e) => setDateResolved(e.target.value)} className={field} /></div>
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

export default function StaffIncidents({ manager = null }) {
  const isManager = !!manager;
  const [incidents, setIncidents] = useState([]);
  const [incidentsLoading, setIncidentsLoading] = useState(true);
  const [staffList, setStaffList] = useState([]);
  const [showReportForm, setShowReportForm] = useState(false);
  const [openIncident, setOpenIncident] = useState(null);
  const [showHidden, setShowHidden] = useState(false); // manager only

  // Staff never see hidden incidents; manager mode loads them too (shown with "Show hidden")
  const refreshIncidents = async () => {
    let q = supabase.from("incidents").select("*").eq("pharmacy_id", PHARMACY_ID);
    if (!isManager) q = q.eq("hidden", false);
    const { data: inc } = await q.order("incident_date", { ascending: false });
    setIncidents(inc || []);
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

  const staffName = (id) => staffList.find((s) => s.id === id)?.name || "";
  const visible = incidents.filter((i) => !i.hidden || (isManager && showHidden));
  const hiddenCount = incidents.filter((i) => i.hidden).length;

  const handleUpdate = async (id, patch) => {
    const { data, error } = await supabase.from("incidents")
      .update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) { alert("Save failed: " + error.message); return false; }
    setIncidents((prev) => prev.map((i) => (i.id === id ? data : i)));
    setOpenIncident(data);
    return true;
  };
  const handleDelete = async (id) => {
    if (!window.confirm("Delete this incident permanently? This cannot be undone.")) return;
    const { error } = await supabase.from("incidents").delete().eq("id", id);
    if (error) { alert("Delete failed: " + error.message); return; }
    setIncidents((prev) => prev.filter((i) => i.id !== id));
    setOpenIncident(null);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-5">
      <button
        onClick={() => setShowReportForm(true)}
        className="w-full min-h-[44px] mb-4 px-4 rounded-[12px] text-sm font-semibold text-white bg-[#1D4ED8] hover:bg-blue-800 transition-colors"
      >
        + Report an incident
      </button>
      {isManager && hiddenCount > 0 && (
        <div className="mb-3 flex justify-end">
          <button onClick={() => setShowHidden((v) => !v)} className="min-h-[36px] px-3 text-xs text-slate-500 hover:text-slate-700">
            {showHidden ? "Hide hidden incidents" : `Show hidden (${hiddenCount})`}
          </button>
        </div>
      )}
      {showReportForm && (
        <ReportIncidentForm
          staffList={staffList}
          onClose={() => setShowReportForm(false)}
          onSaved={async () => {
            setShowReportForm(false);
            await refreshIncidents();
          }}
        />
      )}
      {incidentsLoading ? (
        <p className="text-sm text-slate-400 py-10">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-slate-400 px-1 py-12 text-center">No incidents logged yet.</p>
      ) : (
        <div className="space-y-2">
          {visible.map((inc) => {
            const resolved = !!inc.date_resolved;
            return (
              <button
                key={inc.id}
                onClick={() => setOpenIncident(inc)}
                className={`w-full text-left bg-white rounded-[14px] border border-[#E5E7EB] px-4 py-3 hover:bg-slate-50 transition-colors ${inc.hidden ? "opacity-60" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-400">#{inc.report_number} · {inc.incident_date}</span>
                  <span className="flex items-center gap-1">
                    {inc.hidden && <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Hidden</span>}
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
          onClose={() => setOpenIncident(null)}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      ) : (
        <EditIncidentModal
          incident={openIncident}
          staffList={staffList}
          onClose={() => setOpenIncident(null)}
          onSaved={async () => {
            setOpenIncident(null);
            await refreshIncidents();
          }}
        />
      ))}
    </div>
  );
}
