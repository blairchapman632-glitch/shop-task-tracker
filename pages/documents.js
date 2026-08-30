import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import supabase from "../lib/supabaseClient";

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";

const fileExt = (name = "") => {
  const m = name.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : "";
};

const extTag = (ext) => {
  if (ext === "pdf") return { label: "PDF", cls: "bg-red-50 text-red-600 border-red-100" };
  if (ext === "doc" || ext === "docx") return { label: "DOC", cls: "bg-blue-50 text-blue-600 border-blue-100" };
  if (ext === "xls" || ext === "xlsx") return { label: "XLS", cls: "bg-green-50 text-green-600 border-green-100" };
  return { label: (ext || "FILE").toUpperCase().slice(0, 4), cls: "bg-gray-100 text-gray-500 border-gray-200" };
};

function EditIncidentModal({ incident, staffList, onClose, onSaved }) {
  const [actionNeeded, setActionNeeded] = useState(incident.action_needed || "");
  const [actionedById, setActionedById] = useState(incident.actioned_by_staff_id || "");
  const [qualityImprovement, setQualityImprovement] = useState(incident.quality_improvement || "");
  const actionLocked = !!incident.actioned_by_staff_id;
  const resolvedLocked = !!incident.date_resolved;
  const [followUpRequired, setFollowUpRequired] = useState(incident.follow_up_required || "");
  const [assignedToId, setAssignedToId] = useState(incident.assigned_to_staff_id || "");
  const [dateResolved, setDateResolved] = useState(incident.date_resolved || "");
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
        assigned_to_staff_id: assignedToId || null,
        date_resolved: dateResolved || null,
        updated_at: new Date().toISOString(),
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

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Assign follow-up to</label>
            <select
              value={assignedToId}
              onChange={(e) => setAssignedToId(e.target.value)}
              disabled={resolvedLocked}
              className={`w-full border border-slate-200 rounded-lg px-3 py-2 text-sm ${resolvedLocked ? "bg-slate-50 text-slate-500" : ""}`}
            >
              <option value="">No one yet</option>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Date resolved</label>
            <input
              type="date"
              value={dateResolved}
              onChange={(e) => setDateResolved(e.target.value)}
              disabled={resolvedLocked}
              className={`w-full border border-slate-200 rounded-lg px-3 py-2 text-sm ${resolvedLocked ? "bg-slate-50 text-slate-500" : ""}`}
            />
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
              className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-slate-800 hover:bg-slate-700 disabled:opacity-40 transition-colors"
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
              className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-slate-800 hover:bg-slate-700 disabled:opacity-40 transition-colors"
            >
              {saving ? "Saving…" : "Submit"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DocumentsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("library");

  useEffect(() => {
    if (router.query.tab === "incidents") setActiveTab("incidents");
  }, [router.query.tab]);
  const [folders, setFolders] = useState([]);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFolder, setActiveFolder] = useState(null);
  const [search, setSearch] = useState("");
  const [incidents, setIncidents] = useState([]);
  const [incidentsLoading, setIncidentsLoading] = useState(true);
  const [staffList, setStaffList] = useState([]);
  const [showReportForm, setShowReportForm] = useState(false);
  const [openIncident, setOpenIncident] = useState(null);

  useEffect(() => {
    const load = async () => {
      const { data: f } = await supabase
        .from("document_folders")
        .select("*")
        .eq("pharmacy_id", PHARMACY_ID)
        .order("sort_order");
      const { data: d } = await supabase
        .from("pharmacy_documents")
        .select("*")
        .eq("pharmacy_id", PHARMACY_ID)
        .eq("active", true)
        .order("title");
      setFolders(f || []);
      setDocs(d || []);
      if (f && f.length) setActiveFolder(f[0].id);
      setLoading(false);
    };
    load();
  }, []);

  useEffect(() => {
    const loadIncidents = async () => {
      const { data: staff } = await supabase
        .from("staff")
        .select("id, name")
        .eq("pharmacy_id", PHARMACY_ID)
        .or("role.is.null,role.neq.Locum")
        .order("name");
      setStaffList(staff || []);

      const { data: inc } = await supabase
        .from("incidents")
        .select("*")
        .eq("pharmacy_id", PHARMACY_ID)
        .eq("hidden", false)
        .order("incident_date", { ascending: false });
      setIncidents(inc || []);
      setIncidentsLoading(false);
    };
    loadIncidents();
  }, []);

  const staffName = (id) => staffList.find((s) => s.id === id)?.name || "";

  const refreshIncidents = async () => {
    const { data: inc } = await supabase
      .from("incidents")
      .select("*")
      .eq("pharmacy_id", PHARMACY_ID)
      .eq("hidden", false)
      .order("incident_date", { ascending: false });
    setIncidents(inc || []);
  };

  const term = search.trim().toLowerCase();
  const searching = term.length > 0;
  const folderName = (id) => folders.find((f) => f.id === id)?.name || "";
  const folderDocs = searching
    ? docs.filter((d) => (d.title || "").toLowerCase().includes(term))
    : docs.filter((d) => d.folder_id === activeFolder);
  const activeFolderObj = folders.find((f) => f.id === activeFolder);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="max-w-3xl mx-auto px-4 pt-5 pb-2 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 leading-tight">QSPP Library</h1>
          <p className="text-xs text-slate-400 leading-tight mt-0.5">Policies &amp; procedures</p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors shrink-0"
        >
          🏠 Home
        </Link>
      </div>

      {/* Page tabs */}
      <div className="max-w-3xl mx-auto px-4 pb-3">
        <div className="flex gap-2">
          {[
            { key: "library", label: "📁 Library" },
            { key: "incidents", label: "⚠️ Incidents" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                activeTab === t.key
                  ? "bg-slate-800 text-white border-slate-800"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "incidents" ? (
        <div className="max-w-3xl mx-auto px-4 py-5">
          <button
            onClick={() => setShowReportForm(true)}
            className="w-full mb-4 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-slate-800 hover:bg-slate-700 transition-colors"
          >
            + Report an incident
          </button>
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
          ) : incidents.length === 0 ? (
            <p className="text-sm text-slate-400 px-1 py-12 text-center">No incidents logged yet.</p>
          ) : (
            <div className="space-y-1.5">
              {incidents.map((inc) => {
                const resolved = !!inc.date_resolved;
                return (
                  <div
                    key={inc.id}
                    onClick={() => setOpenIncident(inc)}
                    className="bg-white rounded-xl border border-slate-100 px-3.5 py-3 cursor-pointer hover:border-slate-300 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-400">#{inc.report_number} · {inc.incident_date}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                          resolved
                            ? "bg-green-50 text-green-600 border-green-100"
                            : "bg-amber-50 text-amber-600 border-amber-100"
                        }`}
                      >
                        {resolved ? "RESOLVED" : "OPEN"}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 mt-1.5 line-clamp-2">{inc.nature_of_incident}</p>
                    {inc.assigned_to_staff_id && (
                      <div className="mt-1.5 text-[11px] text-slate-400">Assigned: {staffName(inc.assigned_to_staff_id)}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {openIncident && (
            <EditIncidentModal
              incident={openIncident}
              staffList={staffList}
              onClose={() => setOpenIncident(null)}
              onSaved={async () => {
                setOpenIncident(null);
                await refreshIncidents();
              }}
            />
          )}
        </div>
      ) : loading ? (
        <div className="max-w-3xl mx-auto px-4 py-10 text-sm text-slate-400">Loading…</div>
      ) : (
        <div className="max-w-3xl mx-auto px-4 py-5">
          {/* Search */}
          <div className="relative mb-4">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search all documents…"
              className="w-full border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>

          {/* Folder chips */}
          <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-1 px-1">
            {folders.map((f) => {
              const count = docs.filter((d) => d.folder_id === f.id).length;
              const active = activeFolder === f.id && !searching;
              return (
                <button
                  key={f.id}
                  onClick={() => { setActiveFolder(f.id); setSearch(""); }}
                  className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    active
                      ? "bg-slate-800 text-white border-slate-800"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {f.name}
                  <span className={`ml-1.5 text-xs ${active ? "text-slate-300" : "text-slate-400"}`}>{count}</span>
                </button>
              );
            })}
          </div>

          {/* Section label */}
          <div className="mb-2.5 px-1 text-xs font-semibold text-slate-400 uppercase tracking-wide">
            {searching ? `Search results · ${folderDocs.length}` : activeFolderObj?.name || ""}
          </div>

          {/* Document list */}
          {folderDocs.length === 0 ? (
            <p className="text-sm text-slate-400 px-1 py-12 text-center">
              {searching ? "No documents match your search." : "No documents in this folder yet."}
            </p>
          ) : (
            <div className="space-y-1.5">
              {folderDocs.map((doc) => {
                const tag = extTag(fileExt(doc.title));
                return (
                  <a
                    key={doc.id}
                    href={doc.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 bg-white rounded-xl border border-slate-100 px-3.5 py-3 hover:border-slate-300 hover:shadow-sm transition-all"
                  >
                    <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-md border ${tag.cls}`}>
                      {tag.label}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-slate-800 truncate">{doc.title}</span>
                      {searching && (
                        <span className="block text-[11px] text-slate-400 truncate">{folderName(doc.folder_id)}</span>
                      )}
                    </span>
                  </a>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}