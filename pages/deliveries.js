import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function isDueOn(c, dateStr) {
  if (!c.active || !c.is_recurring) return false;
  const d = new Date(dateStr + "T00:00:00");
  if (c.recurring_day !== d.getDay()) return false;
  const weeks = c.recurrence_weeks || 1;
  if (weeks === 1) return true;
  if (!c.anchor_date) return true;
  const anchor = new Date(c.anchor_date + "T00:00:00");
  const diffDays = Math.round((d - anchor) / 86400000);
  if (diffDays < 0) return false;
  return diffDays % (weeks * 7) === 0;
}

export default function Deliveries() {
  const [tab, setTab] = useState("upcoming");
  const [customers, setCustomers] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [staff, setStaff] = useState([]);
  const [runDate, setRunDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [builtDates, setBuiltDates] = useState([]);

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    loadDeliveries();
  }, [runDate]);

  async function loadAll() {
    setLoading(true);
    const [{ data: c }, { data: s }] = await Promise.all([
      supabase
        .from("delivery_customers")
        .select("*")
        .eq("pharmacy_id", PHARMACY_ID)
        .order("name"),
      supabase
        .from("staff")
        .select("id, name, is_driver")
        .eq("pharmacy_id", PHARMACY_ID)
        .order("name"),
    ]);
    setCustomers(c || []);
    setStaff(s || []);
    const { data: bd } = await supabase
      .from("deliveries")
      .select("delivery_date")
      .eq("pharmacy_id", PHARMACY_ID)
      .gte("delivery_date", new Date().toISOString().slice(0, 10));
    setBuiltDates([...new Set((bd || []).map((x) => x.delivery_date))]);
    await loadDeliveries();
    setLoading(false);
  }

  async function loadDeliveries() {
    const { data } = await supabase
      .from("deliveries")
      .select("*, delivery_customers(*)")
      .eq("pharmacy_id", PHARMACY_ID)
      .eq("delivery_date", runDate)
      .order("sequence", { nullsFirst: false });
    setDeliveries(data || []);
  }

  async function buildRun() {
    const recurring = customers.filter((c) => isDueOn(c, runDate));
    const existing = new Set(deliveries.map((d) => d.delivery_customer_id));
    const toAdd = recurring.filter((c) => !existing.has(c.id));
    if (toAdd.length === 0) {
      alert("No new recurring customers for that day.");
      return;
    }
    const maxSeq = deliveries.reduce((m, d) => Math.max(m, d.sequence || 0), 0);
    const rows = toAdd.map((c, i) => ({
      pharmacy_id: PHARMACY_ID,
      delivery_customer_id: c.id,
      delivery_date: runDate,
      payment_status: c.payment_default,
      sequence: maxSeq + i + 1,
    }));
    const { error } = await supabase.from("deliveries").insert(rows);
    if (error) {
      alert("Error: " + error.message);
      return;
    }
    loadDeliveries();
  }

  async function addOneOff(customerId) {
    const c = customers.find((x) => String(x.id) === String(customerId));
    if (!c) return;
    const maxSeq = deliveries.reduce((m, d) => Math.max(m, d.sequence || 0), 0);
    const { error } = await supabase.from("deliveries").insert({
      pharmacy_id: PHARMACY_ID,
      delivery_customer_id: c.id,
      delivery_date: runDate,
      payment_status: c.payment_default,
      sequence: maxSeq + 1,
    });
    if (error) {
      alert("Error: " + error.message);
      return;
    }
    loadDeliveries();
  }

  async function updateDelivery(id, patch) {
    const { error } = await supabase.from("deliveries").update(patch).eq("id", id);
    if (error) {
      alert("Error: " + error.message);
      return;
    }
    loadDeliveries();
  }

  async function removeDelivery(id) {
    if (!confirm("Remove this delivery from the run?")) return;
    await supabase.from("deliveries").delete().eq("id", id);
    loadDeliveries();
  }

  async function saveCustomer(form) {
    const payload = {
      pharmacy_id: PHARMACY_ID,
      name: form.name,
      address: form.address,
      phone: form.phone || null,
      notes: form.notes || null,
      is_recurring: form.is_recurring,
      recurring_day: form.is_recurring ? Number(form.recurring_day) : null,
      recurrence_weeks: form.is_recurring ? Number(form.recurrence_weeks) : 1,
      anchor_date: form.is_recurring && form.anchor_date ? form.anchor_date : null,
      payment_default: form.payment_default,
      payment_note: form.payment_note || null,
      active: form.active,
    };
    let error;
    if (editingCustomer) {
      ({ error } = await supabase
        .from("delivery_customers")
        .update(payload)
        .eq("id", editingCustomer.id));
    } else {
      ({ error } = await supabase.from("delivery_customers").insert(payload));
    }
    if (error) {
      alert("Error: " + error.message);
      return;
    }
    setShowCustomerForm(false);
    setEditingCustomer(null);
    loadAll();
  }

  const done = deliveries.filter((d) => d.status === "delivered").length;

  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-slate-800">Deliveries</h1>
          <a href="/" className="text-sm text-sky-600">
            ← Home
          </a>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setTab("upcoming")}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              tab === "upcoming" ? "bg-sky-600 text-white" : "bg-white text-slate-600"
            }`}
          >
            Upcoming
          </button>
          <button
            onClick={() => setTab("run")}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              tab === "run" ? "bg-sky-600 text-white" : "bg-white text-slate-600"
            }`}
          >
            Run
          </button>
          <button
            onClick={() => setTab("customers")}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              tab === "customers" ? "bg-sky-600 text-white" : "bg-white text-slate-600"
            }`}
          >
            Customers
          </button>
        </div>

        {tab === "run" && (
          <div>
            <div className="bg-white rounded-lg p-4 mb-4 flex flex-wrap items-center gap-3">
              <input
                type="date"
                value={runDate}
                onChange={(e) => setRunDate(e.target.value)}
                className="border rounded px-3 py-2 text-sm"
              />
              <button
                onClick={buildRun}
                className="bg-sky-600 text-white px-4 py-2 rounded text-sm font-medium"
              >
                Build run
              </button>
              <select
                onChange={(e) => {
                  if (e.target.value) addOneOff(e.target.value);
                  e.target.value = "";
                }}
                className="border rounded px-3 py-2 text-sm"
                defaultValue=""
              >
                <option value="">+ Add customer…</option>
                {customers
                  .filter((c) => c.active)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
              <span className="text-sm text-slate-500 ml-auto">
                {done} / {deliveries.length} delivered
              </span>
            </div>

            {deliveries.length === 0 && (
              <div className="bg-white rounded-lg p-6 text-center text-slate-500 text-sm">
                No deliveries for this date.
              </div>
            )}

            <div className="space-y-2">
              {deliveries.map((d) => (
                <DeliveryRow
                  key={d.id}
                  d={d}
                  staff={staff}
                  onUpdate={updateDelivery}
                  onRemove={removeDelivery}
                />
              ))}
            </div>
          </div>
        )}

        {tab === "upcoming" && (
          <div className="space-y-3">
            {(() => {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const out = [];
              for (let i = 0; i < 28; i++) {
                const d = new Date(today);
                d.setDate(d.getDate() + i);
                const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                const due = customers.filter((c) => isDueOn(c, iso));
                if (due.length === 0) continue;
                out.push({ iso, d, due, built: builtDates.includes(iso) });
              }
              if (out.length === 0)
                return (
                  <div className="bg-white rounded-lg p-6 text-center text-slate-500 text-sm">
                    No recurring deliveries scheduled in the next 4 weeks.
                  </div>
                );
              return out.map(({ iso, d, due, built }) => (
                <div key={iso} className="bg-white rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium text-slate-800">
                      {d.toLocaleDateString("en-AU", {
                        weekday: "long",
                        day: "numeric",
                        month: "short",
                      })}
                      <span className="ml-2 text-sm font-normal text-slate-400">
                        {due.length} {due.length === 1 ? "drop" : "drops"}
                      </span>
                    </div>
                    {built ? (
                      <button
                        onClick={() => {
                          setRunDate(iso);
                          setTab("run");
                        }}
                        className="text-sm text-emerald-600 font-medium"
                      >
                        ✓ Built — open
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setRunDate(iso);
                          setTab("run");
                        }}
                        className="text-sm text-sky-600 font-medium"
                      >
                        Open →
                      </button>
                    )}
                  </div>
                  <div className="text-sm text-slate-600 space-y-0.5">
                    {due.map((c) => (
                      <div key={c.id}>
                        {c.name}
                        <span className="text-slate-400"> · {c.address}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ));
            })()}
          </div>
        )}

        {tab === "customers" && (
          <div>
            <button
              onClick={() => {
                setEditingCustomer(null);
                setShowCustomerForm(true);
              }}
              className="bg-sky-600 text-white px-4 py-2 rounded text-sm font-medium mb-4"
            >
              + New customer
            </button>

            <div className="space-y-2">
              {customers.map((c) => (
                <div
                  key={c.id}
                  className={`bg-white rounded-lg p-4 ${!c.active ? "opacity-50" : ""}`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium text-slate-800">{c.name}</div>
                      <div className="text-sm text-slate-500">{c.address}</div>
                      {c.phone && <div className="text-sm text-slate-500">{c.phone}</div>}
                      {c.notes && (
                        <div className="text-sm text-amber-700 mt-1">{c.notes}</div>
                      )}
                      <div className="text-xs text-slate-400 mt-1">
                        {c.is_recurring
                          ? `${DAYS[c.recurring_day]}${
                              (c.recurrence_weeks || 1) > 1
                                ? ` — every ${c.recurrence_weeks} weeks`
                                : " — weekly"
                            }`
                          : "One-off"}{" "}
                        · {c.payment_default}
                        {c.payment_note ? ` · ${c.payment_note}` : ""}
                        {!c.active && " · inactive"}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setEditingCustomer(c);
                        setShowCustomerForm(true);
                      }}
                      className="text-sm text-sky-600"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {showCustomerForm && (
          <CustomerForm
            customer={editingCustomer}
            onSave={saveCustomer}
            onCancel={() => {
              setShowCustomerForm(false);
              setEditingCustomer(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

function DeliveryRow({ d, staff, onUpdate, onRemove }) {
  const [open, setOpen] = useState(false);
  const c = d.delivery_customers || {};
  const delivered = d.status === "delivered";
  const failed = d.status === "failed";

  return (
    <div
      className={`bg-white rounded-lg p-4 ${
        delivered ? "border-l-4 border-emerald-500" : failed ? "border-l-4 border-red-500" : ""
      }`}
    >
      <div className="flex justify-between items-start">
        <div className="min-w-0">
          <div className="font-medium text-slate-800">
            {delivered && "✓ "}
            {failed && "✕ "}
            {c.name}
          </div>
          <div className="text-sm text-slate-500">{c.address}</div>
          {c.notes && <div className="text-sm text-amber-700">{c.notes}</div>}
          {c.payment_note && (
            <div className="text-sm text-indigo-700">💳 {c.payment_note}</div>
          )}
          {d.items && <div className="text-sm text-slate-600 mt-1">{d.items}</div>}
          <div className="text-xs text-slate-400 mt-1">
            {d.payment_status}
            {d.amount_collected ? ` · $${d.amount_collected}` : ""}
            {d.delivered_at &&
              ` · ${new Date(d.delivered_at).toLocaleTimeString("en-AU", {
                hour: "numeric",
                minute: "2-digit",
              })}`}
          </div>
          {d.outcome_note && (
            <div className="text-sm text-slate-600 mt-1">{d.outcome_note}</div>
          )}
        </div>
        <button onClick={() => setOpen(!open)} className="text-sm text-sky-600 shrink-0">
          {open ? "Close" : "Edit"}
        </button>
      </div>

      {open && (
        <div className="mt-3 pt-3 border-t space-y-2">
          <input
            defaultValue={d.items || ""}
            onBlur={(e) => onUpdate(d.id, { items: e.target.value })}
            placeholder="Items"
            className="w-full border rounded px-3 py-2 text-sm"
          />
          <input
            defaultValue={d.notes || ""}
            onBlur={(e) => onUpdate(d.id, { notes: e.target.value })}
            placeholder="Notes for this run"
            className="w-full border rounded px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <select
              title="Payment for this delivery"
              value={d.payment_status}
              onChange={(e) => onUpdate(d.id, { payment_status: e.target.value })}
              className="border rounded px-3 py-2 text-sm flex-1"
            >
              <option value="account">On account</option>
              <option value="paid">Already paid</option>
              <option value="collect">Collect payment</option>
            </select>
            <select
              value={d.status}
              onChange={(e) => onUpdate(d.id, { status: e.target.value })}
              className="border rounded px-3 py-2 text-sm flex-1"
            >
              <option value="pending">Pending</option>
              <option value="delivered">Delivered</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          <button
            onClick={() => onRemove(d.id)}
            className="text-sm text-red-600"
          >
            Remove from run
          </button>
        </div>
      )}
    </div>
  );
}

function CustomerForm({ customer, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: customer?.name || "",
    address: customer?.address || "",
    phone: customer?.phone || "",
    notes: customer?.notes || "",
    is_recurring: customer?.is_recurring || false,
    recurring_day: customer?.recurring_day ?? 1,
    recurrence_weeks: customer?.recurrence_weeks ?? 1,
    anchor_date: customer?.anchor_date || "",
    payment_default: customer?.payment_default || "account",
    payment_note: customer?.payment_note || "",
    active: customer?.active ?? true,
  });

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-5 w-full max-w-md max-h-[85vh] overflow-y-auto">
        <h2 className="text-lg font-bold mb-4">
          {customer ? "Edit customer" : "New customer"}
        </h2>
        <div className="space-y-3">
          <input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Name"
            className="w-full border rounded px-3 py-2 text-sm"
          />
          <input
            value={form.address}
            onChange={(e) => set("address", e.target.value)}
            placeholder="Address"
            className="w-full border rounded px-3 py-2 text-sm"
          />
          <input
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="Phone"
            className="w-full border rounded px-3 py-2 text-sm"
          />
          <textarea
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Standing notes (gate code, leave at back door…)"
            rows={2}
            className="w-full border rounded px-3 py-2 text-sm"
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_recurring}
              onChange={(e) => set("is_recurring", e.target.checked)}
            />
            Recurring delivery
          </label>
          {form.is_recurring && (
            <>
              <select
                value={form.recurring_day}
                onChange={(e) => set("recurring_day", e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
              >
                {DAYS.map((d, i) => (
                  <option key={i} value={i}>
                    {d}
                  </option>
                ))}
              </select>
              <select
                value={form.recurrence_weeks}
                onChange={(e) => set("recurrence_weeks", e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
              >
                <option value={1}>Every week</option>
                <option value={2}>Every 2 weeks</option>
                <option value={4}>Every 4 weeks</option>
              </select>
              {Number(form.recurrence_weeks) > 1 && (
                <div>
                  <label className="block text-xs text-slate-500 mb-1">
                    First delivery date (sets the cycle)
                  </label>
                  <input
                    type="date"
                    value={form.anchor_date}
                    onChange={(e) => set("anchor_date", e.target.value)}
                    className="w-full border rounded px-3 py-2 text-sm"
                  />
                </div>
              )}
            </>
          )}
          <div>
            <label className="block text-xs text-slate-500 mb-1">Usual payment</label>
            <select
              value={form.payment_default}
              onChange={(e) => set("payment_default", e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="account">On account</option>
              <option value="paid">Already paid</option>
              <option value="collect">Collect payment</option>
            </select>
          </div>
          <input
            value={form.payment_note}
            onChange={(e) => set("payment_note", e.target.value)}
            placeholder="Payment note (e.g. card on file at counter, acct #442)"
            className="w-full border rounded px-3 py-2 text-sm"
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => set("active", e.target.checked)}
            />
            Active
          </label>
        </div>
        <div className="flex gap-2 mt-5">
          <button
            onClick={() => onSave(form)}
            disabled={!form.name || !form.address}
            className="bg-sky-600 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-40"
          >
            Save
          </button>
          <button onClick={onCancel} className="px-4 py-2 rounded text-sm text-slate-600">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}