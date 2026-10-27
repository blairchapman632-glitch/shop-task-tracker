// Kiosk — the Consumables Checklist sheet (opened from its monthly task card on Today's Jobs → On the List).
// Every entry saves as it's made, so a sheet can be finished on a later shift (the card stays until Complete).
// Complete = a normal completion of the task for the sheet's month (completions.period_start), then the sheet locks.
// Low "Buy in person" items go to the shopping list (Part C shows it); owner-to-order items notify the owner on Complete.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import supabase from "../lib/supabaseClient";
import OrderLines from "./OrderLines";
import { fmtDateShort, perthDateOf, todayPerth } from "../lib/performanceReview";
import {
  RESULT_LABEL, RESULT_STYLE, fmtReorder, lineResult, loadOrCreateSheet, isOpenOrder,
  addToShoppingList, withdrawFromShoppingList, groupedRows, groupSupplier, nameInGroup,
} from "../lib/consumables";

const monthName = (ym) => new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-AU", { month: "long", year: "numeric" });

export default function ConsumablesSheet({ task, periodMonth, staffId, staffName, nameOf, pharmacyId, ownerStaffId, onClose, onCompleted }) {
  const [sheet, setSheet] = useState(null);
  const [lines, setLines] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(new Set()); // line ids saving
  const [completing, setCompleting] = useState(false);

  const ownerName = nameOf(ownerStaffId) || "Owner";
  const locked = sheet?.status === "completed";
  const canEdit = !locked && !!staffId;
  const carried = String(periodMonth).slice(0, 7) !== todayPerth().slice(0, 7);

  useEffect(() => {
    let cancelled = false;
    loadOrCreateSheet(supabase, { pharmacyId, taskId: task.id, periodMonth, staffId })
      .then(({ sheet: s, lines: l }) => { if (!cancelled) { setSheet(s); setLines(l); } })
      .catch((err) => { if (!cancelled) setError(err?.message || String(err)); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id, periodMonth]);

  const setBusyId = (id, on) => setBusy((b) => { const n = new Set(b); if (on) n.add(id); else n.delete(id); return n; });

  // Save an entry (qty or Low yes/no) — works out the result and keeps the shopping list in step
  const saveEntry = async (line, entry) => {
    if (!canEdit || busy.has(line.id)) return;
    const next = { ...line, ...entry };
    const result = lineResult(next);
    const patch = { ...entry, result, entered_by_staff_id: Number(staffId), entered_at: new Date().toISOString() };
    setBusyId(line.id, true);
    setError("");
    try {
      if (result === "shopping" && !line.shopping_item_id) {
        patch.shopping_item_id = await addToShoppingList(supabase, { pharmacyId, line });
      } else if (result !== "shopping" && line.shopping_item_id) {
        await withdrawFromShoppingList(supabase, { shoppingItemId: line.shopping_item_id, staffId });
        patch.shopping_item_id = null;
      }
      if (result !== "order" && result !== "owner" && (line.ordered || line.not_ordering)) {
        // no longer an order line
        Object.assign(patch, { ordered: false, ordered_by_staff_id: null, ordered_at: null, not_ordering: false, not_ordering_by_staff_id: null, not_ordering_at: null, not_ordering_note: null });
      }
      const { data, error: err } = await supabase.from("checklist_lines").update(patch).eq("id", line.id).select("*").single();
      if (err) throw err;
      setLines((ls) => ls.map((l) => (l.id === line.id ? data : l)));
    } catch (err) {
      setError("Couldn't save: " + (err?.message || String(err)));
    } finally {
      setBusyId(line.id, false);
    }
  };

  const complete = async () => {
    if (!canEdit) return;
    const notEntered = lines.filter((l) => !l.result);
    const staffOpen = lines.filter((l) => l.result === "order" && isOpenOrder(l));
    const ownerOpen = lines.filter((l) => l.result === "owner" && isOpenOrder(l));
    const warn = [
      notEntered.length ? `${notEntered.length} item(s) not checked yet.` : "",
      staffOpen.length
        ? `Not ordered yet — these will stay on Today's Jobs as "Consumables — ${staffOpen.length} still to order" until they're ticked Ordered (or Not ordering):\n${staffOpen.map((l) => `• ${l.item_name}`).join("\n")}`
        : "",
      ownerOpen.length ? `${ownerOpen.length} item(s) for ${ownerName} to order will stay on the kiosk for ${ownerName} until ordered.` : "",
    ].filter(Boolean).join("\n\n");
    if (!window.confirm(`${warn ? `${warn}\n\n` : ""}Complete the count for ${monthName(String(periodMonth).slice(0, 7))}? The counts will be locked.`)) return;
    setCompleting(true);
    setError("");
    try {
      const nowIso = new Date().toISOString();
      const { data: done, error: sErr } = await supabase.from("checklist_sheets")
        .update({ status: "completed", completed_by_staff_id: Number(staffId), completed_at: nowIso })
        .eq("id", sheet.id).eq("status", "in_progress").select("*");
      if (sErr) throw sErr;
      if (!done?.length) throw new Error("This sheet was just completed on another screen.");
      // Normal completion of the monthly task, for the sheet's month (a carried-over sheet counts for its own month)
      const { error: cErr } = await supabase.from("completions").insert([{
        task_id: Number(task.id), staff_id: Number(staffId), pharmacy_id: pharmacyId, completed_at: nowIso, period_start: periodMonth,
      }]);
      if (cErr) throw cErr;
      // Tell the owner what they need to order (existing push route)
      const ownerLines = lines.filter((l) => l.result === "owner");
      if (ownerLines.length && ownerStaffId) {
        fetch("/api/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            staff_ids: [Number(ownerStaffId)],
            title: `Consumables — ${ownerLines.length} for you to order`,
            body: ownerLines.map((l) => l.item_name).join(", ").slice(0, 300),
            url: `/tasks?tab=checklists&sheet=${sheet.id}`,
          }),
        }).catch(() => {});
        await supabase.from("checklist_sheets").update({ owner_notified_at: nowIso }).eq("id", sheet.id);
      }
      onCompleted();
    } catch (err) {
      setError("Couldn't complete: " + (err?.message || String(err)));
      setCompleting(false);
    }
  };

  const orderLines = lines.filter((l) => l.result === "order");
  const ownerLines = lines.filter((l) => l.result === "owner");
  const shoppingLines = lines.filter((l) => l.result === "shopping");
  const enteredCount = lines.filter((l) => l.result).length;

  return createPortal(
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={() => !completing && onClose()} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl flex flex-col max-h-[92vh]" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
            <div>
              <h2 className="font-semibold text-gray-800">🧾 {task.title} — {monthName(String(periodMonth).slice(0, 7))}</h2>
              <div className="text-xs text-gray-500 mt-0.5">
                {locked
                  ? `Completed by ${nameOf(sheet.completed_by_staff_id) || "—"} · ${fmtDateShort(perthDateOf(sheet.completed_at))}`
                  : `${enteredCount} of ${lines.length} checked${carried ? " · carried over from last month" : ""} · saves as you go`}
              </div>
            </div>
            <button onClick={onClose} disabled={completing} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
          </div>

          <div className="px-5 py-4 overflow-y-auto space-y-5">
            {!staffId && !locked && (
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Tap your photo on the home screen first, then open the checklist.</div>
            )}
            {staffId && !locked && <div className="text-xs text-blue-800 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">Filling in as <span className="font-semibold">{staffName}</span></div>}
            {error && <p className="text-sm text-red-500">{error}</p>}
            {!sheet && !error && <p className="text-sm text-gray-400">Loading…</p>}

            {sheet && (
              <div className="divide-y border rounded-lg">
                {groupedRows(lines).map((sec) => (sec.group ? (
                  <div key={`g-${sec.group}`}>
                    <div className="px-3 pt-2.5 pb-1 bg-gray-50 text-xs font-semibold text-gray-700">
                      {sec.group}{groupSupplier(sec.rows) && <span className="font-normal text-gray-400"> · {groupSupplier(sec.rows)}</span>}
                    </div>
                    <div className="divide-y">
                      {sec.rows.map((l) => (
                        <LineRow key={l.id} line={l} inGroup canEdit={canEdit} busy={busy.has(l.id)} ownerName={ownerName} onSave={saveEntry} />
                      ))}
                    </div>
                  </div>
                ) : (
                  <LineRow key={sec.rows[0].id} line={sec.rows[0]} canEdit={canEdit} busy={busy.has(sec.rows[0].id)} ownerName={ownerName} onSave={saveEntry} />
                )))}
              </div>
            )}

            {sheet && orderLines.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Order summary</div>
                <OrderLines
                  lines={orderLines}
                  staffId={staffId}
                  canEdit={!!staffId}
                  nameOf={nameOf}
                  onChanged={(saved) => setLines((ls) => ls.map((l) => (l.id === saved.id ? saved : l)))}
                />
              </div>
            )}

            {sheet && ownerLines.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">For {ownerName} to order</div>
                <div className="rounded-lg border border-purple-200 bg-purple-50/40 p-3 space-y-1">
                  {ownerLines.map((l) => (
                    <div key={l.id} className="text-sm text-gray-800">
                      {l.item_name}
                      <span className="text-xs text-gray-400"> · {l.supplier_name || "—"}{l.delivery_time ? ` · ${l.delivery_time}` : ""}</span>
                      {l.ordered && <span className="block text-[11px] text-green-700">Ordered by {nameOf(l.ordered_by_staff_id) || "—"} · {fmtDateShort(perthDateOf(l.ordered_at))}</span>}
                    </div>
                  ))}
                  <p className="text-[11px] text-purple-700 pt-1">{ownerName} is notified when the checklist is completed.</p>
                </div>
              </div>
            )}

            {sheet && shoppingLines.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Added to the shopping list</div>
                <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 space-y-1">
                  {shoppingLines.map((l) => (
                    <div key={l.id} className="text-sm text-gray-800">
                      {l.item_name} <span className="text-xs text-gray-400">· {l.supplier_name || "Other"}</span>
                      {l.bought_at && <span className="block text-[11px] text-green-700">Bought by {nameOf(l.bought_by_staff_id) || "—"} · {fmtDateShort(perthDateOf(l.bought_at))}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {sheet && !locked && (
            <div className="px-5 py-4 border-t shrink-0">
              <button onClick={complete} disabled={!canEdit || completing} className="w-full bg-green-600 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-40">
                {completing ? "Completing…" : "Complete checklist"}
              </button>
            </div>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}

// inGroup: shown under its group heading — the name drops the group prefix and the supplier is in the heading
function LineRow({ line, inGroup = false, canEdit, busy, ownerName, onSave }) {
  const [qty, setQty] = useState(line.qty_on_hand ?? "");
  useEffect(() => { setQty(line.qty_on_hand ?? ""); }, [line.qty_on_hand]);

  const saveQty = () => {
    const v = String(qty).trim();
    const n = v === "" ? null : Number(v);
    if (v !== "" && !Number.isFinite(n)) { setQty(line.qty_on_hand ?? ""); return; }
    if (n === (line.qty_on_hand === null || line.qty_on_hand === undefined ? null : Number(line.qty_on_hand))) return;
    onSave(line, { qty_on_hand: n });
  };

  const r = line.result;
  return (
    <div className={`py-2.5 flex flex-wrap items-center gap-3 ${inGroup ? "pl-6 pr-3" : "px-3"}`}>
      <div className="flex-1 min-w-[220px]">
        <div className="text-sm font-medium text-gray-800">{inGroup ? nameInGroup(line) : line.item_name}</div>
        <div className="text-[11px] text-gray-400">
          {line.check_only ? "Check only" : `Reorder at ${fmtReorder(line)}`}
          {!inGroup && line.supplier_name && ` · ${line.supplier_name}`}
        </div>
      </div>
      {line.check_only ? (
        <div className="flex gap-1">
          {[{ v: false, label: "OK" }, { v: true, label: "Low" }].map((o) => (
            <button
              key={o.label}
              type="button"
              disabled={!canEdit || busy}
              onClick={() => onSave(line, { is_low: line.is_low === o.v ? null : o.v })}
              className={`px-3 py-1.5 rounded-lg border text-sm disabled:opacity-60 ${line.is_low === o.v ? (o.v ? "bg-amber-500 text-white border-amber-500" : "bg-green-600 text-white border-green-600") : "bg-white text-gray-600 border-gray-300"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            inputMode="decimal"
            value={qty}
            disabled={!canEdit || busy}
            onChange={(e) => setQty(e.target.value.replace(/[^\d.]/g, ""))}
            onBlur={saveQty}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            placeholder="On hand"
            className="w-24 border rounded-lg px-2 py-1.5 text-sm disabled:bg-gray-50"
          />
          {line.reorder_unit && <span className="text-xs text-gray-400">{line.reorder_unit}</span>}
        </div>
      )}
      <div className="w-full sm:w-auto sm:min-w-[180px] text-right">
        {r ? (
          <span className={`inline-block text-[11px] px-2 py-0.5 rounded-full border ${RESULT_STYLE[r]}`}>
            {r === "owner" ? `${ownerName} to order` : r === "shopping" ? "Added to shopping list" : RESULT_LABEL[r]}
          </span>
        ) : <span className="text-[11px] text-gray-300">—</span>}
        {r === "order" && (
          <div className="text-[11px] text-amber-700 mt-0.5">
            {line.supplier_name}{line.supplier_phone ? ` · ${line.supplier_phone}` : ""}{line.delivery_time ? ` · ${line.delivery_time}` : ""}
          </div>
        )}
      </div>
    </div>
  );
}
