// QSPP → "Policies to read" (pick your name → Open the staff PDF + "I have read and understood").
// Used by the /qspp Library (components/qspp/Library.js).
import { useState } from "react";
import supabase from "../../lib/supabaseClient";
import { REQUEST_COLUMNS, acknowledgeRequest } from "../../lib/policyReads";

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";

// ─── Policies to read (kiosk) ────────────────────────────────────────────────
// Pick your name (active, non-locum staff) → your outstanding policies → Open + "I have read and understood".

export function KioskPolicies({ staffList, onClose }) {
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
      .select(`${REQUEST_COLUMNS}, document:document_id(id, title, pdf_url, pdf_file_name, active)`)
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
                  {r.document.pdf_url ? (
                    <a href={r.document.pdf_url} target="_blank" rel="noopener noreferrer" className="flex-1 text-center border border-slate-300 rounded-lg py-2 text-sm text-slate-700 hover:bg-slate-50">
                      Open
                    </a>
                  ) : (
                    <span className="flex-1 text-center border border-slate-200 rounded-lg py-2 text-sm text-slate-400 bg-slate-50">Not available yet</span>
                  )}
                  {/* Can't confirm reading a policy that can't be opened yet */}
                  <button onClick={() => handleRead(r)} disabled={busyId === r.id || !r.document.pdf_url} className="flex-[2] bg-[#1D4ED8] text-white rounded-lg py-2 text-sm font-semibold hover:bg-blue-800 disabled:opacity-40">
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
