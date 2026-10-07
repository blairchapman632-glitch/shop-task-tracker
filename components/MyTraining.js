// /me → Training (staff side): Records (add + certificates), Plan (read-only hours, S2/S3, goals) and
// Certificates (components/MyCertificates.js).
// Data: pages/api/me/training.js (login token, own records only, staff-facing fields only).
// Rules: lib/trainingPlan.js — the same functions Admin and the kiosk /training use, so numbers match exactly.
// Loads only when the Training tab is opened.
import { useEffect, useState } from "react";
import { callMeApi } from "./MyReview";
import CertificatesView from "./MyCertificates";
import { CERT_BUCKET, putFile, openSignedUrl } from "../lib/staffFiles";
import { hasPlan, hasGoals, hoursStatus, s2s3Status, STATE_STYLE } from "../lib/trainingPlan";
import { isPharmacistRole } from "../lib/staffDocuments";
import { fmtDateShort, perthDateOf, LABELS, REVIEW_TYPE_LABEL } from "../lib/performanceReview";

const API = "/api/me/training";
const inputCls = "w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400";
const cardCls = "bg-white rounded-2xl shadow-sm border p-4";
const fmtLong = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
const byNewest = (a, b) => String(b.training_date).localeCompare(String(a.training_date));

// Upload a certificate for one of my records -> the updated record
async function attachCert(record, file) {
  const ext = (String(file.name).split(".").pop() || "").toLowerCase();
  const t = await callMeApi(API, { action: "upload-url", record_id: record.id, ext });
  if (!t) throw new Error("Please log in with your email.");
  await putFile(CERT_BUCKET, t.path, t.token, file);
  return (await callMeApi(API, { action: "attach", record_id: record.id, path: t.path, filename: file.name })).record;
}

// target: { sub, section, n } from a To do nudge — opens that sub-tab (and certificate section); n changes each tap
export default function MyTrainingTab({ target = null }) {
  const [sub, setSub] = useState(target?.sub || "records"); // "records" | "plan" | "certificates"
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    callMeApi(API)
      .then((d) => { if (!cancelled) { if (d) setData(d); else setError("Please log in with your email to see your training."); } })
      .catch((err) => { if (!cancelled) setError(err?.message || String(err)); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { if (target?.sub) setSub(target.sub); }, [target?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  const setRecords = (fn) => setData((d) => ({ ...d, records: fn(d.records) }));

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="flex gap-1">
        {[{ key: "records", label: "📚 Records" }, { key: "plan", label: "🎯 Plan" }, { key: "certificates", label: "📄 Certificates" }].map((t) => (
          <button key={t.key} onClick={() => setSub(t.key)}
            className={`flex-1 min-w-0 text-xs sm:text-sm rounded-lg py-2 font-medium whitespace-nowrap ${sub === t.key ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            {t.label}
          </button>
        ))}
      </div>
      {sub === "certificates" ? (
        <CertificatesView key={target?.n || 0} focusSection={target?.sub === "certificates" ? target.section : null} />
      ) : error ? (
        <div className={`${cardCls} text-sm text-red-500 text-center`}>{error}</div>
      ) : !data ? (
        <div className="text-sm text-gray-400 text-center mt-10">Loading…</div>
      ) : sub === "records" ? (
        <RecordsView records={data.records} setRecords={setRecords} />
      ) : (
        <PlanView data={data} />
      )}
    </div>
  );
}

// ─── Records ─────────────────────────────────────────────────────────────────

function RecordsView({ records, setRecords }) {
  const [topic, setTopic] = useState("");
  const [date, setDate] = useState("");
  const [hours, setHours] = useState("");
  const [provider, setProvider] = useState("");
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [certBusyId, setCertBusyId] = useState(null);
  const [certError, setCertError] = useState("");

  const handleAdd = async () => {
    setError("");
    if (!topic.trim()) { setError("Topic is required."); return; }
    if (!date) { setError("Date is required."); return; }
    if (hours === "" || isNaN(Number(hours))) { setError("Hours is required."); return; }
    const dup = records.find((r) => r.topic?.trim().toLowerCase() === topic.trim().toLowerCase() && r.training_date === date);
    if (dup && !window.confirm(`You already have a record for "${topic.trim()}" on that date. Add it again anyway?`)) return;
    setSaving(true);
    try {
      const out = await callMeApi(API, { action: "add", topic: topic.trim(), training_date: date, hours: Number(hours), provider: provider.trim() });
      if (!out) throw new Error("Please log in with your email.");
      let rec = out.record;
      // Certificate after the record exists (the record is kept even if this fails)
      let certErr = null;
      if (file) {
        try { rec = await attachCert(rec, file); } catch (e) { certErr = e; }
      }
      setRecords((prev) => [rec, ...prev].sort(byNewest));
      setTopic(""); setDate(""); setHours(""); setProvider(""); setFile(null);
      if (certErr) {
        setError("Training saved, but the certificate didn't upload — use 📎 Add on the record to try again. (" + (certErr?.message || String(certErr)) + ")");
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (err) {
      setError("Couldn't save: " + (err?.message || String(err)));
    } finally {
      setSaving(false);
    }
  };

  const handleCert = async (record, selected) => {
    if (!selected) return;
    setCertError("");
    setCertBusyId(record.id);
    try {
      const updated = await attachCert(record, selected); // replaces (and removes) any older certificate
      setRecords((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch (err) {
      setCertError("Couldn't attach certificate: " + (err?.message || String(err)));
    } finally {
      setCertBusyId(null);
    }
  };

  const openCert = (record) => openSignedUrl(async () => {
    const out = await callMeApi(API, { action: "url", record_id: record.id });
    if (!out?.url) throw new Error("Please log in with your email.");
    return out.url;
  });

  return (
    <>
      <div className={`${cardCls} space-y-3`}>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Add training</div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Topic *</label>
          <input value={topic} onChange={(e) => setTopic(e.target.value)} className={inputCls} placeholder="e.g. Wound care module" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date *</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Hours *</label>
            <input type="text" inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value.replace(/[^\d.]/g, ""))} className={inputCls} placeholder="e.g. 1.5" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Training provider</label>
          <input value={provider} onChange={(e) => setProvider(e.target.value)} className={inputCls} placeholder="e.g. Guild Training" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Certificate (optional — PDF or photo)</label>
          <label className="flex items-center gap-2 w-full border-2 border-dashed rounded-lg px-3 py-2.5 cursor-pointer border-gray-200 hover:border-blue-300 hover:bg-blue-50">
            <span className="text-gray-400">📎</span>
            <span className="text-xs text-gray-500 truncate">{file ? file.name : "Attach certificate"}</span>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button onClick={handleAdd} disabled={saving} className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-medium disabled:opacity-40">
          {saving ? "Saving…" : "Add training record"}
        </button>
        {saved && (
          <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-center text-sm text-green-700 font-medium">✅ Training record saved.</div>
        )}
      </div>

      <div className={cardCls}>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Your records {records.length > 0 && <span className="text-gray-400 font-normal">({records.length})</span>}
        </div>
        {records.length === 0 ? (
          <p className="text-sm text-gray-400">No training recorded yet.</p>
        ) : (
          <div className="space-y-1.5">
            {records.map((r, i) => {
              const yr = r.training_date ? r.training_date.slice(0, 4) : "";
              const prevYr = i > 0 && records[i - 1].training_date ? records[i - 1].training_date.slice(0, 4) : "";
              return (
                <div key={r.id}>
                  {yr && yr !== prevYr && <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide pt-2 pb-1">{yr}</div>}
                  <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 flex items-start gap-2">
                    <span className="text-sm">📚</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-700 break-words">{r.topic}</div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        {fmtLong(r.training_date)} · {Number(r.hours)} hr{Number(r.hours) === 1 ? "" : "s"}{r.provider ? ` · ${r.provider}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {r.has_certificate && (
                        <button type="button" onClick={() => openCert(r)} className="text-xs text-blue-600 hover:underline">Certificate</button>
                      )}
                      <label className={`text-xs cursor-pointer hover:underline ${r.has_certificate ? "text-gray-500" : "text-blue-600"} ${certBusyId === r.id ? "opacity-40 pointer-events-none" : ""}`}>
                        {certBusyId === r.id ? "Uploading…" : r.has_certificate ? "Replace" : "📎 Add"}
                        <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                          onChange={(e) => { const f = e.target.files?.[0] || null; e.target.value = ""; handleCert(r, f); }} />
                      </label>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {certError && <p className="text-sm text-red-500 mt-2">{certError}</p>}
        <p className="text-[11px] text-gray-400 mt-3">Need to change or remove a record? Ask your manager.</p>
      </div>
    </>
  );
}

// ─── Plan (read-only) ────────────────────────────────────────────────────────

function HoursBar({ label, range, done, req, note = null }) {
  const met = done >= req;
  const pct = req > 0 ? Math.min(100, Math.round((done / req) * 100)) : 100;
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className={`text-sm font-medium shrink-0 ${met ? "text-green-600" : "text-gray-700"}`}>{done} of {req} hours {met ? "✓" : ""}</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden mt-1">
        <div className={`h-2 rounded-full ${met ? "bg-green-500" : "bg-blue-500"}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-[11px] text-gray-400 mt-1">{range}</div>
      {note && <div className="text-[11px] text-gray-600 mt-0.5">✓ {note}</div>}
    </div>
  );
}

function PlanView({ data }) {
  const { staff, records, anchor, exemptions, s2s3, review, goals } = data;
  const plan = hasPlan(staff);
  const progress = plan ? hoursStatus(staff, records, exemptions, anchor) : null;
  const s2 = plan ? s2s3Status(staff, s2s3) : null;

  return (
    <>
      {plan && (
        <div className={`${cardCls} space-y-3`}>
          <div className="text-sm font-semibold text-gray-700">Training plan</div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-gray-700">S2/S3 certificate</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full border shrink-0 ${STATE_STYLE[s2.state]}`}>{s2.label}</span>
          </div>
          {!progress ? (
            <p className="text-xs text-gray-500">Your training hours can't be counted yet — the pharmacy's QSPP anniversary date hasn't been set.</p>
          ) : (
            <>
              <HoursBar
                label="This training year"
                range={`${fmtDateShort(progress.year.start)} – ${fmtDateShort(progress.year.end)}`}
                done={progress.yearDone} req={progress.yearReq}
                note={progress.exemption ? "Not required this training year" : null}
              />
              <HoursBar
                label="This QSPP cycle"
                range={`${fmtDateShort(progress.cycle.start)} – ${fmtDateShort(progress.cycle.end)}`}
                done={progress.cycleDone} req={progress.cycleReq}
              />
            </>
          )}
        </div>
      )}
      {isPharmacistRole(staff.role) && (
        <div className={`${cardCls} text-sm text-gray-700`}>CPD managed by the pharmacist under Pharmacy Board requirements.</div>
      )}
      {hasGoals(staff) && <GoalsCard review={review} goals={goals} />}
    </>
  );
}

function GoalsCard({ review, goals }) {
  const [showDone, setShowDone] = useState(false);
  const reviewGoals = review?.goals || [];
  const open = goals.filter((g) => !g.done);
  const done = goals.filter((g) => g.done).sort((a, b) => String(b.done_at || "").localeCompare(String(a.done_at || "")));

  return (
    <div className={`${cardCls} space-y-3`}>
      <div className="text-sm font-semibold text-gray-700">Training &amp; development goals</div>
      {reviewGoals.length === 0 && goals.length === 0 ? (
        <p className="text-sm text-gray-400">No goals yet.</p>
      ) : (
        <>
          {reviewGoals.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-gray-400 uppercase">
                From your {REVIEW_TYPE_LABEL[review.review_type] ? `${REVIEW_TYPE_LABEL[review.review_type].toLowerCase()} ` : ""}review of {fmtDateShort(review.meeting_date || perthDateOf(review.signed_at))}
              </div>
              {reviewGoals.map((g, i) => (
                <div key={i} className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
                  <div className="text-sm text-gray-800 whitespace-pre-wrap">{g.goal || "—"}</div>
                  {g.actions && <div className="text-xs text-gray-500 mt-0.5 whitespace-pre-wrap">{LABELS.actions}: {g.actions}</div>}
                  {g.target_date && <div className="text-[11px] text-gray-400 mt-0.5">{LABELS.targetDate}: {fmtDateShort(g.target_date)}</div>}
                </div>
              ))}
            </div>
          )}
          {goals.length > 0 && (
            <div className="space-y-1.5">
              {reviewGoals.length > 0 && <div className="text-[11px] font-semibold text-gray-400 uppercase">Other goals</div>}
              {open.map((g) => <GoalRow key={g.id} goal={g} />)}
              {open.length === 0 && <p className="text-xs text-gray-400">No open goals.</p>}
              {done.length > 0 && (
                <div>
                  <button type="button" onClick={() => setShowDone((v) => !v)} className="text-xs text-gray-500 hover:text-gray-700">
                    {showDone ? "Hide" : "Show"} completed goals ({done.length})
                  </button>
                  {showDone && <div className="mt-1.5 space-y-1.5">{done.map((g) => <GoalRow key={g.id} goal={g} />)}</div>}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function GoalRow({ goal }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${goal.done ? "border-gray-100 bg-gray-50" : "border-gray-200"}`}>
      <div className={`text-sm whitespace-pre-wrap ${goal.done ? "text-gray-500 line-through" : "text-gray-800"}`}>{goal.goal}</div>
      {goal.notes && <div className="text-xs text-gray-500 mt-0.5 whitespace-pre-wrap">{goal.notes}</div>}
      {goal.done && goal.done_at && <div className="text-[11px] text-gray-400 mt-0.5">Done {fmtDateShort(perthDateOf(goal.done_at))}</div>}
    </div>
  );
}
