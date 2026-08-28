import { useEffect, useState } from "react";
import Link from "next/link";
import supabase from "../lib/supabaseClient";
import Avatar from "../components/Avatar";
import { getLeaveCover } from "../lib/leaveCover";
import { QSPP_HOURS_REQUIRED, qsppApplies, getCurrentCycle, hoursInCycle, formatCycle } from "../lib/qspp";


const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";

const formatTime = (time) => {
  if (!time) return "";
  const [hourStr, minuteStr] = String(time).split(":");
  let hour = Number(hourStr);
  const minute = Number(minuteStr);
  const suffix = hour >= 12 ? "pm" : "am";
  hour = hour % 12;
  if (hour === 0) hour = 12;
  if (minute === 0) return `${hour}${suffix}`;
  return `${hour}.${String(minute).padStart(2, "0")}${suffix}`;
};

const ROLES = [
  "Pharmacist",
  "Locum",
  "Pharmacy Assistant",
  "DAA Coordinator",
  "Intern Pharmacist",
];

const EMPLOYMENT_TYPES = ["Permanent", "Salary", "Casual"];
const WEEK_DAYS = [
  { key: "hours_monday", label: "Monday" },
  { key: "hours_tuesday", label: "Tuesday" },
  { key: "hours_wednesday", label: "Wednesday" },
  { key: "hours_thursday", label: "Thursday" },
  { key: "hours_friday", label: "Friday" },
  { key: "hours_saturday", label: "Saturday" },
  { key: "hours_sunday", label: "Sunday" },
];
const DAYS = [
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
];

const defaultSchedule = () =>
  Object.fromEntries(
    DAYS.map(({ key }) => [key, { active: false, start: "", end: "" }])
  );

const defaultWeekSchedule = () => ({
  a: defaultSchedule(),
  b: defaultSchedule(),
  notes: "",
});

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function Sidebar() {
  return (
    <aside className="w-[200px] min-w-[200px] h-screen bg-white border-r flex flex-col py-4 px-3 gap-1 shrink-0">
      <div className="text-sm font-bold text-gray-800 px-2 mb-3 leading-tight">
        Byford Pharmacy
      </div>
      <Link href="/" className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-gray-700 hover:bg-gray-100"><span>🏠</span> Home</Link>
      <Link href="/roster" className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-gray-700 hover:bg-gray-100"><span>📅</span> Roster</Link>
      <Link href="/insights" className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-gray-700 hover:bg-gray-100"><span>📊</span> Insights</Link>
      <Link href="/tasks" className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-gray-700 hover:bg-gray-100"><span>✅</span> Tasks</Link>
      <Link href="/wages" className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-gray-700 hover:bg-gray-100"><span>💰</span> Wages</Link>
      <Link href="/availability" className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-gray-700 hover:bg-gray-100"><span>🗓️</span> Requests</Link>
      <Link href="/admin" className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm bg-gray-100 font-semibold text-gray-900"><span>⚙️</span> Admin</Link>
    </aside>
  );
}

// ─── PIN Screen ───────────────────────────────────────────────────────────────

function PinScreen({ onUnlock }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const handleSubmit = async () => {
    if (pin.length !== 4) return;
    setChecking(true);
    setError("");
    const { data, error: err } = await supabase
      .from("staff")
      .select("id, name")
      .eq("pharmacy_id", PHARMACY_ID)
      .eq("pin", pin)
      .eq("can_access_admin", true)
      .single();
    setChecking(false);
    if (err || !data) {
      setError("Incorrect PIN or no admin access.");
      setPin("");
    } else {
      onUnlock(data);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-gray-100">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm text-center">
        <div className="text-2xl mb-1">⚙️</div>
        <h1 className="text-lg font-bold text-gray-800 mb-1">Admin</h1>
        <p className="text-sm text-gray-500 mb-6">Enter your PIN to continue</p>
        <input
          type="text"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="••••"
          autoComplete="off"
          name="admin_pin_field"
          data-1p-ignore
          data-lpignore="true"
          style={{ WebkitTextSecurity: "disc", textSecurity: "disc" }}
          className="w-full border rounded-lg px-4 py-3 text-center text-2xl tracking-widest mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
          autoFocus
        />
        {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
        <button
          onClick={handleSubmit}
          disabled={pin.length !== 4 || checking}
          className="w-full bg-blue-600 text-white rounded-lg py-2.5 font-medium disabled:opacity-40"
        >
          {checking ? "Checking…" : "Unlock"}
        </button>
      </div>
    </div>
  );
}
// ─── Day Schedule Grid ────────────────────────────────────────────────────────

function DayScheduleGrid({ schedule, onChange }) {
  return (
    <div className="space-y-2">
      {DAYS.map(({ key, label }) => {
        const day = schedule[key] || { active: false, start: "", end: "" };
        return (
          <div key={key} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onChange({ ...schedule, [key]: { ...day, active: !day.active } })}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${day.active ? "bg-blue-600" : "bg-gray-200"}`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${day.active ? "translate-x-4" : "translate-x-0.5"}`} />
            </button>
            <span className={`text-sm w-24 shrink-0 ${day.active ? "text-gray-700 font-medium" : "text-gray-400"}`}>{label}</span>
            {day.active && (
              <>
                <input
                  type="time"
                  value={day.start}
                  onChange={(e) => onChange({ ...schedule, [key]: { ...day, start: e.target.value } })}
                  className="border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <span className="text-gray-400 text-sm">–</span>
                <input
                  type="time"
                  value={day.end}
                  onChange={(e) => onChange({ ...schedule, [key]: { ...day, end: e.target.value } })}
                  className="border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Staff Form ───────────────────────────────────────────────────────────────

function StaffForm({ member, onSave, onCancel }) {

  const isNew = !member?.id;
  const [activeTab, setActiveTab] = useState("profile");
  const [form, setForm] = useState({
    name: member?.name || "",
    email: member?.email || "",
    phone: member?.phone || "",
    role: member?.role || "",
    employment_type: member?.employment_type || "",
    contracted_hours: member?.contracted_hours || "",
    date_of_birth: member?.date_of_birth || "",
    start_date: member?.start_date || "",
    address: member?.address || "",
    emergency_contact_name: member?.emergency_contact_name || "",
    emergency_contact_phone: member?.emergency_contact_phone || "",
    tfn: member?.tfn || "",
    ahpra_number: member?.ahpra_number || "",
    bank_account_name: member?.bank_account_name || "",
    bsb: member?.bsb || "",
    account_number: member?.account_number || "",
    super_fund_name: member?.super_fund_name || "",
    super_fund_usi: member?.super_fund_usi || "",
    super_fund_abn: member?.super_fund_abn || "",
    super_member_number: member?.super_member_number || "",
    active: member?.active ?? true,
    can_access_roster: member?.can_access_roster ?? false,
    can_access_tasks: member?.can_access_tasks ?? false,
    can_access_admin: member?.can_access_admin ?? false,
    can_access_wages: member?.can_access_wages ?? false,
    no_lunch_deduction: member?.no_lunch_deduction ?? false,
    is_roster_manager: member?.is_roster_manager ?? false,
    is_driver: member?.is_driver ?? false,
    uniforms_supplied: member?.uniforms_supplied ?? "",
    badge_supplied: member?.badge_supplied ?? false,
    keys_supplied: member?.keys_supplied ?? false,
    last_day: member?.last_day || "",
    reason_for_leaving: member?.reason_for_leaving || "",
    exit_interview_date: member?.exit_interview_date || "",
    statement_of_service_provided: member?.statement_of_service_provided ?? false,
    training_record_provided: member?.training_record_provided ?? false,
    uniforms_returned: member?.uniforms_returned ?? false,
    badge_returned: member?.badge_returned ?? false,
    keys_returned: member?.keys_returned ?? false,
    pin: member?.pin || "",
    photo_url: member?.photo_url || "",
    weekly_schedule: member?.weekly_schedule || defaultSchedule(),
    schedule_type: member?.schedule_type || "weekly",
    week_ab_schedule: member?.week_ab_schedule || defaultWeekSchedule(),
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [sickDays, setSickDays] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [training, setTraining] = useState([]);
  const [qsppAnchor, setQsppAnchor] = useState(null);

  useEffect(() => {
    supabase.from("pharmacy_settings")
      .select("qspp_cycle_start_date")
      .eq("pharmacy_id", PHARMACY_ID)
      .maybeSingle()
      .then(({ data }) => setQsppAnchor(data?.qspp_cycle_start_date || null));
  }, []);

  useEffect(() => {
    if (!member?.id) return;
    supabase.from("sick_days")
      .select("id, sick_date, reason")
      .eq("staff_id", member.id)
      .order("sick_date", { ascending: false })
      .then(({ data }) => setSickDays(data || []));
    supabase.from("locum_documents")
      .select("*")
      .eq("staff_id", member.id)
      .order("uploaded_at", { ascending: false })
      .then(({ data }) => setDocuments(data || []));
    supabase.from("training_records")
      .select("*")
      .eq("staff_id", member.id)
      .order("training_date", { ascending: false })
      .then(({ data }) => setTraining(data || []));
  }, [member?.id]);

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  // ── Training records ──
  const [trTopic, setTrTopic] = useState("");
  const [trDate, setTrDate] = useState("");
  const [trHours, setTrHours] = useState("");
  const [trProvider, setTrProvider] = useState("");
  const [trFile, setTrFile] = useState(null);
  const [savingTraining, setSavingTraining] = useState(false);
  const [trainingError, setTrainingError] = useState("");

  const handleAddTraining = async () => {
    if (!member?.id) return;
    setTrainingError("");
    if (!trTopic.trim()) { setTrainingError("Topic is required."); return; }
    if (!trDate) { setTrainingError("Date is required."); return; }
    if (trHours === "" || isNaN(Number(trHours))) { setTrainingError("Hours is required."); return; }
    setSavingTraining(true);
    try {
      let certUrl = null, certName = null;
      if (trFile) {
        const ext = trFile.name.split(".").pop();
        const filename = `${member.id}_${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("training-certificates")
          .upload(filename, trFile, { upsert: true });
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from("training-certificates").getPublicUrl(filename);
        certUrl = urlData.publicUrl;
        certName = trFile.name;
      }
      const { data: rec, error: insErr } = await supabase.from("training_records").insert([{
        pharmacy_id: PHARMACY_ID,
        staff_id: member.id,
        topic: trTopic.trim(),
        training_date: trDate,
        hours: Number(trHours),
        provider: trProvider.trim() || null,
        certificate_url: certUrl,
        certificate_filename: certName,
      }]).select().single();
      if (insErr) throw insErr;
      setTraining((prev) => [rec, ...prev].sort((a, b) => b.training_date.localeCompare(a.training_date)));
      setTrTopic(""); setTrDate(""); setTrHours(""); setTrProvider(""); setTrFile(null);
    } catch (err) {
      setTrainingError("Couldn't save: " + (err?.message || String(err)));
    } finally {
      setSavingTraining(false);
    }
  };

  const trCertPath = (url) => {
    if (!url) return null;
    const marker = "/training-certificates/";
    const i = url.indexOf(marker);
    return i === -1 ? null : url.slice(i + marker.length).split("?")[0];
  };

  const handleDeleteTraining = async (rec) => {
    if (!window.confirm("Delete this training record?")) return;
    const path = trCertPath(rec.certificate_url);
    if (path) await supabase.storage.from("training-certificates").remove([path]);
    await supabase.from("training_records").delete().eq("id", rec.id);
    setTraining((prev) => prev.filter((r) => r.id !== rec.id));
  };

  const handleDocUpload = async (file, type) => {
    if (!file || !member?.id) return;
    setUploadingDoc(true);
    setError("");
    try {
      const ext = file.name.split(".").pop();
      const filename = `${member.id}_${type}_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("locum-documents")
        .upload(filename, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("locum-documents").getPublicUrl(filename);
      const { data: doc, error: insErr } = await supabase.from("locum_documents").insert([{
        staff_id: member.id,
        type,
        url: urlData.publicUrl,
        filename: file.name,
        pharmacy_id: PHARMACY_ID,
      }]).select().single();
      if (insErr) throw insErr;
      setDocuments((prev) => [doc, ...prev]);
    } catch (err) {
      setError("Upload failed: " + (err?.message || String(err)));
    } finally {
      setUploadingDoc(false);
    }
  };

  const storagePathFromUrl = (url) => {
    if (!url) return null;
    const marker = "/locum-documents/";
    const i = url.indexOf(marker);
    return i === -1 ? null : url.slice(i + marker.length).split("?")[0];
  };

  const handleDocDelete = async (doc, skipConfirm = false) => {
    if (!skipConfirm && !window.confirm("Delete this document?")) return;
    const path = storagePathFromUrl(doc.url);
    if (path) await supabase.storage.from("locum-documents").remove([path]);
    await supabase.from("locum_documents").delete().eq("id", doc.id);
    setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
  };

  const showHours = form.employment_type === "Salary";
  const showSchedule = form.employment_type === "Permanent";
  const isPharmacist = form.role === "Pharmacist" || form.role === "Intern Pharmacist";

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const filename = `staff_${form.name.toLowerCase().replace(/\s+/g, "_") || "new"}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("staff-photos")
      .upload(filename, file, { upsert: true });
    if (upErr) {
      setError("Photo upload failed: " + upErr.message);
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage
      .from("staff-photos")
      .getPublicUrl(filename);
    set("photo_url", urlData.publicUrl);
    setUploading(false);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError("Name is required."); return; }
    if (form.pin && form.pin.length !== 4) { setError("PIN must be 4 digits."); return; }

    // PIN uniqueness — real PINs must be unique within the pharmacy; "0000" is the unset placeholder and may repeat
    if (form.pin && form.pin !== "0000") {
      let q = supabase.from("staff").select("id, name").eq("pharmacy_id", PHARMACY_ID).eq("pin", form.pin);
      if (member?.id) q = q.neq("id", member.id);
      const { data: clash } = await q.maybeSingle();
      if (clash) { setError("That PIN is already taken. Please choose a different PIN."); return; }
    }

    setSaving(true);
    setError("");
    const payload = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      role: form.role || null,
      employment_type: form.employment_type || null,
      contracted_hours: showHours && form.contracted_hours ? Number(form.contracted_hours) : null,
      contracted_hours_period: null,
      date_of_birth: form.date_of_birth || null,
      start_date: form.start_date || null,
      address: form.address.trim() || null,
      emergency_contact_name: form.emergency_contact_name.trim() || null,
      emergency_contact_phone: form.emergency_contact_phone.trim() || null,
      tfn: form.tfn.trim() || null,
      ahpra_number: form.ahpra_number.trim() || null,
      bank_account_name: form.bank_account_name.trim() || null,
      bsb: form.bsb.trim() || null,
      account_number: form.account_number.trim() || null,
      super_fund_name: form.super_fund_name.trim() || null,
      super_fund_usi: form.super_fund_usi.trim() || null,
      super_fund_abn: form.super_fund_abn.trim() || null,
      super_member_number: form.super_member_number.trim() || null,
      weekly_schedule: showSchedule && form.schedule_type === "weekly" ? form.weekly_schedule : null,
      schedule_type: showSchedule ? form.schedule_type : null,
      week_ab_schedule: showSchedule && form.schedule_type === "alternating" ? form.week_ab_schedule : null,
      active: form.active,
      can_access_roster: form.can_access_roster,
      can_access_tasks: form.can_access_tasks,
      can_access_admin: form.can_access_admin,
      can_access_wages: form.can_access_wages,
      no_lunch_deduction: form.no_lunch_deduction,
      is_roster_manager: form.is_roster_manager,
      is_driver: form.is_driver,
      uniforms_supplied: form.uniforms_supplied === "" ? null : Number(form.uniforms_supplied),
      badge_supplied: form.badge_supplied,
      keys_supplied: form.keys_supplied,
      last_day: form.last_day || null,
      reason_for_leaving: form.reason_for_leaving.trim() || null,
      exit_interview_date: form.exit_interview_date || null,
      statement_of_service_provided: form.statement_of_service_provided,
      training_record_provided: form.training_record_provided,
      uniforms_returned: form.uniforms_returned,
      badge_returned: form.badge_returned,
      keys_returned: form.keys_returned,
      pin: form.pin || null,
      photo_url: form.photo_url || null,
      pharmacy_id: PHARMACY_ID,
      onboarding_token: isNew ? Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) : undefined,
    };
    let result;
    if (isNew) {
      result = await supabase.from("staff").insert(payload).select().single();
    } else {
      result = await supabase.from("staff").update(payload).eq("id", member.id).select().single();
    }
    setSaving(false);
    if (result.error) { setError(result.error.message); return; }
    onSave(result.data);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
        <h2 className="font-semibold text-gray-800">{isNew ? "Add Staff Member" : "Edit Staff Member"}</h2>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b shrink-0 px-5 gap-4">
        {[
          { key: "profile", label: "Profile" },
          { key: "payroll", label: "Payroll" },
          { key: "documents", label: "Documents" },
          { key: "training", label: "Training" },
          { key: "offboarding", label: "Offboarding" },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={`py-2.5 text-sm font-medium ${activeTab === t.key ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500 hover:text-gray-700"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

        {/* ── PROFILE TAB ── */}
        {activeTab === "profile" && (
        <div className="space-y-4">

        {/* Photo */}
        <div className="flex items-center gap-4">
          <Avatar
            name={form.name}
            photoUrl={form.photo_url}
            className="w-16 h-16 rounded-full border"
          />
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Photo</label>
            <label className="cursor-pointer inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50">
              {uploading ? "Uploading…" : "Upload photo"}
              <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={uploading} />
            </label>
          </div>
        </div>

        {/* Name */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
          <input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            placeholder="Full name"
          />
        </div>

        {/* Email */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            placeholder="email@example.com"
          />
          <p className="text-[11px] text-gray-400 mt-1">Used for app login. Must match the email they sign up with.</p>
        </div>

        {/* Phone */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
          <input
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            placeholder="04xx xxx xxx"
          />
        </div>

        {/* DOB + Start date */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date of Birth</label>
            <input
              type="date"
              value={form.date_of_birth}
              onChange={(e) => set("date_of_birth", e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
            <input
              type="date"
              value={form.start_date}
              onChange={(e) => set("start_date", e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
        </div>

        {/* Address */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
          <input
            value={form.address}
            onChange={(e) => set("address", e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            placeholder="Street, Suburb, State, Postcode"
          />
        </div>

        {/* Emergency contact */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Emergency Contact</label>
            <input
              value={form.emergency_contact_name}
              onChange={(e) => set("emergency_contact_name", e.target.value)}
              autoComplete="off"
              name="emergency_contact_name_field"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              placeholder="Name"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Emergency Phone</label>
            <input
              value={form.emergency_contact_phone}
              onChange={(e) => set("emergency_contact_phone", e.target.value)}
              autoComplete="off"
              name="emergency_contact_phone_field"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              placeholder="04xx xxx xxx"
            />
          </div>
        </div>

        {/* Role */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
          <select
            value={form.role}
            onChange={(e) => set("role", e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            <option value="">— Select role —</option>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {/* AHPRA — pharmacists only */}
        {isPharmacist && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">AHPRA Number</label>
            <input
              value={form.ahpra_number}
              onChange={(e) => set("ahpra_number", e.target.value)}
              autoComplete="off"
              name="ahpra_number_field"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              placeholder="PHA0000000000"
            />
          </div>
        )}

        {/* PIN */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">PIN (4 digits)</label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={form.pin}
            onChange={(e) => set("pin", e.target.value.replace(/\D/g, ""))}
            autoComplete="new-password"
            name="staff_pin_field"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            placeholder="••••"
          />
        </div>

        {/* Toggles */}
        <div className="space-y-3 pt-1">
          {[
            { field: "active", label: "Active", desc: "Appears on roster and home screen" },
            { field: "can_access_roster", label: "Can access roster", desc: "PIN unlocks the roster page" },
            { field: "can_access_tasks", label: "Can access tasks", desc: "PIN unlocks the tasks page" },
            { field: "can_access_admin", label: "Can access admin", desc: "PIN unlocks this admin page" },
            { field: "can_access_wages", label: "Can access wages", desc: "PIN unlocks the full wages table for all staff" },
            { field: "no_lunch_deduction", label: "Never deduct lunch break", desc: "Skip the 30-min lunch deduction on all shifts and public holidays" },
            { field: "is_roster_manager", label: "Roster manager", desc: "Receives push notifications for leave requests and availability changes" },
            { field: "is_driver", label: "Delivery driver", desc: "Sees the Deliveries tab on their phone app" },
          ].map(({ field, label, desc }) => (
            <div key={field} className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-700">{label}</div>
                <div className="text-xs text-gray-400">{desc}</div>
              </div>
              <button
                onClick={() => set(field, !form[field])}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form[field] ? "bg-blue-600" : "bg-gray-200"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form[field] ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
          ))}
        </div>

        {/* Issued items */}
        <div className="border-t pt-4">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Issued Items</div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Uniforms Supplied</label>
            <input
              type="text"
              inputMode="numeric"
              value={form.uniforms_supplied}
              onChange={(e) => set("uniforms_supplied", e.target.value.replace(/\D/g, ""))}
              className="w-28 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              placeholder="e.g. 3"
            />
          </div>
          <div className="space-y-3 mt-3">
            {[
              { field: "badge_supplied", label: "Badge supplied" },
              { field: "keys_supplied", label: "Keys supplied" },
            ].map(({ field, label }) => (
              <div key={field} className="flex items-center justify-between">
                <div className="text-sm font-medium text-gray-700">{label}</div>
                <button
                  onClick={() => set(field, !form[field])}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form[field] ? "bg-blue-600" : "bg-gray-200"}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form[field] ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
            ))}
          </div>
        </div>

        </div>
        )}

        {/* ── PAYROLL TAB ── */}
        {activeTab === "payroll" && (
        <div className="space-y-4">

        {/* Employment type */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Employment Type</label>
          <select
            value={form.employment_type}
            onChange={(e) => set("employment_type", e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            <option value="">— Select type —</option>
            {EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {/* Salary — fortnightly hours */}
        {showHours && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Fortnightly Hours</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                inputMode="decimal"
                value={form.contracted_hours}
                onChange={(e) => set("contracted_hours", e.target.value.replace(/[^\d.]/g, ""))}
                className="w-28 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder="e.g. 76"
              />
              <span className="text-sm text-gray-500">hrs per fortnight</span>
              {form.contracted_hours && !isNaN(Number(form.contracted_hours)) && (
                <span className="text-xs text-gray-400">
                  (= {(Number(form.contracted_hours) / 2).toFixed(1)} hrs/week)
                </span>
              )}
            </div>
          </div>
        )}

        {/* Permanent — schedule */}
        {showSchedule && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-600">Schedule</label>
              <div className="flex gap-1">
                {[{ value: "weekly", label: "Every week" }, { value: "alternating", label: "Week A / B" }].map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => set("schedule_type", value)}
                    className={`text-xs px-2.5 py-1 rounded-full border ${form.schedule_type === value ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-500 border-gray-300"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {form.schedule_type === "weekly" && (
              <DayScheduleGrid
                schedule={form.weekly_schedule}
                onChange={(s) => set("weekly_schedule", s)}
              />
            )}

            {form.schedule_type === "alternating" && (
              <div className="space-y-4">
                <div>
                  <div className="text-xs font-semibold text-blue-700 mb-2 px-1">Week A <span className="font-normal text-gray-400">(Wed–Tue, first week of pay period)</span></div>
                  <DayScheduleGrid
                    schedule={form.week_ab_schedule.a}
                    onChange={(s) => set("week_ab_schedule", { ...form.week_ab_schedule, a: s })}
                  />
                </div>
                <div>
                  <div className="text-xs font-semibold text-purple-700 mb-2 px-1">Week B <span className="font-normal text-gray-400">(Wed–Tue, second week of pay period)</span></div>
                  <DayScheduleGrid
                    schedule={form.week_ab_schedule.b}
                    onChange={(s) => set("week_ab_schedule", { ...form.week_ab_schedule, b: s })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Schedule notes</label>
                  <input
                    type="text"
                    value={form.week_ab_schedule.notes || ""}
                    onChange={(e) => set("week_ab_schedule", { ...form.week_ab_schedule, notes: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                    placeholder="e.g. 1st Sunday of each month"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="border-t pt-2" />

        {/* TFN */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Tax File Number (TFN)</label>
          <input
            value={form.tfn}
            onChange={(e) => set("tfn", e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            placeholder="xxx xxx xxx"
          />
        </div>

        {/* Bank */}
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-1">Bank Account</div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Account Name</label>
          <input
            value={form.bank_account_name}
            onChange={(e) => set("bank_account_name", e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            placeholder="Full name as on account"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">BSB</label>
            <input
              value={form.bsb}
              onChange={(e) => set("bsb", e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              placeholder="xxx-xxx"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Account Number</label>
            <input
              value={form.account_number}
              onChange={(e) => set("account_number", e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              placeholder="xxxxxxxx"
            />
          </div>
        </div>

        {/* Super */}
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-1">Superannuation</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Fund Name</label>
            <input
              value={form.super_fund_name}
              onChange={(e) => set("super_fund_name", e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              placeholder="e.g. GuildSuper"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">USI / SPIN</label>
            <input
              value={form.super_fund_usi}
              onChange={(e) => set("super_fund_usi", e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              placeholder="e.g. RES0103AU"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Fund ABN</label>
            <input
              value={form.super_fund_abn}
              onChange={(e) => set("super_fund_abn", e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              placeholder="xx xxx xxx xxx"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Member Number</label>
            <input
              value={form.super_member_number}
              onChange={(e) => set("super_member_number", e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              placeholder="xxxxxxxxx"
            />
          </div>
        </div>

        {/* Onboarding / details link — existing staff, for collecting or updating payroll details */}
        {!isNew && member?.onboarding_token && (
          <div className="border rounded-lg p-3 bg-amber-50 border-amber-100">
            <div className="text-xs font-semibold text-amber-700 mb-1">📋 Details Link</div>
            <div className="text-[11px] text-amber-600 mb-2">Send this to the staff member to collect or update their payroll details (e.g. new bank account).</div>
            <div className="text-[11px] text-amber-600 break-all mb-2">
              {typeof window !== "undefined" ? `${window.location.origin}/staff-onboard?token=${member.onboarding_token}` : ""}
            </div>
            <button
              onClick={() => {
                const url = `${window.location.origin}/staff-onboard?token=${member.onboarding_token}`;
                navigator.clipboard.writeText(url);
                alert("Onboarding link copied to clipboard!");
              }}
              className="text-[11px] px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
            >
              Copy link
            </button>
          </div>
        )}

        

        {/* Sick days — existing staff only */}
        {!isNew && (
          <div className="border-t pt-4">
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
              Sick Days {sickDays.length > 0 && <span className="text-gray-400 font-normal">({sickDays.length})</span>}
            </div>
            {sickDays.length === 0 ? (
              <p className="text-xs text-gray-400">No sick days recorded.</p>
            ) : (
              <div className="space-y-1.5">
                {sickDays.map((sd) => (
                  <div key={sd.id} className="flex items-start gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                    <span className="text-sm">🤒</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-700">
                        {new Date(sd.sick_date + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                      </div>
                      {sd.reason && <div className="text-xs text-gray-500 mt-0.5">{sd.reason}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        </div>
        )}

        {/* ── DOCUMENTS TAB ── */}
        {activeTab === "documents" && (
        <div className="space-y-4">
          {isNew ? (
            <p className="text-xs text-gray-400">Save the staff member first, then you can upload documents.</p>
          ) : (
            <>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Documents {documents.length > 0 && <span className="text-gray-400 font-normal">({documents.length})</span>}
              </div>

              <div className="space-y-4">
                {[
                  { type: "signed_contract", label: "Signed Employment Contract", multi: false },
                  { type: "resume", label: "Resume", multi: false },
                  { type: "first_aid_cert", label: "First Aid Certificate", multi: false },
                  { type: "cpr_cert", label: "CPR Certificate", multi: false },
                  { type: "induction_checklist", label: "Induction Checklist", multi: false },
                  { type: "confidentiality_policy", label: "Signed Confidentiality Policy", multi: false },
                  ...(isPharmacist
                    ? [
                        { type: "ahpra_cert", label: "AHPRA Certificate", multi: false },
                        { type: "indemnity_cert", label: "Professional Indemnity Certificate", multi: false },
                        { type: "vaccination_accreditation", label: "Vaccination Accreditation", multi: true },
                      ]
                    : [{ type: "s2_s3_cert", label: "S2/S3 Certificate (if applicable)", multi: false }]),
                  { type: "other", label: "Other Documents", multi: true },
                ].map(({ type, label, multi }) => {
                  const slotDocs = documents.filter((d) => d.type === type);
                  const showUploader = multi || slotDocs.length === 0;
                  return (
                    <div key={type}>
                      <div className="text-xs font-medium text-gray-600 mb-1.5">{label}</div>

                      {slotDocs.length > 0 && (
                        <div className="space-y-1.5 mb-2">
                          {slotDocs.map((doc) => (
                            <div key={doc.id} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                              <span className="text-sm">📄</span>
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-medium text-gray-700 truncate">{doc.filename || doc.type}</div>
                                <div className="text-[11px] text-gray-400">{new Date(doc.uploaded_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</div>
                              </div>
                              <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline shrink-0">View</a>
                              {!multi && (
                                <label className="text-xs text-blue-600 hover:underline shrink-0 cursor-pointer">
                                  Replace
                                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" disabled={uploadingDoc}
                                    onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; await handleDocDelete(doc, true); await handleDocUpload(f, type); }} />
                                </label>
                              )}
                              <button type="button" onClick={() => handleDocDelete(doc)} className="text-xs text-red-500 hover:text-red-700 shrink-0">Remove</button>
                            </div>
                          ))}
                        </div>
                      )}

                      {showUploader && (
                        <label className={`flex items-center gap-2 w-full border-2 border-dashed rounded-lg px-3 py-3 cursor-pointer transition-colors ${uploadingDoc ? "border-blue-200 bg-blue-50" : "border-gray-200 hover:border-blue-300 hover:bg-blue-50"}`}>
                          <span className="text-gray-400">📎</span>
                          <span className="text-xs text-gray-500">{uploadingDoc ? "Uploading…" : multi && slotDocs.length > 0 ? "Add another" : `Upload ${label}`}</span>
                          <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" disabled={uploadingDoc} onChange={(e) => handleDocUpload(e.target.files?.[0], type)} />
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
        )}

        {/* ── TRAINING TAB ── */}
        {activeTab === "training" && (
        <div className="space-y-4">
          {isNew ? (
            <p className="text-xs text-gray-400">Save the staff member first, then you can add training records.</p>
          ) : (
            <>
              {/* QSPP progress — pharmacy assistants only */}
              {qsppApplies(form.role) && (() => {
                const cycle = getCurrentCycle(qsppAnchor);
                if (!cycle) {
                  return (
                    <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-700">
                      Set a QSPP cycle start date in Settings to track training progress.
                    </div>
                  );
                }
                const done = hoursInCycle(training, cycle);
                const pct = Math.min(100, Math.round((done / QSPP_HOURS_REQUIRED) * 100));
                const met = done >= QSPP_HOURS_REQUIRED;
                return (
                  <div className="rounded-lg border border-gray-200 p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-600">QSPP Training</span>
                      <span className={`text-xs font-medium ${met ? "text-green-600" : "text-gray-700"}`}>
                        {done} / {QSPP_HOURS_REQUIRED} hrs {met ? "✓" : ""}
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div className={`h-2 rounded-full ${met ? "bg-green-500" : "bg-blue-500"}`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="text-[11px] text-gray-400 mt-1.5">Current cycle: {formatCycle(cycle)}</div>
                  </div>
                );
              })()}

              {/* Existing records */}
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Records {training.length > 0 && <span className="text-gray-400 font-normal">({training.length})</span>}
              </div>
              {training.length === 0 ? (
                <p className="text-xs text-gray-400">No training recorded yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {training.map((r) => (
                    <div key={r.id} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                      <div className="flex items-start gap-2">
                        <span className="text-sm">📚</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-gray-700">{r.topic}</div>
                          <div className="text-[11px] text-gray-500 mt-0.5">
                            {new Date(r.training_date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                            {" · "}{Number(r.hours)} hr{Number(r.hours) === 1 ? "" : "s"}
                            {r.provider ? ` · ${r.provider}` : ""}
                          </div>
                        </div>
                        {r.certificate_url && (
                          <a href={r.certificate_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline shrink-0">Certificate</a>
                        )}
                        <button type="button" onClick={() => handleDeleteTraining(r)} className="text-xs text-red-500 hover:text-red-700 shrink-0">Remove</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add record */}
              <div className="border rounded-lg p-3 bg-gray-50 space-y-3">
                <div className="text-xs font-semibold text-gray-600">Add training record</div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Topic *</label>
                  <input value={trTopic} onChange={(e) => setTrTopic(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="e.g. Wound care workshop" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Date *</label>
                    <input type="date" value={trDate} onChange={(e) => setTrDate(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Hours *</label>
                    <input type="text" inputMode="decimal" value={trHours} onChange={(e) => setTrHours(e.target.value.replace(/[^\d.]/g, ""))} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="e.g. 1.5" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Training Provider</label>
                  <input value={trProvider} onChange={(e) => setTrProvider(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="e.g. Guild Training" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Certificate (optional)</label>
                  <label className="flex items-center gap-2 w-full border-2 border-dashed rounded-lg px-3 py-2.5 cursor-pointer border-gray-200 hover:border-blue-300 hover:bg-blue-50">
                    <span className="text-gray-400">📎</span>
                    <span className="text-xs text-gray-500 truncate">{trFile ? trFile.name : "Attach certificate"}</span>
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => setTrFile(e.target.files?.[0] || null)} />
                  </label>
                </div>
                {trainingError && <p className="text-sm text-red-500">{trainingError}</p>}
                <button onClick={handleAddTraining} disabled={savingTraining} className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-40">
                  {savingTraining ? "Saving…" : "Add training record"}
                </button>
              </div>
            </>
          )}
        </div>
        )}

        {/* ── OFFBOARDING TAB ── */}
        {activeTab === "offboarding" && (
        <div className="space-y-4">
          <p className="text-xs text-gray-400">Complete this section when a staff member leaves. Set them to inactive on the Profile tab once finalised.</p>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Last Day of Employment</label>
            <input
              type="date"
              value={form.last_day}
              onChange={(e) => set("last_day", e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Reason for Leaving</label>
            <textarea
              value={form.reason_for_leaving}
              onChange={(e) => set("reason_for_leaving", e.target.value)}
              rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
              placeholder="e.g. Resignation, moved interstate"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Exit Interview Date</label>
            <input
              type="date"
              value={form.exit_interview_date}
              onChange={(e) => set("exit_interview_date", e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>

          <div className="space-y-3 pt-1">
            {[
              { field: "statement_of_service_provided", label: "Statement of service provided" },
              { field: "training_record_provided", label: "Training record provided" },
              { field: "uniforms_returned", label: "Uniforms returned" },
              { field: "badge_returned", label: "Badge returned" },
              { field: "keys_returned", label: "Keys returned" },
            ].map(({ field, label }) => (
              <div key={field} className="flex items-center justify-between">
                <div className="text-sm font-medium text-gray-700">{label}</div>
                <button
                  onClick={() => set(field, !form[field])}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form[field] ? "bg-blue-600" : "bg-gray-200"}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form[field] ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
            ))}
          </div>
        </div>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>

      <div className="px-5 py-4 border-t shrink-0 space-y-2">
        {!isNew && (
          <button
            onClick={async () => {
              try {
                const XLSX = await import("xlsx");
                const data = [{
                  "Name": form.name,
                  "Role": form.role || "",
                  "Employment Type": form.employment_type || "",
                  "Date of Birth": form.date_of_birth || "",
                  "Start Date": form.start_date || "",
                  "Address": form.address || "",
                  "Phone": form.phone || "",
                  "Email": form.email || "",
                  "Emergency Contact": form.emergency_contact_name || "",
                  "Emergency Phone": form.emergency_contact_phone || "",
                  "TFN": form.tfn || "",
                  "AHPRA": form.ahpra_number || "",
                  "Fortnightly Hours": form.contracted_hours || "",
                  "Bank Account Name": form.bank_account_name || "",
                  "BSB": form.bsb || "",
                  "Account Number": form.account_number || "",
                  "Super Fund Name": form.super_fund_name || "",
                  "Super Fund USI/SPIN": form.super_fund_usi || "",
                  "Super Fund ABN": form.super_fund_abn || "",
                  "Super Member Number": form.super_member_number || "",
                }];
                const ws = XLSX.utils.json_to_sheet(data);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Staff");
                XLSX.writeFile(wb, `staff_${(form.name || "member").replace(/\s+/g, "_").toLowerCase()}.xlsx`);
              } catch (err) {
                alert("Export failed: " + (err?.message || String(err)));
              }
            }}
            className="w-full border border-green-300 text-green-700 rounded-lg py-2 text-sm font-medium hover:bg-green-50"
          >
            ↓ Export to Excel
          </button>
        )}
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-40">
            {saving ? "Saving…" : isNew ? "Add Staff" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
// ─── Locum Form ───────────────────────────────────────────────────────────────

function LocumForm({ member, onSave, onCancel }) {
  const isNew = !member?.id;
  const [form, setForm] = useState({
    name: member?.name || "",
    email: member?.email || "",
    phone: member?.phone || "",
    address: member?.address || "",
    ahpra_number: member?.ahpra_number || "",
    photo_url: member?.photo_url || "",
    pdl_cert: member?.pdl_cert ?? false,
    hourly_rate: member?.hourly_rate || "",
    rate_weekday: member?.rate_weekday ?? 70,
    rate_saturday: member?.rate_saturday ?? 75,
    rate_sunday: member?.rate_sunday ?? 80,
    notes: member?.notes || "",
    pin: member?.pin || "",
    active: member?.active ?? true,
    can_access_wages: member?.can_access_wages ?? false,
    date_of_birth: member?.date_of_birth || "",
    tfn: member?.tfn || "",
    bank_account_name: member?.bank_account_name || "",
    bsb: member?.bsb || "",
    account_number: member?.account_number || "",
    super_fund_name: member?.super_fund_name || "",
    super_fund_usi: member?.super_fund_usi || "",
    super_fund_abn: member?.super_fund_abn || "",
    super_member_number: member?.super_member_number || "",
  });
  const [payrollOpen, setPayrollOpen] = useState(false);
  const [bookings, setBookings] = useState([]);
  const [newBookingDate, setNewBookingDate] = useState("");
  const [newBookingStart, setNewBookingStart] = useState("09:00");
  const [newBookingEnd, setNewBookingEnd] = useState("17:00");
  const [savingBooking, setSavingBooking] = useState(false);
  const [deletingBooking, setDeletingBooking] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [copiedBookings, setCopiedBookings] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    setError("");
    const ext = file.name.split(".").pop();
    const filename = `locum_${(form.name.toLowerCase().replace(/[^a-z0-9]+/g, "_") || "new")}_${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("staff-photos")
      .upload(filename, file, { upsert: true });
    if (upErr) {
      setError("Photo upload failed: " + upErr.message);
      setUploadingPhoto(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("staff-photos").getPublicUrl(filename);
    set("photo_url", urlData.publicUrl);
    setUploadingPhoto(false);
  };

  useEffect(() => {
    if (!member?.id) return;
    supabase.from("roster_shifts")
      .select("id, shift_date, start_time, end_time")
      .eq("staff_id", member.id)
      .gte("shift_date", new Date().toISOString().slice(0, 10))
      .order("shift_date")
      .then(({ data }) => setBookings(data || []));
    supabase.from("locum_documents")
      .select("*")
      .eq("staff_id", member.id)
      .order("uploaded_at", { ascending: false })
      .then(({ data }) => setDocuments(data || []));
  }, [member?.id]);

  const handleSave = async () => {
    if (!form.name.trim()) { setError("Name is required."); return; }
    if (form.pin && form.pin.length !== 4) { setError("PIN must be 4 digits."); return; }

    // PIN uniqueness — real PINs must be unique within the pharmacy; "0000" is the unset placeholder and may repeat
    if (form.pin && form.pin !== "0000") {
      let q = supabase.from("staff").select("id, name").eq("pharmacy_id", PHARMACY_ID).eq("pin", form.pin);
      if (member?.id) q = q.neq("id", member.id);
      const { data: clash } = await q.maybeSingle();
      if (clash) { setError("That PIN is already taken. Please choose a different PIN."); return; }
    }

    setSaving(true);
    setError("");
    const payload = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      ahpra_number: form.ahpra_number.trim() || null,
      photo_url: form.photo_url || null,
      hourly_rate: form.hourly_rate ? Number(form.hourly_rate) : null,
      rate_weekday: form.rate_weekday ? Number(form.rate_weekday) : 70,
      rate_saturday: form.rate_saturday ? Number(form.rate_saturday) : 75,
      rate_sunday: form.rate_sunday ? Number(form.rate_sunday) : 80,
      notes: form.notes.trim() || null,
      pin: form.pin || null,
      active: form.active,
      can_access_wages: form.can_access_wages,
      date_of_birth: form.date_of_birth || null,
      tfn: form.tfn.trim() || null,
      bank_account_name: form.bank_account_name.trim() || null,
      bsb: form.bsb.trim() || null,
      account_number: form.account_number.trim() || null,
      super_fund_name: form.super_fund_name.trim() || null,
      super_fund_usi: form.super_fund_usi.trim() || null,
      super_fund_abn: form.super_fund_abn.trim() || null,
      super_member_number: form.super_member_number.trim() || null,
      role: "Locum",
      employment_type: "Casual",
      pharmacy_id: PHARMACY_ID,
      onboarding_token: isNew ? Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) : undefined,
    };
    let result;
    if (isNew) {
      result = await supabase.from("staff").insert(payload).select().single();
    } else {
      result = await supabase.from("staff").update(payload).eq("id", member.id).select().single();
    }
    setSaving(false);
    if (result.error) { setError(result.error.message); return; }
    onSave(result.data);
  };

  const handleAddBooking = async () => {
    if (!member?.id) { setError("Save the locum first before adding bookings."); return; }
    if (!newBookingDate) { setError("Please select a date."); return; }
    setSavingBooking(true);
    setError("");
    try {
      const { data: monthData } = await supabase.from("roster_months").select("id").eq("month", newBookingDate.slice(0, 7) + "-01").maybeSingle();
      let rosterMonthId = monthData?.id;
      if (!rosterMonthId) {
        const { data: created } = await supabase.from("roster_months").insert([{ month: newBookingDate.slice(0, 7) + "-01", status: "draft", pharmacy_id: PHARMACY_ID }]).select("id").single();
        rosterMonthId = created?.id;
      }
      const { data, error: insErr } = await supabase.from("roster_shifts").insert([{
        staff_id: member.id,
        shift_date: newBookingDate,
        start_time: newBookingStart,
        end_time: newBookingEnd,
        role: "Locum",
        roster_month_id: rosterMonthId,
      }]).select("id, shift_date, start_time, end_time").single();
      if (insErr) throw insErr;
      setBookings((b) => [...b, data].sort((a, c) => a.shift_date.localeCompare(c.shift_date)));
      setNewBookingDate("");
      setNewBookingStart("09:00");
      setNewBookingEnd("17:00");
    } catch (err) {
      setError("Couldn't add booking: " + (err?.message || String(err)));
    } finally {
      setSavingBooking(false);
    }
  };

  const handleDeleteBooking = async (id) => {
    if (!window.confirm("Remove this booking from the roster?")) return;
    setDeletingBooking(id);
    await supabase.from("roster_shifts").delete().eq("id", id);
    setBookings((b) => b.filter((x) => x.id !== id));
    setDeletingBooking(null);
  };

  const fmtBookingDate = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

  const handleCopyBookings = () => {
    const lines = bookings.map((b) => `${fmtBookingDate(b.shift_date)} · ${formatTime(b.start_time)} – ${formatTime(b.end_time)}`);
    const text = `${form.name} — Upcoming Bookings\n\n${lines.join("\n")}\n\n${bookings.length} shift${bookings.length !== 1 ? "s" : ""}`;
    navigator.clipboard.writeText(text);
    setCopiedBookings(true);
    setTimeout(() => setCopiedBookings(false), 2000);
  };

  const handleDocUpload = async (file, type) => {
    if (!file || !member?.id) return;
    setUploadingDoc(true);
    setError("");
    try {
      const ext = file.name.split(".").pop();
      const filename = `${member.id}_${type}_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("locum-documents")
        .upload(filename, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("locum-documents").getPublicUrl(filename);
      const { data: doc, error: insErr } = await supabase.from("locum_documents").insert([{
        staff_id: member.id,
        type,
        url: urlData.publicUrl,
        filename: file.name,
        pharmacy_id: PHARMACY_ID,
      }]).select().single();
      if (insErr) throw insErr;
      setDocuments((prev) => [doc, ...prev]);
    } catch (err) {
      setError("Upload failed: " + (err?.message || String(err)));
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleDocDelete = async (doc) => {
    if (!window.confirm("Delete this document?")) return;
    await supabase.from("locum_documents").delete().eq("id", doc.id);
    setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
        <h2 className="font-semibold text-gray-800">{isNew ? "Add Locum" : "Edit Locum"}</h2>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

        {/* Professional details */}
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Professional</div>
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <Avatar name={form.name} photoUrl={form.photo_url} className="w-16 h-16 rounded-full border" />
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Photo</label>
                <label className="cursor-pointer inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50">
                  {uploadingPhoto ? "Uploading…" : "Upload photo"}
                  <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={uploadingPhoto} />
                </label>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input value={form.name} onChange={(e) => set("name", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="Full name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                <input value={form.phone} onChange={(e) => set("phone", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="04xx xxx xxx" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <input value={form.email} onChange={(e) => set("email", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="email@example.com" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">AHPRA Number</label>
              <input value={form.ahpra_number} onChange={(e) => set("ahpra_number", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="PHA0000000000" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Rates ($/hr)</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { field: "rate_weekday", label: "Weekday" },
                  { field: "rate_saturday", label: "Saturday" },
                  { field: "rate_sunday", label: "Sunday" },
                ].map(({ field, label }) => (
                  <div key={field}>
                    <div className="text-[11px] text-gray-500 mb-1">{label}</div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-400">$</span>
                      <input
                        type="text" inputMode="decimal"
                        value={form[field]}
                        onChange={(e) => set(field, e.target.value.replace(/[^\d.]/g, ""))}
                        className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="e.g. Good with vaccinations, prefers weekends" className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-400" />
            </div>
          </div>
        </div>

        {/* Payroll — collapsible */}
        <div className="border rounded-lg overflow-hidden">
          <button onClick={() => setPayrollOpen((o) => !o)} className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 text-xs font-semibold text-gray-600 uppercase tracking-wide hover:bg-gray-100">
            <span>💳 Payroll Details</span>
            <span>{payrollOpen ? "▾" : "▸"}</span>
          </button>
          {payrollOpen && (
            <div className="px-4 py-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Date of Birth</label>
                  <input type="date" value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">TFN</label>
                  <input value={form.tfn} onChange={(e) => set("tfn", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="xxx xxx xxx" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
                <input value={form.address} onChange={(e) => set("address", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="Street, Suburb, State, Postcode" />
              </div>
              <div className="text-xs font-medium text-gray-500 pt-1">Bank Account</div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Account Name</label>
                <input value={form.bank_account_name} onChange={(e) => set("bank_account_name", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="Full name as on account" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">BSB</label>
                  <input value={form.bsb} onChange={(e) => set("bsb", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="xxx-xxx" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Account Number</label>
                  <input value={form.account_number} onChange={(e) => set("account_number", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="xxxxxxxx" />
                </div>
              </div>
              <div className="text-xs font-medium text-gray-500 pt-1">Superannuation</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Fund Name</label>
                  <input value={form.super_fund_name} onChange={(e) => set("super_fund_name", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="e.g. GuildSuper" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">USI / SPIN</label>
                  <input value={form.super_fund_usi} onChange={(e) => set("super_fund_usi", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="e.g. RES0103AU" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Fund ABN</label>
                  <input value={form.super_fund_abn} onChange={(e) => set("super_fund_abn", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="xx xxx xxx xxx" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Member Number</label>
                  <input value={form.super_member_number} onChange={(e) => set("super_member_number", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="xxxxxxxxx" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Onboarding link */}
        {!isNew && member?.onboarding_token && (
          <div className="border rounded-lg p-3 bg-blue-50 border-blue-100">
            <div className="text-xs font-semibold text-blue-700 mb-1">📋 Onboarding Link</div>
            <div className="text-[11px] text-blue-600 break-all mb-2">
              {typeof window !== "undefined" ? `${window.location.origin}/locum?token=${member.onboarding_token}` : ""}
            </div>
            <button
              onClick={() => {
                const url = `${window.location.origin}/locum?token=${member.onboarding_token}`;
                navigator.clipboard.writeText(url);
                alert("Link copied to clipboard!");
              }}
              className="text-[11px] px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Copy link
            </button>
          </div>
        )}

        {/* Access */}
        <div className="space-y-3">
          {[
            { field: "active", label: "Active", desc: "Appears in roster staff picker" },
            { field: "can_access_wages", label: "Can approve wages", desc: "PIN unlocks wages approval for their own timesheet" },
          ].map(({ field, label, desc }) => (
            <div key={field} className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-gray-700">{label}</div>
                <div className="text-xs text-gray-400">{desc}</div>
              </div>
              <button onClick={() => set(field, !form[field])} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form[field] ? "bg-blue-600" : "bg-gray-200"}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form[field] ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
          ))}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">PIN (4 digits, optional)</label>
            <input type="password" inputMode="numeric" maxLength={4} value={form.pin} onChange={(e) => set("pin", e.target.value.replace(/\D/g, ""))} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="••••" />
          </div>
        </div>

        {/* Documents */}
        {!isNew && (
          <div className="border-t pt-4">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Documents {documents.length > 0 && <span className="text-gray-400 font-normal">({documents.length})</span>}
            </div>

            {/* Existing documents */}
            {documents.length === 0 ? (
              <p className="text-xs text-gray-400 mb-3">No documents uploaded yet.</p>
            ) : (
              <div className="space-y-1.5 mb-3">
                {documents.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                    <span className="text-sm">📄</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-gray-700 truncate">{doc.filename || doc.type}</div>
                      <div className="text-[11px] text-gray-400">{doc.type} · {new Date(doc.uploaded_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</div>
                    </div>
                    <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline shrink-0">View</a>
                    <button onClick={() => handleDocDelete(doc)} className="text-xs text-red-500 hover:text-red-700 shrink-0">Delete</button>
                  </div>
                ))}
              </div>
            )}

            {/* Upload new document */}
            <div className="space-y-2 border rounded-lg p-3 bg-gray-50">
              <div className="text-[11px] font-medium text-gray-500">Upload document</div>
              <div className="flex gap-2">
                {[
                  { type: "indemnity_cert", label: "Indemnity Cert" },
                  { type: "locum_agreement", label: "Locum Agreement" },
                  { type: "other", label: "Other" },
                ].map(({ type, label }) => (
                  <label key={type} className={`flex-1 text-center text-[11px] px-2 py-2 rounded-lg border cursor-pointer hover:bg-blue-50 hover:border-blue-200 ${uploadingDoc ? "opacity-40 pointer-events-none" : "border-gray-200 text-gray-600"}`}>
                    {uploadingDoc ? "Uploading…" : `+ ${label}`}
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" disabled={uploadingDoc}
                      onChange={(e) => handleDocUpload(e.target.files?.[0], type)} />
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Bookings */}
        {!isNew && (
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Upcoming Bookings</div>
              {bookings.length > 0 && (
                <button
                  onClick={handleCopyBookings}
                  className={`text-[11px] px-2.5 py-1 rounded-lg border font-medium ${copiedBookings ? "bg-green-50 border-green-200 text-green-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                >
                  {copiedBookings ? "✓ Copied" : "📋 Copy bookings"}
                </button>
              )}
            </div>
            {bookings.length === 0 ? (
              <p className="text-xs text-gray-400 mb-3">No upcoming bookings.</p>
            ) : (
              <div className="space-y-1.5 mb-3">
                {bookings.map((b) => (
                  <div key={b.id} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                    <div>
                      <div className="text-xs font-medium text-gray-700">{fmtBookingDate(b.shift_date)}</div>
                      <div className="text-[11px] text-gray-500">{formatTime(b.start_time)} – {formatTime(b.end_time)}</div>
                    </div>
                    <button onClick={() => handleDeleteBooking(b.id)} disabled={deletingBooking === b.id} className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40">Remove</button>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-2 border rounded-lg p-3 bg-gray-50">
              <div className="text-[11px] font-medium text-gray-500">Add booking</div>
              <input type="date" value={newBookingDate} onChange={(e) => setNewBookingDate(e.target.value)} className="w-full border rounded-lg px-2 py-1.5 text-sm" />
              <div className="flex gap-2 items-center">
                <input type="time" value={newBookingStart} onChange={(e) => setNewBookingStart(e.target.value)} className="flex-1 border rounded-lg px-2 py-1.5 text-sm" />
                <span className="text-gray-400 text-sm">–</span>
                <input type="time" value={newBookingEnd} onChange={(e) => setNewBookingEnd(e.target.value)} className="flex-1 border rounded-lg px-2 py-1.5 text-sm" />
              </div>
              <button onClick={handleAddBooking} disabled={savingBooking || !newBookingDate} className="w-full py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
                {savingBooking ? "Adding…" : "+ Add to roster"}
              </button>
            </div>
          </div>
        )}
        {isNew && <p className="text-xs text-gray-400">Save the locum first, then you can add bookings.</p>}

        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>

      <div className="px-5 py-4 border-t shrink-0 space-y-2">
        {!isNew && bookings.length > 0 && (
          <button
            onClick={async () => {
              try {
                const { generateLocumAgreement } = await import("../lib/generateLocumAgreement");
                await generateLocumAgreement({ locum: { ...member, ...form }, bookings });
              } catch (err) {
                alert("PDF generation failed: " + (err?.message || String(err)));
              }
            }}
            className="w-full border border-blue-200 text-blue-700 rounded-lg py-2 text-sm font-medium hover:bg-blue-50"
          >
            📄 Generate Locum Agreement PDF
          </button>
        )}

        {!isNew && (
          <button onClick={async () => {
            try {
              const XLSX = await import("xlsx");
              const data = [{
                "Name": form.name,
                "DOB": form.date_of_birth || "",
                "Address": form.address || "",
                "Phone": form.phone || "",
                "Email": form.email || "",
                "TFN": form.tfn || "",
                "Super Fund Name": form.super_fund_name || "",
                "Super Fund USI/SPIN": form.super_fund_usi || "",
                "Super Fund ABN": form.super_fund_abn || "",
                "Super Member Number": form.super_member_number || "",
                "Weekday Rate ($/hr)": form.rate_weekday || 70,
                "Saturday Rate ($/hr)": form.rate_saturday || 75,
                "Sunday Rate ($/hr)": form.rate_sunday || 80,
              }];
              const ws = XLSX.utils.json_to_sheet(data);
              const wb = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb, ws, "Locum");
              XLSX.writeFile(wb, `locum_${form.name.replace(/\s+/g, "_").toLowerCase()}.xlsx`);
            } catch (err) {
              alert("Export failed: " + (err?.message || String(err)));
            }
          }} className="w-full border border-green-300 text-green-700 rounded-lg py-2 text-sm font-medium hover:bg-green-50">
            ↓ Export to Excel
          </button>
        )}
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-40">
            {saving ? "Saving…" : isNew ? "Add Locum" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

function SettingsTab() {
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [slug, setSlug] = useState("");

  useEffect(() => {
    supabase.from("pharmacies").select("slug").eq("id", PHARMACY_ID).maybeSingle()
      .then(({ data }) => setSlug(data?.slug || ""));
    const load = async () => {
      const { data } = await supabase
        .from("pharmacy_settings")
        .select("*")
        .eq("pharmacy_id", PHARMACY_ID)
        .single();
      setForm(data || {
        name: "",
        phone: "",
        address: "",
        payroll_start_date: "",
        qspp_cycle_start_date: "",
        hours_monday: "",
        hours_tuesday: "",
        hours_wednesday: "",
        hours_thursday: "",
        hours_friday: "",
        hours_saturday: "",
        hours_sunday: "",
      });
      setLoading(false);
    };
    load();
  }, []);

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleSave = async () => {
    setSaving(true);
    setError("");
    const { error: err } = await supabase
      .from("pharmacy_settings")
      .update({
        name: form.name,
        phone: form.phone,
        address: form.address,
        payroll_start_date: form.payroll_start_date || null,
        qspp_cycle_start_date: form.qspp_cycle_start_date || null,
        hours_monday: form.hours_monday,
        hours_tuesday: form.hours_tuesday,
        hours_wednesday: form.hours_wednesday,
        hours_thursday: form.hours_thursday,
        hours_friday: form.hours_friday,
        hours_saturday: form.hours_saturday,
        hours_sunday: form.hours_sunday,
        updated_at: new Date().toISOString(),
      })
      .eq("pharmacy_id", PHARMACY_ID);
    setSaving(false);
    if (err) { setError(err.message); return; }
    setSuccess(true);
    setTimeout(() => setSuccess(false), 3000);
  };

  // Calculate pay periods from start date
  const getPayPeriods = () => {
    if (!form?.payroll_start_date) return [];
    const start = new Date(form.payroll_start_date);
    const today = new Date();
    const periods = [];
    let current = new Date(start);
    // Wind forward to find current/upcoming periods
    while (current < today) {
      current.setDate(current.getDate() + 14);
    }
    current.setDate(current.getDate() - 14);
    for (let i = 0; i < 4; i++) {
      const end = new Date(current);
      end.setDate(end.getDate() + 13);
      periods.push({
        start: new Date(current),
        end,
        isCurrent: current <= today && today <= end,
      });
      current.setDate(current.getDate() + 14);
    }
    return periods;
  };

  const payPeriods = form ? getPayPeriods() : [];

  if (loading) return <div className="p-6 text-sm text-gray-400">Loading…</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 max-w-2xl">

        {/* Staff app link */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Staff App Link</h3>
          <p className="text-xs text-gray-400 mb-3">Send this link to all staff. They log in with their work email and can add the app to their phone's home screen.</p>
          {slug ? (
            <div className="border rounded-lg p-3 bg-blue-50 border-blue-100">
              <div className="text-[11px] text-blue-600 break-all mb-2">
                {typeof window !== "undefined" ? `${window.location.origin}/me?p=${slug}` : ""}
              </div>
              <button
                onClick={() => {
                  const url = `${window.location.origin}/me?p=${slug}`;
                  navigator.clipboard.writeText(url);
                  alert("Staff link copied to clipboard!");
                }}
                className="text-[11px] px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Copy link
              </button>
            </div>
          ) : (
            <p className="text-xs text-gray-400">No pharmacy link set up yet.</p>
          )}
        </div>

        {/* Pharmacy details */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Pharmacy Details</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Pharmacy Name</label>
              <input
                value={form.name || ""}
                onChange={(e) => set("name", e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder="e.g. Byford Pharmacy"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
              <input
                value={form.phone || ""}
                onChange={(e) => set("phone", e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder="e.g. 08 9999 0000"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
              <input
                value={form.address || ""}
                onChange={(e) => set("address", e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder="e.g. 1 Main Street, Byford WA 6122"
              />
            </div>
          </div>
        </div>

        {/* Opening hours */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Opening Hours</h3>
          <p className="text-xs text-gray-400 mb-3">Enter hours as e.g. "8am–6:30pm" or leave blank if closed.</p>
          <div className="space-y-2">
            {WEEK_DAYS.map(({ key, label }) => (
              <div key={key} className="flex items-center gap-3">
                <span className="text-sm text-gray-600 w-28 shrink-0">{label}</span>
                <input
                  value={form[key] || ""}
                  onChange={(e) => set(key, e.target.value)}
                  className="flex-1 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                  placeholder="e.g. 8am–6:30pm or Closed"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Payroll */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Payroll</h3>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Fortnightly Start Date</label>
            <p className="text-xs text-gray-400 mb-2">Set the Wednesday that starts your first pay period. All future periods are calculated automatically.</p>
            <input
              type="date"
              value={form.payroll_start_date || ""}
              onChange={(e) => set("payroll_start_date", e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>

          {/* Pay periods */}
          {payPeriods.length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-medium text-gray-600 mb-2">Pay Periods</div>
              <div className="space-y-1.5">
                {payPeriods.map((p, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${p.isCurrent ? "bg-blue-50 border border-blue-200" : "bg-gray-50 border border-gray-100"}`}
                  >
                    <span className={p.isCurrent ? "text-blue-700 font-medium" : "text-gray-600"}>
                      {p.start.toLocaleDateString("en-AU", { day: "numeric", month: "short" })} – {p.end.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                    {p.isCurrent && <span className="ml-auto text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">Current</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* QSPP training */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">QSPP Training</h3>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Cycle Start Date</label>
            <p className="text-xs text-gray-400 mb-2">The fixed date your 3-year QSPP cycle starts. Pharmacy assistants need 3 hours of training per year (9 hours per cycle). All future cycles are calculated automatically from this date.</p>
            <input
              type="date"
              value={form.qspp_cycle_start_date || ""}
              onChange={(e) => set("qspp_cycle_start_date", e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
        {success && <p className="text-sm text-green-600 font-medium">✓ Settings saved.</p>}
      </div>

      <div className="px-6 py-4 border-t shrink-0">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 text-white rounded-lg px-6 py-2.5 text-sm font-medium disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}

// ─── Locums Tab ───────────────────────────────────────────────────────────────

function LocumsTab() {
  const [locums, setLocums] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [formKey, setFormKey] = useState(0);
  const [showInactive, setShowInactive] = useState(false);
  const [successId, setSuccessId] = useState(null);
  const [allBookings, setAllBookings] = useState([]);
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [copiedAll, setCopiedAll] = useState(false);
  const [coverEntries, setCoverEntries] = useState([]);
  const [loadingCover, setLoadingCover] = useState(true);
  const [coverMonths, setCoverMonths] = useState(3);
  const [copiedCover, setCopiedCover] = useState(false);

  const loadAllBookings = async () => {
    setLoadingBookings(true);
    const { data } = await supabase
      .from("roster_shifts")
      .select("id, shift_date, start_time, end_time, staff:staff_id(id, name)")
      .eq("role", "Locum")
      .gte("shift_date", new Date().toISOString().slice(0, 10))
      .order("shift_date");
    setAllBookings(data || []);
    setLoadingBookings(false);
  };

  const loadCover = async (months = coverMonths) => {
    setLoadingCover(true);
    const from = new Date().toISOString().slice(0, 10);
    const toD = new Date();
    toD.setMonth(toD.getMonth() + months);
    const to = toD.toISOString().slice(0, 10);
    const entries = await getLeaveCover({ fromDate: from, toDate: to });
    setCoverEntries(entries);
    setLoadingCover(false);
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("staff")
        .select("*")
        .eq("pharmacy_id", PHARMACY_ID)
        .eq("role", "Locum")
        .order("name");
      setLocums(data || []);
      setLoading(false);
    };
    load();
    loadAllBookings();
    loadCover();
  }, []);

  const fmtAllDate = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

  const handleCopyAll = () => {
    const lines = allBookings.map((b) => `${fmtAllDate(b.shift_date)} · ${b.staff?.name || "?"} · ${formatTime(b.start_time)} – ${formatTime(b.end_time)}`);
    const text = `Upcoming Locum Bookings\n\n${lines.join("\n")}\n\n${allBookings.length} shift${allBookings.length !== 1 ? "s" : ""}`;
    navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  // Only the unfilled (needs-locum) dates go into the copyable list — dates + times only
  const coverGaps = coverEntries.filter((e) => !e.filled);
  const handleCopyCover = () => {
    const lines = coverGaps.map((e) => `${fmtAllDate(e.date)} · ${formatTime(e.start)} – ${formatTime(e.end)}`);
    const text = `Shifts needing a locum\n\n${lines.join("\n")}\n\n${coverGaps.length} shift${coverGaps.length !== 1 ? "s" : ""}`;
    navigator.clipboard.writeText(text);
    setCopiedCover(true);
    setTimeout(() => setCopiedCover(false), 2000);
  };

  const handleSave = (saved) => {
    setLocums((prev) => {
      const exists = prev.find((s) => s.id === saved.id);
      if (exists) return prev.map((s) => s.id === saved.id ? saved : s);
      return [...prev, saved].sort((a, b) => a.name.localeCompare(b.name));
    });
    setSelected(saved);
    setSuccessId(saved.id);
    setTimeout(() => setSuccessId(null), 3000);
  };

  const visible = locums.filter((s) => showInactive ? true : s.active !== false);

  const handleExport = async () => {
    try {
      const XLSX = await import("xlsx");
      const data = locums.filter((s) => s.active !== false).map((s) => ({
        "Name": s.name,
        "DOB": s.date_of_birth || "",
        "Address": s.address || "",
        "Phone": s.phone || "",
        "TFN": s.tfn || "",
        "Super Fund Name": s.super_fund_name || "",
        "Super Fund USI/SPIN": s.super_fund_usi || "",
        "Super Fund ABN": s.super_fund_abn || "",
        "Super Member Number": s.super_member_number || "",
        "Weekday Rate ($/hr)": s.rate_weekday || 70,
        "Saturday Rate ($/hr)": s.rate_saturday || 75,
        "Sunday Rate ($/hr)": s.rate_sunday || 80,
      }));
      if (!data.length) { alert("No active locums to export."); return; }
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Locums");
      XLSX.writeFile(wb, `locum_directory_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
      alert("Export failed: " + (err?.message || String(err)));
    }
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left list */}
      <div className="w-[260px] min-w-[260px] bg-white border-r flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
          <button onClick={() => { setSelected("new"); setFormKey((k) => k + 1); }} className="text-xs font-medium text-blue-600 hover:text-blue-700">+ Add Locum</button>
          <button onClick={() => setShowInactive((v) => !v)} className="text-xs text-gray-400 hover:text-gray-600">{showInactive ? "Hide inactive" : "Show inactive"}</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-sm text-gray-400">Loading…</div>
          ) : visible.length === 0 ? (
            <div className="p-4 text-sm text-gray-400">No locums yet.</div>
          ) : (
            visible.map((s) => (
              <button key={s.id} onClick={() => { setSelected(s); setFormKey((k) => k + 1); }} className={`w-full flex items-center gap-3 px-3 py-2.5 border-b hover:bg-gray-50 text-left ${selected?.id === s.id ? "bg-blue-50" : ""}`}>
                <Avatar name={s.name} photoUrl={s.photo_url} className="w-9 h-9 rounded-full shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-800 truncate">{s.name}</div>
                  <div className="text-xs text-gray-400 truncate">{s.ahpra_number || "No AHPRA"}{s.hourly_rate ? ` · $${s.hourly_rate}/hr` : ""}</div>
                </div>
                {s.active === false && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400 shrink-0">Inactive</span>}
                {s.pdl_cert && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-100 shrink-0">PDL</span>}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right form */}
      <div className="flex-1 bg-white overflow-hidden flex flex-col">
        {successId && (
          <div className="shrink-0 bg-green-50 border-b border-green-200 px-5 py-2 text-sm text-green-700 font-medium">
            ✓ Changes saved successfully.
          </div>
        )}
        {!selected ? (
          <div className="flex flex-col h-full overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
              <h2 className="font-semibold text-gray-800">
                Upcoming Locum Bookings
                {allBookings.length > 0 && <span className="text-gray-400 font-normal text-sm ml-2">({allBookings.length})</span>}
              </h2>
              {allBookings.length > 0 && (
                <button
                  onClick={handleCopyAll}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-medium ${copiedAll ? "bg-green-50 border-green-200 text-green-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                >
                  {copiedAll ? "✓ Copied" : "📋 Copy list"}
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {loadingBookings ? (
                <div className="text-sm text-gray-400">Loading…</div>
              ) : allBookings.length === 0 ? (
                <div className="text-sm text-gray-400">No upcoming locum bookings.</div>
              ) : (
                <div className="space-y-1.5 max-w-2xl">
                  {allBookings.map((b) => (
                    <div key={b.id} className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
                      <span className="text-sm">💊</span>
                      <div className="text-sm text-gray-700 w-48 shrink-0">{fmtAllDate(b.shift_date)}</div>
                      <div className="text-sm font-medium text-gray-800 flex-1 min-w-0 truncate">{b.staff?.name || "?"}</div>
                      <div className="text-xs text-gray-500 shrink-0">{formatTime(b.start_time)} – {formatTime(b.end_time)}</div>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-400 mt-4">Select a locum on the left to edit, or add a new one.</p>

              {/* ── Locum cover needed ── */}
              <div className="mt-8 max-w-2xl">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-800">Shifts needing a locum</h3>
                    {!loadingCover && coverGaps.length > 0 && (
                      <span className="text-xs bg-red-100 text-red-700 rounded-full px-2 py-0.5 font-medium">{coverGaps.length}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={coverMonths}
                      onChange={(e) => { const m = Number(e.target.value); setCoverMonths(m); loadCover(m); }}
                      className="text-xs border rounded-lg px-2 py-1"
                    >
                      <option value={1}>Next 1 month</option>
                      <option value={2}>Next 2 months</option>
                      <option value={3}>Next 3 months</option>
                      <option value={6}>Next 6 months</option>
                    </select>
                    {coverGaps.length > 0 && (
                      <button
                        onClick={handleCopyCover}
                        className={`text-xs px-3 py-1.5 rounded-lg border font-medium ${copiedCover ? "bg-green-50 border-green-200 text-green-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                      >
                        {copiedCover ? "✓ Copied" : "📋 Copy gap list"}
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-400 mb-3">
                  Pharmacist leave (pending or approved) that falls on a day they'd normally work. Dates with a locum already booked are marked filled.
                </p>
                {loadingCover ? (
                  <div className="text-sm text-gray-400">Loading…</div>
                ) : coverEntries.length === 0 ? (
                  <div className="text-sm text-gray-400">No pharmacist leave needing cover in this window.</div>
                ) : (
                  <div className="space-y-1.5">
                    {coverEntries.map((e, i) => (
                      <div
                        key={`${e.date}-${e.staffName}-${i}`}
                        className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${e.filled ? "border-green-100 bg-green-50" : "border-red-100 bg-red-50"}`}
                      >
                        <span className="text-sm">{e.filled ? "✅" : "🔴"}</span>
                        <div className="text-sm text-gray-700 w-48 shrink-0">{fmtAllDate(e.date)}</div>
                        <div className="text-sm text-gray-600 w-32 shrink-0">{formatTime(e.start)} – {formatTime(e.end)}</div>
                        <div className="text-xs text-gray-500 flex-1 min-w-0 truncate">
                          {e.staffName} off{e.status === "pending" ? " (pending)" : ""}
                        </div>
                        <div className="text-xs shrink-0">
                          {e.filled
                            ? <span className="text-green-700 font-medium">{e.locumName}</span>
                            : <span className="text-red-600 font-medium">Needs locum</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <LocumForm
            key={formKey}
            member={selected === "new" ? null : selected}
            onSave={handleSave}
            onCancel={() => { setSelected(null); loadAllBookings(); }}
          />
        )}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────


export default function AdminPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [adminUser, setAdminUser] = useState(null);
  const [tab, setTab] = useState("staff");
  const [locumFormKey, setLocumFormKey] = useState(0);
  const [staffList, setStaffList] = useState([]);
  const [showInactive, setShowInactive] = useState(false);
  const [selected, setSelected] = useState(null); // null = none, "new" = add form, or staff object
  const [formKey, setFormKey] = useState(0);
  const [successId, setSuccessId] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!unlocked) return;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("staff")
        .select("*")
        .eq("pharmacy_id", PHARMACY_ID)
        .or("role.is.null,role.neq.Locum")
        .order("name", { ascending: true });
      setStaffList(data || []);
      setLoading(false);
    };
    load();
  }, [unlocked]);

  const handleUnlock = (user) => {
    setAdminUser(user);
    setUnlocked(true);
  };

  const handleSave = (saved) => {
    setStaffList((prev) => {
      const exists = prev.find((s) => s.id === saved.id);
      if (exists) return prev.map((s) => s.id === saved.id ? saved : s);
      return [...prev, saved].sort((a, b) => a.name.localeCompare(b.name));
    });
    setSelected(saved);
    setSuccessId(saved.id);
    setTimeout(() => setSuccessId(null), 3000);
  };

  if (!unlocked) return <PinScreen onUnlock={handleUnlock} />;

  const visibleStaff = staffList.filter((s) => showInactive ? true : s.active !== false);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      <Sidebar />

      <div className="flex flex-1 overflow-hidden">

        {/* Left — staff list */}
        {tab === "staff" && <div className="w-[260px] min-w-[260px] bg-white border-r flex flex-col overflow-hidden">

          

          {tab === "staff" && (
            <>
              {/* Add + toggle */}
              <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
                <button
                  onClick={() => setSelected("new")}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  + Add Staff
                </button>
                <div className="flex items-center gap-3">
                  <button
                    onClick={async () => {
                      try {
                        const XLSX = await import("xlsx");
                        const rows = staffList.filter((s) => s.active !== false).map((s) => ({
                          "Name": s.name || "",
                          "Role": s.role || "",
                          "Employment Type": s.employment_type || "",
                          "Date of Birth": s.date_of_birth || "",
                          "Start Date": s.start_date || "",
                          "Address": s.address || "",
                          "Phone": s.phone || "",
                          "Email": s.email || "",
                          "Emergency Contact": s.emergency_contact_name || "",
                          "Emergency Phone": s.emergency_contact_phone || "",
                          "TFN": s.tfn || "",
                          "AHPRA": s.ahpra_number || "",
                          "Fortnightly Hours": s.contracted_hours || "",
                          "Bank Account Name": s.bank_account_name || "",
                          "BSB": s.bsb || "",
                          "Account Number": s.account_number || "",
                          "Super Fund Name": s.super_fund_name || "",
                          "Super Fund USI/SPIN": s.super_fund_usi || "",
                          "Super Fund ABN": s.super_fund_abn || "",
                          "Super Member Number": s.super_member_number || "",
                        }));
                        if (!rows.length) { alert("No active staff to export."); return; }
                        const ws = XLSX.utils.json_to_sheet(rows);
                        const wb = XLSX.utils.book_new();
                        XLSX.utils.book_append_sheet(wb, ws, "Staff");
                        XLSX.writeFile(wb, `staff_directory_${new Date().toISOString().slice(0, 10)}.xlsx`);
                      } catch (err) {
                        alert("Export failed: " + (err?.message || String(err)));
                      }
                    }}
                    className="text-xs text-green-600 hover:text-green-700"
                  >
                    ↓ Export
                  </button>
                  <button
                    onClick={() => setShowInactive((v) => !v)}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    {showInactive ? "Hide inactive" : "Show inactive"}
                  </button>
                </div>
              </div>

              {/* Staff list */}
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="p-4 text-sm text-gray-400">Loading…</div>
                ) : visibleStaff.length === 0 ? (
                  <div className="p-4 text-sm text-gray-400">No staff found.</div>
                ) : (
                  visibleStaff.map((s) => {
                    const isSelected = selected?.id === s.id;
                    return (
                      <button
                        key={s.id}
                        onClick={() => { setSelected(s); setFormKey((k) => k + 1); }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 border-b hover:bg-gray-50 text-left transition-colors ${isSelected ? "bg-blue-50" : ""}`}
                      >
                        <Avatar
                          name={s.name}
                          photoUrl={s.photo_url}
                          className="w-9 h-9 rounded-full shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-gray-800 truncate">{s.name}</div>
                          <div className="text-xs text-gray-400 truncate">{s.role || "No role set"}</div>
                        </div>
                        {s.active === false && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400 shrink-0">Inactive</span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </>
          )}

          </div>}

        {/* Right — edit panel */}
        <div className="flex-1 bg-white overflow-hidden flex flex-col">

          {/* Top tabs */}
          <div className="flex border-b shrink-0 px-4">
            {["staff", "locums", "settings"].map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTab(t);
                  setSelected(null);
                  if (t === "locums") setLocumFormKey((k) => k + 1);
                }}
                className={`mr-4 py-3 text-sm font-medium ${tab === t ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500 hover:text-gray-700"}`}
              >
                {t === "staff" ? "👥 Staff" : t === "locums" ? "💊 Locums" : "⚙️ Settings"}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-hidden flex flex-col">
            {successId && (
              <div className="shrink-0 bg-green-50 border-b border-green-200 px-5 py-2 text-sm text-green-700 font-medium">
                ✓ Changes saved successfully.
              </div>
            )}
            {tab === "settings" ? (
              <SettingsTab />
            ) : tab === "locums" ? (
              <LocumsTab key={locumFormKey} />
            ) : !selected ? (
              <div className="h-full flex items-center justify-center text-sm text-gray-400">
                Select a staff member to edit, or add a new one.

              </div>
            ) : (
              <StaffForm
                key={formKey}
                member={selected === "new" ? null : selected}
                onSave={handleSave}
                onCancel={() => setSelected(null)}
              />
            )}
          </div>
        </div>

      </div>
    </div>
  );
}