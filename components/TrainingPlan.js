// Training & Development Plan on the Admin staff form (Training tab, above the existing records):
//   Plan (Pharmacy Assistant / DAA / Retail Manager): S2/S3 certificate from Documents + training hours this year / this cycle
//   Pharmacists / interns: CPD line + required certificates of their ticked services (status read from Documents)
//   Policies (all staff except locums): to read / read, from QSPP library read requests (read-only)
//   Goals (all staff except locums): Section 4 of their latest signed review + manual goals
//   Download training record (PDF)
// Rules live in lib/trainingPlan.js.
import { useEffect, useState } from "react";
import supabase from "../lib/supabaseClient";
import { SETTINGS_COLUMNS, HOURS_PER_YEAR, hasPlan, hasGoals, hoursStatus, s2s3Status, STATE_STYLE } from "../lib/trainingPlan";
import { addMonthsStr, todayPerth, perthDateOf, fmtDateShort, LABELS, REVIEW_TYPE_LABEL } from "../lib/performanceReview";
import { isPharmacistRole, loadServiceConfig, docSections, sectionStatus, DOC_STATE_STYLE } from "../lib/staffDocuments";
import { viaLabel } from "../lib/policyReads";
import { docHasFile, openStaffDoc } from "../lib/staffFiles";

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";

const inputCls = "w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400";
const sectionTitleCls = "text-xs font-semibold text-gray-500 uppercase tracking-wide";

export default function StaffTrainingPlan({ member, records, documents, adminUser, onOpenReview }) {
  const [settings, setSettings] = useState(null);
  const [exemptions, setExemptions] = useState([]);
  const [goals, setGoals] = useState([]);
  const [review, setReview] = useState(null);
  const [services, setServices] = useState(null);
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const [st, ex, gl, rv, pr] = await Promise.all([
        supabase.from("pharmacy_settings").select(SETTINGS_COLUMNS).eq("pharmacy_id", PHARMACY_ID).maybeSingle(),
        supabase.from("staff_training_exemptions").select("*").eq("staff_id", member.id),
        supabase.from("staff_training_goals").select("*").eq("staff_id", member.id).order("created_at"),
        supabase.from("performance_reviews").select("id, review_type, meeting_date, signed_at, goals")
          .eq("staff_id", member.id).eq("status", "signed").order("signed_at", { ascending: false }).limit(1),
        supabase.from("policy_read_requests").select("id, status, requested_at, read_at, read_via, read_file_name, document:document_id(title, active)")
          .eq("staff_id", member.id).in("status", ["outstanding", "read"]).order("requested_at", { ascending: false }),
      ]);
      const firstErr = [st, ex, gl, rv, pr].find((r) => r.error)?.error;
      if (firstErr) throw firstErr;
      setSettings(st.data || {});
      setExemptions(ex.data || []);
      setGoals(gl.data || []);
      setReview(rv.data?.[0] || null);
      setPolicies(pr.data || []);
      if (isPharmacistRole(member.role)) setServices(await loadServiceConfig(supabase, PHARMACY_ID, [member.id]));
      setError("");
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member.id]);

  if (loading) return <p className="text-xs text-gray-400">Loading training plan…</p>;
  if (error) return <p className="text-xs text-red-500">Couldn't load the training plan: {error}</p>;

  const anchor = settings?.qspp_cycle_start_date || null;
  const hours = hoursStatus(member, records, exemptions, anchor);

  return (
    <div className="space-y-5">
      {isPharmacistRole(member.role) && <PharmacistSection member={member} documents={documents} services={services} />}
      {hasPlan(member) && (
        <PlanSection member={member} hours={hours} documents={documents} adminUser={adminUser} reload={load} />
      )}
      {hasGoals(member) && (
        <GoalsSection member={member} review={review} goals={goals} adminUser={adminUser} onOpenReview={onOpenReview} reload={load} />
      )}
      {hasGoals(member) && <PoliciesSection policies={policies} />}
      <RecordDownload member={member} records={records} settings={settings} hours={hours} />
      <div className="border-t" />
    </div>
  );
}

// ─── Pharmacists / interns ───────────────────────────────────────────────────

function PharmacistSection({ member, documents, services }) {
  const certs = docSections(member, services).filter((sec) => sec.kind === "service");
  return (
    <section className="space-y-2">
      <div className={sectionTitleCls}>Training plan</div>
      <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700">
        CPD managed by the pharmacist under Pharmacy Board requirements.
      </div>
      <div className="text-[11px] font-semibold text-gray-400 uppercase pt-1">Required certificates</div>
      {certs.length === 0 ? (
        <p className="text-xs text-gray-400">No services ticked on their Profile tab.</p>
      ) : certs.map((sec, i) => {
        const st = sectionStatus(sec, documents);
        const header = sec.group !== certs[i - 1]?.group ? <div className="text-xs font-medium text-gray-600 pt-1">{sec.group}</div> : null;
        return (
          <div key={sec.key}>
            {header}
            <div className="rounded-lg border border-gray-200 px-3 py-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm text-gray-800">{sec.title}</div>
                <div className="text-[11px] text-gray-400">{sec.certificate.renew_months ? `Renews every ${sec.certificate.renew_months} months` : "One-off"}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {docHasFile(st?.latest) && <button type="button" onClick={() => openStaffDoc(st.latest)} className="text-xs text-blue-600 hover:underline">Open</button>}
                {st && <span className={`text-[11px] px-2 py-0.5 rounded-full border ${DOC_STATE_STYLE[st.state]}`}>{st.label}</span>}
              </div>
            </div>
          </div>
        );
      })}
      {certs.length > 0 && <p className="text-[11px] text-gray-400">Upload certificates and completion dates on the Documents tab.</p>}
    </section>
  );
}

// ─── Plan (assistants / DAA / Retail Manager) ────────────────────────────────

function PlanSection({ member, hours, documents, adminUser, reload }) {
  const s2 = s2s3Status(member, documents);
  const badge = (state, text) => <span className={`text-[11px] px-2 py-0.5 rounded-full border shrink-0 ${STATE_STYLE[state]}`}>{text}</span>;

  return (
    <section className="space-y-2">
      <div className={sectionTitleCls}>Training plan</div>

      <div className="rounded-lg border border-gray-200 px-3 py-2 flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-gray-800">S2/S3</div>
          <div className="text-[11px] text-gray-400">From the Documents tab</div>
        </div>
        <div className="flex items-center gap-2">
          {docHasFile(s2.doc) && <button type="button" onClick={() => openStaffDoc(s2.doc)} className="text-xs text-blue-600 hover:underline">Open</button>}
          {badge(s2.state, s2.label)}
        </div>
      </div>

      {!hours ? (
        <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-700">
          Set the QSPP anniversary date in QSPP → Training to count training hours.
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 px-3 py-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium text-gray-800">This training year</div>
              <div className="text-[11px] text-gray-400">{fmtDateShort(hours.year.start)} – {fmtDateShort(hours.year.end)}</div>
            </div>
            {badge(hours.yearShort ? "short" : "done", `${hours.yearDone} of ${hours.yearReq} hours`)}
          </div>
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium text-gray-800">This QSPP cycle</div>
              <div className="text-[11px] text-gray-400">{fmtDateShort(hours.cycle.start)} – {fmtDateShort(hours.cycle.end)}</div>
            </div>
            {badge(hours.cycleShort ? "short" : "done", `${hours.cycleDone} of ${hours.cycleReq} hours`)}
          </div>
          <Exemption member={member} hours={hours} adminUser={adminUser} reload={reload} />
          <p className="text-[11px] text-gray-400">
            Counts every training record below. {HOURS_PER_YEAR} hours per training year, pro-rata in the year they started.
          </p>
        </div>
      )}
    </section>
  );
}

function Exemption({ member, hours, adminUser, reload }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const ex = hours.exemption;

  const handleSave = async () => {
    if (!reason.trim()) { alert("Add a reason."); return; }
    setBusy(true);
    const { error } = await supabase.from("staff_training_exemptions").insert([{
      pharmacy_id: member.pharmacy_id || PHARMACY_ID,
      staff_id: member.id,
      training_year_start: hours.year.start,
      reason: reason.trim(),
      created_by: adminUser?.id ?? null,
    }]);
    setBusy(false);
    if (error) { alert("Couldn't save: " + error.message); return; }
    setOpen(false);
    setReason("");
    reload();
  };

  const handleUndo = async () => {
    if (!window.confirm("Make training hours required again for this training year?")) return;
    setBusy(true);
    const { error } = await supabase.from("staff_training_exemptions").delete().eq("staff_id", member.id).eq("training_year_start", hours.year.start);
    setBusy(false);
    if (error) { alert("Couldn't undo: " + error.message); return; }
    reload();
  };

  if (ex) {
    return (
      <div className="text-xs text-gray-600 bg-gray-50 rounded px-2 py-1.5 flex items-start justify-between gap-2">
        <span>✓ Not required this training year{ex.reason ? ` — ${ex.reason}` : ""}</span>
        <button type="button" onClick={handleUndo} disabled={busy} className="text-red-500 hover:text-red-600 shrink-0">Undo</button>
      </div>
    );
  }
  if (!open) {
    return (
      <label className="flex items-center gap-2 text-xs text-gray-600">
        <input type="checkbox" checked={false} onChange={() => setOpen(true)} />
        Not required this training year
      </label>
    );
  }
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-2 text-xs text-gray-600">
        <input type="checkbox" checked onChange={() => { setOpen(false); setReason(""); }} />
        Not required this training year
      </label>
      <div className="flex gap-2">
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason, e.g. extended leave" className={inputCls} autoFocus />
        <button type="button" onClick={handleSave} disabled={busy} className="text-xs px-3 rounded-lg bg-blue-600 text-white disabled:opacity-40 shrink-0">Save</button>
      </div>
    </div>
  );
}

// ─── Goals ───────────────────────────────────────────────────────────────────

function GoalsSection({ member, review, goals, adminUser, onOpenReview, reload }) {
  const [showDone, setShowDone] = useState(false);
  const [adding, setAdding] = useState(false);
  const reviewGoals = (Array.isArray(review?.goals) ? review.goals : []).filter((g) => g && (g.goal || g.actions || g.target_date));
  const open = goals.filter((g) => !g.done);
  const done = goals.filter((g) => g.done).sort((a, b) => String(b.done_at || "").localeCompare(String(a.done_at || "")));

  return (
    <section className="border-t pt-4 space-y-3">
      <div className={sectionTitleCls}>Training &amp; development goals</div>

      {/* From the latest signed performance review (read-only) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-semibold text-gray-400 uppercase">From performance review</div>
          {review && (
            <button type="button" onClick={() => onOpenReview(review.id)} className="text-xs text-blue-600 hover:text-blue-700">Open review →</button>
          )}
        </div>
        {!review ? (
          <p className="text-xs text-gray-400">No signed performance review yet.</p>
        ) : (
          <>
            <p className="text-[11px] text-gray-400">
              {REVIEW_TYPE_LABEL[review.review_type] || ""} review of {fmtDateShort(review.meeting_date || perthDateOf(review.signed_at))}
            </p>
            {reviewGoals.length === 0 ? (
              <p className="text-xs text-gray-400">No goals recorded in that review.</p>
            ) : reviewGoals.map((g, i) => (
              <div key={i} className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
                <div className="text-sm text-gray-800 whitespace-pre-wrap">{g.goal || "—"}</div>
                {g.actions && <div className="text-xs text-gray-500 mt-0.5 whitespace-pre-wrap">{LABELS.actions}: {g.actions}</div>}
                {g.target_date && <div className="text-[11px] text-gray-400 mt-0.5">{LABELS.targetDate}: {fmtDateShort(g.target_date)}</div>}
              </div>
            ))}
          </>
        )}
      </div>

      {/* Manual goals */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-semibold text-gray-400 uppercase">Other goals</div>
          {!adding && <button type="button" onClick={() => setAdding(true)} className="text-xs text-blue-600 hover:text-blue-700">+ Add goal</button>}
        </div>
        {adding && <GoalForm member={member} adminUser={adminUser} onCancel={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
        {open.length === 0 && !adding && <p className="text-xs text-gray-400">No open goals.</p>}
        {open.map((g) => <GoalRow key={g.id} goal={g} member={member} reload={reload} />)}
        {done.length > 0 && (
          <div>
            <button type="button" onClick={() => setShowDone((v) => !v)} className="text-xs text-gray-500 hover:text-gray-700">
              {showDone ? "Hide" : "Show"} completed training goals ({done.length})
            </button>
            {showDone && <div className="mt-1.5 space-y-1.5">{done.map((g) => <GoalRow key={g.id} goal={g} member={member} reload={reload} />)}</div>}
          </div>
        )}
      </div>
    </section>
  );
}

function GoalRow({ goal, member, reload }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const toggleDone = async () => {
    setBusy(true);
    const nowIso = new Date().toISOString();
    const { error } = await supabase.from("staff_training_goals")
      .update({ done: !goal.done, done_at: goal.done ? null : nowIso, updated_at: nowIso }).eq("id", goal.id);
    setBusy(false);
    if (error) { alert("Couldn't update: " + error.message); return; }
    reload();
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete this goal?\n\n${goal.goal}`)) return;
    setBusy(true);
    const { error } = await supabase.from("staff_training_goals").delete().eq("id", goal.id);
    setBusy(false);
    if (error) { alert("Couldn't delete: " + error.message); return; }
    reload();
  };

  if (editing) {
    return <GoalForm member={member} goal={goal} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); }} />;
  }
  return (
    <div className={`rounded-lg border px-3 py-2 ${goal.done ? "border-gray-100 bg-gray-50" : "border-gray-200"}`}>
      <div className="flex items-start gap-2">
        <input type="checkbox" checked={!!goal.done} onChange={toggleDone} disabled={busy} className="mt-1" title="Done" />
        <div className="min-w-0 flex-1">
          <div className={`text-sm whitespace-pre-wrap ${goal.done ? "text-gray-500 line-through" : "text-gray-800"}`}>{goal.goal}</div>
          {goal.notes && <div className="text-xs text-gray-500 mt-0.5 whitespace-pre-wrap">{goal.notes}</div>}
          {goal.done && goal.done_at && <div className="text-[11px] text-gray-400 mt-0.5">Done {fmtDateShort(perthDateOf(goal.done_at))}</div>}
        </div>
        <button type="button" onClick={() => setEditing(true)} className="text-xs text-blue-600 hover:text-blue-700 shrink-0">Edit</button>
        <button type="button" onClick={handleDelete} disabled={busy} className="text-xs text-red-500 hover:text-red-600 shrink-0">Delete</button>
      </div>
    </div>
  );
}

function GoalForm({ member, goal, adminUser, onCancel, onSaved }) {
  const [text, setText] = useState(goal?.goal || "");
  const [notes, setNotes] = useState(goal?.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!text.trim()) { setError("Write the goal."); return; }
    setSaving(true);
    setError("");
    const nowIso = new Date().toISOString();
    const { error: err } = goal
      ? await supabase.from("staff_training_goals").update({ goal: text.trim(), notes: notes.trim() || null, updated_at: nowIso }).eq("id", goal.id)
      : await supabase.from("staff_training_goals").insert([{
        pharmacy_id: member.pharmacy_id || PHARMACY_ID,
        staff_id: member.id,
        goal: text.trim(),
        notes: notes.trim() || null,
        created_by: adminUser?.id ?? null,
      }]);
    setSaving(false);
    if (err) { setError("Couldn't save: " + err.message); return; }
    onSaved();
  };

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 space-y-2">
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Goal" className={inputCls} autoFocus />
      <div>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" rows={3} className={`${inputCls} resize-y`} />
        <p className="text-[11px] text-gray-400 mt-0.5">Staff can see this (goal and notes) in Chalkboard Pocket → Training → Plan.</p>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="flex-1 border border-gray-300 rounded-lg py-1.5 text-xs text-gray-600 hover:bg-white">Cancel</button>
        <button type="button" onClick={handleSave} disabled={saving} className="flex-1 bg-blue-600 text-white rounded-lg py-1.5 text-xs font-medium disabled:opacity-40">
          {saving ? "Saving…" : goal ? "Save" : "Add goal"}
        </button>
      </div>
    </div>
  );
}

// ─── Policies (QSPP library read requests, read-only) ───────────────────────

function PoliciesSection({ policies }) {
  const toRead = policies.filter((p) => p.status === "outstanding" && p.document?.active !== false);
  const read = policies.filter((p) => p.status === "read").sort((a, b) => String(b.read_at || "").localeCompare(String(a.read_at || "")));
  return (
    <section className="border-t pt-4 space-y-2">
      <div className={sectionTitleCls}>Policies</div>
      <div>
        <div className="text-[11px] font-semibold text-gray-400 uppercase mb-1">To read</div>
        {toRead.length === 0 ? <p className="text-xs text-gray-400">Nothing to read.</p> : (
          <div className="rounded-lg border border-gray-200 divide-y">
            {toRead.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                <span className="text-sm text-gray-800 truncate">{p.document?.title || "Policy"}</span>
                <span className="text-[11px] text-amber-700 shrink-0">Asked {fmtDateShort(perthDateOf(p.requested_at))}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <div className="text-[11px] font-semibold text-gray-400 uppercase mb-1">Read</div>
        {read.length === 0 ? <p className="text-xs text-gray-400">None yet.</p> : (
          <div className="rounded-lg border border-gray-200 divide-y">
            {read.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                <span className="text-sm text-gray-800 truncate">{p.document?.title || p.read_file_name || "Policy"}</span>
                <span className="text-[11px] text-green-700 shrink-0">✓ {fmtDateShort(perthDateOf(p.read_at))}{p.read_via ? ` · ${viaLabel(p.read_via)}` : ""}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Training record PDF (download only) ────────────────────────────────────

function RecordDownload({ member, records, settings, hours }) {
  const today = todayPerth();
  const [from, setFrom] = useState(hours?.year?.start || addMonthsStr(today, -12));
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false);

  const handleDownload = async () => {
    if (!from || !to || from > to) { alert("Choose a From date on or before the To date."); return; }
    setBusy(true);
    try {
      const { buildTrainingRecordPdf } = await import("../lib/trainingRecordPdf");
      const inRange = (records || []).filter((r) => r.training_date >= from && r.training_date <= to);
      const { bytes, warnings } = await buildTrainingRecordPdf({
        staffName: member.name, role: member.role,
        pharmacy: { name: settings?.name || "", address: settings?.address || "", phone: settings?.phone || "" },
        from, to, generatedOn: today, records: inRange,
      });
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `training_record_${String(member.name || "staff").replace(/\s+/g, "_").toLowerCase()}_${from}_${to}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      if (warnings.length) alert(warnings.join("\n"));
    } catch (err) {
      alert("Couldn't create the PDF: " + (err?.message || String(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="border-t pt-4 space-y-2">
      <div className={sectionTitleCls}>Training record</div>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-[11px] font-medium text-gray-600 mb-1">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-gray-600 mb-1">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm" />
        </div>
        <button type="button" onClick={handleDownload} disabled={busy} className="text-xs px-3 py-2 rounded-lg border border-green-300 text-green-700 hover:bg-green-50 disabled:opacity-40">
          {busy ? "Creating…" : "↓ Download training record (PDF)"}
        </button>
      </div>
    </section>
  );
}
