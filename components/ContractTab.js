// Employment contracts in Admin:
//   default export ContractForm      — New starter tab: build, preview and issue an offer of employment
//   ContractHistory                  — New starter tab: list of this staff member's contracts
//   ContractSignatureSettings        — Settings tab: the handwritten signature drawn in the employer boxes
// PDFs are generated server-side (pages/api/contracts/*); these components only edit values / call the routes.
import { useEffect, useMemo, useRef, useState } from "react";
import supabase from "../lib/supabaseClient";
import { adminFetch } from "../lib/adminFetch";
import { nextDayStr } from "../lib/leaveCalendar";

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";

const HOURS_DAYS = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

const FULL_TIME_HOURS = 38; // weekly hours at or above this suggest Full-time

// Today in Perth as "YYYY-MM-DD"
const todayPerth = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Perth" }).format(new Date());
const addDaysStr = (d, n) => { let s = d; for (let i = 0; i < n; i++) s = nextDayStr(s); return s; };

// Paid hours for a start/finish: span minus the same 30-min lunch the wages calc uses
// (shifts over 5 hrs, unless the staff member has no_lunch_deduction).
const paidHours = (start, finish, noLunch) => {
  if (!start || !finish) return "";
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = finish.split(":").map(Number);
  let hrs = (eh * 60 + em - (sh * 60 + sm)) / 60;
  if (!(hrs > 0)) return "";
  if (hrs > 5 && !noLunch) hrs -= 0.5;
  return String(Math.round(hrs * 100) / 100);
};

const hoursTotal = (table) =>
  Math.round(HOURS_DAYS.reduce((sum, { key }) => {
    const r = table?.[key];
    const n = Number(r?.hours);
    return r?.start && r?.finish && !isNaN(n) ? sum + n : sum;
  }, 0) * 100) / 100;

const suggestEmploymentType = (table) => (hoursTotal(table) >= FULL_TIME_HOURS ? "Full-time" : "Part-time");

// staff.address is one free-text field ("Street, Suburb, State, Postcode"): split at the first comma
const splitAddress = (address) => {
  const a = String(address || "").trim();
  const i = a.indexOf(",");
  if (i === -1) return { street: a, rest: "" };
  return {
    street: a.slice(0, i).trim(),
    rest: a.slice(i + 1).replace(/,/g, " ").replace(/\s+/g, " ").trim(),
  };
};

const scheduleHours = (member) => {
  const alternating = member?.schedule_type === "alternating" && member?.week_ab_schedule;
  const grid = alternating ? member.week_ab_schedule.a : member?.schedule_type === "weekly" ? member?.weekly_schedule : null;
  const table = {};
  HOURS_DAYS.forEach(({ key }) => {
    const d = grid?.[key];
    table[key] = d?.active && d.start && d.end
      ? { start: d.start, finish: d.end, hours: paidHours(d.start, d.end, member?.no_lunch_deduction === true) }
      : { start: "", finish: "", hours: "" };
  });
  return table;
};

// Values that come straight from the staff record (re-synced when Basics are saved)
const memberDerived = (member) => {
  const { street, rest } = splitAddress(member?.address);
  return {
    employee_full_name: member?.name || "",
    first_name: String(member?.name || "").trim().split(/\s+/)[0] || "",
    street_address: street,
    suburb_state_postcode: rest,
    start_date: member?.start_date || "",
  };
};

// employment_type_auto: true while employment type is our suggestion (not picked by Blair) — not a PDF field
const prefillValues = (template, member, signatory) => {
  const today = todayPerth();
  const auto = {
    ...memberDerived(member),
    letter_date: today,
    schedule_date: today,
    return_by_date: addDaysStr(today, 7),
    employer_signature: signatory || "",
    employer_sign_date: today,
  };
  const values = {};
  for (const f of template?.fields || []) {
    if (f.type === "hours_table") values[f.key] = scheduleHours(member);
    else if (f.key === "classification") values[f.key] = (f.options || []).includes(member?.classification) ? member.classification : "";
    else values[f.key] = auto[f.key] ?? f.default ?? "";
  }
  const hoursField = (template?.fields || []).find((f) => f.type === "hours_table");
  if ((template?.fields || []).some((f) => f.key === "employment_type")) {
    values.employment_type = suggestEmploymentType(hoursField ? values[hoursField.key] : null);
    values.employment_type_auto = true;
  }
  return values;
};

// Best template for a staff member: employment type (Permanent/Salary -> permanent, Casual -> casual) + role
const pickTemplate = (list, member) => {
  const cat = ["Permanent", "Salary"].includes(member?.employment_type) ? "permanent"
    : member?.employment_type === "Casual" ? "casual" : null;
  const inCat = cat ? list.filter((t) => t.employment_category === cat) : list;
  return inCat.find((t) => (t.default_roles || []).includes(member?.role))
    || list.find((t) => (t.default_roles || []).includes(member?.role))
    || inCat[0] || list[0] || null;
};

const STATUS_BADGE = {
  draft: "bg-gray-100 text-gray-600 border-gray-200",
  issued: "bg-amber-50 text-amber-700 border-amber-200",
  accepted: "bg-green-50 text-green-700 border-green-200",
  superseded: "bg-gray-50 text-gray-400 border-gray-200",
};

const fmtStamp = (iso) => iso
  ? new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Australia/Perth" })
  : "";
const fmtDateD = (d) => { const [y, m, dd] = String(d).slice(0, 10).split("-").map(Number); return y ? new Date(y, m - 1, dd).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : String(d); };
const fmtD = (iso) => iso ? new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Perth" }) : "";

// Open a signed URL in a new tab (window opened first, while we still have the click — popup blockers)
export const openContractFile = async (id, which) => {
  const win = window.open("", "_blank");
  try {
    const res = await adminFetch(`/api/contracts/admin-url?id=${encodeURIComponent(id)}&which=${which}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.url) throw new Error(body.error || "Couldn't open file");
    if (win) win.location.href = body.url; else window.open(body.url, "_blank");
  } catch (err) {
    if (win) win.close();
    alert(err?.message || String(err));
  }
};

// ─── Contract form ───────────────────────────────────────────────────────────

// onStaffUpdated(staffRow): called when issuing filled in an empty staff start date
export default function ContractForm({ member, contracts, onContractsChanged, onStaffUpdated }) {
  const [templates, setTemplates] = useState([]);
  const [signatory, setSignatory] = useState("");
  const [loading, setLoading] = useState(true);
  const [templateId, setTemplateId] = useState("");
  const [templateTouched, setTemplateTouched] = useState(false);
  const [values, setValues] = useState({});
  const [draftId, setDraftId] = useState(null);
  const [busy, setBusy] = useState(""); // "draft" | "preview" | "issue" | ""
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [warnings, setWarnings] = useState([]);
  const [mode, setMode] = useState("auto"); // auto = card if there is a current contract and no draft; or "editor" / "card"
  const prevMember = useRef(member);

  // The contract in force: newest issued or accepted one
  const current = useMemo(() => (contracts || [])
    .filter((c) => c.status === "issued" || c.status === "accepted")
    .sort((a, b) => String(b.issued_at || "").localeCompare(String(a.issued_at || "")))[0] || null, [contracts]);

  const template = useMemo(() => templates.find((t) => t.id === templateId) || null, [templates, templateId]);
  const alternating = member?.schedule_type === "alternating" && !!member?.week_ab_schedule;

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [{ data: tpls }, { data: settings }] = await Promise.all([
        supabase.from("contract_templates").select("*").eq("pharmacy_id", PHARMACY_ID).eq("active", true).order("label"),
        supabase.from("pharmacy_settings").select("contract_signatory_name").eq("pharmacy_id", PHARMACY_ID).maybeSingle(),
      ]);
      const list = tpls || [];
      const sig = settings?.contract_signatory_name || "";
      setTemplates(list);
      setSignatory(sig);

      // Resume the latest saved draft if there is one
      const draft = (contracts || []).find((c) => c.status === "draft");
      const draftTpl = draft && list.find((t) => t.id === draft.template_id);
      if (draftTpl) {
        setTemplateId(draftTpl.id);
        setTemplateTouched(true);
        setValues({ ...prefillValues(draftTpl, member, sig), ...(draft.field_values || {}) });
        setDraftId(draft.id);
      } else {
        const pick = pickTemplate(list, member);
        if (pick) {
          setTemplateId(pick.id);
          setValues(prefillValues(pick, member, sig));
        }
      }
      prevMember.current = member;
      setLoading(false);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member?.id]);

  // Basics saved on the New starter tab -> follow the staff record, without overwriting anything typed here
  useEffect(() => {
    if (loading) return;
    const prev = prevMember.current;
    prevMember.current = member;
    if (!prev || prev === member) return;

    if (!templateTouched && !draftId) {
      const pick = pickTemplate(templates, member);
      if (pick && pick.id !== templateId) { applyTemplate(pick, member); return; }
    }
    const before = memberDerived(prev);
    const after = memberDerived(member);
    setValues((v) => {
      const next = { ...v };
      for (const k of Object.keys(after)) {
        if (k in next && next[k] === before[k] && after[k] !== before[k]) next[k] = after[k];
      }
      const clsField = template?.fields?.find((f) => f.key === "classification");
      if (clsField && !next.classification && (clsField.options || []).includes(member?.classification)) next.classification = member.classification;
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member]);

  // Switch template: fresh prefill, but keep anything already typed into fields both templates share
  const applyTemplate = (tpl, m = member) => {
    setTemplateId(tpl.id);
    const fresh = prefillValues(tpl, m, signatory);
    const sharedKeys = new Set((tpl.fields || []).map((f) => f.key));
    const kept = Object.fromEntries(Object.entries(values).filter(([k, v]) => sharedKeys.has(k) && v !== "" && v != null));
    // Selects whose old value isn't a valid option for the new template are dropped
    for (const f of tpl.fields || []) {
      if (f.type === "select" && kept[f.key] !== undefined && !(f.options || []).includes(kept[f.key])) delete kept[f.key];
    }
    if (values.employment_type_auto && "employment_type" in kept) {
      delete kept.employment_type; // still a suggestion -> recalculated from this template's hours
    } else if ("employment_type" in kept) {
      kept.employment_type_auto = false;
    }
    setValues({ ...fresh, ...kept });
    setWarnings([]);
  };

  const startFromCurrent = () => {
    const tpl = current && templates.find((t) => t.id === current.template_id);
    if (tpl) {
      const fresh = prefillValues(tpl, member, signatory);
      const kept = { ...(current.field_values || {}) };
      for (const k of ["letter_date", "schedule_date", "return_by_date", "employer_signature", "employer_sign_date"]) delete kept[k];
      if ("employment_type" in kept) kept.employment_type_auto = false; // keep the type that was issued
      setTemplateId(tpl.id);
      setValues({ ...fresh, ...kept });
    }
    setTemplateTouched(true);
    setWarnings([]);
    setError("");
    setNotice("");
    setMode("editor");
  };

  const changeTemplate = (id) => {
    const tpl = templates.find((t) => t.id === id);
    setTemplateTouched(true);
    if (tpl) applyTemplate(tpl);
  };

  const setVal = (key, v) => setValues((prev) => ({
    ...prev,
    [key]: v,
    ...(key === "employment_type" ? { employment_type_auto: false } : {}), // Blair picked it — never overwrite
  }));

  const setHoursCell = (fieldKey, day, part, v) => {
    setValues((prev) => {
      const table = { ...(prev[fieldKey] || {}) };
      const row = { ...(table[day] || { start: "", finish: "", hours: "" }), [part]: v };
      if (part === "start" || part === "finish") row.hours = paidHours(row.start, row.finish, member?.no_lunch_deduction === true);
      table[day] = row;
      const next = { ...prev, [fieldKey]: table };
      if (prev.employment_type_auto && "employment_type" in prev) next.employment_type = suggestEmploymentType(table);
      return next;
    });
  };

  const missingRequired = () =>
    (template?.fields || []).filter((f) => f.required && f.type !== "hours_table" && !String(values[f.key] ?? "").trim()).map((f) => f.label);

  const handleSaveDraft = async () => {
    if (!template) return;
    setBusy("draft"); setError(""); setNotice("");
    try {
      const row = {
        pharmacy_id: PHARMACY_ID,
        staff_id: member.id,
        template_id: template.id,
        template_version: template.version,
        field_values: values,
        status: "draft",
        updated_at: new Date().toISOString(),
      };
      if (draftId) {
        const { error: err } = await supabase.from("employment_contracts").update(row).eq("id", draftId).eq("status", "draft");
        if (err) throw err;
      } else {
        const { data, error: err } = await supabase.from("employment_contracts").insert([row]).select("id").single();
        if (err) throw err;
        setDraftId(data.id);
      }
      setNotice("Draft saved.");
      await onContractsChanged?.();
    } catch (err) {
      setError("Couldn't save draft: " + (err?.message || String(err)));
    } finally {
      setBusy("");
    }
  };

  const handlePreview = async () => {
    if (!template) return;
    setBusy("preview"); setError(""); setNotice("");
    const win = window.open("", "_blank"); // open now, while we still have the click (popup blockers)
    try {
      const res = await adminFetch("/api/contracts/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staff_id: member.id, template_id: template.id, values }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Preview failed (${res.status})`);
      try { setWarnings(JSON.parse(decodeURIComponent(res.headers.get("X-Contract-Warnings") || "%5B%5D"))); } catch { setWarnings([]); }
      const url = URL.createObjectURL(await res.blob());
      if (win) win.location.href = url; else window.open(url, "_blank");
    } catch (err) {
      if (win) win.close();
      setError(err?.message || String(err));
    } finally {
      setBusy("");
    }
  };

  const handleIssue = async () => {
    if (!template) return;
    const missing = missingRequired();
    if (missing.length) { setError("Please fill in: " + missing.join(", ")); return; }
    const hasOpen = (contracts || []).some((c) => c.status === "issued");
    const noAddress = !String(values.street_address || "").trim();
    if (!window.confirm(
      `Issue the ${template.label} contract to ${member.name}?` +
      (noAddress ? "\n\nNo address entered — they'll be asked for it when they accept." : "") +
      (hasOpen ? "\n\nTheir earlier contract that hasn't been accepted yet will be marked Superseded." : "") +
      "\n\nThey'll see it when they open their onboarding link."
    )) return;
    setBusy("issue"); setError(""); setNotice("");
    try {
      const res = await adminFetch("/api/contracts/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staff_id: member.id, template_id: template.id, values, draft_id: draftId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Issue failed (${res.status})`);
      setWarnings(body.warnings || []);
      setDraftId(null);
      setNotice("Contract issued. Copy the onboarding link below and send it to them."
        + (body.start_date_set ? " Their start date has been added to their staff record." : ""));
      await onContractsChanged?.();
      setMode("card");
      if (body.start_date_set && onStaffUpdated) {
        const { data: row } = await supabase.from("staff").select("*").eq("id", member.id).maybeSingle();
        if (row) onStaffUpdated(row);
      }
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy("");
    }
  };

  if (loading) return <p className="text-xs text-gray-400">Loading…</p>;
  if (!templates.length) return <p className="text-xs text-gray-400">No contract templates set up yet.</p>;

  const inputCls = "w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400";

  const renderField = (f) => {
    const v = values[f.key] ?? "";
    if (f.type === "hours_table") {
      const table = values[f.key] || {};
      return (
        <div key={f.key}>
          <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
          {alternating && (
            <div className="mb-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-1.5 text-[11px] text-amber-700">
              Alternating roster — check hours. Prefilled from Week A.
            </div>
          )}
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-[80px_1fr_1fr_60px] gap-1 bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-500">
              <span>Day</span><span>Start</span><span>Finish</span><span>Hours</span>
            </div>
            {HOURS_DAYS.map(({ key, label }) => {
              const r = table[key] || {};
              const worked = r.start && r.finish;
              return (
                <div key={key} className="grid grid-cols-[80px_1fr_1fr_60px] gap-1 items-center px-2 py-1 border-t border-gray-100">
                  <span className={`text-xs ${worked ? "text-gray-700" : "text-gray-400"}`}>{label}</span>
                  <input type="time" value={r.start || ""} onChange={(e) => setHoursCell(f.key, key, "start", e.target.value)} className="border rounded px-1.5 py-1 text-xs" />
                  <input type="time" value={r.finish || ""} onChange={(e) => setHoursCell(f.key, key, "finish", e.target.value)} className="border rounded px-1.5 py-1 text-xs" />
                  {worked ? (
                    <input type="text" inputMode="decimal" value={r.hours ?? ""} onChange={(e) => setHoursCell(f.key, key, "hours", e.target.value.replace(/[^\d.]/g, ""))} className="border rounded px-1.5 py-1 text-xs w-full" />
                  ) : (
                    <span className="text-xs text-gray-400 text-center">—</span>
                  )}
                </div>
              );
            })}
            <div className="grid grid-cols-[80px_1fr_1fr_60px] gap-1 px-2 py-1.5 border-t border-gray-200 bg-gray-50">
              <span className="text-xs font-semibold text-gray-700">Total</span><span /><span />
              <span className="text-xs font-semibold text-gray-700">{hoursTotal(table)}</span>
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-1">Hours = start to finish minus a 30-min lunch on shifts over 5 hrs{member?.no_lunch_deduction ? " (not deducted for this staff member)" : ""}. Clear a day's times for "—".</p>
        </div>
      );
    }
    const label = <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}{f.required ? " *" : ""}</label>;
    if (f.key === "employer_sign_date") {
      return (
        <div key={f.key}>
          {label}
          <div className="text-xs text-gray-500 px-1">Set automatically to the date you issue the contract.</div>
        </div>
      );
    }
    if (f.type === "select") {
      const hoursField = template?.fields?.find((x) => x.type === "hours_table");
      return (
        <div key={f.key}>
          {label}
          <select value={v} onChange={(e) => setVal(f.key, e.target.value)} className={inputCls}>
            <option value="">— Select —</option>
            {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          {f.key === "employment_type" && values.employment_type_auto && v && (
            <p className="text-[11px] text-gray-400 mt-1">
              Suggested from {hoursField ? hoursTotal(values[hoursField.key]) : 0} hrs/week ({FULL_TIME_HOURS}+ = Full-time). Pick one to override.
            </p>
          )}
        </div>
      );
    }
    if (f.type === "multiline") {
      return (
        <div key={f.key}>
          {label}
          <textarea value={v} onChange={(e) => setVal(f.key, e.target.value)} rows={3} className={`${inputCls} resize-y`} />
        </div>
      );
    }
    if (f.type === "money") {
      return (
        <div key={f.key}>
          {label}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">$</span>
            <input type="text" inputMode="decimal" value={v} onChange={(e) => setVal(f.key, e.target.value.replace(/[^\d.]/g, ""))} className="w-28 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="e.g. 52.50" />
            <span className="text-sm text-gray-500">per hour</span>
          </div>
        </div>
      );
    }
    return (
      <div key={f.key}>
        {label}
        <input type={f.type === "date" ? "date" : "text"} value={v} onChange={(e) => setVal(f.key, e.target.value)} className={inputCls}
          placeholder={f.key === "course" ? "e.g. Master of Pharmacy, year 1 — Curtin University" : (f.key === "street_address" || f.key === "suburb_state_postcode") ? "Optional — they can enter it when accepting" : ""} />
      </div>
    );
  };

  const hasDraft = (contracts || []).some((c) => c.status === "draft");
  const cardMode = !!current && (mode === "card" || (mode === "auto" && !draftId && !hasDraft));
  if (cardMode) {
    return (
      <div className="space-y-3">
        <CurrentContractCard contract={current} template={templates.find((t) => t.id === current.template_id)} />
        {warnings.length > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-[11px] text-amber-700 space-y-0.5">
            {warnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}
          </div>
        )}
        {notice && <p className="text-sm text-green-600">{notice}</p>}
        <button type="button" onClick={startFromCurrent} className="w-full border border-blue-200 text-blue-700 rounded-lg py-2 text-sm hover:bg-blue-50">
          Issue a new contract
        </button>
        <p className="text-[11px] text-gray-400">Starts from this contract's details. The current contract stays on file.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {current && !draftId && (
        <button type="button" onClick={() => { setMode("card"); setError(""); setNotice(""); }} className="text-xs text-blue-600 hover:text-blue-700">
          ← Back to current contract
        </button>
      )}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Contract template</label>
        <select value={templateId} onChange={(e) => changeTemplate(e.target.value)} className={inputCls}>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        {draftId && <p className="text-[11px] text-gray-400 mt-1">Editing a saved draft.</p>}
      </div>

      {template && <div className="space-y-3">{(template.fields || []).map(renderField)}</div>}

      {warnings.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-[11px] text-amber-700 space-y-0.5">
          {warnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}
        </div>
      )}
      {error && <p className="text-sm text-red-500">{error}</p>}
      {notice && <p className="text-sm text-green-600">{notice}</p>}

      <div className="flex gap-2">
        <button type="button" onClick={handleSaveDraft} disabled={!!busy || !template} className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40">
          {busy === "draft" ? "Saving…" : "Save draft"}
        </button>
        <button type="button" onClick={handlePreview} disabled={!!busy || !template} className="flex-1 border border-blue-200 text-blue-700 rounded-lg py-2 text-sm hover:bg-blue-50 disabled:opacity-40">
          {busy === "preview" ? "Building…" : "Preview"}
        </button>
        <button type="button" onClick={handleIssue} disabled={!!busy || !template} className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-40">
          {busy === "issue" ? "Issuing…" : "Issue contract"}
        </button>
      </div>
    </div>
  );
}

// ─── Current contract card (read-only) ──────────────────────────────────────

const CARD_FIELDS = ["start_date", "employment_type", "classification", "reports_to", "course", "hourly_rate"];

function CurrentContractCard({ contract, template }) {
  const v = contract.field_values || {};
  const fields = (template?.fields || []).filter((f) => CARD_FIELDS.includes(f.key));
  const hoursField = (template?.fields || []).find((f) => f.type === "hours_table");
  const show = (f) => {
    const x = v[f.key];
    if (x === "" || x == null) return "—";
    if (f.type === "date") return fmtDateD(x);
    if (f.type === "money") return isNaN(Number(x)) ? String(x) : `$${Number(x).toFixed(2)} per hour`;
    return String(x);
  };
  return (
    <div className="rounded-lg border border-gray-200 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-gray-800">Current contract · {contract.contract_templates?.label || template?.label || "Contract"}</div>
        <span className={`text-[11px] px-2 py-0.5 rounded-full border ${STATUS_BADGE[contract.status] || STATUS_BADGE.draft}`}>
          {contract.status === "accepted" ? "Accepted" : "Issued — awaiting acceptance"}
        </span>
      </div>
      <div className="text-[11px] text-gray-500">
        Issued {fmtD(contract.issued_at)}
        {contract.accepted_at && ` · Accepted ${fmtStamp(contract.accepted_at)} by ${contract.accepted_name}`}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {fields.map((f) => (
          <div key={f.key}>
            <div className="text-[11px] text-gray-400">{f.label}</div>
            <div className="text-sm text-gray-800">{show(f)}</div>
          </div>
        ))}
        {hoursField && (
          <div>
            <div className="text-[11px] text-gray-400">{hoursField.label}</div>
            <div className="text-sm text-gray-800">{hoursTotal(v[hoursField.key])} hrs/week</div>
          </div>
        )}
      </div>
      <div className="flex gap-3 pt-1">
        {contract.accepted_file_path && <button type="button" onClick={() => openContractFile(contract.id, "accepted")} className="text-xs text-blue-600 hover:underline">View accepted PDF</button>}
        {contract.issued_file_path && <button type="button" onClick={() => openContractFile(contract.id, "issued")} className="text-xs text-blue-600 hover:underline">View issued PDF</button>}
      </div>
    </div>
  );
}

// ─── Contract history ────────────────────────────────────────────────────────

// contracts rows include contract_templates:template_id(label)
export function ContractHistory({ contracts }) {
  return (
    <div>
      <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
        Contract history {contracts?.length > 0 && <span className="text-gray-400 font-normal">({contracts.length})</span>}
      </div>
      {!contracts?.length ? (
        <p className="text-xs text-gray-400">No contracts yet.</p>
      ) : (
        <>
        <p className="text-[11px] text-gray-400 mb-2">Signed contracts are also listed in Documents.</p>
        <div className="space-y-1.5">
          {contracts.map((c) => (
            <div key={c.id} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-700">{c.contract_templates?.label || "Contract"}</span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full border ${STATUS_BADGE[c.status] || STATUS_BADGE.draft}`}>
                  {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                </span>
              </div>
              <div className="text-[11px] text-gray-500 mt-0.5">
                {c.issued_at ? `Issued ${fmtD(c.issued_at)}` : `Draft saved ${fmtD(c.updated_at || c.created_at)}`}
                {c.accepted_at && ` · Accepted ${fmtStamp(c.accepted_at)} by ${c.accepted_name}`}
              </div>
              {(c.issued_file_path || c.accepted_file_path) && (
                <div className="flex gap-3 mt-1">
                  {c.issued_file_path && <button type="button" onClick={() => openContractFile(c.id, "issued")} className="text-xs text-blue-600 hover:underline">View issued</button>}
                  {c.accepted_file_path && <button type="button" onClick={() => openContractFile(c.id, "accepted")} className="text-xs text-blue-600 hover:underline">View accepted</button>}
                </div>
              )}
            </div>
          ))}
        </div>
        </>
      )}
    </div>
  );
}

// ─── Contract signature (Settings) ───────────────────────────────────────────

export function ContractSignatureSettings({ pharmacyId }) {
  const [url, setUrl] = useState(null);
  const [hasSig, setHasSig] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    adminFetch(`/api/contracts/signature?pharmacy_id=${encodeURIComponent(pharmacyId)}`)
      .then((r) => r.json())
      .then((b) => { setUrl(b.url || null); setHasSig(!!b.path); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [pharmacyId]);

  const upload = async (file) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g)$/i.test(file.type)) { setError("Please choose a PNG or JPG image."); return; }
    if (file.size > 2 * 1024 * 1024) { setError("Image is over 2 MB — please use a smaller one."); return; }
    setBusy(true); setError("");
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(file);
      });
      const res = await adminFetch("/api/contracts/signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pharmacy_id: pharmacyId, data_url: dataUrl }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Upload failed");
      setUrl(body.url); setHasSig(true);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Remove the contract signature? The signature space on the offer letter will be left blank.")) return;
    setBusy(true); setError("");
    try {
      const res = await adminFetch(`/api/contracts/signature?pharmacy_id=${encodeURIComponent(pharmacyId)}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Remove failed");
      setUrl(null); setHasSig(false);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Contract Signature</h3>
      <p className="text-xs text-gray-400 mb-3">
        Your handwritten signature, drawn above the signatory name on the offer letter. A PNG with a transparent
        background looks best. Without one, that space is left blank. (The contract signature boxes always show
        the typed signatory name.)
      </p>
      {loading ? (
        <p className="text-xs text-gray-400">Loading…</p>
      ) : (
        <div className="space-y-2">
          {hasSig && url && (
            <div className="inline-block rounded-lg border border-gray-200 p-2"
              style={{ backgroundImage: "repeating-conic-gradient(#f3f4f6 0% 25%, #fff 0% 50%)", backgroundSize: "12px 12px" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="Contract signature" className="h-12 w-auto" />
            </div>
          )}
          <div className="flex items-center gap-3">
            <label className={`text-xs px-3 py-1.5 rounded-lg border cursor-pointer ${busy ? "opacity-40 pointer-events-none" : "border-gray-300 hover:bg-gray-50"}`}>
              {busy ? "Working…" : hasSig ? "Replace" : "Upload signature"}
              <input type="file" accept="image/png,image/jpeg" className="hidden" disabled={busy}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; upload(f); }} />
            </label>
            {hasSig && <button type="button" onClick={remove} disabled={busy} className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40">Remove</button>}
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
      )}
    </div>
  );
}
