import { useEffect, useState } from "react";
import supabase from "../lib/supabaseClient";

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";

const DAYS = [
  { dow: 1, label: "Monday" },
  { dow: 2, label: "Tuesday" },
  { dow: 3, label: "Wednesday" },
  { dow: 4, label: "Thursday" },
  { dow: 5, label: "Friday" },
  { dow: 6, label: "Saturday" },
  { dow: 0, label: "Sunday" },
];

const STATUS_OPTIONS = [
  { value: "all_day", label: "All day", emoji: "✅" },
  { value: "am", label: "Mornings", emoji: "🌅" },
  { value: "pm", label: "Afternoons", emoji: "🌆" },
  { value: "unavailable", label: "Unavailable", emoji: "❌" },
];

const statusMeta = (v) => STATUS_OPTIONS.find((s) => s.value === v) || STATUS_OPTIONS[0];

const fmtDate = (d) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

export default function AvailabilityPage() {
  // ── Identity ──
  const [staffList, setStaffList] = useState([]);
  const [step, setStep] = useState("select"); // select → pin → form
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [checking, setChecking] = useState(false);

  // ── Form state ──
  const [pattern, setPattern] = useState({});   // dow -> status
  const [patternNote, setPatternNote] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [overrides, setOverrides] = useState([]); // {override_date, status, note}
  const [newOverrideDate, setNewOverrideDate] = useState("");
  const [newOverrideStatus, setNewOverrideStatus] = useState("unavailable");
  const [newOverrideNote, setNewOverrideNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load active staff for the picker
  useEffect(() => {
    supabase.from("staff").select("id, name, photo_url, pin").eq("pharmacy_id", PHARMACY_ID).eq("active", true).order("name")
      .then(({ data }) => setStaffList(data || []));
  }, []);

  const handleSelectStaff = (s) => {
    setSelectedStaff(s);
    setPin("");
    setPinError("");
    setStep("pin");
  };

  const handlePin = async () => {
    if (pin.length !== 4) { setPinError("Enter your 4-digit PIN."); return; }
    setChecking(true);
    const { data, error } = await supabase
      .from("staff").select("id").eq("id", selectedStaff.id).eq("pin", pin).single();
    setChecking(false);
    if (error || !data) { setPinError("Incorrect PIN."); setPin(""); return; }
    await loadExisting(selectedStaff.id);
    setStep("form");
  };

  const loadExisting = async (staffId) => {
    setLoading(true);
    const [{ data: pats }, { data: ovrs }] = await Promise.all([
      supabase.from("availability_patterns").select("*").eq("staff_id", staffId),
      supabase.from("availability_overrides").select("*").eq("staff_id", staffId).gte("override_date", new Date().toISOString().slice(0, 10)).order("override_date"),
    ]);
    const pmap = {};
    (pats || []).forEach((p) => { pmap[p.day_of_week] = p.status; });
    // Default any unset day to all_day
    DAYS.forEach((d) => { if (!(d.dow in pmap)) pmap[d.dow] = "all_day"; });
    setPattern(pmap);
    const firstWithMeta = (pats || []).find((p) => p.note || p.from_date || p.to_date);
    setPatternNote(firstWithMeta?.note || "");
    setFromDate(firstWithMeta?.from_date || "");
    setToDate(firstWithMeta?.to_date || "");
    setOverrides((ovrs || []).map((o) => ({ override_date: o.override_date, status: o.status, note: o.note || "" })));
    setLoading(false);
  };

  const setDayStatus = (dow, status) => setPattern((p) => ({ ...p, [dow]: status }));

  const addOverride = () => {
    if (!newOverrideDate) return;
    if (overrides.some((o) => o.override_date === newOverrideDate)) {
      alert("You already have an entry for that date.");
      return;
    }
    setOverrides((o) => [...o, { override_date: newOverrideDate, status: newOverrideStatus, note: newOverrideNote.trim() }].sort((a, b) => a.override_date.localeCompare(b.override_date)));
    setNewOverrideDate("");
    setNewOverrideStatus("unavailable");
    setNewOverrideNote("");
  };

  const removeOverride = (date) => setOverrides((o) => o.filter((x) => x.override_date !== date));

  const handleSave = async () => {
    setSaving(true);
    try {
      const staffId = selectedStaff.id;
      // Replace patterns: delete then insert current grid
      await supabase.from("availability_patterns").delete().eq("staff_id", staffId);
      const patternRows = DAYS.map((d) => ({
        staff_id: staffId,
        day_of_week: d.dow,
        status: pattern[d.dow] || "all_day",
        from_date: fromDate || null,
        to_date: toDate || null,
        note: patternNote.trim() || null,
        pharmacy_id: PHARMACY_ID,
      }));
      await supabase.from("availability_patterns").insert(patternRows);

      // Replace overrides
      await supabase.from("availability_overrides").delete().eq("staff_id", staffId);
      if (overrides.length) {
        await supabase.from("availability_overrides").insert(
          overrides.map((o) => ({
            staff_id: staffId,
            override_date: o.override_date,
            status: o.status,
            note: o.note || null,
            pharmacy_id: PHARMACY_ID,
          }))
        );
      }
      setSaved(true);
      setTimeout(() => { try { window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }); } catch (e) {} }, 50);
    } catch (err) {
      alert("Couldn't save: " + (err?.message || String(err)));
    } finally {
      setSaving(false);
    }
  };

  // ── Render ──
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center py-8 px-4">
      <div className="w-full max-w-lg">
        <div className="mb-2">
          <a href="/" className="text-sm text-blue-600 hover:underline">← Back to home</a>
        </div>
        <div className="text-center mb-6">
          <div className="text-3xl mb-1">📅</div>
          <h1 className="text-xl font-bold text-gray-800">Byford Pharmacy</h1>
          <p className="text-sm text-gray-500">My Availability</p>
        </div>

        {/* Step: select staff */}
        {step === "select" && (
          <div className="bg-white rounded-2xl shadow-sm border p-5">
            <p className="text-sm text-gray-500 mb-3">Select your name:</p>
            <div className="space-y-1 max-h-[60vh] overflow-y-auto">
              {staffList.map((s) => (
                <button key={s.id} onClick={() => handleSelectStaff(s)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 text-left border border-transparent hover:border-gray-200">
                  <img src={s.photo_url || "/placeholder.png"} alt={s.name} className="w-10 h-10 rounded-full object-cover" />
                  <span className="text-sm font-medium text-gray-800">{s.name}</span>
                </button>
              ))}
              {staffList.length === 0 && <div className="text-sm text-gray-400">Loading staff…</div>}
            </div>
          </div>
        )}

        {/* Step: PIN */}
        {step === "pin" && selectedStaff && (
          <div className="bg-white rounded-2xl shadow-sm border p-6 text-center">
            <img src={selectedStaff.photo_url || "/placeholder.png"} alt={selectedStaff.name} className="w-14 h-14 rounded-full object-cover mx-auto mb-2" />
            <div className="font-medium text-gray-800 mb-4">{selectedStaff.name}</div>
            <input
              type="password" inputMode="numeric" maxLength={4} value={pin}
              onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setPinError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handlePin()}
              placeholder="••••" autoFocus
              className="w-full border rounded-lg px-4 py-3 text-center text-2xl tracking-widest mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            {pinError && <p className="text-sm text-red-500 mb-3">{pinError}</p>}
            <div className="flex gap-2">
              <button onClick={() => { setStep("select"); setSelectedStaff(null); }} className="flex-1 border border-gray-300 rounded-lg py-2.5 text-sm text-gray-600 hover:bg-gray-50">Back</button>
              <button onClick={handlePin} disabled={checking} className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-40">{checking ? "Checking…" : "Continue"}</button>
            </div>
          </div>
        )}

        {/* Step: form */}
        {step === "form" && selectedStaff && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border p-5">
              <div className="flex items-center gap-3 mb-4">
                <img src={selectedStaff.photo_url || "/placeholder.png"} alt={selectedStaff.name} className="w-10 h-10 rounded-full object-cover" />
                <div>
                  <div className="font-medium text-gray-800">{selectedStaff.name}</div>
                  <button onClick={() => { setStep("select"); setSelectedStaff(null); }} className="text-xs text-blue-600 hover:underline">Not you?</button>
                </div>
              </div>

              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Weekly availability</div>
              <p className="text-xs text-gray-400 mb-3">This applies every week until you change it. Set the days you can't work or are limited.</p>

              {loading ? (
                <div className="text-sm text-gray-400">Loading…</div>
              ) : (
                <div className="space-y-2">
                  {DAYS.map((d) => (
                    <div key={d.dow} className="flex items-center gap-2">
                      <span className="text-sm w-24 shrink-0 text-gray-700">{d.label}</span>
                      <div className="flex gap-1 flex-1">
                        {STATUS_OPTIONS.map((opt) => {
                          const active = (pattern[d.dow] || "all_day") === opt.value;
                          return (
                            <button
                              key={opt.value}
                              onClick={() => setDayStatus(d.dow, opt.value)}
                              className={`flex-1 text-[11px] rounded-lg border py-1.5 ${active ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}
                              title={opt.label}
                            >
                              {opt.emoji}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-2 text-[10px] text-gray-400 pt-1 justify-end">
                    {STATUS_OPTIONS.map((o) => <span key={o.value}>{o.emoji} {o.label}</span>)}
                  </div>
                </div>
              )}

              {/* Optional date range for the pattern */}
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Applies from (optional)</label>
                  <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full border rounded-lg px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Until (optional)</label>
                  <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full border rounded-lg px-2 py-1.5 text-sm" />
                </div>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">e.g. set an end date if this is just for a uni semester. Leave blank for ongoing.</p>

              <div className="mt-3">
                <label className="block text-xs font-medium text-gray-600 mb-1">Note (optional)</label>
                <textarea value={patternNote} onChange={(e) => setPatternNote(e.target.value)} rows={2} placeholder="Anything Paige should know…" className="w-full border rounded-lg px-3 py-2 text-sm resize-none" />
              </div>
            </div>

            {/* Specific dates */}
            <div className="bg-white rounded-2xl shadow-sm border p-5">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Specific dates</div>
              <p className="text-xs text-gray-400 mb-3">One-off exceptions — a day you can't do, or a normally-off day you can.</p>

              {overrides.length > 0 && (
                <div className="space-y-1.5 mb-3">
                  {overrides.map((o) => (
                    <div key={o.override_date} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                      <span>{statusMeta(o.status).emoji}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-gray-700">{fmtDate(o.override_date)} — {statusMeta(o.status).label}</div>
                        {o.note && <div className="text-xs text-gray-500">{o.note}</div>}
                      </div>
                      <button onClick={() => removeOverride(o.override_date)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2 border-t pt-3">
                <input type="date" value={newOverrideDate} onChange={(e) => setNewOverrideDate(e.target.value)} className="w-full border rounded-lg px-2 py-1.5 text-sm" />
                <div className="flex gap-1">
                  {STATUS_OPTIONS.map((opt) => (
                    <button key={opt.value} onClick={() => setNewOverrideStatus(opt.value)} className={`flex-1 text-[11px] rounded-lg border py-1.5 ${newOverrideStatus === opt.value ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200"}`}>
                      {opt.emoji} {opt.label}
                    </button>
                  ))}
                </div>
                <input value={newOverrideNote} onChange={(e) => setNewOverrideNote(e.target.value)} placeholder="Note (optional)" className="w-full border rounded-lg px-3 py-2 text-sm" />
                <button onClick={addOverride} disabled={!newOverrideDate} className="w-full border border-blue-200 text-blue-600 rounded-lg py-2 text-sm font-medium hover:bg-blue-50 disabled:opacity-40">+ Add date</button>
              </div>
            </div>

            {/* Save */}
            <button onClick={handleSave} disabled={saving} className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-medium disabled:opacity-40">
              {saving ? "Saving…" : "Save my availability"}
            </button>
            {saved && (
              <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-4 text-center">
                <div className="text-2xl mb-1">✅</div>
                <div className="text-sm font-semibold text-green-700">All done — your availability is saved.</div>
                <div className="text-xs text-green-600 mt-0.5">Paige can now see it. You can safely close this page.</div>
                <button onClick={() => setSaved(false)} className="mt-3 text-xs text-green-700 underline">Keep editing</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}