import { useEffect, useState } from "react";
import Link from "next/link";
import supabase from "../lib/supabaseClient";

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";

const ROLES = [
  "Pharmacist",
  "Locum",
  "Pharmacy Assistant",
  "DAA Coordinator",
  "Intern Pharmacist",
  "Manager",
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
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
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
      <Link href="/" className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-gray-700 hover:bg-gray-100">
        <span>🏠</span> Home
      </Link>
      <Link href="/roster" className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-gray-700 hover:bg-gray-100">
        <span>📅</span> Roster
      </Link>
      <Link href="/insights" className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-gray-700 hover:bg-gray-100">
        <span>📊</span> Insights
      </Link>
      <Link href="/tasks" className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-gray-700 hover:bg-gray-100">
        <span>✅</span> Tasks
      </Link>
      <Link href="/admin" className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm bg-gray-100 font-semibold text-gray-900">
        <span>⚙️</span> Admin
      </Link>
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
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="••••"
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
  const [form, setForm] = useState({
    name: member?.name || "",
    role: member?.role || "",
    employment_type: member?.employment_type || "",
    contracted_hours: member?.contracted_hours || "",
    active: member?.active ?? true,
    can_access_roster: member?.can_access_roster ?? false,
    can_access_tasks: member?.can_access_tasks ?? false,
    can_access_admin: member?.can_access_admin ?? false,
    pin: member?.pin || "",
    photo_url: member?.photo_url || "",
    weekly_schedule: member?.weekly_schedule || defaultSchedule(),
    schedule_type: member?.schedule_type || "weekly",
    week_ab_schedule: member?.week_ab_schedule || defaultWeekSchedule(),
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const showHours = form.employment_type === "Salary";
  const showSchedule = form.employment_type === "Permanent";

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
    setSaving(true);
    setError("");
    const payload = {
      name: form.name.trim(),
      role: form.role || null,
      employment_type: form.employment_type || null,
      contracted_hours: showHours && form.contracted_hours ? Number(form.contracted_hours) : null,
      contracted_hours_period: null,
      weekly_schedule: showSchedule && form.schedule_type === "weekly" ? form.weekly_schedule : null,
      schedule_type: showSchedule ? form.schedule_type : null,
      week_ab_schedule: showSchedule && form.schedule_type === "alternating" ? form.week_ab_schedule : null,
      active: form.active,
      can_access_roster: form.can_access_roster,
      can_access_tasks: form.can_access_tasks,
      can_access_admin: form.can_access_admin,
      pin: form.pin || null,
      photo_url: form.photo_url || null,
      pharmacy_id: PHARMACY_ID,
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

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

        {/* Photo */}
        <div className="flex items-center gap-4">
          <img
            src={form.photo_url || "/placeholder.png"}
            alt="Photo"
            className="w-16 h-16 rounded-full object-cover border"
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
                  <div className="text-xs font-semibold text-blue-700 mb-2 px-1">Week A</div>
                  <DayScheduleGrid
                    schedule={form.week_ab_schedule.a}
                    onChange={(s) => set("week_ab_schedule", { ...form.week_ab_schedule, a: s })}
                  />
                </div>
                <div>
                  <div className="text-xs font-semibold text-purple-700 mb-2 px-1">Week B</div>
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

        {/* PIN */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">PIN (4 digits)</label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={form.pin}
            onChange={(e) => set("pin", e.target.value.replace(/\D/g, ""))}
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

        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>

      <div className="px-5 py-4 border-t shrink-0 flex gap-2">
        <button onClick={onCancel} className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">
          Cancel
        </button>
        <button onClick={handleSave} disabled={saving} className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-40">
          {saving ? "Saving…" : isNew ? "Add Staff" : "Save Changes"}
        </button>
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

  useEffect(() => {
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
    setSaving(true);
    setError("");
    const { error: err } = await supabase
      .from("pharmacy_settings")
      .update({
        name: form.name,
        phone: form.phone,
        address: form.address,
        payroll_start_date: form.payroll_start_date || null,
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

// ─── Main ─────────────────────────────────────────────────────────────────────


export default function AdminPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [adminUser, setAdminUser] = useState(null);
  const [tab, setTab] = useState("staff");
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
                <button
                  onClick={() => setShowInactive((v) => !v)}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  {showInactive ? "Hide inactive" : "Show inactive"}
                </button>
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
                        <img
                          src={s.photo_url || "/placeholder.png"}
                          alt={s.name}
                          className="w-9 h-9 rounded-full object-cover shrink-0"
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
            {["staff", "settings"].map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setSelected(null); }}
                className={`mr-4 py-3 text-sm font-medium ${tab === t ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500 hover:text-gray-700"}`}
              >
                {t === "staff" ? "👥 Staff" : "⚙️ Settings"}
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