// Admin → Settings → Daily Banking: the float and over/under limit (pharmacy_settings) and the payment types
// (banking_payment_types — Closing / Right till / Left till EFTPOS and Z "Other Payments"; name + help_text shown on the
// till count). Payment types are never deleted:
// switch one off so past days keep it. Admin is already behind the admin PIN. Helpers in lib/banking.js.
import { useEffect, useState } from "react";
import supabase from "../lib/supabaseClient";
import { bankingStartDate, MON } from "../lib/bankingData";

const inputCls = "border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400";
const KIND_LABEL = { eftpos: "EFTPOS", other: "Other payment" };

// "Square / Direct" -> "square_direct" (unique among the existing keys)
const keyFrom = (name, existing) => {
  const base = String(name).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "type";
  let key = base;
  for (let i = 2; existing.has(key); i++) key = `${base}_${i}`;
  return key;
};

export default function BankingSettingsAdmin({ pharmacyId }) {
  const [floatAmount, setFloatAmount] = useState("");
  const [limit, setLimit] = useState("");
  const [email, setEmail] = useState("");               // weekly summary email (pharmacy_settings.banking_summary_email)
  const [emailSupported, setEmailSupported] = useState(true); // false until docs/sql/daily_banking_stage5_7.sql is run
  const [startDate, setStartDate] = useState(null);     // pharmacy_settings.banking_start_date — read-only here
  const [types, setTypes] = useState(null);
  const [savingMoney, setSavingMoney] = useState(false);
  const [moneySaved, setMoneySaved] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [adding, setAdding] = useState({ name: "", kind: "other" });
  const [error, setError] = useState("");

  const loadTypes = () => supabase.from("banking_payment_types").select("*").eq("pharmacy_id", pharmacyId).order("sort_order")
    .then(({ data, error: err }) => { if (err) setError(err.message); setTypes(data || []); });

  useEffect(() => {
    if (!pharmacyId) return;
    supabase.from("pharmacy_settings").select("banking_float_amount, banking_variance_limit").eq("pharmacy_id", pharmacyId).maybeSingle()
      .then(({ data }) => {
        setFloatAmount(data?.banking_float_amount != null ? String(data.banking_float_amount) : "300");
        setLimit(data?.banking_variance_limit != null ? String(data.banking_variance_limit) : "5");
      });
    supabase.from("pharmacy_settings").select("banking_summary_email").eq("pharmacy_id", pharmacyId).maybeSingle()
      .then(({ data, error: e }) => { if (e) setEmailSupported(false); else setEmail(data?.banking_summary_email || ""); });
    bankingStartDate(supabase, pharmacyId).then(setStartDate);
    loadTypes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pharmacyId]);

  const saveMoney = async () => {
    const f = Number(floatAmount);
    const l = Number(limit);
    if (!(f >= 0) || !(l >= 0) || floatAmount === "" || limit === "") { setError("Enter the float and the over/under limit as dollar amounts."); return; }
    const mail = email.trim();
    if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) { setError("That email address doesn't look right."); return; }
    setSavingMoney(true);
    setError("");
    const { error: err } = await supabase.from("pharmacy_settings")
      .update({ banking_float_amount: f, banking_variance_limit: l, ...(emailSupported ? { banking_summary_email: mail || null } : {}), updated_at: new Date().toISOString() }).eq("pharmacy_id", pharmacyId);
    setSavingMoney(false);
    if (err) { setError("Couldn't save: " + err.message); return; }
    setMoneySaved(true);
    setTimeout(() => setMoneySaved(false), 2500);
  };

  const saveType = async (t, patch) => {
    setSavingId(t.id);
    setError("");
    const { error: err } = await supabase.from("banking_payment_types").update(patch).eq("id", t.id);
    setSavingId(null);
    if (err) { setError("Couldn't save: " + err.message); return; }
    setTypes((ts) => ts.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
  };
  const move = async (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= types.length) return;
    const order = [...types];
    [order[i], order[j]] = [order[j], order[i]];
    setTypes(order);
    await Promise.all(order.map((t, k) => supabase.from("banking_payment_types").update({ sort_order: k + 1 }).eq("id", t.id)));
    loadTypes();
  };
  const add = async () => {
    const name = adding.name.trim();
    if (!name) return;
    setError("");
    const key = keyFrom(name, new Set((types || []).map((t) => t.key)));
    const { error: err } = await supabase.from("banking_payment_types").insert([{
      pharmacy_id: pharmacyId, key, name, kind: adding.kind,
      counts_to_bendigo: adding.kind === "eftpos", active: true, sort_order: (types?.length || 0) + 1,
    }]);
    if (err) { setError("Couldn't add: " + err.message); return; }
    setAdding({ name: "", kind: "other" });
    loadTypes();
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-1">Daily Banking</h3>
      <p className="text-xs text-gray-400 mb-3">The float left in the drawer, how far over or under the till can be before a reason is needed, and the payment types on the till-close sheet.</p>
      {error && <p className="text-xs text-red-500 mb-2">{error}</p>}

      <div className="space-y-2 mb-4">
        {startDate && (() => { const [y, m, d] = startDate.split("-").map(Number); return (
          <p className="text-sm text-gray-600">Banking tracked from {d} {MON[m - 1]} {y} <span className="text-xs text-gray-400">— earlier days were banked under the old spreadsheet</span></p>
        ); })()}
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600 w-48 shrink-0">Float</span>
          <span className="text-sm text-gray-500">$</span>
          <input type="number" min="0" step="0.05" value={floatAmount} onChange={(e) => setFloatAmount(e.target.value)} className={`${inputCls} w-28`} />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600 w-48 shrink-0">Over/under limit</span>
          <span className="text-sm text-gray-500">$</span>
          <input type="number" min="0" step="0.05" value={limit} onChange={(e) => setLimit(e.target.value)} className={`${inputCls} w-28`} />
          <span className="text-xs text-gray-400">past this, a reason is needed</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm text-gray-600 w-48 shrink-0">Weekly summary email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!emailSupported} placeholder="e.g. owner@example.com" className={`${inputCls} w-64 disabled:bg-gray-50`} />
          <span className="text-xs text-gray-400">{emailSupported ? "Mondays 7am — leave blank for no email" : "Run docs/sql/daily_banking_stage5_7.sql first"}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="w-48 shrink-0" />
          <button onClick={saveMoney} disabled={savingMoney} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {savingMoney ? "Saving…" : "Save banking settings"}
          </button>
          {moneySaved && <span className="text-xs text-green-700">✓ Saved</span>}
        </div>
      </div>

      <div className="text-xs font-semibold text-gray-600 mb-1">Payment types</div>
      <p className="text-[11px] text-gray-400 mb-2">Switch a type off instead of deleting it — past days keep it. Bendigo = paid into the Bendigo account (the EFTPOS terminals).</p>
      {types === null ? <p className="text-xs text-gray-400">Loading…</p> : (
        <div className="border rounded-lg divide-y">
          {types.map((t, i) => (
            <div key={t.id} className={`flex items-center gap-2 px-3 py-2 ${t.active === false ? "opacity-50" : ""}`}>
              <div className="flex flex-col">
                <button onClick={() => move(i, -1)} className="text-[10px] text-gray-400 hover:text-gray-700" aria-label="Move up">▲</button>
                <button onClick={() => move(i, 1)} className="text-[10px] text-gray-400 hover:text-gray-700" aria-label="Move down">▼</button>
              </div>
              <div className="flex-1 min-w-0">
                <input
                  defaultValue={t.name}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== t.name) saveType(t, { name: v }); else e.target.value = t.name; }}
                  className="w-full border rounded px-2 py-1 text-sm"
                />
                <input
                  defaultValue={t.help_text || ""}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v !== (t.help_text || "")) saveType(t, { help_text: v || null }); }}
                  placeholder="Help shown under this field on the till count"
                  className="w-full border rounded px-2 py-1 text-xs text-gray-600 mt-1"
                />
                <div className="text-[10px] text-gray-400 mt-0.5">{KIND_LABEL[t.kind] || t.kind} · {t.key}</div>
              </div>
              <label className="flex items-center gap-1 text-xs text-gray-600 shrink-0">
                <input type="checkbox" checked={!!t.counts_to_bendigo} onChange={(e) => saveType(t, { counts_to_bendigo: e.target.checked })} /> Bendigo
              </label>
              <label className="flex items-center gap-1 text-xs text-gray-600 shrink-0">
                <input type="checkbox" checked={t.active !== false} onChange={(e) => saveType(t, { active: e.target.checked })} /> Active
              </label>
              {savingId === t.id && <span className="text-[10px] text-gray-400">…</span>}
            </div>
          ))}
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-50">
            <input value={adding.name} onChange={(e) => setAdding((a) => ({ ...a, name: e.target.value }))} placeholder="New payment type, e.g. Afterpay"
              className="flex-1 border rounded px-2 py-1 text-sm" />
            <select value={adding.kind} onChange={(e) => setAdding((a) => ({ ...a, kind: e.target.value }))} className="border rounded px-2 py-1 text-sm">
              <option value="other">Other payment</option>
              <option value="eftpos">EFTPOS</option>
            </select>
            <button onClick={add} disabled={!adding.name.trim()} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded disabled:opacity-40">+ Add</button>
          </div>
        </div>
      )}
    </div>
  );
}
