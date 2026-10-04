// Admin → QSPP → Documents: ask staff to read a policy, and see who has read it.
//   AskToReadModal — Everyone / By role / Individual people (active, non-locum); skips anyone with it outstanding
//   PolicyProgress — "x of y read" + expandable list (read: date + phone/kiosk; not yet: Cancel)
// Rules: lib/policyReads.js
import { useState } from "react";
import supabase from "../lib/supabaseClient";
import { targetStaff, docProgress, canBeAsked, viaLabel } from "../lib/policyReads";
import { perthDateOf, fmtDateShort } from "../lib/performanceReview";

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";
const ROLE_ORDER = ["Pharmacist", "Intern Pharmacist", "Pharmacy Assistant", "DAA Coordinator", "Retail Manager"];

export function AskToReadModal({ doc, staffList, requests, adminUser, onClose, onSent }) {
  const [mode, setMode] = useState("everyone");
  const [roles, setRoles] = useState([]);
  const [ids, setIds] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const pool = (staffList || []).filter(canBeAsked).sort((a, b) => a.name.localeCompare(b.name));
  const rank = (r) => { const i = ROLE_ORDER.indexOf(r); return i === -1 ? 99 : i; };
  const roleList = [...new Set(pool.map((s) => s.role).filter(Boolean))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const mine = (requests || []).filter((r) => String(r.document_id) === String(doc.id));
  const outstanding = new Set(mine.filter((r) => r.status === "outstanding").map((r) => Number(r.staff_id)));
  const readBefore = new Set(mine.filter((r) => r.status === "read").map((r) => Number(r.staff_id)));

  const chosen = targetStaff(staffList, mode, roles, ids);
  const toAsk = chosen.filter((s) => !outstanding.has(Number(s.id)));
  const skipped = chosen.length - toAsk.length;
  const rereads = toAsk.filter((s) => readBefore.has(Number(s.id))).length;

  const handleSend = async () => {
    if (!toAsk.length) return;
    setSending(true);
    setError("");
    const nowIso = new Date().toISOString();
    const { error: err } = await supabase.from("policy_read_requests").insert(toAsk.map((s) => ({
      pharmacy_id: PHARMACY_ID,
      document_id: doc.id,
      staff_id: s.id,
      requested_by: adminUser?.id ?? null,
      requested_at: nowIso,
      status: "outstanding",
    })));
    setSending(false);
    if (err) {
      setError(err.code === "23505"
        ? "Someone was asked just now from another screen. Close this and try again."
        : "Couldn't send: " + err.message);
      return;
    }
    onSent();
  };

  const toggle = (list, setList, v) => setList(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full max-h-[85vh] overflow-y-auto p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Ask staff to read</h2>
            <p className="text-xs text-gray-500 mt-0.5 break-words">{doc.title}</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="flex gap-1.5">
          {[{ k: "everyone", l: "Everyone" }, { k: "roles", l: "By role" }, { k: "people", l: "Individual people" }].map((o) => (
            <button key={o.k} type="button" onClick={() => setMode(o.k)}
              className={`flex-1 text-xs py-1.5 rounded-lg border ${mode === o.k ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>
              {o.l}
            </button>
          ))}
        </div>

        {mode === "roles" && (
          <div className="space-y-1">
            {roleList.map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={roles.includes(r)} onChange={() => toggle(roles, setRoles, r)} />
                {r} <span className="text-xs text-gray-400">({pool.filter((s) => s.role === r).length})</span>
              </label>
            ))}
          </div>
        )}
        {mode === "people" && (
          <div className="max-h-56 overflow-y-auto border rounded-lg divide-y">
            {pool.map((s) => (
              <label key={s.id} className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700">
                <input type="checkbox" checked={ids.includes(Number(s.id))} onChange={() => toggle(ids, setIds, Number(s.id))} />
                <span className="flex-1">{s.name}</span>
                {outstanding.has(Number(s.id)) && <span className="text-[11px] text-amber-600">already asked</span>}
              </label>
            ))}
          </div>
        )}

        <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700">
          This will ask <span className="font-semibold">{toAsk.length}</span> {toAsk.length === 1 ? "person" : "people"}.
          {skipped > 0 && <span className="block text-xs text-gray-500">{skipped} already {skipped === 1 ? "has" : "have"} it to read — skipped.</span>}
          {rereads > 0 && <span className="block text-xs text-gray-500">{rereads} read it before and will be asked to read it again.</span>}
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button type="button" onClick={handleSend} disabled={sending || toAsk.length === 0} className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-40">
            {sending ? "Sending…" : `Ask ${toAsk.length}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PolicyProgress({ doc, requests, staffList, adminUser, open, onToggle, onChanged }) {
  const p = docProgress(doc.id, requests, staffList);
  const [busyId, setBusyId] = useState(null);
  if (p.total === 0) return null;

  const handleCancel = async (row) => {
    if (!window.confirm(`Cancel the request for ${row.staff.name} to read "${doc.title}"?`)) return;
    setBusyId(row.request.id);
    const { error } = await supabase.from("policy_read_requests")
      .update({ status: "cancelled", cancelled_by: adminUser?.id ?? null, cancelled_at: new Date().toISOString() })
      .eq("id", row.request.id).eq("status", "outstanding");
    setBusyId(null);
    if (error) { alert("Couldn't cancel: " + error.message); return; }
    onChanged();
  };

  return (
    <div className="mt-2 pl-6">
      <button type="button" onClick={onToggle} className={`text-[11px] font-medium ${p.outstanding ? "text-amber-700" : "text-green-700"} hover:underline`}>
        {p.read} of {p.total} read {open ? "▲" : "▼"}
      </button>
      {open && (
        <div className="mt-1.5 rounded-lg border border-gray-200 bg-white divide-y">
          {p.rows.map((row) => (
            <div key={row.request.id} className="flex items-center gap-2 px-3 py-1.5">
              <span className="text-sm text-gray-800 flex-1 truncate">{row.staff.name}</span>
              {row.request.status === "read" ? (
                <span className="text-[11px] text-green-700">
                  ✓ Read {fmtDateShort(perthDateOf(row.request.read_at))}{row.request.read_via ? ` · ${viaLabel(row.request.read_via)}` : ""}
                </span>
              ) : (
                <>
                  <span className="text-[11px] text-amber-700">Not yet · asked {fmtDateShort(perthDateOf(row.request.requested_at))}</span>
                  <button type="button" disabled={busyId === row.request.id} onClick={() => handleCancel(row)} className="text-[11px] text-red-500 hover:text-red-600">Cancel</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
