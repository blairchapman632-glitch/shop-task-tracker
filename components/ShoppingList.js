// Kiosk — 🛒 Shopping list (opened from its card on Today's Jobs → On the List). Kiosk only, not /me.
// Table shopping_list_items: low "Buy in person" items from the consumables check land here automatically (source
// 'consumables', one line per thing to buy, linked by checklist_line_id); anyone can add their own (source 'manual').
// Bought = who + when (the check line counts as bought once all its lines are); Remove = mistakes (kept, marked removed).
// Not a task: nothing is written to completions (no points / Activity).
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import supabase from "../lib/supabaseClient";
import { fmtDateShort, perthDateOf, todayPerth, addDaysStr } from "../lib/performanceReview";
import { refreshLineBought } from "../lib/consumables";

const BOUGHT_DAYS = 7; // "Bought recently" window

export default function ShoppingList({ pharmacyId, staffId, staffName, nameOf, onClose, onChanged }) {
  const [shops, setShops] = useState([]); // "Buy in person" suppliers
  const [open, setOpen] = useState(null);
  const [bought, setBought] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(new Set());
  const [form, setForm] = useState({ name: "", details: "", supplier_id: "" });
  const [adding, setAdding] = useState(false);

  const load = async () => {
    const since = new Date(Date.now() - (BOUGHT_DAYS + 1) * 864e5).toISOString(); // trimmed to Perth days below
    const [sp, op, bt] = await Promise.all([
      supabase.from("consumable_suppliers").select("id, name, supplier_type, sort_order, active").eq("pharmacy_id", pharmacyId).order("sort_order"),
      supabase.from("shopping_list_items").select("*").eq("pharmacy_id", pharmacyId).is("bought_at", null).is("removed_at", null).order("created_at"),
      supabase.from("shopping_list_items").select("*").eq("pharmacy_id", pharmacyId).is("removed_at", null).gte("bought_at", since).order("bought_at", { ascending: false }),
    ]);
    const err = sp.error || op.error || bt.error;
    if (err) { setError(err.message); return; }
    const cutoff = addDaysStr(todayPerth(), -(BOUGHT_DAYS - 1));
    setShops(sp.data || []);
    setOpen(op.data || []);
    setBought((bt.data || []).filter((x) => String(perthDateOf(x.bought_at)) >= cutoff));
    onChanged?.((op.data || []).length);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [pharmacyId]);

  const needStaff = () => {
    if (staffId) return false;
    alert("Tap your photo on the home screen first.");
    return true;
  };
  const run = async (id, fn) => {
    setBusy((b) => new Set(b).add(id));
    setError("");
    try { await fn(); await load(); }
    catch (err) { setError("Couldn't save: " + (err?.message || String(err))); }
    finally { setBusy((b) => { const n = new Set(b); n.delete(id); return n; }); }
  };

  // Bought (or Undo). The consumables check line it came from counts as bought once all its shopping lines are.
  const setBoughtState = (item, isBought) => {
    if (needStaff()) return;
    run(item.id, async () => {
      const now = new Date().toISOString();
      const patch = isBought ? { bought_at: now, bought_by_staff_id: Number(staffId) } : { bought_at: null, bought_by_staff_id: null };
      const { error: err } = await supabase.from("shopping_list_items").update(patch).eq("id", item.id);
      if (err) {
        if (err.code === "23505") throw new Error(`"${item.name}" is already back on the list from the same check — tick that one instead.`);
        throw err;
      }
      if (item.checklist_line_id) await refreshLineBought(supabase, item.checklist_line_id);
    });
  };

  const remove = (item) => {
    if (needStaff()) return;
    if (!window.confirm(`Remove "${item.name}" from the shopping list?`)) return;
    run(item.id, async () => {
      const { error: err } = await supabase.from("shopping_list_items")
        .update({ removed_at: new Date().toISOString(), removed_by_staff_id: Number(staffId) }).eq("id", item.id);
      if (err) throw err;
      if (item.checklist_line_id) await refreshLineBought(supabase, item.checklist_line_id); // the rest may all be bought
    });
  };

  const add = async () => {
    if (needStaff()) return;
    const typed = form.name.trim();
    const name = typed.charAt(0).toUpperCase() + typed.slice(1); // "milk" -> "Milk", like the consumables check lines
    if (!name) { alert("Type what's needed."); return; }
    setAdding(true);
    setError("");
    try {
      const { error: err } = await supabase.from("shopping_list_items").insert([{
        pharmacy_id: pharmacyId, name: name.slice(0, 200), details: form.details.trim().slice(0, 300) || null,
        supplier_id: form.supplier_id || null, source: "manual", added_by_staff_id: Number(staffId),
      }]);
      if (err) throw err;
      setForm({ name: "", details: "", supplier_id: "" });
      await load();
    } catch (err) {
      setError("Couldn't add: " + (err?.message || String(err)));
    } finally {
      setAdding(false);
    }
  };

  // Group by shop: "Buy in person" suppliers in their order, then any other supplier, then Other (no shop)
  const shopName = (id) => shops.find((s) => String(s.id) === String(id))?.name;
  const groups = (() => {
    const out = [];
    const byKey = new Map();
    const keyOf = (it) => (it.supplier_id && shopName(it.supplier_id) ? String(it.supplier_id) : "other");
    for (const s of shops.filter((x) => x.supplier_type === "in_person")) { const g = { key: String(s.id), name: s.name, items: [] }; byKey.set(g.key, g); out.push(g); }
    for (const it of open || []) {
      const k = keyOf(it);
      if (!byKey.has(k)) { const g = { key: k, name: k === "other" ? "Other" : shopName(k), items: [] }; byKey.set(k, g); out.push(g); }
      byKey.get(k).items.push(it);
    }
    const other = byKey.get("other");
    return [...out.filter((g) => g.key !== "other"), ...(other ? [other] : [])].filter((g) => g.items.length);
  })();
  const addedBy = (it) => (it.added_by_staff_id ? nameOf(it.added_by_staff_id) || "—" : it.source === "consumables" ? "Consumables check" : "—");
  const label = (it) => (it.details ? `${it.name} — ${it.details}` : it.name);
  const inPersonShops = shops.filter((s) => s.supplier_type === "in_person" && s.active !== false);

  return createPortal(
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[88vh]" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
            <h2 className="font-semibold text-gray-800">🛒 Shopping list</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
          </div>
          <div className="px-5 py-4 overflow-y-auto space-y-4">
            {!staffId
              ? <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Tap your photo on the home screen first, then add or tick items.</div>
              : <div className="text-xs text-blue-800 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">Using the list as <span className="font-semibold">{staffName}</span></div>}
            {error && <p className="text-sm text-red-500">{error}</p>}
            {open === null && !error && <p className="text-sm text-gray-400">Loading…</p>}
            {open && open.length === 0 && <p className="text-sm text-gray-400 text-center py-2">Nothing on the list.</p>}

            {groups.map((g) => (
              <div key={g.key}>
                <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{g.name}</div>
                <div className="rounded-lg border border-blue-200 bg-blue-50/40 divide-y divide-blue-100">
                  {g.items.map((it) => (
                    <div key={it.id} className="flex items-start gap-2 px-3 py-2">
                      <input type="checkbox" checked={false} disabled={busy.has(it.id)} onChange={() => setBoughtState(it, true)} className="mt-1 h-4 w-4" title="Bought" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-800">{label(it)}</div>
                        <div className="text-[11px] text-gray-400">{addedBy(it)} · {fmtDateShort(perthDateOf(it.created_at))}</div>
                      </div>
                      <button type="button" disabled={busy.has(it.id)} onClick={() => remove(it)}
                        className="shrink-0 text-[11px] px-2 py-0.5 rounded border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50">
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Add item */}
            <div className="rounded-lg border border-gray-200 p-3 space-y-2">
              <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Add item</div>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={200}
                placeholder="What's needed (e.g. Milk)" className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
              <div className="flex gap-2">
                <input value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} maxLength={300}
                  placeholder="Details (optional)" className="flex-1 min-w-0 rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
                <select value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}
                  className="w-36 rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
                  <option value="">Other</option>
                  {inPersonShops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <button onClick={add} disabled={adding || !staffId} className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-40">
                {adding ? "Adding…" : "+ Add to list"}
              </button>
            </div>

            {bought.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Bought recently</div>
                <div className="rounded-lg border border-gray-200 divide-y">
                  {bought.map((it) => (
                    <div key={it.id} className="flex items-start gap-2 px-3 py-2">
                      <span className="mt-0.5 text-green-600 text-sm">✓</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-500 line-through">{label(it)}</div>
                        <div className="text-[11px] text-green-700">Bought by {nameOf(it.bought_by_staff_id) || "—"} · {fmtDateShort(perthDateOf(it.bought_at))}</div>
                      </div>
                      <button type="button" disabled={busy.has(it.id)} onClick={() => setBoughtState(it, false)}
                        className="shrink-0 text-[11px] px-2 py-0.5 rounded border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50">
                        Undo
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
