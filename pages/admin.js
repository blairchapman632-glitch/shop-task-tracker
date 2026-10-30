import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import supabase from "../lib/supabaseClient";
import Sidebar from "../components/Sidebar";
import Avatar from "../components/Avatar";
import ContractForm, { ContractHistory, ContractSignatureSettings } from "../components/ContractTab";
import EmploymentContractsList from "../components/EmploymentContractsList";
import ReviewsTab from "../components/PerformanceReviews";
import StaffNeedsAttention from "../components/StaffNeedsAttention";
import InductionStep, { InductionPdfEntry } from "../components/InductionTab";
import DocumentSections from "../components/DocumentSections";
import { docSections, loadServiceConfig, updateStaffDocument } from "../lib/staffDocuments";
import { uploadStaffDoc, openStaffDoc, removeStaffDoc, attachTrainingCert, openTrainingCert, deleteTrainingRecord, recordHasCert } from "../lib/staffFiles";
import StaffTrainingPlan from "../components/TrainingPlan";
import { getLeaveCover } from "../lib/leaveCover";
import { todayPerth, addMonthsStr } from "../lib/performanceReview";
import { checkAdminPin } from "../lib/adminPin";
import { nextDayStr } from "../lib/leaveCalendar";


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
  "Retail Manager",
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

// ─── PIN Screen ───────────────────────────────────────────────────────────────

function PinScreen({ onUnlock }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const handleSubmit = async () => {
    if (pin.length !== 4) return;
    setChecking(true);
    setError("");
    const data = await checkAdminPin(supabase, PHARMACY_ID, pin);
    setChecking(false);
    if (!data) {
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

function StaffForm({ member, onSave, onRefresh, onCancel, initialTab, initialReviewId, adminUser }) {

  const isNew = !member?.id;
  const [activeTab, setActiveTab] = useState(initialTab || "profile");
  const [reviewToOpen, setReviewToOpen] = useState(null); // set by the Training tab's "Open review" link
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
    can_conduct_reviews: member?.can_conduct_reviews ?? false,
    exclude_from_reviews: member?.exclude_from_reviews ?? false,
    can_sign_inductions: member?.can_sign_inductions ?? false,
    paper_induction_on_file: member?.paper_induction_on_file ?? false,
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
  const [leaveHistory, setLeaveHistory] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [serviceConfig, setServiceConfig] = useState({ services: [], certificates: [], staffServices: [] });
  const [training, setTraining] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [onboardingDoneAt, setOnboardingDoneAt] = useState(null);

  const loadDocuments = async () => {
    if (!member?.id) return;
    const { data } = await supabase.from("locum_documents")
      .select("*")
      .eq("staff_id", member.id)
      .order("uploaded_at", { ascending: false });
    setDocuments(data || []);
  };

  const loadContracts = async () => {
    if (!member?.id) return;
    const [{ data }, { data: st }] = await Promise.all([
      supabase.from("employment_contracts")
        .select("id, template_id, status, field_values, issued_at, issued_file_path, accepted_at, accepted_name, accepted_file_path, created_at, updated_at, contract_templates:template_id(label, key)")
        .eq("staff_id", member.id)
        .order("created_at", { ascending: false }),
      // Fresh read — set by the onboarding page when they submit their payroll details
      supabase.from("staff").select("onboarding_completed_at").eq("id", member.id).maybeSingle(),
    ]);
    setContracts(data || []);
    setOnboardingDoneAt(st?.onboarding_completed_at || null);
  };

  useEffect(() => {
    if (!member?.id) return;
    supabase.from("sick_days")
      .select("id, sick_date, reason")
      .eq("staff_id", member.id)
      .order("sick_date", { ascending: false })
      .then(({ data }) => setSickDays(data || []));
    supabase.from("leave_requests")
      .select("id, leave_type, from_date, to_date, all_day, start_time, end_time, status, note, manager_note")
      .eq("staff_id", member.id)
      .order("from_date", { ascending: false })
      .then(({ data }) => setLeaveHistory(data || []));
    loadDocuments();
    supabase.from("training_records")
      .select("*")
      .eq("staff_id", member.id)
      .order("training_date", { ascending: false })
      .then(({ data }) => setTraining(data || []));
    loadContracts();
    loadServiceConfig(supabase, PHARMACY_ID, [member.id]).then(setServiceConfig).catch((err) => console.error("[services]", err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member?.id]);

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));


  // For staff who gave their payroll details another way (e.g. before the onboarding form existed)
  const handleMarkOnboarded = async () => {
    if (!window.confirm(`Mark ${member.name}'s onboarding as complete?\n\nUse this when they've already given you their payroll details another way.`)) return;
    const { data, error: err } = await supabase.from("staff")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("id", member.id).select().single();
    if (err) { setError("Couldn't mark onboarding complete: " + err.message); return; }
    setOnboardingDoneAt(data.onboarding_completed_at);
    onRefresh?.(data);
  };

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
      const { data: inserted, error: insErr } = await supabase.from("training_records").insert([{
        pharmacy_id: PHARMACY_ID,
        staff_id: member.id,
        topic: trTopic.trim(),
        training_date: trDate,
        hours: Number(trHours),
        provider: trProvider.trim() || null,
      }]).select().single();
      if (insErr) throw insErr;
      let rec = inserted;
      // Certificate goes to private storage after the record exists (the record is kept even if this fails)
      let certErr = null;
      if (trFile) {
        try { rec = await attachTrainingCert(inserted, trFile); } catch (e) { certErr = e; }
      }
      setTraining((prev) => [rec, ...prev].sort((a, b) => b.training_date.localeCompare(a.training_date)));
      setTrTopic(""); setTrDate(""); setTrHours(""); setTrProvider(""); setTrFile(null);
      if (certErr) setTrainingError("Record saved, but the certificate didn't upload: " + (certErr?.message || String(certErr)));
    } catch (err) {
      setTrainingError("Couldn't save: " + (err?.message || String(err)));
    } finally {
      setSavingTraining(false);
    }
  };

  const handleDeleteTraining = async (rec) => {
    if (!window.confirm("Delete this training record?")) return;
    try {
      await deleteTrainingRecord(rec);
      setTraining((prev) => prev.filter((r) => r.id !== rec.id));
    } catch (err) {
      setTrainingError("Couldn't delete: " + (err?.message || String(err)));
    }
  };

  // Staff Documents (shared sections — components/DocumentSections.js)
  const docActions = {
    upload: async (file, fields) => {
      const doc = await uploadStaffDoc({ staffId: member.id, file, fields });
      setDocuments((prev) => [doc, ...prev]);
    },
    remove: async (doc) => {
      await removeStaffDoc(doc);
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    },
    open: (doc) => openStaffDoc(doc),
    update: async (doc, patch) => {
      const row = await updateStaffDocument(supabase, doc, patch);
      setDocuments((prev) => prev.map((d) => (d.id === doc.id ? row : d)));
    },
  };

  // Pharmacist services ticks (saved straight away; untick keeps the row with active = false)
  const handleServiceTick = async (svc, on) => {
    const { error: err } = await supabase.from("staff_services").upsert(
      { pharmacy_id: member.pharmacy_id || PHARMACY_ID, staff_id: member.id, service_id: svc.id, active: on },
      { onConflict: "staff_id,service_id" });
    if (err) { setError("Couldn't save the service: " + err.message); return; }
    setServiceConfig((c) => ({
      ...c,
      staffServices: [
        ...c.staffServices.filter((x) => !(Number(x.staff_id) === Number(member.id) && String(x.service_id) === String(svc.id))),
        { staff_id: member.id, service_id: svc.id, active: on },
      ],
    }));
  };

  const showHours = form.employment_type === "Salary";
  const showSchedule = ["Permanent", "Salary", "Casual"].includes(form.employment_type);
  const isPharmacist = form.role === "Pharmacist" || form.role === "Intern Pharmacist";

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again
    if (!file) return;
    setUploading(true);
    setError("");
    const ext = file.name.split(".").pop().toLowerCase();
    const filename = `staff_${form.name.toLowerCase().replace(/[^a-z0-9]+/g, "_") || "new"}_${Date.now()}.${ext}`;
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
      can_conduct_reviews: form.can_conduct_reviews,
      exclude_from_reviews: form.exclude_from_reviews,
      can_sign_inductions: form.can_sign_inductions,
      paper_induction_on_file: form.paper_induction_on_file,
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
          ...(form.role !== "Locum" ? [{ key: "newstarter", label: "New starter" }] : []),
          ...(form.role !== "Locum" ? [{ key: "reviews", label: "Reviews" }] : []),
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

        {/* Pharmacist services — each ticked service adds its certificates to Documents + Training */}
        {isPharmacist && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Services they provide</label>
            {isNew ? (
              <p className="text-xs text-gray-400">Save the staff member first, then tick their services.</p>
            ) : serviceConfig.services.filter((sv) => sv.active !== false).length === 0 ? (
              <p className="text-xs text-gray-400">No services set up (QSPP → Training → Pharmacist services).</p>
            ) : (
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {serviceConfig.services.filter((sv) => sv.active !== false).map((sv) => {
                  const on = serviceConfig.staffServices.some((x) => Number(x.staff_id) === Number(member.id) && String(x.service_id) === String(sv.id) && x.active !== false);
                  return (
                    <label key={sv.id} className="flex items-center gap-1.5 text-sm text-gray-700">
                      <input type="checkbox" checked={on} onChange={(e) => handleServiceTick(sv, e.target.checked)} />
                      {sv.name}
                    </label>
                  );
                })}
              </div>
            )}
            <p className="text-[11px] text-gray-400 mt-1">Saved straight away. Their certificates appear on the Documents and Training tabs; unticking hides them (files are kept).</p>
          </div>
        )}

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
            { field: "can_conduct_reviews", label: "Can conduct performance reviews", desc: "Appears in the reviewer list when starting a review" },
            ...(form.role !== "Locum" ? [{ field: "can_sign_inductions", label: "Can sign off inductions", desc: "Can tick induction items for new starters in their staff app" }] : []),
            { field: "exclude_from_reviews", label: "Exclude from performance reviews", desc: "Never shown as due for a review" },
            ...(form.role !== "Locum" ? [{ field: "paper_induction_on_file", label: "Paper induction on file", desc: "Inducted on the paper checklist — no induction in the New starter tab" }] : []),
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

        {/* Permanent, Salary + Casual — regular schedule (optional for casuals) */}
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
            {(() => {
              const latest = contracts.find((c) => c.status === "issued" || c.status === "accepted");
              if (!latest) return null;
              return latest.status === "accepted" ? (
                <div className="text-[11px] font-medium text-green-700 mb-2">✓ Contract accepted {new Date(latest.accepted_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Perth" })}</div>
              ) : (
                <div className="text-[11px] font-medium text-amber-700 mb-2">Contract issued — awaiting acceptance</div>
              );
            })()}
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

        {/* Leave history — existing staff only, read-only (locums don't request leave) */}
        {!isNew && form.role !== "Locum" && (() => {
          // Yearly totals of APPROVED leave by type: all-day = inclusive calendar days
          // (split across years), partial-day = hours (kept separate, not converted to days)
          const totals = {}; // year -> type -> { days, hours }
          const bump = (year, type) => ((totals[year] ||= {})[type] ||= { days: 0, hours: 0 });
          leaveHistory.filter((lr) => lr.status === "approved").forEach((lr) => {
            const type = lr.leave_type || "Leave";
            const partial = lr.all_day === false && lr.start_time && lr.end_time && lr.from_date === lr.to_date;
            if (partial) {
              const [sh, sm] = String(lr.start_time).split(":").map(Number);
              const [eh, em] = String(lr.end_time).split(":").map(Number);
              bump(lr.from_date.slice(0, 4), type).hours += Math.max(0, (eh * 60 + em - (sh * 60 + sm)) / 60);
              return;
            }
            for (let d = lr.from_date; d <= lr.to_date; d = nextDayStr(d)) bump(d.slice(0, 4), type).days += 1;
          });
          const years = Object.keys(totals).sort().reverse();
          const fmtHrs = (h) => `${Math.round(h * 100) / 100} hr${h === 1 ? "" : "s"}`;
          const fmtD = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
          const badge = {
            approved: "bg-green-50 text-green-700 border-green-200",
            declined: "bg-red-50 text-red-600 border-red-200",
            pending: "bg-amber-50 text-amber-700 border-amber-200",
          };
          return (
            <div className="border-t pt-4">
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                Leave history {leaveHistory.length > 0 && <span className="text-gray-400 font-normal">({leaveHistory.length})</span>}
              </div>
              {leaveHistory.length === 0 ? (
                <p className="text-xs text-gray-400">No leave requests.</p>
              ) : (
                <>
                  {years.length > 0 && (
                    <div className="mb-2 rounded-lg border border-gray-100 bg-white px-3 py-2 space-y-1">
                      <div className="text-[11px] text-gray-400">Approved leave by year</div>
                      {years.map((y) => (
                        <div key={y} className="text-xs text-gray-700">
                          <span className="font-semibold">{y}:</span>{" "}
                          {Object.keys(totals[y]).sort().map((type) => {
                            const t = totals[y][type];
                            const parts = [];
                            if (t.days) parts.push(`${t.days} day${t.days === 1 ? "" : "s"}`);
                            if (t.hours) parts.push(fmtHrs(t.hours));
                            return `${type} ${parts.join(" + ")}`;
                          }).join(" · ")}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="space-y-1.5">
                    {leaveHistory.map((lr) => (
                      <div key={lr.id} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-gray-700">{lr.leave_type}</span>
                          <span className={`text-[11px] px-2 py-0.5 rounded-full border ${badge[lr.status] || "bg-gray-50 text-gray-600 border-gray-200"}`}>
                            {lr.status ? lr.status.charAt(0).toUpperCase() + lr.status.slice(1) : "?"}
                          </span>
                        </div>
                        <div className="text-xs text-gray-600 mt-0.5">
                          {lr.from_date === lr.to_date ? fmtD(lr.from_date) : `${fmtD(lr.from_date)} → ${fmtD(lr.to_date)}`}
                          {lr.all_day === false && lr.start_time && ` · ${String(lr.start_time).slice(0, 5)}–${String(lr.end_time || "").slice(0, 5)}`}
                        </div>
                        {lr.note && <div className="text-xs text-gray-500 mt-0.5 italic">"{lr.note}"</div>}
                        {lr.manager_note && <div className="text-[11px] text-blue-600 mt-0.5">Manager: {lr.manager_note}</div>}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })()}

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

              <InductionPdfEntry member={member} />

              <DocumentSections
                sections={docSections({ id: member.id, role: form.role, active: form.active }, serviceConfig)}
                docs={documents}
                actions={docActions}
                staffName={member.name}
                contractNode={
                  /* Paper + electronic contracts, newest first */
                  <EmploymentContractsList
                    staffId={member.id}
                    paperDocs={documents.filter((d) => d.type === "signed_contract")}
                    contracts={contracts}
                    onChanged={async () => { await loadDocuments(); await loadContracts(); }}
                  />
                }
              />
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
              {/* Training & development plan + goals + training record PDF (QSPP 2.4.1.5) */}
              {form.role !== "Locum" && (
                <StaffTrainingPlan
                  member={member}
                  records={training}
                  documents={documents}
                  adminUser={adminUser}
                  onOpenReview={(id) => { setReviewToOpen(id); setActiveTab("reviews"); }}
                />
              )}

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
                        {recordHasCert(r) && (
                          <button type="button" onClick={() => openTrainingCert(r)} className="text-xs text-blue-600 hover:underline shrink-0">Certificate</button>
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

        {/* ── NEW STARTER TAB ── (basics → contract + history → onboarding link → induction) */}
        {activeTab === "newstarter" && (
        <div className="space-y-5">

          {/* a) Basics — same form state + handleSave as the Profile/Payroll tabs */}
          <div className="space-y-3">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">1. Basics</div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input value={form.name} onChange={(e) => set("name", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="Full name" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="email@example.com" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                <select value={form.role} onChange={(e) => set("role", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400">
                  <option value="">— Select role —</option>
                  {ROLES.filter((r) => r !== "Locum").map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Employment Type</label>
                <select value={form.employment_type} onChange={(e) => set("employment_type", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400">
                  <option value="">— Select type —</option>
                  {EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
              <input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} className="w-48 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
            </div>
            <button type="button" onClick={handleSave} disabled={saving} className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-40">
              {saving ? "Saving…" : isNew ? "Save new starter" : "Save basics"}
            </button>
            {isNew && <p className="text-[11px] text-gray-400">Save first — the contract and onboarding link appear once they're saved.</p>}
          </div>

          {!isNew && (
            <>
              {/* b) Contract */}
              <div id="ns-contract" className="border-t pt-4 space-y-3 scroll-mt-4">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">2. Contract</div>
                <ContractForm
                  member={member}
                  contracts={contracts}
                  onContractsChanged={loadContracts}
                  onStaffUpdated={(row) => {
                    setForm((f) => (f.start_date ? f : { ...f, start_date: row.start_date || "" }));
                    onRefresh?.(row);
                  }}
                />
                <ContractHistory contracts={contracts} />
              </div>

              {/* c) Onboarding link + status */}
              <div className="border-t pt-4 space-y-2">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">3. Onboarding link</div>
                {(() => {
                  const latest = contracts.find((c) => c.status === "issued" || c.status === "accepted");
                  const fmt = (iso) => new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Perth" });
                  const lines = [];
                  if (latest?.status === "accepted") lines.push(<div key="a" className="text-xs font-medium text-green-700">✓ Contract accepted {fmt(latest.accepted_at)}</div>);
                  else if (latest?.status === "issued") lines.push(<div key="i" className="text-xs font-medium text-amber-700">Contract issued — awaiting acceptance</div>);
                  if (onboardingDoneAt) lines.push(<div key="o" className="text-xs font-medium text-green-700">✓ Onboarding complete {fmt(onboardingDoneAt)}</div>);
                  return lines.length ? <div className="space-y-0.5">{lines}</div> : <div className="text-xs text-gray-400">No contract issued yet.</div>;
                })()}
                {!onboardingDoneAt && (
                  <button type="button" onClick={handleMarkOnboarded} className="text-[11px] px-3 py-1.5 border border-green-300 text-green-700 rounded-lg hover:bg-green-50">
                    Mark onboarding complete
                  </button>
                )}
                {member?.onboarding_token ? (
                  <div className="border rounded-lg p-3 bg-amber-50 border-amber-100">
                    <div className="text-[11px] text-amber-600 break-all mb-2">
                      {typeof window !== "undefined" ? `${window.location.origin}/staff-onboard?token=${member.onboarding_token}` : ""}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/staff-onboard?token=${member.onboarding_token}`);
                        alert("Onboarding link copied to clipboard!");
                      }}
                      className="text-[11px] px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
                    >
                      Copy link
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">This staff member has no onboarding link.</p>
                )}
              </div>

              {/* d) Induction (QSPP-4.9-induction-checklist) */}
              <div className="border-t pt-4 space-y-2">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">4. Induction</div>
                {member?.paper_induction_on_file ? (
                  <p className="text-xs text-gray-500">Paper induction on file.</p>
                ) : (
                  <InductionStep
                    member={member}
                    contracts={contracts}
                    adminUser={adminUser}
                    onOpenTab={(tab, reviewId) => {
                      if (tab === "newstarter") document.getElementById("ns-contract")?.scrollIntoView({ behavior: "smooth" });
                      else { if (tab === "reviews") setReviewToOpen(reviewId || null); setActiveTab(tab); }
                    }}
                    onStaffUpdated={(row) => {
                      setForm((f) => (f.start_date ? f : { ...f, start_date: row.start_date || "" }));
                      onRefresh?.(row);
                    }}
                  />
                )}
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

        {/* ── REVIEWS TAB ── (performance reviews; has its own save, so the staff footer is hidden) */}
        {activeTab === "reviews" && form.role !== "Locum" && (
          isNew
            ? <p className="text-xs text-gray-400">Save the staff member first, then you can start a review.</p>
            : <ReviewsTab member={member} adminUser={adminUser} initialReviewId={reviewToOpen || initialReviewId} />
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>

      {activeTab !== "reviews" && <div className="px-5 py-4 border-t shrink-0 space-y-2">
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
      </div>}
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
      const doc = await uploadStaffDoc({ staffId: member.id, file, fields: { type } });
      setDocuments((prev) => [doc, ...prev]);
    } catch (err) {
      setError("Upload failed: " + (err?.message || String(err)));
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleDocDelete = async (doc) => {
    if (!window.confirm("Delete this document?")) return;
    try {
      await removeStaffDoc(doc); // removes the file too
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (err) {
      setError("Couldn't delete: " + (err?.message || String(err)));
    }
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
                    <button type="button" onClick={() => openStaffDoc(doc)} className="text-xs text-blue-600 hover:underline shrink-0">View</button>
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
    const rawWindow = String(form.review_comment_window_days ?? "").trim();
    const commentWindowDays = rawWindow === "" ? 14 : Number(rawWindow);
    if (!Number.isInteger(commentWindowDays) || commentWindowDays < 0 || commentWindowDays > 365) {
      setError("Performance review comment window must be a whole number of days (0–365).");
      return;
    }
    setSaving(true);
    setError("");
    const { error: err } = await supabase
      .from("pharmacy_settings")
      .update({
        name: form.name,
        phone: form.phone,
        address: form.address,
        payroll_start_date: form.payroll_start_date || null,
        review_comment_window_days: commentWindowDays,
        contract_signatory_name: (form.contract_signatory_name || "").trim() || null,
        contract_signatory_title: (form.contract_signatory_title || "").trim() || null,
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

        {/* Performance reviews */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Performance Reviews</h3>
          <label className="block text-xs font-medium text-gray-600 mb-1">Performance review comment window (days)</label>
          <p className="text-xs text-gray-400 mb-2">How long staff can add their own comments after a review is signed. Only affects reviews signed after you change it.</p>
          <input
            type="text"
            inputMode="numeric"
            value={form.review_comment_window_days ?? 14}
            onChange={(e) => set("review_comment_window_days", e.target.value.replace(/\D/g, ""))}
            className="w-24 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
        {success && <p className="text-sm text-green-600 font-medium">✓ Settings saved.</p>}

        {/* Contract sign-off: name/title save with Save Settings; the signature image saves on its own */}
        <div className="border-t pt-5 space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Contract Signatory</h3>
            <p className="text-xs text-gray-400 mb-3">Printed under the signature on the offer letter, and as the employer name in the contract signature boxes. Click Save Settings after changing.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Signatory name</label>
                <input
                  value={form.contract_signatory_name || ""}
                  onChange={(e) => set("contract_signatory_name", e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                  placeholder="e.g. Blair Chapman"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Signatory title</label>
                <input
                  value={form.contract_signatory_title || ""}
                  onChange={(e) => set("contract_signatory_title", e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                  placeholder="e.g. Director"
                />
              </div>
            </div>
          </div>
          <ContractSignatureSettings pharmacyId={PHARMACY_ID} />
        </div>
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
  const [manualGaps, setManualGaps] = useState([]);
  const [loadingCover, setLoadingCover] = useState(true);
  const [coverMonths, setCoverMonths] = useState(3);
  const [copiedCover, setCopiedCover] = useState(false);
  const [assigningKey, setAssigningKey] = useState(null);
  const [newGapDate, setNewGapDate] = useState("");
  const [newGapStart, setNewGapStart] = useState("09:00");
  const [newGapEnd, setNewGapEnd] = useState("17:00");
  const [addingGap, setAddingGap] = useState(false);
  const [editingBookingId, setEditingBookingId] = useState(null);
  const [editBookingStart, setEditBookingStart] = useState("");
  const [editBookingEnd, setEditBookingEnd] = useState("");
  const [editBookingLocumId, setEditBookingLocumId] = useState(""); // "l:<id>" locum | "p:<id>" pharmacist
  const [savingBookingEdit, setSavingBookingEdit] = useState(false);
  const [pharmacists, setPharmacists] = useState([]); // active Pharmacist / Intern Pharmacist — can be assigned as cover
  const [editingSlotKey, setEditingSlotKey] = useState(null); // red (unfilled) row whose times are being edited
  const [editSlotStart, setEditSlotStart] = useState("");
  const [editSlotEnd, setEditSlotEnd] = useState("");
  const [savingSlot, setSavingSlot] = useState(false);

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
    // Local (Perth) date strings — toISOString is UTC and is a day behind before 8am
    const from = todayPerth();
    const to = addMonthsStr(from, months);
    const entries = await getLeaveCover({ fromDate: from, toDate: to });
    setCoverEntries(entries);

    // Manual "we could use a locum" slots — live in locum_gaps, off the roster until assigned
    const { data: gaps } = await supabase
      .from("locum_gaps")
      .select("id, gap_date, start_time, end_time")
      .eq("pharmacy_id", PHARMACY_ID)
      .gte("gap_date", from)
      .lte("gap_date", to)
      .order("gap_date");
    setManualGaps((gaps || []).map((g) => ({
      gapId: g.id,
      date: g.gap_date,
      start: String(g.start_time).slice(0, 5),
      end: String(g.end_time).slice(0, 5),
      staffName: null,
      status: null,
      filled: false,
      locumName: null,
      manual: true,
    })));
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
      const { data: ph } = await supabase.from("staff").select("id, name, role, active")
        .eq("pharmacy_id", PHARMACY_ID).in("role", ["Pharmacist", "Intern Pharmacist"]).eq("active", true).order("name");
      setPharmacists(ph || []);
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

  // Merge leave-derived gaps + manual slots, sorted by date/time
  const allCover = [...coverEntries, ...manualGaps].sort(
    (a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start)
  );
  // Only the unfilled (needs-locum) dates go into the copyable list — dates + times only
  const coverGaps = allCover.filter((e) => !e.filled);

  const handleAddGap = async () => {
    if (!newGapDate) return;
    setAddingGap(true);
    try {
      const { error } = await supabase.from("locum_gaps").insert([{
        pharmacy_id: PHARMACY_ID,
        gap_date: newGapDate,
        start_time: newGapStart,
        end_time: newGapEnd,
      }]);
      if (error) throw error;
      setNewGapDate("");
      setNewGapStart("09:00");
      setNewGapEnd("17:00");
      await loadCover();
    } catch (err) {
      alert("Couldn't add slot: " + (err?.message || String(err)));
    } finally {
      setAddingGap(false);
    }
  };

  const handleDeleteGap = async (gapId) => {
    if (!window.confirm("Remove this slot from the list?")) return;
    await supabase.from("locum_gaps").delete().eq("id", gapId);
    await loadCover();
  };

  const startEditBooking = async (entry) => {
    setEditingBookingId(entry.bookingId);
    setEditBookingStart(entry.bookingStart || entry.start);
    setEditBookingEnd(entry.bookingEnd || entry.end);
    // Look up who's on this booking so the dropdown pre-selects them (locum or pharmacist cover)
    const { data } = await supabase.from("roster_shifts").select("staff_id, role").eq("id", entry.bookingId).maybeSingle();
    setEditBookingLocumId(data?.staff_id ? `${data.role === "Locum" ? "l" : "p"}:${data.staff_id}` : "");
  };

  // "l:<id>" / "p:<id>" -> what the shift row needs: a locum booking, or a pharmacist rostered as cover
  const coverPatchFor = (value) => {
    const [kind, id] = String(value).split(":");
    if (kind === "p") {
      const ph = pharmacists.find((p) => String(p.id) === id);
      return ph ? { staff_id: Number(id), role: ph.role, covers_leave: true } : null; // their real role
    }
    return id ? { staff_id: Number(id), role: "Locum", covers_leave: false } : null;
  };

  const handleSaveBookingEdit = async () => {
    if (!editingBookingId) return;
    if (editBookingStart && editBookingEnd && editBookingEnd <= editBookingStart) { alert("End time must be after the start time."); return; }
    setSavingBookingEdit(true);
    try {
      const patch = { start_time: editBookingStart, end_time: editBookingEnd };
      if (editBookingLocumId) Object.assign(patch, coverPatchFor(editBookingLocumId) || {});
      const { error } = await supabase.from("roster_shifts").update(patch).eq("id", editingBookingId);
      if (error) throw error;
      setEditingBookingId(null);
      await loadCover();
      await loadAllBookings();
    } catch (err) {
      alert("Couldn't update booking: " + (err?.message || String(err)));
    } finally {
      setSavingBookingEdit(false);
    }
  };

  const handleUnassignBooking = async () => {
    if (!editingBookingId) return;
    if (!window.confirm("Unassign this cover? The shift is removed and goes back to needing cover.")) return;
    setSavingBookingEdit(true);
    try {
      const { error } = await supabase.from("roster_shifts").delete().eq("id", editingBookingId);
      if (error) throw error;
      setEditingBookingId(null);
      await loadCover();
      await loadAllBookings();
    } catch (err) {
      alert("Couldn't unassign: " + (err?.message || String(err)));
    } finally {
      setSavingBookingEdit(false);
    }
  };

  // Assign cover: a locum (role Locum) or a pharmacist (their real role + covers_leave). Uses the slot's (edited) times.
  const handleAssignLocum = async (entry, value, rowKey) => {
    if (!value) return;
    const cover = coverPatchFor(value);
    if (!cover) return;
    setAssigningKey(rowKey);
    try {
      if (cover.covers_leave) {
        const { data: already } = await supabase.from("roster_shifts").select("id")
          .eq("staff_id", cover.staff_id).eq("shift_date", entry.date).limit(1);
        const name = pharmacists.find((p) => Number(p.id) === cover.staff_id)?.name || "This pharmacist";
        if (already?.length && !window.confirm(`${name} is already rostered that day — add cover shift anyway?`)) return;
      }
      // Both create a real roster shift (this is what puts it on the roster)
      const monthDate = entry.date.slice(0, 7) + "-01";
      const { data: monthData } = await supabase.from("roster_months").select("id").eq("month", monthDate).maybeSingle();
      let rosterMonthId = monthData?.id;
      if (!rosterMonthId) {
        const { data: created } = await supabase.from("roster_months").insert([{ month: monthDate, status: "draft", pharmacy_id: PHARMACY_ID }]).select("id").single();
        rosterMonthId = created?.id;
      }
      const { error } = await supabase.from("roster_shifts").insert([{
        ...cover,
        shift_date: entry.date,
        start_time: entry.start,
        end_time: entry.end,
        roster_month_id: rosterMonthId,
        pharmacy_id: PHARMACY_ID,
      }]);
      if (error) throw error;

      // Manual slot is consumed once assigned — remove the gap row
      if (entry.manual && entry.gapId) {
        await supabase.from("locum_gaps").delete().eq("id", entry.gapId);
      }

      await loadCover();
      await loadAllBookings();
    } catch (err) {
      alert("Couldn't assign cover: " + (err?.message || String(err)));
    } finally {
      setAssigningKey(null);
    }
  };

  // ── Edit times on a red (unfilled) row ──
  // Leave-based slot -> locum_slot_overrides (one per staff member + date); manual slot -> its locum_gaps row
  const startEditSlot = (entry, rowKey) => {
    setEditingSlotKey(rowKey);
    setEditSlotStart(entry.start);
    setEditSlotEnd(entry.end);
  };
  const handleSaveSlot = async (entry) => {
    if (!editSlotStart || !editSlotEnd || editSlotEnd <= editSlotStart) { alert("End time must be after the start time."); return; }
    setSavingSlot(true);
    try {
      const { error } = entry.manual
        ? await supabase.from("locum_gaps").update({ start_time: editSlotStart, end_time: editSlotEnd }).eq("id", entry.gapId)
        : await supabase.from("locum_slot_overrides").upsert({
          pharmacy_id: PHARMACY_ID, staff_id: Number(entry.staffId), slot_date: entry.date,
          start_time: editSlotStart, end_time: editSlotEnd,
        }, { onConflict: "staff_id,slot_date" });
      if (error) throw error;
      setEditingSlotKey(null);
      await loadCover();
    } catch (err) {
      alert("Couldn't save times: " + (err?.message || String(err)));
    } finally {
      setSavingSlot(false);
    }
  };
  // Back to their normal shift times (leave-based slots only)
  const handleResetSlot = async (entry) => {
    setSavingSlot(true);
    try {
      const { error } = await supabase.from("locum_slot_overrides").delete()
        .eq("staff_id", Number(entry.staffId)).eq("slot_date", entry.date);
      if (error) throw error;
      setEditingSlotKey(null);
      await loadCover();
    } catch (err) {
      alert("Couldn't reset: " + (err?.message || String(err)));
    } finally {
      setSavingSlot(false);
    }
  };
  // "Assign cover…" options: active locums, then active pharmacists / interns (not the person on leave for that row)
  const coverOptions = (entry) => (
    <>
      <optgroup label="Locums">
        {locums.filter((l) => l.active !== false).map((l) => <option key={`l${l.id}`} value={`l:${l.id}`}>{l.name}</option>)}
      </optgroup>
      <optgroup label="Pharmacists">
        {pharmacists.filter((p) => Number(p.id) !== Number(entry.staffId)).map((p) => (
          <option key={`p${p.id}`} value={`p:${p.id}`}>{p.name}{p.role === "Intern Pharmacist" ? " (intern)" : ""}</option>
        ))}
      </optgroup>
    </>
  );

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
                      <option value={12}>Next 12 months</option>
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
                  Pharmacist leave (pending or approved) that falls on a day they'd normally work, plus any slots you add manually. Dates with a locum already booked are marked filled.
                </p>

                {/* Add a manual slot */}
                <div className="flex flex-wrap items-end gap-2 mb-4 p-3 rounded-lg border border-gray-100 bg-gray-50">
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 mb-1">Date</label>
                    <input type="date" value={newGapDate} onChange={(e) => setNewGapDate(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 mb-1">Start</label>
                    <input type="time" value={newGapStart} onChange={(e) => setNewGapStart(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 mb-1">End</label>
                    <input type="time" value={newGapEnd} onChange={(e) => setNewGapEnd(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm" />
                  </div>
                  <button onClick={handleAddGap} disabled={addingGap || !newGapDate} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
                    {addingGap ? "Adding…" : "+ Add slot"}
                  </button>
                </div>
                {loadingCover ? (
                  <div className="text-sm text-gray-400">Loading…</div>
                ) : allCover.length === 0 ? (
                  <div className="text-sm text-gray-400">No shifts needing a locum in this window. Add one above.</div>
                ) : (
                  <div className="space-y-1.5">
                    {allCover.map((e, i) => {
                      const rowKey = e.gapId ? `m${e.gapId}` : `${e.date}-${e.staffName}-${i}`;
                      return (
                      <div
                        key={rowKey}
                        className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${e.filled ? "border-green-100 bg-green-50" : "border-red-100 bg-red-50"}`}
                      >
                        <span className="text-sm">{e.filled ? "✅" : "🔴"}</span>
                        <div className="text-sm text-gray-700 w-48 shrink-0">{fmtAllDate(e.date)}</div>
                        {e.filled && editingBookingId === e.bookingId ? (
                          <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                            <input type="time" value={editBookingStart} onChange={(ev) => setEditBookingStart(ev.target.value)} className="border rounded px-2 py-1 text-xs shrink-0" />
                            <span className="text-gray-400 text-xs">–</span>
                            <input type="time" value={editBookingEnd} onChange={(ev) => setEditBookingEnd(ev.target.value)} className="border rounded px-2 py-1 text-xs shrink-0" />
                            <select value={editBookingLocumId} onChange={(ev) => setEditBookingLocumId(ev.target.value)} className="border rounded px-2 py-1 text-xs shrink-0">
                              <option value="">— cover —</option>
                              {coverOptions(e)}
                            </select>
                            <div className="flex items-center gap-1 shrink-0 ml-auto">
                              <button onClick={handleSaveBookingEdit} disabled={savingBookingEdit} className="text-xs px-2 py-1 bg-blue-600 text-white rounded disabled:opacity-40">{savingBookingEdit ? "…" : "Save"}</button>
                              <button onClick={() => setEditingBookingId(null)} className="text-xs px-2 py-1 border rounded">Cancel</button>
                              <button onClick={handleUnassignBooking} disabled={savingBookingEdit} className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50 disabled:opacity-40">Unassign</button>
                            </div>
                          </div>
                        ) : !e.filled && editingSlotKey === rowKey ? (
                          <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                            <input type="time" value={editSlotStart} onChange={(ev) => setEditSlotStart(ev.target.value)} className="border rounded px-2 py-1 text-xs shrink-0" />
                            <span className="text-gray-400 text-xs">–</span>
                            <input type="time" value={editSlotEnd} onChange={(ev) => setEditSlotEnd(ev.target.value)} className="border rounded px-2 py-1 text-xs shrink-0" />
                            <div className="flex items-center gap-1 shrink-0 ml-auto">
                              <button onClick={() => handleSaveSlot(e)} disabled={savingSlot} className="text-xs px-2 py-1 bg-blue-600 text-white rounded disabled:opacity-40">{savingSlot ? "…" : "Save"}</button>
                              <button onClick={() => setEditingSlotKey(null)} className="text-xs px-2 py-1 border rounded">Cancel</button>
                              {!e.manual && e.edited && (
                                <button onClick={() => handleResetSlot(e)} disabled={savingSlot} className="text-xs px-2 py-1 border rounded text-gray-600 disabled:opacity-40" title="Back to their normal shift times">Reset</button>
                              )}
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="text-sm text-gray-600 w-32 shrink-0">
                              {e.filled
                                ? `${formatTime(e.bookingStart || e.start)} – ${formatTime(e.bookingEnd || e.end)}`
                                : `${formatTime(e.start)} – ${formatTime(e.end)}`}
                              {!e.filled && e.edited && <span className="block text-[10px] text-amber-700">edited</span>}
                            </div>
                            <div className="text-xs text-gray-500 flex-1 min-w-0 truncate">
                              {e.manual ? "Manual slot" : `${e.staffName} off${e.status === "pending" ? " (pending)" : ""}`}
                            </div>
                          </>
                        )}
                        {e.filled ? (
                          editingBookingId === e.bookingId ? null : (
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs text-green-700 font-medium">{e.locumName}</span>
                              {e.fillerType === "pharmacist" && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">pharmacist</span>
                              )}
                              {e.bookingId && (
                                <button onClick={() => startEditBooking(e)} className="text-xs text-blue-600 hover:underline">Edit</button>
                              )}
                            </div>
                          )
                        ) : editingSlotKey === rowKey ? null : (
                          <div className="flex items-center gap-2 shrink-0">
                            <button onClick={() => startEditSlot(e, rowKey)} className="text-xs text-blue-600 hover:underline">Edit</button>
                            <select
                              value=""
                              disabled={assigningKey === rowKey}
                              onChange={(ev) => handleAssignLocum(e, ev.target.value, rowKey)}
                              className="text-xs border rounded-lg px-2 py-1 disabled:opacity-40"
                            >
                              <option value="">{assigningKey === rowKey ? "Assigning…" : "Assign cover…"}</option>
                              {coverOptions(e)}
                            </select>
                          </div>
                        )}
                        {e.manual && e.gapId && (
                          <button
                            onClick={() => handleDeleteGap(e.gapId)}
                            className="text-xs text-red-500 hover:text-red-700 shrink-0"
                            title="Remove this slot"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      );
                    })}
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
  const router = useRouter();
  const [unlocked, setUnlocked] = useState(false);
  const [adminUser, setAdminUser] = useState(null);
  const [tab, setTab] = useState("staff");
  const [locumFormKey, setLocumFormKey] = useState(0);
  const [staffList, setStaffList] = useState([]);
  const [showInactive, setShowInactive] = useState(false);
  const [selected, setSelected] = useState(null); // null = none, "new" = add form, or staff object
  const [formKey, setFormKey] = useState(0);
  const [initialStaffTab, setInitialStaffTab] = useState(null); // tab to open the staff form on (e.g. "reviews")
  const [initialReviewId, setInitialReviewId] = useState(null); // review to open on that tab
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

  // Needs attention "N still to read" -> that policy's side panel in /qspp (asks for the manager PIN there)
  const openPolicy = (docId) => { router.push(`/qspp?doc=${encodeURIComponent(docId)}`); };

  // /admin?staff=<id>&staffTab=reviews&review=<id> (e.g. from /qspp → Reviews): open that person once unlocked
  useEffect(() => {
    if (!unlocked || !router.isReady || !router.query.staff || !staffList.length) return;
    const st = staffList.find((x) => String(x.id) === String(router.query.staff));
    if (st) openStaff(st, router.query.staffTab || null, router.query.review || null);
    router.replace("/admin", undefined, { shallow: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, router.isReady, router.query.staff, staffList]);

  const openStaff = (s, staffTab, reviewId) => {
    setTab("staff");
    setSelected(s);
    setInitialStaffTab(staffTab || null);
    setInitialReviewId(reviewId || null);
    setFormKey((k) => k + 1);
  };

  const handleUnlock = (user) => {
    setAdminUser(user);
    setUnlocked(true);
  };

  // Update one staff row in the list + selection (no "Changes saved" banner)
  const handleRefresh = (row) => {
    setStaffList((prev) => prev.map((s) => (s.id === row.id ? row : s)));
    setSelected((sel) => (sel && sel !== "new" && sel.id === row.id ? row : sel));
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
      <Sidebar active="admin" />

      <div className="flex flex-1 overflow-hidden">

        {/* Left — staff list */}
        {tab === "staff" && <div className="w-[260px] min-w-[260px] bg-white border-r flex flex-col overflow-hidden">

          

          {tab === "staff" && (
            <>
              {/* Add + toggle */}
              <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
                <button
                  onClick={() => { setSelected("new"); setInitialStaffTab(null); }}
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
                        onClick={() => { setSelected(s); setInitialStaffTab(null); setFormKey((k) => k + 1); }}
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
              <StaffNeedsAttention staffList={staffList} onOpen={openStaff} onOpenPolicy={openPolicy} />
            ) : (
              <StaffForm
                key={formKey}
                member={selected === "new" ? null : selected}
                initialTab={initialStaffTab}
                initialReviewId={initialStaffTab === "reviews" ? initialReviewId : null}
                adminUser={adminUser}
                onSave={handleSave}
                onRefresh={handleRefresh}
                onCancel={() => setSelected(null)}
              />
            )}
          </div>
        </div>

      </div>
    </div>
  );
}