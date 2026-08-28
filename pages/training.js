import { useEffect, useState } from "react";
import supabase from "../lib/supabaseClient";
import Avatar from "../components/Avatar";
import { QSPP_HOURS_REQUIRED, qsppApplies, getCurrentCycle, hoursInCycle, formatCycle } from "../lib/qspp";

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";

// ─── Identity gate: select name → PIN ─────────────────────────────────────────

function IdentityGate({ onIdentified }) {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    supabase.from("staff")
      .select("id, name, photo_url, role, pin")
      .eq("pharmacy_id", PHARMACY_ID)
      .eq("active", true)
      .or("role.is.null,role.neq.Locum")
      .order("name")
      .then(({ data }) => { setStaff(data || []); setLoading(false); });
  }, []);

  const submit = () => {
    if (!selected || pin.length !== 4) return;
    setChecking(true);
    setError("");
    if (selected.pin && pin === selected.pin) {
      onIdentified(selected);
    } else {
      setError("Incorrect PIN.");
      setPin("");
    }
    setChecking(false);
  };

  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-gray-50 text-sm text-gray-400">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6 py-10">
      <div className="bg-white rounded-2xl shadow-sm border p-6 w-full max-w-md">
        <div className="text-center mb-5">
          <div className="text-2xl mb-1">📚</div>
          <h1 className="text-lg font-bold text-gray-800">Training Records</h1>
          <p className="text-sm text-gray-500 mt-1">
            {selected ? "Enter your PIN to continue" : "Select your name"}
          </p>
        </div>

        {!selected ? (
          <div className="space-y-1 max-h-[60vh] overflow-y-auto">
            {staff.map((s) => (
              <button
                key={s.id}
                onClick={() => { setSelected(s); setPin(""); setError(""); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 text-left"
              >
                <Avatar name={s.name} photoUrl={s.photo_url} className="w-9 h-9 rounded-full shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-800 truncate">{s.name}</div>
                  <div className="text-xs text-gray-400 truncate">{s.role || ""}</div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <Avatar name={selected.name} photoUrl={selected.photo_url} className="w-10 h-10 rounded-full" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-gray-800 truncate">{selected.name}</div>
                <div className="text-xs text-gray-400 truncate">{selected.role || ""}</div>
              </div>
              <button onClick={() => { setSelected(null); setPin(""); setError(""); }} className="text-xs text-blue-600 hover:underline">Change</button>
            </div>
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="••••"
              autoComplete="off"
              name="training_pin_field"
              data-1p-ignore
              data-lpignore="true"
              style={{ WebkitTextSecurity: "disc", textSecurity: "disc" }}
              className="w-full border rounded-lg px-4 py-3 text-center text-2xl tracking-widest mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
              autoFocus
            />
            {error && <p className="text-sm text-red-500 mb-3 text-center">{error}</p>}
            <button
              onClick={submit}
              disabled={pin.length !== 4 || checking}
              className="w-full bg-blue-600 text-white rounded-lg py-2.5 font-medium disabled:opacity-40"
            >
              {checking ? "Checking…" : "Continue"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main training view (add-only for staff) ──────────────────────────────────

function TrainingView({ staff }) {
  const [training, setTraining] = useState([]);
  const [loading, setLoading] = useState(true);
  const [qsppAnchor, setQsppAnchor] = useState(null);

  const [topic, setTopic] = useState("");
  const [date, setDate] = useState("");
  const [hours, setHours] = useState("");
  const [provider, setProvider] = useState("");
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: recs }, { data: settings }] = await Promise.all([
      supabase.from("training_records").select("*").eq("staff_id", staff.id).order("training_date", { ascending: false }),
      supabase.from("pharmacy_settings").select("qspp_cycle_start_date").eq("pharmacy_id", PHARMACY_ID).maybeSingle(),
    ]);
    setTraining(recs || []);
    setQsppAnchor(settings?.qspp_cycle_start_date || null);
    setLoading(false);
  };

  useEffect(() => { load(); }, [staff.id]);

  const handleAdd = async () => {
    setError("");
    if (!topic.trim()) { setError("Topic is required."); return; }
    if (!date) { setError("Date is required."); return; }
    if (hours === "" || isNaN(Number(hours))) { setError("Hours is required."); return; }
    setSaving(true);
    try {
      let certUrl = null, certName = null;
      if (file) {
        const ext = file.name.split(".").pop();
        const filename = `${staff.id}_${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("training-certificates")
          .upload(filename, file, { upsert: true });
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from("training-certificates").getPublicUrl(filename);
        certUrl = urlData.publicUrl;
        certName = file.name;
      }
      const { data: rec, error: insErr } = await supabase.from("training_records").insert([{
        pharmacy_id: PHARMACY_ID,
        staff_id: staff.id,
        topic: topic.trim(),
        training_date: date,
        hours: Number(hours),
        provider: provider.trim() || null,
        certificate_url: certUrl,
        certificate_filename: certName,
      }]).select().single();
      if (insErr) throw insErr;
      setTraining((prev) => [rec, ...prev].sort((a, b) => b.training_date.localeCompare(a.training_date)));
      setTopic(""); setDate(""); setHours(""); setProvider(""); setFile(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError("Couldn't save: " + (err?.message || String(err)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <Avatar name={staff.name} photoUrl={staff.photo_url} className="w-10 h-10 rounded-full border" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-gray-800 truncate">{staff.name}</div>
          <div className="text-xs text-gray-400 truncate">Training Records</div>
        </div>
        <a href="/" className="inline-flex items-center text-sm font-medium px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 shrink-0">
          Home
        </a>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center text-sm font-medium px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 shrink-0"
        >
          Log out
        </button>
      </header>

      <main className="max-w-lg mx-auto px-4 py-5 space-y-4">

        {/* QSPP progress — pharmacy assistants only */}
        {qsppApplies(staff.role) && (() => {
          const cycle = getCurrentCycle(qsppAnchor);
          if (!cycle) return null;
          const done = hoursInCycle(training, cycle);
          const pct = Math.min(100, Math.round((done / QSPP_HOURS_REQUIRED) * 100));
          const met = done >= QSPP_HOURS_REQUIRED;
          return (
            <div className="bg-white rounded-2xl shadow-sm border p-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-semibold text-gray-700">QSPP Training</span>
                <span className={`text-sm font-medium ${met ? "text-green-600" : "text-gray-700"}`}>
                  {done} / {QSPP_HOURS_REQUIRED} hrs {met ? "✓" : ""}
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                <div className={`h-2.5 rounded-full ${met ? "bg-green-500" : "bg-blue-500"}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="text-[11px] text-gray-400 mt-1.5">Current cycle: {formatCycle(cycle)}</div>
              {!met && <div className="text-[11px] text-gray-500 mt-0.5">{(QSPP_HOURS_REQUIRED - done)} hr{(QSPP_HOURS_REQUIRED - done) === 1 ? "" : "s"} still needed this cycle.</div>}
            </div>
          );
        })()}

        {/* Add record */}
        <div className="bg-white rounded-2xl shadow-sm border p-4 space-y-3">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Add training</div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Topic *</label>
            <input value={topic} onChange={(e) => setTopic(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="e.g. Wound care module" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date *</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Hours *</label>
              <input type="text" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value.replace(/[^\d.]/g, ""))} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="e.g. 1.5" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Training Provider</label>
            <input value={provider} onChange={(e) => setProvider(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="e.g. Guild Training" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Certificate (optional)</label>
            <label className="flex items-center gap-2 w-full border-2 border-dashed rounded-lg px-3 py-2.5 cursor-pointer border-gray-200 hover:border-blue-300 hover:bg-blue-50">
              <span className="text-gray-400">📎</span>
              <span className="text-xs text-gray-500 truncate">{file ? file.name : "Attach certificate"}</span>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button onClick={handleAdd} disabled={saving} className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-40">
            {saving ? "Saving…" : "Add training record"}
          </button>
          {saved && (
            <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-center text-sm text-green-700 font-medium">
              ✅ Training record saved.
            </div>
          )}
        </div>

        {/* Existing records */}
        <div className="bg-white rounded-2xl shadow-sm border p-4">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Your records {training.length > 0 && <span className="text-gray-400 font-normal">({training.length})</span>}
          </div>
          {loading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : training.length === 0 ? (
            <p className="text-sm text-gray-400">No training recorded yet.</p>
          ) : (
            <div className="space-y-1.5">
              {training.map((r) => (
                <div key={r.id} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                  <div className="flex items-start gap-2">
                    <span className="text-sm">📚</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-700">{r.topic}</div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        {new Date(r.training_date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                        {" · "}{Number(r.hours)} hr{Number(r.hours) === 1 ? "" : "s"}
                        {r.provider ? ` · ${r.provider}` : ""}
                      </div>
                    </div>
                    {r.certificate_url && (
                      <a href={r.certificate_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline shrink-0">Certificate</a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-gray-400 mt-3">Need to change or remove a record? Ask your manager.</p>
        </div>
      </main>
    </div>
  );
}

export default function TrainingPage() {
  const [staff, setStaff] = useState(null);
  if (!staff) return <IdentityGate onIdentified={setStaff} />;
  return <TrainingView staff={staff} />;
}