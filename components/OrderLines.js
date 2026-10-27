// Order / Owner lines grouped by supplier (phone, website, notes), each with an "Ordered" tick and "Not ordering".
// Both record who + when (lib/consumables setOrderState). Used by the kiosk sheet's Order summary, the kiosk
// follow-up order cards and Tasks → Checklists → History. Allowed after the sheet is locked — only counts lock.
// staffId: who's ticking (kiosk: the selected photo; History: who unlocked the Tasks page). canEdit false = read-only.
import { useState } from "react";
import supabase from "../lib/supabaseClient";
import { fmtDateShort, perthDateOf } from "../lib/performanceReview";
import { supplierGroups, setOrderState, withDetails } from "../lib/consumables";

export default function OrderLines({ lines, staffId, canEdit = true, nameOf, onChanged, showMonth = false, tone = "amber" }) {
  const [busy, setBusy] = useState(new Set());
  const [error, setError] = useState("");

  const run = async (line, state) => {
    if (!canEdit) return;
    if (!staffId) { alert("Choose who you are first (tap your photo / unlock with your PIN)."); return; }
    let note = null;
    if (state === "not_ordering") {
      note = window.prompt(`Not ordering "${line.item_name}"? Add a note if you like (e.g. "enough in the back"):`, "");
      if (note === null) return; // cancelled
    }
    setBusy((b) => new Set(b).add(line.id));
    setError("");
    try {
      onChanged(await setOrderState(supabase, line, state, staffId, note));
    } catch (err) {
      setError("Couldn't save: " + (err?.message || String(err)));
    } finally {
      setBusy((b) => { const n = new Set(b); n.delete(line.id); return n; });
    }
  };

  const box = tone === "purple" ? "border-purple-200 bg-purple-50/40" : "border-amber-200 bg-amber-50/40";
  const monthOf = (l) => (l.period_month ? new Date(`${String(l.period_month).slice(0, 7)}-01T00:00:00`).toLocaleDateString("en-AU", { month: "short", year: "numeric" }) : "");

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-500">{error}</p>}
      {supplierGroups(lines).map((g) => (
        <div key={g.key} className={`rounded-lg border p-3 ${box}`}>
          <div className="text-sm font-semibold text-gray-800">{g.name}</div>
          <div className="text-xs text-gray-600 space-x-2">
            {g.phone && <span>📞 {g.phone}</span>}
            {g.website && <span>🌐 {g.website}</span>}
          </div>
          {g.notes && <div className="text-xs text-gray-500 whitespace-pre-line mt-0.5">{g.notes}</div>}
          <div className="mt-2 space-y-1.5">
            {g.lines.map((l) => {
              const isBusy = busy.has(l.id);
              return (
                <div key={l.id} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!l.ordered}
                    disabled={!canEdit || isBusy || l.not_ordering}
                    onChange={() => run(l, l.ordered ? "clear" : "ordered")}
                    className="mt-1"
                    title="Ordered"
                  />
                  <span className="flex-1">
                    <span className={l.not_ordering ? "line-through text-gray-400" : ""}>{withDetails(l.item_name, l)}</span>
                    {l.delivery_time && <span className="text-xs text-gray-400"> · {l.delivery_time}</span>}
                    {showMonth && l.period_month && <span className="text-xs text-gray-400"> · {monthOf(l)}</span>}
                    {l.ordered && <span className="block text-[11px] text-green-700">Ordered by {nameOf(l.ordered_by_staff_id) || "—"} · {fmtDateShort(perthDateOf(l.ordered_at))}</span>}
                    {l.not_ordering && (
                      <span className="block text-[11px] text-gray-500">
                        Not ordering — {nameOf(l.not_ordering_by_staff_id) || "—"} · {fmtDateShort(perthDateOf(l.not_ordering_at))}{l.not_ordering_note ? ` · “${l.not_ordering_note}”` : ""}
                      </span>
                    )}
                  </span>
                  {canEdit && !l.ordered && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => run(l, l.not_ordering ? "clear" : "not_ordering")}
                      className="shrink-0 text-[11px] px-2 py-0.5 rounded border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {l.not_ordering ? "Undo" : "Not ordering"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
