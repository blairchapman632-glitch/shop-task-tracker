// Admin → QSPP → 🎓 Training: QSPP anniversary/cycle date, needs attention, training hours table, pharmacist services.
// Rules live in lib/trainingPlan.js.
import { useEffect, useState } from "react";
import supabase from "../lib/supabaseClient";
import { PLAN_ROLES, WARN_DAYS, loadTrainingData, trainingAttention, trainingYear, qsppCycle, STATE_STYLE } from "../lib/trainingPlan";
import { todayPerth, fmtDateShort } from "../lib/performanceReview";
import { loadServiceConfig } from "../lib/staffDocuments";

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";
const h3Cls = "text-sm font-semibold text-gray-700";

export default function TrainingAdminTab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setData(await loadTrainingData(supabase, PHARMACY_ID));
      setError("");
    } catch (err) {
      setError(err?.message || String(err));
    }
  };

  useEffect(() => { load(); }, []);

  if (error) return <div className="flex-1 overflow-y-auto p-6 text-sm text-red-500">Couldn't load training: {error}</div>;
  if (!data) return <div className="flex-1 overflow-y-auto p-6 text-sm text-gray-400">Loading…</div>;

  const { anchor } = data;
  const { planRows, items: attention } = trainingAttention(data, todayPerth());

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
            <p className="text-xs text-gray-400">No active staff in the plan roles ({PLAN_ROLES.join(", ")}).</p>
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

        <ServicesSection onChanged={load} />
      </div>
    </div>
  );
}

// ─── Pharmacist services (each with its certificates). Hide = active false, never delete. ──

const smallInput = "border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400";

function ServicesSection({ onChanged }) {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // "svc:<id>" | "svc:new" | "cert:<id>" | "cert:new:<serviceId>"
  const [showHidden, setShowHidden] = useState(false);

  const load = async () => {
    try { setConfig(await loadServiceConfig(supabase, PHARMACY_ID, [])); setError(""); } catch (err) { setError(err?.message || String(err)); }
  };
  useEffect(() => { load(); }, []);

  const saved = async () => { setEditing(null); await load(); onChanged?.(); };

  const toggle = async (table, row) => {
    const hide = row.active !== false;
    if (hide && !window.confirm(`Hide "${row.name}"? ${table === "pharmacist_services" ? "It disappears from Profile ticks, Documents and Training." : "It disappears from Documents and Training."} Uploaded files are kept.`)) return;
    const { error: err } = await supabase.from(table).update({ active: !hide }).eq("id", row.id);
    if (err) { alert("Couldn't update: " + err.message); return; }
    await load();
    onChanged?.();
  };

  if (error) return <p className="text-xs text-red-500">Couldn't load services: {error}</p>;
  if (!config) return null;
  const visible = (rows) => rows.filter((r) => showHidden || r.active !== false);
  const services = visible(config.services);

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className={h3Cls}>Pharmacist services</h3>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setShowHidden((v) => !v)} className="text-xs text-gray-400 hover:text-gray-600">{showHidden ? "Hide hidden" : "Show hidden"}</button>
          {editing !== "svc:new" && <button type="button" onClick={() => setEditing("svc:new")} className="text-xs text-blue-600 hover:text-blue-700">+ Add service</button>}
        </div>
      </div>
      <p className="text-xs text-gray-400">Tick services on a pharmacist's Profile; each service's certificates then appear on their Documents and Training tabs.</p>
      {editing === "svc:new" && <ServiceForm onCancel={() => setEditing(null)} onSaved={saved} />}
      {services.length === 0 && <p className="text-xs text-gray-400">No services yet.</p>}
      {services.map((svc) => {
        const certs = visible(config.certificates.filter((c) => String(c.service_id) === String(svc.id)));
        return (
          <div key={svc.id} className={`rounded-lg border border-gray-200 ${svc.active === false ? "opacity-50" : ""}`}>
            {editing === `svc:${svc.id}` ? (
              <div className="p-2"><ServiceForm service={svc} onCancel={() => setEditing(null)} onSaved={saved} /></div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-t-lg">
                <span className="text-sm font-semibold text-gray-800 flex-1">{svc.name}{svc.active === false && <span className="ml-2 text-[11px] font-normal text-gray-500">(hidden)</span>}</span>
                <button type="button" onClick={() => setEditing(`svc:${svc.id}`)} className="text-xs text-blue-600 hover:text-blue-700">Edit</button>
                <button type="button" onClick={() => toggle("pharmacist_services", svc)} className={`text-xs ${svc.active === false ? "text-green-600" : "text-red-500"}`}>{svc.active === false ? "Show" : "Hide"}</button>
              </div>
            )}
            <div className="divide-y">
              {certs.map((c) => editing === `cert:${c.id}` ? (
                <div key={c.id} className="p-2"><CertForm cert={c} serviceId={svc.id} onCancel={() => setEditing(null)} onSaved={saved} /></div>
              ) : (
                <div key={c.id} className={`flex items-center gap-2 px-3 py-1.5 ${c.active === false ? "opacity-50" : ""}`}>
                  <span className="text-sm text-gray-700 flex-1">{c.name}{c.active === false && <span className="ml-2 text-[11px] text-gray-500">(hidden)</span>}</span>
                  <span className="text-[11px] text-gray-400">{c.renew_months ? `renews every ${c.renew_months} months` : "one-off"}</span>
                  <button type="button" onClick={() => setEditing(`cert:${c.id}`)} className="text-xs text-blue-600 hover:text-blue-700">Edit</button>
                  <button type="button" onClick={() => toggle("service_certificates", c)} className={`text-xs ${c.active === false ? "text-green-600" : "text-red-500"}`}>{c.active === false ? "Show" : "Hide"}</button>
                </div>
              ))}
              {editing === `cert:new:${svc.id}` ? (
                <div className="p-2"><CertForm serviceId={svc.id} onCancel={() => setEditing(null)} onSaved={saved} /></div>
              ) : (
                <div className="px-3 py-1.5">
                  <button type="button" onClick={() => setEditing(`cert:new:${svc.id}`)} className="text-xs text-blue-600 hover:text-blue-700">+ Add certificate</button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function ServiceForm({ service, onCancel, onSaved }) {
  const [name, setName] = useState(service?.name || "");
  const [order, setOrder] = useState(String(service?.sort_order ?? ""));
  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    if (!name.trim()) { alert("Enter a name."); return; }
    setSaving(true);
    const row = { name: name.trim(), sort_order: order === "" ? 0 : Number(order) };
    const { error } = service
      ? await supabase.from("pharmacist_services").update(row).eq("id", service.id)
      : await supabase.from("pharmacist_services").insert([{ ...row, pharmacy_id: PHARMACY_ID }]);
    setSaving(false);
    if (error) { alert("Couldn't save: " + error.message); return; }
    onSaved();
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Service name, e.g. Vaccinating" className={`${smallInput} flex-1 min-w-[180px]`} autoFocus />
      <input value={order} onChange={(e) => setOrder(e.target.value.replace(/[^\d-]/g, ""))} placeholder="Order" className={`${smallInput} w-20`} />
      <button type="button" onClick={onCancel} className="text-xs px-3 py-1.5 border rounded-lg text-gray-600">Cancel</button>
      <button type="button" onClick={handleSave} disabled={saving} className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white disabled:opacity-40">{saving ? "Saving…" : "Save"}</button>
    </div>
  );
}

function CertForm({ cert, serviceId, onCancel, onSaved }) {
  const [name, setName] = useState(cert?.name || "");
  const [renews, setRenews] = useState(cert ? cert.renew_months != null : false);
  const [months, setMonths] = useState(cert?.renew_months != null ? String(cert.renew_months) : "12");
  const [order, setOrder] = useState(String(cert?.sort_order ?? ""));
  const [saving, setSaving] = useState(false);
  const handleSave = async () => {
    if (!name.trim()) { alert("Enter a name."); return; }
    if (renews && !(Number(months) > 0)) { alert("Enter how many months until it renews."); return; }
    setSaving(true);
    const row = { name: name.trim(), renew_months: renews ? Number(months) : null, sort_order: order === "" ? 0 : Number(order) };
    const { error } = cert
      ? await supabase.from("service_certificates").update(row).eq("id", cert.id)
      : await supabase.from("service_certificates").insert([{ ...row, service_id: serviceId, pharmacy_id: PHARMACY_ID }]);
    setSaving(false);
    if (error) { alert("Couldn't save: " + error.message); return; }
    onSaved();
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Certificate name" className={`${smallInput} flex-1 min-w-[160px]`} autoFocus />
      <select value={renews ? "renews" : "one_off"} onChange={(e) => setRenews(e.target.value === "renews")} className={smallInput}>
        <option value="one_off">One-off</option>
        <option value="renews">Renews every…</option>
      </select>
      {renews && (
        <span className="flex items-center gap-1 text-xs text-gray-600">
          <input value={months} onChange={(e) => setMonths(e.target.value.replace(/\D/g, ""))} className={`${smallInput} w-16`} /> months
        </span>
      )}
      <input value={order} onChange={(e) => setOrder(e.target.value.replace(/[^\d-]/g, ""))} placeholder="Order" className={`${smallInput} w-20`} />
      <button type="button" onClick={onCancel} className="text-xs px-3 py-1.5 border rounded-lg text-gray-600">Cancel</button>
      <button type="button" onClick={handleSave} disabled={saving} className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white disabled:opacity-40">{saving ? "Saving…" : "Save"}</button>
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
