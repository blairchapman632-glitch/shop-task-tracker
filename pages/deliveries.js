import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const PAYMENT_LABEL = {
  account: "On account",
  card: "Card charged",
  paid: "Already paid",
  collect: "Collect cash at door",
};

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Merge real delivery rows with projected recurring customers for a date.
// Virtual entries have no id and are materialised on first interaction.
function buildSchedule(deliveries, customers, dateStr) {
  const existing = new Set(deliveries.map((d) => String(d.delivery_customer_id)));
  const virtual = customers
    .filter((c) => isDueOn(c, dateStr) && !existing.has(String(c.id)))
    .map((c) => ({
      id: null,
      virtual: true,
      delivery_customer_id: c.id,
      delivery_customers: c,
      delivery_date: dateStr,
      items: null,
      notes: null,
      payment_status: c.payment_default,
      amount_due: null,
      amount_collected: null,
      status: "pending",
      sequence: null,
    }));
  const real = [...deliveries];
  const maxSeq = real.reduce((m, d) => Math.max(m, d.sequence || 0), 0);
  virtual.forEach((v, i) => { v.sequence = maxSeq + i + 1; });
  return [...real, ...virtual].sort(
    (a, b) => (a.sequence ?? 9999) - (b.sequence ?? 9999)
  );
}

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
  const [tab, setTab] = useState("schedule");
  const [openDay, setOpenDay] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [staff, setStaff] = useState([]);
  const [runDate, setRunDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [windowDeliveries, setWindowDeliveries] = useState([]);
  const [historyCustomerId, setHistoryCustomerId] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  function shiftIso(iso, days) {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    loadDeliveries();
  }, [runDate]);

  useEffect(() => {
    if (tab !== "schedule" || !openDay) return;
    const id = setInterval(() => { loadDeliveries(); }, 30000);
    return () => clearInterval(id);
  }, [tab, openDay, runDate]);

  useEffect(() => {
    if (openDay) setRunDate(openDay);
  }, [openDay]);

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
    const from = new Date();
    from.setDate(from.getDate() - 7);
    const to = new Date();
    to.setDate(to.getDate() + 28);
    const isoOf = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const { data: wd } = await supabase
      .from("deliveries")
      .select("*, delivery_customers(*)")
      .eq("pharmacy_id", PHARMACY_ID)
      .gte("delivery_date", isoOf(from))
      .lte("delivery_date", isoOf(to));
    setWindowDeliveries(wd || []);
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

    const from = new Date();
    from.setDate(from.getDate() - 7);
    const to = new Date();
    to.setDate(to.getDate() + 28);
    const isoOf = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const { data: wd } = await supabase
      .from("deliveries")
      .select("*, delivery_customers(*)")
      .eq("pharmacy_id", PHARMACY_ID)
      .gte("delivery_date", isoOf(from))
      .lte("delivery_date", isoOf(to));
    setWindowDeliveries(wd || []);
  }

  // Turn a virtual (projected recurring) entry into a real row.
  async function materialise(entry, extraPatch = {}) {
    const { data, error } = await supabase
      .from("deliveries")
      .insert({
        pharmacy_id: PHARMACY_ID,
        delivery_customer_id: entry.delivery_customer_id,
        delivery_date: entry.delivery_date,
        payment_status: entry.payment_status,
        sequence: entry.sequence,
        ...extraPatch,
      })
      .select()
      .single();
    if (error) {
      alert("Error: " + error.message);
      return null;
    }
    await loadDeliveries();
    return data;
  }

  async function addDelivery({ customerId, date, items, notes }) {
    const c = customers.find((x) => String(x.id) === String(customerId));
    if (!c) return;
    const sameDay = deliveries.filter((d) => d.delivery_date === date);
    const maxSeq = sameDay.reduce((m, d) => Math.max(m, d.sequence || 0), 0);
    const { error } = await supabase.from("deliveries").insert({
      pharmacy_id: PHARMACY_ID,
      delivery_customer_id: c.id,
      delivery_date: date,
      payment_status: c.payment_default,
      items: items || null,
      notes: notes || null,
      sequence: maxSeq + 1,
    });
    if (error) {
      alert("Error: " + error.message);
      return;
    }
    setRunDate(date);
    setTab("run");
    await loadAll();
  }

  // Works for both real and virtual entries.
  async function updateDelivery(entryOrId, patch) {
    const entry =
      typeof entryOrId === "object" && entryOrId !== null ? entryOrId : null;

    if (entry && entry.virtual) {
      await materialise(entry, patch);
      return;
    }
    const id = entry ? entry.id : entryOrId;
    const { error } = await supabase.from("deliveries").update(patch).eq("id", id);
    if (error) {
      alert("Error: " + error.message);
      return;
    }
    loadDeliveries();
  }

  async function moveDelivery(schedule, index, direction) {
    const target = index + direction;
    if (target < 0 || target >= schedule.length) return;
    let a = schedule[index];
    let b = schedule[target];

    if (a.virtual) a = await materialise(a);
    if (!a) return;
    if (b.virtual) b = await materialise(b);
    if (!b) return;

    const aSeq = a.sequence ?? index + 1;
    const bSeq = b.sequence ?? target + 1;
    await Promise.all([
      supabase.from("deliveries").update({ sequence: bSeq }).eq("id", a.id),
      supabase.from("deliveries").update({ sequence: aSeq }).eq("id", b.id),
    ]);
    loadDeliveries();
  }

  // Recurring customers are projected, not stored — skipping writes a
  // tombstone row so they stay off the schedule after a refresh.
  async function skipDelivery(entry) {
    if (entry.virtual) {
      await materialise(entry, { status: "skipped" });
      return;
    }
    await updateDelivery(entry, { status: "skipped" });
  }

  async function unskipDelivery(entry) {
    await updateDelivery(entry, { status: "pending" });
  }

  async function removeDelivery(entry) {
    if (entry.virtual) {
      await skipDelivery(entry);
      return;
    }
    if (!confirm("Remove this delivery completely?")) return;
    await supabase.from("deliveries").delete().eq("id", entry.id);
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

  // Day cards for the Schedule list: today → +28 days, plus unfinished past week.
  function buildDayList() {
    const isoOf = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const byDate = {};
    windowDeliveries.forEach((d) => {
      (byDate[d.delivery_date] ||= []).push(d);
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = isoOf(today);

    const makeDay = (iso, dateObj) => {
      const rows = byDate[iso] || [];
      const entries = buildSchedule(rows, customers, iso).filter(
        (e) => e.status !== "skipped"
      );
      if (entries.length === 0) return null;
      return {
        iso,
        dateObj,
        entries,
        total: entries.length,
        delivered: entries.filter((e) => e.status === "delivered").length,
        outstanding: entries.filter((e) => e.status === "pending").length,
      };
    };

    const upcoming = [];
    for (let i = 0; i < 29; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const day = makeDay(isoOf(d), d);
      if (day) upcoming.push(day);
    }

    const unfinished = [];
    for (let i = 7; i >= 1; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = isoOf(d);
      const rows = byDate[iso] || [];
      if (rows.length === 0) continue;
      const entries = rows.filter((e) => e.status === "pending");
      if (entries.length === 0) continue;
      unfinished.push({
        iso,
        dateObj: d,
        entries,
        total: rows.filter((e) => e.status !== "skipped").length,
        delivered: rows.filter((e) => e.status === "delivered").length,
        outstanding: entries.length,
      });
    }

    return { upcoming, unfinished, todayIso };
  }

  const dayList = buildDayList();
  const schedule = buildSchedule(deliveries, customers, runDate);
  const activeSchedule = schedule.filter((d) => d.status !== "skipped");
  const skipped = schedule.filter((d) => d.status === "skipped");
  const done = activeSchedule.filter((d) => d.status === "delivered").length;

  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-slate-800">Deliveries</h1>
          <a
          href="/"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition-colors"
          >
            <span>🏠</span> Home
          </a>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => {
              setTab("schedule");
              setOpenDay(null);
            }}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              tab === "schedule" ? "bg-sky-600 text-white" : "bg-white text-slate-600"
            }`}
          >
            Schedule
          </button>
          <button
            onClick={() => setTab("customers")}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              tab === "customers" ? "bg-sky-600 text-white" : "bg-white text-slate-600"
            }`}
          >
            Customers
          </button>
          <button
            onClick={() => setTab("history")}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              tab === "history" ? "bg-sky-600 text-white" : "bg-white text-slate-600"
            }`}
          >
            History
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            className="ml-auto bg-sky-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            + Add delivery
          </button>
        </div>

        {tab === "schedule" && openDay && (
          <div>
            <div className="bg-white rounded-lg p-4 mb-4 flex flex-wrap items-center gap-3">
              <button
                onClick={() => setOpenDay(shiftIso(openDay, -1))}
                className="px-3 py-2 rounded border text-sm text-slate-600 hover:bg-slate-50"
              >
                ‹
              </button>
              <div className="font-medium text-slate-800">
                {new Date(openDay + "T00:00:00").toLocaleDateString("en-AU", {
                  weekday: "long",
                  day: "numeric",
                  month: "short",
                })}
              </div>
              <button
                onClick={() => setOpenDay(shiftIso(openDay, 1))}
                className="px-3 py-2 rounded border text-sm text-slate-600 hover:bg-slate-50"
              >
                ›
              </button>
              <span className="text-sm text-slate-500 ml-auto">
                {done} / {activeSchedule.length} delivered
              </span>
            </div>

            {activeSchedule.length === 0 && (
              <div className="bg-white rounded-lg p-6 text-center text-slate-500 text-sm">
                No deliveries scheduled for this date.
              </div>
            )}

            <div className="space-y-2">
              {activeSchedule.map((d, i) => (
                <DeliveryRow
                  key={d.id || `v-${d.delivery_customer_id}`}
                  d={d}
                  staff={staff}
                  onUpdate={updateDelivery}
                  onRemove={removeDelivery}
                  onSkip={skipDelivery}
                  onMove={(dir) => moveDelivery(activeSchedule, i, dir)}
                  isFirst={i === 0}
                  isLast={i === activeSchedule.length - 1}
                  position={i + 1}
                />
              ))}
            </div>

            {skipped.length > 0 && (
              <div className="mt-6">
                <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">
                  Skipped today
                </div>
                <div className="space-y-2">
                  {skipped.map((d) => (
                    <div
                      key={d.id}
                      className="bg-white rounded-lg p-3 flex items-center justify-between opacity-60"
                    >
                      <div className="text-sm text-slate-500 line-through">
                        {d.delivery_customers?.name}
                        <span className="text-slate-400 no-underline">
                          {" "}
                          · {d.delivery_customers?.address}
                        </span>
                      </div>
                      <button
                        onClick={() => unskipDelivery(d)}
                        className="text-sm text-sky-600 shrink-0"
                      >
                        Undo
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "schedule" && !openDay && (
          <div className="space-y-3">
            {dayList.unfinished.length > 0 && (
              <div className="border border-amber-200 bg-amber-50 rounded-lg p-3">
                <div className="text-xs uppercase tracking-wide text-amber-700 mb-2">
                  Unfinished
                </div>
                <div className="space-y-2">
                  {dayList.unfinished.map((day) => (
                    <div
                      key={day.iso}
                      role="button"
                      tabIndex={0}
                      onClick={() => setOpenDay(day.iso)}
                      className="bg-white rounded-lg p-3 cursor-pointer hover:bg-slate-50 flex items-center justify-between"
                    >
                      <div className="font-medium text-slate-800 text-sm">
                        {day.dateObj.toLocaleDateString("en-AU", {
                          weekday: "long",
                          day: "numeric",
                          month: "short",
                        })}
                      </div>
                      <div className="text-sm text-amber-700 shrink-0">
                        {day.outstanding} not delivered →
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {dayList.upcoming.length === 0 && (
              <div className="bg-white rounded-lg p-6 text-center text-slate-500 text-sm">
                No deliveries scheduled in the next 4 weeks.
              </div>
            )}

            {dayList.upcoming.map((day) => {
              const isToday = day.iso === dayList.todayIso;
              return (
                <div
                  key={day.iso}
                  role="button"
                  tabIndex={0}
                  onClick={() => setOpenDay(day.iso)}
                  className={`bg-white rounded-lg p-4 cursor-pointer hover:bg-slate-50 ${
                    isToday ? "border-l-4 border-sky-500" : ""
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium text-slate-800">
                      {isToday
                        ? "Today"
                        : day.dateObj.toLocaleDateString("en-AU", {
                            weekday: "long",
                            day: "numeric",
                            month: "short",
                          })}
                      {isToday && (
                        <span className="ml-2 text-sm font-normal text-slate-400">
                          {day.dateObj.toLocaleDateString("en-AU", {
                            weekday: "long",
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-slate-500 shrink-0">
                      {isToday || day.delivered > 0
                        ? `${day.delivered} / ${day.total} delivered`
                        : `${day.total} ${day.total === 1 ? "drop" : "drops"}`}
                    </div>
                  </div>
                  <div className="text-sm text-slate-600 space-y-0.5">
                    {day.entries.map((e) => (
                      <div
                        key={e.id || `v-${e.delivery_customer_id}`}
                        className={e.status === "delivered" ? "text-slate-400" : ""}
                      >
                        {e.status === "delivered" && "✓ "}
                        {e.status === "failed" && "✕ "}
                        {e.delivery_customers?.name}
                        <span className="text-slate-400">
                          {" "}
                          · {e.delivery_customers?.address}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
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
                        · {PAYMENT_LABEL[c.payment_default] || c.payment_default}
                        {c.payment_note ? ` · ${c.payment_note}` : ""}
                        {!c.active && " · inactive"}
                      </div>
                    </div>
                    <div className="flex gap-3 shrink-0">
                      <button
                        onClick={() => {
                          setHistoryCustomerId(c.id);
                          setTab("history");
                        }}
                        className="text-sm text-slate-500 hover:text-slate-700"
                      >
                        History
                      </button>
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
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "history" && (
          <HistoryPanel
            customers={customers}
            staff={staff}
            initialCustomerId={historyCustomerId}
          />
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

        {showAddForm && (
          <AddDeliveryForm
            customers={customers}
            defaultDate={runDate}
            onSave={async (form) => {
              await addDelivery(form);
              setShowAddForm(false);
            }}
            onNewCustomer={() => {
              setShowAddForm(false);
              setEditingCustomer(null);
              setShowCustomerForm(true);
            }}
            onCancel={() => setShowAddForm(false)}
          />
        )}
      </div>
    </div>
  );
}
function AddDeliveryForm({ customers, defaultDate, onSave, onNewCustomer, onCancel }) {
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [date, setDate] = useState(defaultDate || todayISO());
  const [items, setItems] = useState("");
  const [notes, setNotes] = useState("");

  const active = customers.filter((c) => c.active);
  const matches = search.trim()
    ? active.filter((c) =>
        `${c.name} ${c.address}`.toLowerCase().includes(search.trim().toLowerCase())
      )
    : active;
  const selected = active.find((c) => String(c.id) === String(customerId));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-5 w-full max-w-md max-h-[85vh] overflow-y-auto">
        <h2 className="text-lg font-bold mb-4">Add delivery</h2>

        {selected ? (
          <div className="border rounded-lg p-3 mb-3 flex justify-between items-start">
            <div className="min-w-0">
              <div className="font-medium text-slate-800">{selected.name}</div>
              <div className="text-sm text-slate-500">{selected.address}</div>
            </div>
            <button
              onClick={() => {
                setCustomerId("");
                setSearch("");
              }}
              className="text-sm text-sky-600 shrink-0"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="mb-3">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer…"
              className="w-full border rounded px-3 py-2 text-sm mb-2"
            />
            <div className="border rounded max-h-52 overflow-y-auto divide-y">
              {matches.length === 0 && (
                <div className="p-3 text-sm text-slate-400">No matches.</div>
              )}
              {matches.map((c) => (
                <div
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setCustomerId(c.id)}
                  className="p-3 cursor-pointer hover:bg-slate-50"
                >
                  <div className="text-sm font-medium text-slate-800">{c.name}</div>
                  <div className="text-xs text-slate-500">{c.address}</div>
                </div>
              ))}
            </div>
            <button
              onClick={onNewCustomer}
              className="text-sm text-sky-600 mt-2"
            >
              + New customer
            </button>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Delivery date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <input
            value={items}
            onChange={(e) => setItems(e.target.value)}
            placeholder="Items (optional)"
            className="w-full border rounded px-3 py-2 text-sm"
          />
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes for this delivery (optional)"
            className="w-full border rounded px-3 py-2 text-sm"
          />
        </div>

        <div className="flex gap-2 mt-5">
          <button
            onClick={() => onSave({ customerId, date, items, notes })}
            disabled={!customerId || !date}
            className="bg-sky-600 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-40"
          >
            Add
          </button>
          <button onClick={onCancel} className="px-4 py-2 rounded text-sm text-slate-600">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
function DeliveryRow({ d, staff, onUpdate, onRemove, onSkip, onMove, isFirst, isLast, position }) {
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
            <span className="text-slate-400 mr-1">{position}.</span>
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
            {PAYMENT_LABEL[d.payment_status] || d.payment_status}
            {d.payment_status === "collect" && d.amount_due ? ` — $${Number(d.amount_due).toFixed(2)} due` : ""}
            {d.amount_collected ? ` · $${Number(d.amount_collected).toFixed(2)} collected` : ""}
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
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex flex-col">
            <button
              onClick={() => onMove(-1)}
              disabled={isFirst}
              className="px-2 text-slate-400 disabled:opacity-20 hover:text-slate-700"
            >
              ▲
            </button>
            <button
              onClick={() => onMove(1)}
              disabled={isLast}
              className="px-2 text-slate-400 disabled:opacity-20 hover:text-slate-700"
            >
              ▼
            </button>
          </div>
          <button onClick={() => setOpen(!open)} className="text-sm text-sky-600">
            {open ? "Close" : "Edit"}
          </button>
          <button
            onClick={() => onSkip(d)}
            className="text-sm text-slate-400 hover:text-red-600"
            title="Not needed today"
          >
            Skip
          </button>
        </div>
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
              <option value="card">Card charged</option>
              <option value="paid">Already paid</option>
              <option value="collect">Collect cash at door</option>
            </select>
            {d.payment_status === "collect" && (
              <input
                type="number"
                step="0.01"
                defaultValue={d.amount_due || ""}
                onBlur={(e) => onUpdate(d.id, { amount_due: e.target.value ? Number(e.target.value) : null })}
                placeholder="Amount to collect $"
                className="border rounded px-3 py-2 text-sm w-40"
              />
            )}
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
            onClick={() => onRemove(d)}
            className="text-sm text-red-600"
          >
            Remove from run
          </button>
        </div>
      )}
    </div>
  );
}

function HistoryPanel({ customers, staff, initialCustomerId }) {
  const today = new Date();
  const monthAgo = new Date();
  monthAgo.setMonth(monthAgo.getMonth() - (initialCustomerId ? 12 : 1));
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const [from, setFrom] = useState(iso(monthAgo));
  const [to, setTo] = useState(iso(today));
  const [statusFilter, setStatusFilter] = useState("all");
  const [customerFilter, setCustomerFilter] = useState(initialCustomerId || "");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const staffById = Object.fromEntries((staff || []).map((s) => [String(s.id), s.name]));

  async function run() {
    setLoading(true);
    let q = supabase
      .from("deliveries")
      .select("*, delivery_customers(name, address, phone)")
      .eq("pharmacy_id", PHARMACY_ID)
      .gte("delivery_date", from)
      .lte("delivery_date", to)
      .order("delivery_date", { ascending: false })
      .order("sequence", { nullsFirst: false });
    if (statusFilter !== "all") q = q.eq("status", statusFilter);
    if (customerFilter) q = q.eq("delivery_customer_id", customerFilter);
    const { data, error } = await q;
    setLoading(false);
    if (error) { alert("Error: " + error.message); return; }
    setRows(data || []);
  }

  useEffect(() => { run(); }, [from, to, statusFilter, customerFilter]);

  async function exportExcel() {
    if (rows.length === 0) { alert("Nothing to export."); return; }
    try {
      const XLSX = await import("xlsx");
      const data = rows.map((d) => ({
        Date: d.delivery_date,
        Customer: d.delivery_customers?.name || "",
        Address: d.delivery_customers?.address || "",
        Phone: d.delivery_customers?.phone || "",
        Items: d.items || "",
        Notes: d.notes || "",
        Payment: PAYMENT_LABEL[d.payment_status] || d.payment_status || "",
        "Amount due": d.amount_due ?? "",
        "Amount collected": d.amount_collected ?? "",
        Status: d.status,
        "Delivered by": staffById[String(d.delivered_by)] || "",
        "Completed at": d.delivered_at
          ? new Date(d.delivered_at).toLocaleString("en-AU")
          : "",
        Outcome: d.outcome_note || "",
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Deliveries");
      XLSX.writeFile(wb, `deliveries_${from}_to_${to}.xlsx`);
    } catch (err) {
      alert("Export failed: " + (err?.message || String(err)));
    }
  }

  const counts = {
    total: rows.length,
    delivered: rows.filter((r) => r.status === "delivered").length,
    failed: rows.filter((r) => r.status === "failed").length,
    pending: rows.filter((r) => r.status === "pending").length,
  };

  return (
    <div>
      <div className="bg-white rounded-lg p-4 mb-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border rounded px-3 py-2 text-sm">
              <option value="all">All</option>
              <option value="delivered">Delivered</option>
              <option value="failed">Failed</option>
              <option value="pending">Pending</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Customer</label>
            <select value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)} className="border rounded px-3 py-2 text-sm">
              <option value="">All customers</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <button onClick={exportExcel} className="ml-auto border border-emerald-300 text-emerald-700 rounded px-4 py-2 text-sm font-medium hover:bg-emerald-50">
            ↓ Export to Excel
          </button>
        </div>
        <div className="text-sm text-slate-500">
          {counts.total} deliveries · {counts.delivered} delivered · {counts.failed} failed
          {counts.pending > 0 ? ` · ${counts.pending} still pending` : ""}
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-lg p-6 text-center text-sm text-slate-400">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-lg p-6 text-center text-sm text-slate-400">
          No deliveries in this range.
        </div>
      ) : (
        <div className="bg-white rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-slate-500">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Items</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">By</th>
                <th className="px-3 py-2">Completed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className="border-b last:border-0">
                  <td className="px-3 py-2 whitespace-nowrap text-slate-600">
                    {new Date(d.delivery_date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800">{d.delivery_customers?.name}</div>
                    <div className="text-xs text-slate-400">{d.delivery_customers?.address}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{d.items || "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      d.status === "delivered" ? "bg-emerald-50 text-emerald-700"
                      : d.status === "failed" ? "bg-red-50 text-red-600"
                      : "bg-slate-100 text-slate-500"
                    }`}>
                      {d.status}
                    </span>
                    {d.outcome_note && <div className="text-xs text-slate-500 mt-0.5">{d.outcome_note}</div>}
                  </td>
                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{staffById[String(d.delivered_by)] || "—"}</td>
                  <td className="px-3 py-2 text-slate-500 whitespace-nowrap text-xs">
                    {d.delivered_at
                      ? new Date(d.delivered_at).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
              <option value="card">Card charged</option>
              <option value="paid">Already paid</option>
              <option value="collect">Collect cash at door</option>
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