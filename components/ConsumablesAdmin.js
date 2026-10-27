// Tasks → Checklists: the tasks with a checklist, then per task Items, Suppliers, Settings (owner), History.
// The owner ticks "owner to order" lines as ordered from a month's sheet here (also opened from the push notification:
// /tasks?tab=checklists&sheet=<id>). Who ticked = the staff member who unlocked the Tasks page with their PIN.
import { useEffect, useState } from "react";
import supabase from "../lib/supabaseClient";
import { fmtDateShort, perthDateOf } from "../lib/performanceReview";
import { SUPPLIER_TYPES, RESULT_LABEL, RESULT_STYLE, fmtReorder, checklistTypeLabel, groupedRows, displayOrder, nameInGroup, groupSupplier, isOpenOrder, openOrderCount, sheetStatusLabel } from "../lib/consumables";
import OrderLines from "./OrderLines";
import { fetchAllRows } from "../lib/trainingPlan";

const inputCls = "w-full rounded border border-gray-300 px-2 py-1.5 text-sm";
const monthName = (d) => new Date(`${String(d).slice(0, 7)}-01T00:00:00`).toLocaleDateString("en-AU", { month: "long", year: "numeric" });
// Green = Complete (counted + every order closed); amber = in progress or still to order
const statusStyle = (sheet, lines) => (sheet.status === "completed" && !openOrderCount(lines)
  ? "bg-green-50 text-green-700 border-green-200" : "bg-amber-50 text-amber-700 border-amber-200");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Tasks → Checklists. Opens with the tasks that have a checklist (tasks.checklist_type — set in Recurring tasks);
// pick one for its Items / Suppliers / Settings / History. Items, suppliers and the owner are pharmacy-wide (shared by
// every consumables checklist task); History is per task.
export default function ConsumablesAdmin({ pharmacyId, staffOptions, tasks, pinStaffId, initialSheetId }) {
  const checklistTasks = (tasks || []).filter((t) => t.checklist_type);
  const [taskId, setTaskId] = useState(null);
  const [view, setView] = useState(initialSheetId ? "history" : "items");
  const [suppliers, setSuppliers] = useState([]);
  const [items, setItems] = useState([]);
  const [used, setUsed] = useState({ items: new Set(), suppliers: new Set() }); // on a sheet at least once
  const [settings, setSettings] = useState({ consumables_owner_staff_id: null });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [sp, it, st, lines] = await Promise.all([
      supabase.from("consumable_suppliers").select("*").eq("pharmacy_id", pharmacyId).order("sort_order"),
      supabase.from("consumable_items").select("*").eq("pharmacy_id", pharmacyId).order("sort_order"),
      supabase.from("pharmacy_settings").select("consumables_owner_staff_id").eq("pharmacy_id", pharmacyId).maybeSingle(),
      fetchAllRows(() => supabase.from("checklist_lines").select("item_id, supplier_id").eq("pharmacy_id", pharmacyId).order("id")).catch((e) => ({ error: e })),
    ]);
    const err = sp.error || it.error || st.error || lines.error;
    setError(err ? err.message : "");
    setSuppliers(sp.data || []);
    setItems(it.data || []);
    setSettings(st.data || {});
    const rows = Array.isArray(lines) ? lines : [];
    setUsed({
      items: new Set(rows.map((l) => String(l.item_id)).filter((x) => x !== "null")),
      suppliers: new Set(rows.map((l) => String(l.supplier_id)).filter((x) => x !== "null")),
    });
    setLoading(false);
  };
  useEffect(() => { if (pharmacyId) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [pharmacyId]);

  // Opened from the owner's notification (?sheet=<id>): select that sheet's task
  useEffect(() => {
    if (!initialSheetId) return;
    supabase.from("checklist_sheets").select("task_id").eq("id", initialSheetId).maybeSingle()
      .then(({ data }) => { if (data?.task_id) setTaskId(Number(data.task_id)); });
  }, [initialSheetId]);

  const nameOf = (id) => staffOptions.find((s) => Number(s.id) === Number(id))?.name || "";
  const ownerName = nameOf(settings.consumables_owner_staff_id) || "Owner";

  const saveSetting = async (patch) => {
    const { error: err } = await supabase.from("pharmacy_settings").update(patch).eq("pharmacy_id", pharmacyId);
    if (err) { alert("Couldn't save: " + err.message); return; }
    setSettings((s) => ({ ...s, ...patch }));
  };

  if (loading) return <div className="text-sm text-gray-400 py-8 text-center">Loading…</div>;

  const task = checklistTasks.find((t) => Number(t.id) === Number(taskId));
  if (!task) {
    return (
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-4 py-3 border-b">
          <div className="text-sm font-semibold text-gray-700">Checklists</div>
          <div className="text-xs text-gray-400">Tasks with a checklist. Add one by ticking "Checklist" on a task in Recurring tasks.</div>
        </div>
        {error && <p className="px-4 py-2 text-sm text-red-500">{error}</p>}
        {checklistTasks.length === 0 ? (
          <div className="px-4 py-6 text-sm text-gray-400 text-center">No tasks have a checklist yet.</div>
        ) : checklistTasks.map((t) => (
          <button key={t.id} onClick={() => setTaskId(t.id)} className="w-full text-left px-4 py-3 border-t hover:bg-gray-50 flex items-center justify-between">
            <span>
              <span className="text-sm font-medium text-gray-800">🧾 {t.title}</span>
              <span className="block text-xs text-gray-400">{checklistTypeLabel(t.checklist_type)}{t.active === false ? " · task inactive" : ""}</span>
            </span>
            <span className="text-gray-400">›</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => setTaskId(null)} className="text-sm text-blue-600">‹ Checklists</button>
        <div className="text-sm font-semibold text-gray-800">🧾 {task.title}</div>
        <span className="text-xs text-gray-400">{checklistTypeLabel(task.checklist_type)}</span>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-1">
        {[{ k: "items", l: "Items" }, { k: "suppliers", l: "Suppliers" }, { k: "settings", l: "Settings" }, { k: "history", l: "History" }].map((t) => (
          <button key={t.k} onClick={() => setView(t.k)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${view === t.k ? "bg-gray-800 text-white" : "bg-white border text-gray-600 hover:bg-gray-50"}`}>
            {t.l}
          </button>
        ))}
      </div>

      {view === "settings" && (
        <div className="bg-white rounded-xl border p-4 max-w-md">
          <label className="block text-xs font-semibold text-gray-600 mb-1">Owner to order</label>
          <select value={settings.consumables_owner_staff_id ? String(settings.consumables_owner_staff_id) : ""}
            onChange={(e) => saveSetting({ consumables_owner_staff_id: e.target.value ? Number(e.target.value) : null })} className={inputCls}>
            <option value="">— Nobody —</option>
            {staffOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <p className="text-[11px] text-gray-400 mt-1">Shown as "{ownerName} to order" and notified when a checklist with their items is completed.</p>
        </div>
      )}
      {view === "suppliers" && <Suppliers pharmacyId={pharmacyId} suppliers={suppliers} items={items} used={used.suppliers} onChanged={load} />}
      {view === "items" && <Items pharmacyId={pharmacyId} items={items} suppliers={suppliers} ownerName={ownerName} used={used.items} onChanged={load} />}
      {view === "history" && (
        <History pharmacyId={pharmacyId} taskId={task.id} items={items} nameOf={nameOf} ownerName={ownerName} ownerStaffId={settings.consumables_owner_staff_id} pinStaffId={pinStaffId} initialSheetId={initialSheetId} />
      )}
    </div>
  );
}

// Delete only if never used (used ones can only be made inactive)
async function deleteRow(table, row, label) {
  if (!window.confirm(`Delete "${row.name}"? This can't be undone.`)) return false;
  const { error } = await supabase.from(table).delete().eq("id", row.id);
  if (error) { alert(`Couldn't delete the ${label}: ${error.message}`); return false; }
  return true;
}

// Swap display order with the neighbour (renumbers by 10s so gaps never run out)
async function move(table, list, index, dir) {
  const j = index + dir;
  if (j < 0 || j >= list.length) return;
  const order = [...list];
  [order[index], order[j]] = [order[j], order[index]];
  await Promise.all(order.map((row, i) => supabase.from(table).update({ sort_order: (i + 1) * 10 }).eq("id", row.id)));
}

// ─── Suppliers ───────────────────────────────────────────────────────────────
function Suppliers({ pharmacyId, suppliers, items, used, onChanged }) {
  // Deletable only if never on a sheet AND no item uses it (otherwise make it inactive)
  const canDelete = (s) => !used.has(String(s.id)) && !items.some((it) => String(it.supplier_id) === String(s.id));
  const blank = { name: "", phone: "", website: "", notes: "", supplier_type: "order", active: true };
  const [editing, setEditing] = useState(null); // supplier id | "new"
  const [form, setForm] = useState(blank);

  const startEdit = (s) => { setEditing(s ? s.id : "new"); setForm(s ? { ...blank, ...s } : blank); };
  const save = async () => {
    if (!form.name.trim()) { alert("Enter a supplier name."); return; }
    const row = {
      name: form.name.trim(), phone: form.phone?.trim() || null, website: form.website?.trim() || null,
      notes: form.notes?.trim() || null, supplier_type: form.supplier_type, active: form.active !== false,
    };
    const { error } = editing === "new"
      ? await supabase.from("consumable_suppliers").insert([{ ...row, pharmacy_id: pharmacyId, sort_order: (suppliers.length + 1) * 10 }])
      : await supabase.from("consumable_suppliers").update(row).eq("id", editing);
    if (error) { alert("Couldn't save: " + error.message); return; }
    setEditing(null);
    onChanged();
  };

  const formRow = (
    <div className="px-4 py-3 bg-blue-50 border-t space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" className={inputCls} />
        <input value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" className={inputCls} />
        <input value={form.website || ""} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="Website or email" className={inputCls} />
        <select value={form.supplier_type} onChange={(e) => setForm({ ...form, supplier_type: e.target.value })} className={inputCls}>
          {SUPPLIER_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
      </div>
      <textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Notes (how to order, account numbers…)" className={inputCls} />
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-sm text-gray-700">
          <input type="checkbox" checked={form.active !== false} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active
        </label>
        <div className="flex gap-2">
          <button onClick={() => setEditing(null)} className="px-3 py-1.5 text-xs border rounded bg-white">Cancel</button>
          <button onClick={save} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded">Save</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-700">Suppliers</div>
        <button onClick={() => startEdit(null)} className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg">+ Supplier</button>
      </div>
      {editing === "new" && formRow}
      {suppliers.map((s, i) => (
        <div key={s.id}>
          <div className={`px-4 py-2 border-t flex items-start gap-3 ${s.active === false ? "opacity-50" : ""}`}>
            <div className="flex flex-col">
              <button onClick={async () => { await move("consumable_suppliers", suppliers, i, -1); onChanged(); }} className="text-xs text-gray-400 hover:text-gray-700">▲</button>
              <button onClick={async () => { await move("consumable_suppliers", suppliers, i, 1); onChanged(); }} className="text-xs text-gray-400 hover:text-gray-700">▼</button>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-800">
                {s.name}
                <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${s.supplier_type === "in_person" ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
                  {SUPPLIER_TYPES.find((t) => t.key === s.supplier_type)?.label}
                </span>
                {s.active === false && <span className="ml-2 text-[10px] text-gray-500">Inactive</span>}
              </div>
              <div className="text-xs text-gray-500 space-x-2">{s.phone && <span>📞 {s.phone}</span>}{s.website && <span>🌐 {s.website}</span>}</div>
              {s.notes && <div className="text-xs text-gray-400 whitespace-pre-line">{s.notes}</div>}
            </div>
            <button onClick={() => startEdit(s)} className="px-2 py-1 text-xs border border-blue-200 text-blue-600 rounded">Edit</button>
            {canDelete(s) ? (
              <button onClick={async () => { if (await deleteRow("consumable_suppliers", s, "supplier")) onChanged(); }}
                className="px-2 py-1 text-xs border border-red-200 text-red-600 rounded">Delete</button>
            ) : (
              <span className="text-[10px] text-gray-400 w-16 text-center" title="Used on a checklist or by an item — make it inactive instead">in use</span>
            )}
          </div>
          {editing === s.id && formRow}
        </div>
      ))}
    </div>
  );
}

// ─── Items ───────────────────────────────────────────────────────────────────
function Items({ pharmacyId, items, suppliers, ownerName, used, onChanged }) {
  const blank = { name: "", item_group: "", supplier_id: "", check_only: false, reorder_qty: "", reorder_unit: "", delivery_time: "", owner_to_order: false, active: true };
  const display = displayOrder(items); // grouped items kept together (▲▼ moves within this order)
  const groupNames = [...new Set(items.map((it) => String(it.item_group || "").trim()).filter(Boolean))];
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blank);
  const supplierName = (id) => suppliers.find((s) => String(s.id) === String(id))?.name || "—";

  const startEdit = (it) => {
    setEditing(it ? it.id : "new");
    setForm(it ? { ...blank, ...it, item_group: it.item_group || "", supplier_id: it.supplier_id || "", reorder_qty: it.reorder_qty ?? "", reorder_unit: it.reorder_unit || "", delivery_time: it.delivery_time || "" } : blank);
  };
  const save = async () => {
    if (!form.name.trim()) { alert("Enter an item name."); return; }
    const qty = String(form.reorder_qty).trim();
    if (!form.check_only && (qty === "" || !Number.isFinite(Number(qty)))) { alert("Enter a reorder point, or tick Check only."); return; }
    const row = {
      name: form.name.trim(), item_group: String(form.item_group || "").trim() || null, supplier_id: form.supplier_id || null, check_only: !!form.check_only,
      reorder_qty: form.check_only ? null : Number(qty), reorder_unit: form.check_only ? null : (form.reorder_unit?.trim() || null),
      delivery_time: form.delivery_time?.trim() || null, owner_to_order: !!form.owner_to_order, active: form.active !== false,
    };
    const { error } = editing === "new"
      ? await supabase.from("consumable_items").insert([{ ...row, pharmacy_id: pharmacyId, sort_order: (items.length + 1) * 10 }])
      : await supabase.from("consumable_items").update(row).eq("id", editing);
    if (error) { alert("Couldn't save: " + error.message); return; }
    setEditing(null);
    onChanged();
  };

  const formRow = (
    <div className="px-4 py-3 bg-blue-50 border-t space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Item (incl. product codes)" className={`${inputCls} md:col-span-2`} />
        <input value={form.item_group} onChange={(e) => setForm({ ...form, item_group: e.target.value })} list="consumable-groups" placeholder="Group (optional, e.g. Paper bags)" className={inputCls} />
        <datalist id="consumable-groups">{groupNames.map((g) => <option key={g} value={g} />)}</datalist>
        <select value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })} className={inputCls}>
          <option value="">— Supplier —</option>
          {suppliers.filter((s) => s.active !== false || String(s.id) === String(form.supplier_id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-sm text-gray-700">
          <input type="checkbox" checked={!!form.check_only} onChange={(e) => setForm({ ...form, check_only: e.target.checked })} /> Check only (Low? yes/no)
        </label>
        {!form.check_only && (
          <>
            <span className="text-xs text-gray-500">Reorder at</span>
            <input value={form.reorder_qty} onChange={(e) => setForm({ ...form, reorder_qty: e.target.value.replace(/[^\d.]/g, "") })} placeholder="e.g. 20" className="w-20 rounded border border-gray-300 px-2 py-1.5 text-sm" />
            <input value={form.reorder_unit} onChange={(e) => setForm({ ...form, reorder_unit: e.target.value })} placeholder="unit (rolls, %…)" className="w-36 rounded border border-gray-300 px-2 py-1.5 text-sm" />
          </>
        )}
        <input value={form.delivery_time} onChange={(e) => setForm({ ...form, delivery_time: e.target.value })} placeholder="Delivery time" className="w-32 rounded border border-gray-300 px-2 py-1.5 text-sm" />
        <label className="flex items-center gap-1.5 text-sm text-gray-700">
          <input type="checkbox" checked={!!form.owner_to_order} onChange={(e) => setForm({ ...form, owner_to_order: e.target.checked })} /> {ownerName} to order
        </label>
        <label className="flex items-center gap-1.5 text-sm text-gray-700">
          <input type="checkbox" checked={form.active !== false} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={() => setEditing(null)} className="px-3 py-1.5 text-xs border rounded bg-white">Cancel</button>
        <button onClick={save} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded">Save</button>
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-gray-700">Items</div>
          <div className="text-xs text-gray-400">Shown on the checklist in this order. Changes apply to new months — past sheets keep what they had.</div>
        </div>
        <button onClick={() => startEdit(null)} className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg">+ Item</button>
      </div>
      {editing === "new" && formRow}
      {display.map((it, i) => (
        <div key={it.id}>
          <div className={`px-4 py-2 border-t flex items-center gap-3 ${it.active === false ? "opacity-50" : ""}`}>
            <div className="flex flex-col">
              <button onClick={async () => { await move("consumable_items", display, i, -1); onChanged(); }} className="text-xs text-gray-400 hover:text-gray-700">▲</button>
              <button onClick={async () => { await move("consumable_items", display, i, 1); onChanged(); }} className="text-xs text-gray-400 hover:text-gray-700">▼</button>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-800">
                {it.item_group && <span className="mr-1.5 text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{it.item_group}</span>}
                {it.name}{it.active === false && <span className="ml-2 text-[10px] text-gray-500">Inactive</span>}
              </div>
              <div className="text-xs text-gray-500">
                {supplierName(it.supplier_id)} · {it.check_only ? "Check only" : `reorder at ${fmtReorder(it)}`}
                {it.delivery_time && ` · ${it.delivery_time}`}
                {it.owner_to_order && <span className="ml-1 text-purple-700">· {ownerName} to order</span>}
              </div>
            </div>
            <button onClick={() => startEdit(it)} className="px-2 py-1 text-xs border border-blue-200 text-blue-600 rounded">Edit</button>
            {!used.has(String(it.id)) ? (
              <button onClick={async () => { if (await deleteRow("consumable_items", it, "item")) onChanged(); }}
                className="px-2 py-1 text-xs border border-red-200 text-red-600 rounded">Delete</button>
            ) : (
              <span className="text-[10px] text-gray-400 w-16 text-center" title="Used on a checklist — make it inactive instead">in use</span>
            )}
          </div>
          {editing === it.id && formRow}
        </div>
      ))}
    </div>
  );
}

// ─── History ─────────────────────────────────────────────────────────────────
function History({ pharmacyId, taskId, items, nameOf, ownerName, ownerStaffId, pinStaffId, initialSheetId }) {
  const [sheets, setSheets] = useState(null);
  const [openId, setOpenId] = useState(initialSheetId || null);
  const [byItem, setByItem] = useState("");
  const [itemLines, setItemLines] = useState(null);

  const [sheetLines, setSheetLines] = useState([]); // order state per sheet, for "Counted — N still to order"
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("checklist_sheets").select("*").eq("pharmacy_id", pharmacyId).eq("task_id", Number(taskId))
        .order("period_month", { ascending: false });
      const ids = (data || []).map((s) => s.id);
      const lines = ids.length
        ? await fetchAllRows(() => supabase.from("checklist_lines").select("id, sheet_id, result, ordered, not_ordering").in("sheet_id", ids).order("id")).catch(() => [])
        : [];
      setSheetLines(lines);
      setSheets(data || []);
    })();
  }, [pharmacyId, taskId, openId]);

  useEffect(() => {
    if (!byItem) { setItemLines(null); return; }
    supabase.from("checklist_lines").select("id, sheet_id, result, ordered, ordered_at, bought_at, qty_on_hand, is_low")
      .eq("item_id", byItem).in("result", ["order", "owner", "shopping"])
      .then(({ data }) => setItemLines(data || []));
  }, [byItem]); // lines from other tasks' sheets drop out below (only this task's sheets are matched)

  if (openId) return <SheetView sheetId={openId} nameOf={nameOf} ownerName={ownerName} ownerStaffId={ownerStaffId} pinStaffId={pinStaffId} onBack={() => setOpenId(null)} />;

  const sheetById = Object.fromEntries((sheets || []).map((s) => [s.id, s]));
  const short = (d) => new Date(`${String(d).slice(0, 7)}-01T00:00:00`).toLocaleDateString("en-AU", { month: "short", year: "numeric" });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-4 py-3 border-b text-sm font-semibold text-gray-700">By month</div>
        {sheets === null ? <div className="px-4 py-4 text-sm text-gray-400">Loading…</div>
          : sheets.length === 0 ? <div className="px-4 py-4 text-sm text-gray-400">No checklists yet.</div>
          : sheets.map((s) => (
            <button key={s.id} onClick={() => setOpenId(s.id)} className="w-full text-left px-4 py-2 border-t hover:bg-gray-50 flex items-center justify-between">
              <span className="text-sm text-gray-800">{monthName(s.period_month)}</span>
              {(() => {
                const mine = sheetLines.filter((l) => l.sheet_id === s.id);
                return (
                  <span className={`text-[11px] px-2 py-0.5 rounded-full border ${statusStyle(s, mine)}`}>
                    {sheetStatusLabel(s, mine)}
                    {s.status === "completed" && ` · ${fmtDateShort(perthDateOf(s.completed_at))} · ${nameOf(s.completed_by_staff_id) || "—"}`}
                  </span>
                );
              })()}
            </button>
          ))}
      </div>
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-4 py-3 border-b text-sm font-semibold text-gray-700">By item</div>
        <div className="p-4 space-y-3">
          <select value={byItem} onChange={(e) => setByItem(e.target.value)} className={inputCls}>
            <option value="">— Pick an item —</option>
            {items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
          </select>
          {itemLines && (itemLines.length === 0 ? <p className="text-sm text-gray-400">Never flagged.</p> : (() => {
            const rows = itemLines.map((l) => ({ ...l, sheet: sheetById[l.sheet_id] })).filter((l) => l.sheet)
              .sort((a, b) => String(a.sheet.period_month).localeCompare(String(b.sheet.period_month)));
            const ordered = rows.filter((l) => l.ordered || l.bought_at).map((l) => short(l.sheet.period_month));
            return (
              <div className="space-y-2">
                <p className="text-sm text-gray-700">{ordered.length ? `Ordered / bought: ${ordered.join(", ")}` : "Flagged but not yet ordered."}</p>
                <div className="divide-y border rounded">
                  {rows.map((l) => (
                    <div key={l.id} className="px-3 py-1.5 text-xs flex justify-between">
                      <span>{short(l.sheet.period_month)} · {RESULT_LABEL[l.result]}</span>
                      <span className="text-gray-500">
                        {l.ordered ? `Ordered ${fmtDateShort(perthDateOf(l.ordered_at))}` : l.bought_at ? `Bought ${fmtDateShort(perthDateOf(l.bought_at))}` : "Not ordered"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })())}
        </div>
      </div>
    </div>
  );
}

// One month's sheet, read-only — except the owner can tick their "to order" lines. Printable.
// Owner-to-order ticks here are recorded as the owner-to-order person (the Tasks PIN may be shared, so it can't say
// who's at the desk); staff Order ticks are recorded as whoever unlocked the Tasks page.
function SheetView({ sheetId, nameOf, ownerName, ownerStaffId, pinStaffId, onBack }) {
  const [sheet, setSheet] = useState(null);
  const [lines, setLines] = useState([]);
  const [error, setError] = useState("");

  const load = async () => {
    const [{ data: s, error: e1 }, { data: l, error: e2 }] = await Promise.all([
      supabase.from("checklist_sheets").select("*").eq("id", sheetId).maybeSingle(),
      supabase.from("checklist_lines").select("*").eq("sheet_id", sheetId).order("sort_order"),
    ]);
    setError(e1 || e2 ? (e1 || e2).message : !s ? "Sheet not found" : "");
    setSheet(s || null);
    setLines(l || []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [sheetId]);

  const entry = (l) => (l.check_only ? (l.is_low === true ? "Low" : l.is_low === false ? "OK" : "—") : (l.qty_on_hand ?? "—"));
  const status = (l) => (l.ordered ? `Ordered ${fmtDateShort(perthDateOf(l.ordered_at))} · ${nameOf(l.ordered_by_staff_id) || "—"}`
    : l.not_ordering ? `Not ordering ${fmtDateShort(perthDateOf(l.not_ordering_at))} · ${nameOf(l.not_ordering_by_staff_id) || "—"}${l.not_ordering_note ? ` · “${l.not_ordering_note}”` : ""}`
    : isOpenOrder(l) ? "Still to order"
    : l.bought_at ? `Bought ${fmtDateShort(perthDateOf(l.bought_at))} · ${nameOf(l.bought_by_staff_id) || "—"}`
    : l.result === "shopping" ? "On the shopping list" : "");

  const print = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    const row = (l, inGroup) => `<tr><td${inGroup ? ' style="padding-left:18px"' : ""}>${esc(inGroup ? nameInGroup(l) : l.item_name)}</td><td>${esc(l.supplier_name || "")}</td><td>${esc(fmtReorder(l))}</td><td>${esc(entry(l))}</td><td>${esc(l.result === "owner" ? `${ownerName} to order` : RESULT_LABEL[l.result] || "")}</td><td>${esc(status(l))}</td></tr>`;
    // Grouped items under one heading row (group + supplier), each type on its own row
    const rows = groupedRows(lines).map((sec) => (sec.group
      ? `<tr><td colspan="6" style="background:#f9fafb;font-weight:600">${esc(sec.group)}${groupSupplier(sec.rows) ? ` <span style="font-weight:400;color:#666">· ${esc(groupSupplier(sec.rows))}</span>` : ""}</td></tr>${sec.rows.map((l) => row(l, true)).join("")}`
      : row(sec.rows[0], false))).join("");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Consumables — ${esc(monthName(sheet.period_month))}</title>
      <style>body{font:12px system-ui,sans-serif;margin:24px;color:#111}h1{font-size:18px;margin:0 0 4px}p{margin:0 0 12px;color:#555}
      table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}th{background:#f3f4f6}</style>
      </head><body><h1>Consumables Checklist — ${esc(monthName(sheet.period_month))}</h1>
      <p>Started ${esc(fmtDateShort(perthDateOf(sheet.started_at)))} by ${esc(nameOf(sheet.started_by_staff_id) || "—")}${sheet.completed_at ? ` · Completed ${esc(fmtDateShort(perthDateOf(sheet.completed_at)))} by ${esc(nameOf(sheet.completed_by_staff_id) || "—")}` : " · In progress"}</p>
      <table><thead><tr><th>Item</th><th>Supplier</th><th>Reorder at</th><th>On hand / Low</th><th>Result</th><th>Ordered / bought</th></tr></thead><tbody>${rows}</tbody></table>
      <script>window.onload=function(){window.print()}</script></body></html>`);
    w.document.close();
  };

  if (error) return <div className="bg-white rounded-xl border p-4 text-sm text-red-500">{error} <button onClick={onBack} className="ml-2 text-blue-600">Back</button></div>;
  if (!sheet) return <div className="text-sm text-gray-400 py-8 text-center">Loading…</div>;

  const orderLines = lines.filter((l) => l.result === "order");
  const ownerLines = lines.filter((l) => l.result === "owner");
  const onLineSaved = (saved) => setLines((ls) => ls.map((x) => (x.id === saved.id ? saved : x)));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-sm text-blue-600">‹ History</button>
        <button onClick={print} className="px-3 py-1.5 text-xs border rounded-lg bg-white hover:bg-gray-50">🖨 Print</button>
      </div>
      <div className="bg-white rounded-xl border p-4">
        <div className="text-base font-semibold text-gray-800">Consumables Checklist — {monthName(sheet.period_month)}</div>
        <div className="text-xs text-gray-500 mt-0.5">
          Started {fmtDateShort(perthDateOf(sheet.started_at))} by {nameOf(sheet.started_by_staff_id) || "—"}
          {sheet.completed_at ? ` · Counted ${fmtDateShort(perthDateOf(sheet.completed_at))} by ${nameOf(sheet.completed_by_staff_id) || "—"}` : ""}
        </div>
        <div className={`mt-1 inline-block text-[11px] px-2 py-0.5 rounded-full border ${statusStyle(sheet, lines)}`}>{sheetStatusLabel(sheet, lines)}</div>
      </div>

      {/* Orders can still be ticked after the count is locked (who = whoever unlocked the Tasks page with their PIN) */}
      {ownerLines.length > 0 && (
        <div className="bg-white rounded-xl border border-purple-200 p-4">
          <div className="text-sm font-semibold text-purple-800 mb-2">For {ownerName} to order</div>
          <OrderLines lines={ownerLines} staffId={ownerStaffId || pinStaffId} nameOf={nameOf} tone="purple" onChanged={onLineSaved} />
        </div>
      )}

      {orderLines.length > 0 && (
        <div className="bg-white rounded-xl border p-4">
          <div className="text-sm font-semibold text-gray-700 mb-2">Order summary</div>
          <OrderLines lines={orderLines} staffId={pinStaffId} nameOf={nameOf} onChanged={onLineSaved} />
        </div>
      )}

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b">
            <tr>
              {["Item", "Supplier", "Reorder at", "On hand / Low", "Result", "Ordered / bought"].map((h) => (
                <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groupedRows(lines).flatMap((sec) => [
              ...(sec.group ? [{ header: sec }] : []),
              ...sec.rows.map((l) => ({ line: l, inGroup: !!sec.group })),
            ]).map((r) => (r.header ? (
              <tr key={`g-${r.header.group}`} className="border-t bg-gray-50">
                <td colSpan={6} className="px-3 py-1.5 font-semibold text-gray-700">
                  {r.header.group}{groupSupplier(r.header.rows) && <span className="font-normal text-gray-400"> · {groupSupplier(r.header.rows)}</span>}
                </td>
              </tr>
            ) : (({ line: l, inGroup }) => (
              <tr key={l.id} className="border-t">
                <td className={`py-1.5 text-gray-800 ${inGroup ? "pl-6 pr-3" : "px-3"}`}>{inGroup ? nameInGroup(l) : l.item_name}</td>
                <td className="px-3 py-1.5 text-gray-600">{l.supplier_name || "—"}</td>
                <td className="px-3 py-1.5 text-gray-600">{fmtReorder(l)}</td>
                <td className="px-3 py-1.5 text-gray-600">{entry(l)}</td>
                <td className="px-3 py-1.5">
                  {l.result
                    ? <span className={`px-1.5 py-0.5 rounded border ${RESULT_STYLE[l.result]}`}>{l.result === "owner" ? `${ownerName} to order` : RESULT_LABEL[l.result]}</span>
                    : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-3 py-1.5 text-gray-500">{status(l)}</td>
              </tr>
            ))(r)))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
