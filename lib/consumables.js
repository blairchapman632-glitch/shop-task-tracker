// Consumables checklist (Part B) — shared by the kiosk sheet (components/ConsumablesSheet.js) and
// Tasks → Consumables (components/ConsumablesAdmin.js). Browser client (RLS off, like the rest of the app).
// Tables: consumable_suppliers, consumable_items, checklist_sheets + checklist_lines (kind 'consumables'),
// shopping_list_items (kiosk 🛒 card; low "Buy in person" items are added there automatically, one line per part).
// Which tasks have the checklist: tasks.checklist_type = 'consumables' (set on the task in Recurring tasks).
// Settings: pharmacy_settings.consumables_owner_staff_id ("<name> to order"). Items, suppliers and the owner are
// pharmacy-wide — shared by every consumables checklist task. (pharmacy_settings.consumables_task_id is no longer used.)

export const CHECKLIST_TYPES = [{ key: "consumables", label: "Consumables (stock count)" }];
export const checklistTypeLabel = (key) => CHECKLIST_TYPES.find((t) => t.key === key)?.label || key;
export const isConsumablesChecklist = (task) => task?.checklist_type === "consumables";

export const SUPPLIER_TYPES = [
  { key: "order", label: "Order" },
  { key: "in_person", label: "Buy in person" },
];

export const RESULT_LABEL = { ok: "OK", order: "Order", owner: "Owner to order", shopping: "Shopping list" };
export const RESULT_STYLE = {
  ok: "bg-green-50 text-green-700 border-green-200",
  order: "bg-amber-50 text-amber-700 border-amber-200",
  owner: "bg-purple-50 text-purple-700 border-purple-200",
  shopping: "bg-blue-50 text-blue-700 border-blue-200",
};

// "20 rolls", "1.5 boxes", "50 %", "10"
export const fmtReorder = (x) => {
  if (x.check_only) return "Check only";
  const n = Number(x.reorder_qty);
  const num = Number.isInteger(n) ? String(n) : String(n);
  return x.reorder_unit ? `${num}${x.reorder_unit === "%" ? "%" : ` ${x.reorder_unit}`}` : num;
};

// What a line comes out as, from what was entered. null = nothing entered yet.
//   numbered:   above the reorder point = OK; at or below = order / owner / shopping
//   check only: Low? no = OK; yes = order / owner / shopping
// owner_to_order wins; then a "Buy in person" supplier = shopping list; else Order.
export function lineResult(line) {
  let low;
  if (line.check_only) {
    if (line.is_low === null || line.is_low === undefined) return null;
    low = line.is_low === true;
  } else {
    if (line.qty_on_hand === null || line.qty_on_hand === undefined || line.qty_on_hand === "") return null;
    low = Number(line.qty_on_hand) <= Number(line.reorder_qty);
  }
  if (!low) return "ok";
  if (line.owner_to_order) return "owner";
  if (line.supplier_type === "in_person") return "shopping";
  return "order";
}

export async function loadConsumablesSettings(supabase, pharmacyId) {
  const { data, error } = await supabase.from("pharmacy_settings")
    .select("consumables_owner_staff_id").eq("pharmacy_id", pharmacyId).maybeSingle();
  if (error) throw error;
  return { ownerStaffId: data?.consumables_owner_staff_id ?? null };
}

// The month's sheet for this task — created (with a snapshot of every active item + its supplier) if it doesn't
// exist yet. Two kiosks opening it at once: the unique index keeps one, the loser just reloads it.
export async function loadOrCreateSheet(supabase, { pharmacyId, taskId, periodMonth, staffId }) {
  const find = () => supabase.from("checklist_sheets").select("*").eq("task_id", Number(taskId)).eq("period_month", periodMonth).maybeSingle();
  let { data: sheet, error } = await find();
  if (error) throw error;
  if (!sheet) {
    const [{ data: items, error: iErr }, { data: suppliers, error: sErr }] = await Promise.all([
      supabase.from("consumable_items").select("*").eq("pharmacy_id", pharmacyId).eq("active", true).order("sort_order"),
      supabase.from("consumable_suppliers").select("*").eq("pharmacy_id", pharmacyId),
    ]);
    if (iErr || sErr) throw iErr || sErr;
    const { data: created, error: cErr } = await supabase.from("checklist_sheets").insert([{
      pharmacy_id: pharmacyId, kind: "consumables", task_id: Number(taskId), period_month: periodMonth,
      status: "in_progress", started_by_staff_id: staffId ? Number(staffId) : null,
    }]).select("*").single();
    if (cErr) {
      if (cErr.code === "23505") { ({ data: sheet, error } = await find()); if (error) throw error; }
      else throw cErr;
    } else {
      sheet = created;
      const supplierOf = (id) => (suppliers || []).find((s) => String(s.id) === String(id)) || null;
      const rows = (items || []).map((it, i) => {
        const s = supplierOf(it.supplier_id);
        return {
          pharmacy_id: pharmacyId, sheet_id: sheet.id, item_id: it.id, sort_order: it.sort_order ?? i,
          item_name: it.name, item_group: it.item_group || null, supplier_id: s?.id || null, supplier_name: s?.name || null, supplier_type: s?.supplier_type || null,
          supplier_phone: s?.phone || null, supplier_website: s?.website || null, supplier_notes: s?.notes || null,
          delivery_time: it.delivery_time, check_only: it.check_only, reorder_qty: it.reorder_qty, reorder_unit: it.reorder_unit,
          owner_to_order: it.owner_to_order, ask_question: it.ask_details ? (String(it.ask_question || "").trim() || "What's needed?") : null,
        };
      });
      if (rows.length) {
        const { error: lErr } = await supabase.from("checklist_lines").insert(rows);
        if (lErr) throw lErr;
      }
    }
  }
  const { data: lines, error: lErr } = await supabase.from("checklist_lines").select("*").eq("sheet_id", sheet.id).order("sort_order");
  if (lErr) throw lErr;
  return { sheet, lines: lines || [] };
}

// Items (or sheet lines) laid out for display: rows with the same Group sit together under one heading, at the
// position of the group's first row; rows with no group stand alone. -> [{ group: string|null, rows: [...] }]
// Works for consumable_items (item_group) and checklist_lines (item_group snapshot).
export function groupedRows(rows) {
  const sorted = [...(rows || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const out = [];
  const byGroup = new Map();
  for (const r of sorted) {
    const g = String(r.item_group || "").trim();
    if (!g) { out.push({ group: null, rows: [r] }); continue; }
    if (!byGroup.has(g)) { const sec = { group: g, rows: [] }; byGroup.set(g, sec); out.push(sec); }
    byGroup.get(g).rows.push(r);
  }
  return out;
}
// Flat list in display order (groups kept together) — e.g. for ▲▼ ordering in Checklists → Items
export const displayOrder = (rows) => groupedRows(rows).flatMap((s) => s.rows);
// Row name under its group heading: "Paper bags – Medium (PB050)" -> "Medium (PB050)"
export const nameInGroup = (row) => {
  const g = String(row.item_group || "").trim();
  const n = String(row.item_name ?? row.name ?? "");
  if (!g) return n;
  const m = n.match(new RegExp(`^${g.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[–—-]\\s*`, "i"));
  return m ? n.slice(m[0].length) : n;
};
// ── "Ask what's needed when low" (consumable_items.ask_details; the line snapshots ask_question, answer in details) ──
// The question box shows once the line is low (any result but OK); the answer only shows while it's low.
export const asksDetails = (l) => !!l.ask_question && !!l.result && l.result !== "ok";
export const lineDetails = (l) => (asksDetails(l) ? String(l.details || "").trim() : "");
// "Ancillary labels — 1, 9, 14"
export const withDetails = (name, l) => (lineDetails(l) ? `${name} — ${lineDetails(l)}` : name);

// The supplier(s) shown in a group heading
export const groupSupplier = (rows) => [...new Set(rows.map((r) => r.supplier_name).filter(Boolean))].join(" / ");

// ── Follow-up orders ──
// A line still to order: an Order or Owner line that's neither ticked Ordered nor marked "Not ordering".
// A completed sheet stays "Counted — N still to order" until every one is closed (kiosk follow-up cards, History),
// and only then counts as done in Insights Schedule Compliance. (Points are awarded when the count is completed.)
export const isOpenOrder = (l) => (l.result === "order" || l.result === "owner") && !l.ordered && !l.not_ordering;
export const openOrderCount = (lines) => (lines || []).filter(isOpenOrder).length;
export const sheetStatusLabel = (sheet, lines) => {
  if (sheet.status !== "completed") return "In progress";
  const n = openOrderCount(lines);
  return n ? `Counted — ${n} still to order` : "Complete";
};
export const ORDER_LINE_COLUMNS = "id, sheet_id, item_name, item_group, sort_order, result, ask_question, details, supplier_id, supplier_name, supplier_phone, supplier_website, supplier_notes, delivery_time, ordered, ordered_by_staff_id, ordered_at, not_ordering, not_ordering_by_staff_id, not_ordering_at, not_ordering_note";

// Tick Ordered (or untick) / mark Not ordering (or undo) — records who + when. Allowed after the sheet is locked
// (only the counts lock). -> the saved line
export async function setOrderState(supabase, line, state, staffId, note = null) {
  const now = new Date().toISOString();
  const who = staffId ? Number(staffId) : null;
  const patch =
    state === "ordered" ? { ordered: true, ordered_by_staff_id: who, ordered_at: now, not_ordering: false, not_ordering_by_staff_id: null, not_ordering_at: null, not_ordering_note: null }
    : state === "not_ordering" ? { not_ordering: true, not_ordering_by_staff_id: who, not_ordering_at: now, not_ordering_note: note ? String(note).trim().slice(0, 300) || null : null, ordered: false, ordered_by_staff_id: null, ordered_at: null }
    : { ordered: false, ordered_by_staff_id: null, ordered_at: null, not_ordering: false, not_ordering_by_staff_id: null, not_ordering_at: null, not_ordering_note: null };
  const { data, error } = await supabase.from("checklist_lines").update(patch).eq("id", line.id).select("*").single();
  if (error) throw error;
  return data;
}

// Lines grouped by supplier (supplier phone / website / notes from the snapshot). which = "order" | "owner" | "any"
export function supplierGroups(lines, which = "any") {
  const groups = new Map();
  for (const l of (lines || []).filter((x) => (which === "any" ? true : x.result === which))) {
    const key = l.supplier_id || l.supplier_name || "—";
    if (!groups.has(key)) {
      groups.set(key, { key, name: l.supplier_name || "No supplier", phone: l.supplier_phone, website: l.supplier_website, notes: l.supplier_notes, lines: [] });
    }
    groups.get(key).lines.push(l);
  }
  return [...groups.values()];
}

// Order summary: "Order" lines grouped by supplier (supplier phone / website / notes from the snapshot)
export function orderGroups(lines) {
  const groups = new Map();
  for (const l of lines.filter((x) => x.result === "order")) {
    const key = l.supplier_id || l.supplier_name || "—";
    if (!groups.has(key)) {
      groups.set(key, { key, name: l.supplier_name || "No supplier", phone: l.supplier_phone, website: l.supplier_website, notes: l.supplier_notes, lines: [] });
    }
    groups.get(key).lines.push(l);
  }
  return [...groups.values()];
}

// ── Shopping list (low "Buy in person" lines) ──
// One shopping list line per thing to buy, each linked to its checklist line (shopping_list_items.checklist_line_id).
// Details "coffee, biscuits" -> "Coffee", "Biscuits"; no details -> one line with the item name.
export const splitDetails = (text) => {
  const seen = new Set();
  return String(text || "").split(/[,\n]/).map((p) => p.trim()).filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .filter((p) => { const k = p.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
};
const shoppingParts = (line) => (lineDetails(line) ? splitDetails(lineDetails(line)) : [line.item_name]);

// The checklist line counts as bought only when every one of its shopping lines (not removed) is bought — then it
// takes the latest bought date + who. -> the saved checklist line
export async function refreshLineBought(supabase, lineId) {
  const { data: items, error } = await supabase.from("shopping_list_items").select("bought_at, bought_by_staff_id")
    .eq("checklist_line_id", lineId).is("removed_at", null);
  if (error) throw error;
  const all = (items || []).length > 0 && items.every((x) => x.bought_at);
  const last = all ? [...items].sort((a, b) => String(b.bought_at).localeCompare(String(a.bought_at)))[0] : null;
  const { data, error: uErr } = await supabase.from("checklist_lines")
    .update({ bought_at: last?.bought_at || null, bought_by_staff_id: last?.bought_by_staff_id || null })
    .eq("id", lineId).select("*").single();
  if (uErr) throw uErr;
  return data;
}

// Keep a "shopping" line's shopping list lines in step with its details: add new parts, take parts no longer listed
// off the list (kept, marked removed), never touch parts already bought. -> the saved checklist line
export async function syncShoppingLines(supabase, { pharmacyId, line, staffId }) {
  const { data: existing, error } = await supabase.from("shopping_list_items").select("id, name, bought_at")
    .eq("checklist_line_id", line.id).is("removed_at", null);
  if (error) throw error;
  const want = shoppingParts(line);
  const wantKeys = new Set(want.map((p) => p.toLowerCase()));
  const haveKeys = new Set((existing || []).map((x) => String(x.name).toLowerCase()));
  const drop = (existing || []).filter((x) => !x.bought_at && !wantKeys.has(String(x.name).toLowerCase())).map((x) => x.id);
  if (drop.length) {
    const { error: dErr } = await supabase.from("shopping_list_items")
      .update({ removed_at: new Date().toISOString(), removed_by_staff_id: staffId ? Number(staffId) : null })
      .in("id", drop).is("bought_at", null);
    if (dErr) throw dErr;
  }
  for (const name of want.filter((p) => !haveKeys.has(p.toLowerCase()))) {
    const { error: iErr } = await supabase.from("shopping_list_items").insert([{
      pharmacy_id: pharmacyId, name, supplier_id: line.supplier_id || null, consumable_item_id: line.item_id || null,
      checklist_line_id: line.id, source: "consumables", added_by_staff_id: null,
    }]);
    if (iErr && iErr.code !== "23505") throw iErr; // 23505 = already added (another kiosk / double tap)
  }
  return refreshLineBought(supabase, line.id);
}

// The line no longer needs buying (count corrected): take its open shopping list lines off the list (kept, marked
// removed). Bought ones stay. -> the saved checklist line
export async function withdrawFromShoppingList(supabase, { lineId, staffId }) {
  const { error } = await supabase.from("shopping_list_items")
    .update({ removed_at: new Date().toISOString(), removed_by_staff_id: staffId ? Number(staffId) : null })
    .eq("checklist_line_id", lineId).eq("source", "consumables").is("bought_at", null).is("removed_at", null);
  if (error) throw error;
  return refreshLineBought(supabase, lineId);
}
