import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import supabase from "../lib/supabaseClient";
import { REQUEST_COLUMNS, acknowledgeRequest } from "../lib/policyReads";
import { groupFolders, fileTag } from "../lib/docFolders";

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";

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

// ─── Policies to read (kiosk) ────────────────────────────────────────────────
// Pick your name (active, non-locum staff) → your outstanding policies → Open + "I have read and understood".

function KioskPolicies({ staffList, onClose }) {
  const [staffId, setStaffId] = useState("");
  const [items, setItems] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const people = staffList.filter((st) => st.active !== false);
  const person = people.find((st) => String(st.id) === String(staffId));

  const load = async (id) => {
    setItems(null);
    setError("");
    if (!id) return;
    const { data, error: err } = await supabase.from("policy_read_requests")
      .select(`${REQUEST_COLUMNS}, document:document_id(id, title, file_url, file_name, active)`)
      .eq("staff_id", Number(id))
      .eq("status", "outstanding")
      .order("requested_at");
    if (err) { setError(err.message); setItems([]); return; }
    setItems((data || []).filter((r) => r.document && r.document.active !== false));
  };

  const handleRead = async (r) => {
    setBusyId(r.id);
    setError("");
    try {
      const ok = await acknowledgeRequest(supabase, r, r.document, "kiosk");
      if (!ok) setError("That one was already recorded.");
    } catch (err) {
      setError("Couldn't save: " + (err?.message || String(err)));
    }
    setBusyId(null);
    await load(staffId);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">Policies to read</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Your name</label>
          <select
            value={staffId}
            onChange={(e) => { setStaffId(e.target.value); load(e.target.value); }}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Select your name…</option>
            {people.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
          </select>
        </div>

        {staffId && (items === null ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-green-700 py-4 text-center">✓ {person?.name ? `${person.name.split(" ")[0]}, you're` : "You're"} all caught up.</p>
        ) : (
          <div className="space-y-2">
            {items.map((r) => (
              <div key={r.id} className="rounded-xl border border-slate-200 px-3.5 py-3 space-y-2">
                <div className="text-sm font-medium text-slate-800 break-words">{r.document.title}</div>
                <div className="flex gap-2">
                  <a href={r.document.file_url} target="_blank" rel="noopener noreferrer" className="flex-1 text-center border border-slate-300 rounded-lg py-2 text-sm text-slate-700 hover:bg-slate-50">
                    Open
                  </a>
                  <button onClick={() => handleRead(r)} disabled={busyId === r.id} className="flex-[2] bg-slate-800 text-white rounded-lg py-2 text-sm font-semibold hover:bg-slate-700 disabled:opacity-40">
                    {busyId === r.id ? "Saving…" : "I have read and understood"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button onClick={onClose} className="w-full border border-slate-200 rounded-lg py-2 text-sm text-slate-600 hover:bg-slate-50">Done</button>
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
  const [openGroup, setOpenGroup] = useState(null); // expanded group in the left panel
  const [search, setSearch] = useState("");
  const [incidents, setIncidents] = useState([]);
  const [incidentsLoading, setIncidentsLoading] = useState(true);
  const [staffList, setStaffList] = useState([]);
  const [showReportForm, setShowReportForm] = useState(false);
  const [openIncident, setOpenIncident] = useState(null);
  const [showPolicies, setShowPolicies] = useState(false);

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
      const first = groupFolders(f || [])[0];
      if (first) {
        setOpenGroup(first.name);
        setActiveFolder(first.folders[0].id);
      }
      setLoading(false);
    };
    load();
  }, []);

  useEffect(() => {
    const loadIncidents = async () => {
      const { data: staff } = await supabase
        .from("staff")
        .select("id, name, active")
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
  const groups = groupFolders(folders);
  const docCount = (folderId) => docs.filter((d) => d.folder_id === folderId).length;
  const activeGroupObj = groups.find((g) => g.folders.some((f) => f.id === activeFolder)) || groups[0];
  // Library gets a wider page so the section panel fits; Incidents keeps its width
  const pageWidth = activeTab === "library" ? "max-w-5xl" : "max-w-3xl";

  const pickFolder = (id) => {
    const f = folders.find((x) => String(x.id) === String(id)); // dropdown values are strings
    if (f) setActiveFolder(f.id);
    setSearch("");
  };
  const pickGroup = (name) => {
    const g = groups.find((x) => x.name === name);
    setOpenGroup(name);
    if (g?.folders.length) pickFolder(g.folders[0].id);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className={`${pageWidth} mx-auto px-4 pt-5 pb-2 flex items-center justify-between gap-3`}>
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
      <div className={`${pageWidth} mx-auto px-4 pb-3`}>
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
        <div className={`${pageWidth} mx-auto px-4 py-10 text-sm text-slate-400`}>Loading…</div>
      ) : (
        <div className={`${pageWidth} mx-auto px-4 py-5`}>
          <button
            onClick={() => setShowPolicies(true)}
            className="w-full mb-4 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-slate-800 hover:bg-slate-700 transition-colors"
          >
            📄 Policies to read
          </button>
          {showPolicies && <KioskPolicies staffList={staffList} onClose={() => setShowPolicies(false)} />}

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

          {/* Phone: group then section dropdowns */}
          {groups.length > 0 && (
            <div className="md:hidden grid grid-cols-1 gap-2 mb-4">
              <select
                value={activeGroupObj?.name || ""}
                onChange={(e) => pickGroup(e.target.value)}
                className="w-full min-w-0 border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white text-slate-700"
              >
                {groups.map((g) => <option key={g.name} value={g.name}>{g.name}</option>)}
              </select>
              <select
                value={activeFolder || ""}
                onChange={(e) => pickFolder(e.target.value)}
                className="w-full min-w-0 border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white text-slate-700"
              >
                {(activeGroupObj?.folders || []).map((f) => (
                  <option key={f.id} value={f.id}>{f.name} ({docCount(f.id)})</option>
                ))}
              </select>
            </div>
          )}

          <div className="md:flex md:gap-5 md:items-start">
            {/* Tablet/desktop: groups with expandable sections */}
            <div className="hidden md:block w-72 shrink-0 bg-white rounded-xl border border-slate-100 overflow-hidden">
              {groups.map((g) => {
                const open = openGroup === g.name;
                const total = g.folders.reduce((n, f) => n + docCount(f.id), 0);
                return (
                  <div key={g.name} className="border-b border-slate-100 last:border-b-0">
                    <button
                      onClick={() => setOpenGroup(open ? null : g.name)}
                      className="w-full flex items-start gap-2 px-3.5 py-3 text-left hover:bg-slate-50 transition-colors"
                    >
                      <span className="text-[10px] text-slate-400 mt-1 w-2.5 shrink-0">{open ? "▼" : "▶"}</span>
                      <span className="flex-1 min-w-0 text-sm font-semibold text-slate-700 leading-snug">{g.name}</span>
                      <span className="text-xs text-slate-400 mt-0.5">{total}</span>
                    </button>
                    {open && (
                      <div className="pb-2">
                        {g.folders.map((f) => {
                          const active = activeFolder === f.id && !searching;
                          return (
                            <button
                              key={f.id}
                              onClick={() => pickFolder(f.id)}
                              className={`w-full flex items-start gap-2 pl-8 pr-3.5 py-2 text-left transition-colors ${
                                active ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"
                              }`}
                            >
                              <span className="flex-1 min-w-0 text-sm leading-snug">{f.name}</span>
                              <span className={`text-xs mt-0.5 ${active ? "text-slate-300" : "text-slate-400"}`}>{docCount(f.id)}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Documents */}
            <div className="flex-1 min-w-0">
              <div className="mb-2.5 px-1 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                {searching ? `Search results · ${folderDocs.length}` : activeFolderObj?.name || ""}
              </div>

              {folderDocs.length === 0 ? (
                <p className="text-sm text-slate-400 px-1 py-12 text-center">
                  {searching ? "No documents match your search." : "No documents in this folder yet."}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {folderDocs.map((doc) => {
                    const tag = fileTag(doc.file_name);
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
          </div>
        </div>
      )}
    </div>
  );
}