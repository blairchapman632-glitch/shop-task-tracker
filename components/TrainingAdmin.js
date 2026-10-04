// Admin → QSPP → 🎓 Training: QSPP anniversary/cycle date, needs attention, training hours table, plan settings.
// Rules live in lib/trainingPlan.js.
import { useEffect, useState } from "react";
import supabase from "../lib/supabaseClient";
import {
  SETTINGS_COLUMNS, DOC_TYPE_LABELS, PLAN_ROLES, WARN_DAYS, configFrom, hasPlan, hoursStatus, s2s3Status,
  latestDocsByType, certExpiry, docTypeLabel, trainingYear, qsppCycle, fetchAllRows, STATE_STYLE,
} from "../lib/trainingPlan";
import { addDaysStr, todayPerth, fmtDateShort } from "../lib/performanceReview";

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";
const h3Cls = "text-sm font-semibold text-gray-700";

export default function TrainingAdminTab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const { data: settings, error: sErr } = await supabase.from("pharmacy_settings")
        .select(SETTINGS_COLUMNS).eq("pharmacy_id", PHARMACY_ID).maybeSingle();
      if (sErr) throw sErr;
      const cfg = configFrom(settings);
      const anchor = settings?.qspp_cycle_start_date || null;
      const cycle = qsppCycle(anchor);

      const { data: staffRows, error: stErr } = await supabase.from("staff")
        .select("id, name, role, active, start_date").eq("pharmacy_id", PHARMACY_ID)
        .or("role.is.null,role.neq.Locum").order("name");
      if (stErr) throw stErr;
      const staff = (staffRows || []).filter((s) => s.active !== false);
      const ids = staff.map((s) => s.id);
      const planIds = staff.filter((s) => hasPlan(s, cfg)).map((s) => s.id);

      const [docs, records, exemptions] = ids.length ? await Promise.all([
        fetchAllRows(() => supabase.from("locum_documents").select("id, staff_id, type, filename, url, uploaded_at, expiry_date").in("staff_id", ids)),
        cycle && planIds.length
          ? fetchAllRows(() => supabase.from("training_records").select("id, staff_id, training_date, hours").in("staff_id", planIds).gte("training_date", cycle.start).lte("training_date", cycle.end))
          : Promise.resolve([]),
        planIds.length
          ? fetchAllRows(() => supabase.from("staff_training_exemptions").select("staff_id, training_year_start, reason").in("staff_id", planIds))
          : Promise.resolve([]),
      ]) : [[], [], []];

      setData({ settings: settings || {}, cfg, anchor, staff, docs, records, exemptions });
      setError("");
    } catch (err) {
      setError(err?.message || String(err));
    }
  };

  useEffect(() => { load(); }, []);

  if (error) return <div className="flex-1 overflow-y-auto p-6 text-sm text-red-500">Couldn't load training: {error}</div>;
  if (!data) return <div className="flex-1 overflow-y-auto p-6 text-sm text-gray-400">Loading…</div>;

  const today = todayPerth();
  const soon = addDaysStr(today, WARN_DAYS);
  const { cfg, anchor, staff, docs, records, exemptions } = data;

  // Plan people: S2/S3 + hours
  const planRows = staff.filter((s) => hasPlan(s, cfg)).map((s) => ({
    staff: s,
    s2: s2s3Status(s, docs, cfg, today),
    hours: hoursStatus(
      s,
      records.filter((r) => Number(r.staff_id) === Number(s.id)),
      exemptions.filter((e) => Number(e.staff_id) === Number(s.id)),
      anchor, cfg, today,
    ),
  }));

  // Needs attention
  const attention = [];
  for (const { staff: s, s2, hours } of planRows) {
    if (s2.state === "not_done") attention.push({ key: `s2-${s.id}`, staff: s, item: "S2/S3", state: "not_done", label: "Not done", sort: "0" });
    if (hours?.yearShort && hours.year.end <= soon) {
      attention.push({ key: `yr-${s.id}`, staff: s, item: "Training hours (this year)", state: "short", label: `${hours.yearDone} of ${hours.yearReq} hrs · year ends ${fmtDateShort(hours.year.end)}`, sort: hours.year.end });
    }
    if (hours?.cycleShort && hours.cycle.end <= soon) {
      attention.push({ key: `cy-${s.id}`, staff: s, item: "Training hours (QSPP cycle)", state: "short", label: `${hours.cycleDone} of ${hours.cycleReq} hrs · cycle ends ${fmtDateShort(hours.cycle.end)}`, sort: hours.cycle.end });
    }
  }
  const nameOf = (id) => staff.find((s) => Number(s.id) === Number(id));
  for (const d of latestDocsByType(docs)) {
    const exp = certExpiry(d, today);
    const s = nameOf(d.staff_id);
    if (exp && s) attention.push({ key: `doc-${d.id}`, staff: s, item: docTypeLabel(d.type), state: exp.state, label: exp.label, sort: exp.date, url: d.url });
  }
  attention.sort((a, b) => a.sort.localeCompare(b.sort) || a.staff.name.localeCompare(b.staff.name));

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <div className="max-w-3xl space-y-8">
        <AnniversarySection anchor={anchor} onSaved={load} />

        <section className="space-y-2">
          <h3 className={h3Cls}>Needs attention</h3>
          <p className="text-xs text-gray-400">
            S2/S3 not done (after the 3-month grace period), training hours short when the training year or QSPP cycle ends within {WARN_DAYS} days,
            and Documents certificates expired or expiring within {WARN_DAYS} days (newest file of each type only).
          </p>
          {attention.length === 0 ? (
            <p className="text-xs text-gray-400">Nothing needs attention.</p>
          ) : (
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              {attention.map((a) => (
                <div key={a.key} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 px-3 py-2 border-b last:border-b-0">
                  <span className="text-sm font-medium text-gray-800 truncate">{a.staff.name}</span>
                  <span className="text-xs text-gray-600 truncate">
                    {a.url ? <a href={a.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{a.item}</a> : a.item}
                  </span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full border justify-self-end ${STATE_STYLE[a.state]}`}>{a.label}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h3 className={h3Cls}>Training hours</h3>
          {!anchor ? (
            <p className="text-xs text-amber-700">Set the QSPP anniversary date above to count training hours.</p>
          ) : planRows.length === 0 ? (
            <p className="text-xs text-gray-400">No active staff in the plan roles ({cfg.planRoles.join(", ") || "none set"}).</p>
          ) : (
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              <div className="grid grid-cols-[1fr_120px_110px_110px] gap-2 px-3 py-1.5 bg-gray-50 text-[11px] font-semibold text-gray-500 uppercase">
                <span>Name</span><span>S2/S3</span><span>This year</span><span>This cycle</span>
              </div>
              {planRows.map(({ staff: s, s2, hours }) => (
                <div key={s.id} className="grid grid-cols-[1fr_120px_110px_110px] items-center gap-2 px-3 py-2 border-t">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{s.name}</div>
                    {hours?.exemption && (
                      <div className="text-[11px] text-gray-400 truncate">Not required this year{hours.exemption.reason ? ` — ${hours.exemption.reason}` : ""}</div>
                    )}
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full border justify-self-start ${STATE_STYLE[s2.state]}`}>{s2.label}</span>
                  <span className={`text-xs ${hours?.yearShort ? "text-amber-700" : "text-green-700"}`}>{hours ? `${hours.yearDone} / ${hours.yearReq}` : "—"}</span>
                  <span className={`text-xs ${hours?.cycleShort ? "text-amber-700" : "text-green-700"}`}>{hours ? `${hours.cycleDone} / ${hours.cycleReq}` : "—"}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <PlanSettings settings={data.settings} onSaved={load} />
      </div>
    </div>
  );
}

// ─── QSPP anniversary / cycle date (moved here from Settings — same column) ──

function AnniversarySection({ anchor, onSaved }) {
  const [value, setValue] = useState(anchor || "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const year = trainingYear(anchor);
  const cycle = qsppCycle(anchor);

  const handleSave = async () => {
    setSaving(true);
    setMsg("");
    const { error } = await supabase.from("pharmacy_settings")
      .update({ qspp_cycle_start_date: value || null, updated_at: new Date().toISOString() })
      .eq("pharmacy_id", PHARMACY_ID);
    setSaving(false);
    if (error) { setMsg("Couldn't save: " + error.message); return; }
    setMsg("✓ Saved");
    onSaved();
  };

  return (
    <section className="space-y-2">
      <h3 className={h3Cls}>QSPP anniversary date</h3>
      <p className="text-xs text-gray-400">
        The date your 3-year QSPP cycle starts. Training years run yearly from this date; a cycle is 3 training years.
      </p>
      <div className="flex items-center gap-2">
        <input type="date" value={value} onChange={(e) => setValue(e.target.value)} className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
        <button type="button" onClick={handleSave} disabled={saving || value === (anchor || "")} className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-40">
          {saving ? "Saving…" : "Save"}
        </button>
        {msg && <span className={`text-xs ${msg.startsWith("✓") ? "text-green-600" : "text-red-500"}`}>{msg}</span>}
      </div>
      {year && cycle && (
        <p className="text-xs text-gray-600">
          Current training year: {fmtDateShort(year.start)} – {fmtDateShort(year.end)} · Current QSPP cycle: {fmtDateShort(cycle.start)} – {fmtDateShort(cycle.end)}
        </p>
      )}
    </section>
  );
}

// ─── Plan settings (pharmacy_settings) ──────────────────────────────────────

function PlanSettings({ settings, onSaved }) {
  const cfg = configFrom(settings);
  const [hours, setHours] = useState(String(cfg.hoursPerYear));
  const [docType, setDocType] = useState(cfg.s2s3Type);
  const [roles, setRoles] = useState(cfg.planRoles);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const dirty = hours !== String(cfg.hoursPerYear) || docType !== cfg.s2s3Type
    || roles.slice().sort().join("|") !== cfg.planRoles.slice().sort().join("|");

  const handleSave = async () => {
    const n = Number(hours);
    if (hours.trim() === "" || !(n >= 0) || n > 100) { setMsg("Hours per training year must be a number from 0 to 100."); return; }
    setSaving(true);
    setMsg("");
    const { error } = await supabase.from("pharmacy_settings")
      .update({ training_hours_per_year: n, training_s2s3_doc_type: docType, training_plan_roles: roles, updated_at: new Date().toISOString() })
      .eq("pharmacy_id", PHARMACY_ID);
    setSaving(false);
    if (error) { setMsg("Couldn't save: " + error.message); return; }
    setMsg("✓ Saved");
    onSaved();
  };

  return (
    <section className="space-y-3">
      <h3 className={h3Cls}>Plan settings</h3>
      <div className="flex flex-wrap gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Training hours per training year</label>
          <input inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value.replace(/[^\d.]/g, ""))} className="w-28 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">S2/S3 certificate (Documents type)</label>
          <select value={docType} onChange={(e) => setDocType(e.target.value)} className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400">
            {Object.entries(DOC_TYPE_LABELS).filter(([k]) => k !== "signed_contract").map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            {!DOC_TYPE_LABELS[docType] && <option value={docType}>{docType}</option>}
          </select>
        </div>
      </div>
      <div>
        <div className="text-xs font-medium text-gray-600 mb-1">Roles that have a plan</div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {PLAN_ROLES.map((role) => (
            <label key={role} className="flex items-center gap-1.5 text-sm text-gray-700">
              <input type="checkbox" checked={roles.includes(role)} onChange={(e) => setRoles(e.target.checked ? [...roles, role] : roles.filter((r) => r !== role))} />
              {role}
            </label>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 mt-1">Everyone else (except locums) still gets Goals and training records on their Training tab.</p>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={handleSave} disabled={saving || !dirty} className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-40">
          {saving ? "Saving…" : "Save plan settings"}
        </button>
        {msg && <span className={`text-xs ${msg.startsWith("✓") ? "text-green-600" : "text-red-500"}`}>{msg}</span>}
      </div>
    </section>
  );
}
