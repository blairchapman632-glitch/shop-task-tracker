// Admin → Staff → New starter → "4. Induction" (QSPP-4.9-induction-checklist v2.2).
// Manual ticks from Admin; Section 3 policy lines tick from kiosk reads; auto lines from staff data (lib/inductionAuto).
// Section 6 + sign-off: outcome / late reason saved here; employee confirms on the kiosk; supervisor signs off here or
// in their /me (pages/api/inductions/sign-off — rules checked server-side); PDF in the private staff-inductions bucket.
// onStaffUpdated(staffRow): called when starting the induction filled in an empty staff start date.
import { useEffect, useState } from "react";
import supabase from "../lib/supabaseClient";
import { adminFetch } from "../lib/adminFetch";
import { fmtDateShort, perthDateOf } from "../lib/performanceReview";
import {
  TEMPLATE_VERSION, SECTIONS, STUDENT_TEMPLATE_KEY, VIA_LABEL, OUTCOMES,
  positionForRole, dueDateFor, templateItemsFor, snapshotItem, inductionProgress, answerLabel,
  pickProbationReview, reviewDateOf, inductionReadiness,
} from "../lib/induction";
import { syncInductionAuto, isAutoLine, addTabFor, AUTO_SOURCES } from "../lib/inductionAuto";

// Open the checklist PDF (signed URL). The window opens first so it isn't blocked as a pop-up.
export async function openInductionPdf(inductionId) {
  const win = window.open("", "_blank");
  try {
    const res = await adminFetch(`/api/inductions/pdf-url?id=${encodeURIComponent(inductionId)}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.url) throw new Error(body.error || "Couldn't open the PDF");
    if (win) win.location.href = body.url; else window.open(body.url, "_blank");
  } catch (err) {
    if (win) win.close();
    alert(err?.message || String(err));
  }
}

// Staff → Documents: the signed-off Chalkboard checklist (opens via signed URL)
export function InductionPdfEntry({ member }) {
  const [ind, setInd] = useState(null);
  useEffect(() => {
    if (!member?.id) return;
    supabase.from("staff_inductions").select("id, status, signed_off_at, pdf_path").eq("staff_id", member.id).maybeSingle()
      .then(({ data }) => setInd(data || null));
  }, [member?.id]);
  if (!ind || ind.status !== "signed_off" || !ind.pdf_path) return null;
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2">
      <div>
        <div className="text-sm font-medium text-gray-700">Induction checklist</div>
        <div className="text-xs text-gray-400">Chalkboard · signed off {fmtDateShort(perthDateOf(ind.signed_off_at))}</div>
      </div>
      <button type="button" onClick={() => openInductionPdf(ind.id)} className="text-xs px-3 py-1.5 border rounded-lg text-gray-600 hover:bg-gray-50">Open</button>
    </div>
  );
}

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";

const inputCls = "w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400";
const sectionTitleCls = "text-xs font-semibold text-gray-500 uppercase tracking-wide";

// Timestamp -> "2 Nov" (Perth)
const fmtDayMonth = (iso) => fmtDateShort(perthDateOf(iso)).replace(/ \d{4}$/, "");

const ANSWER_STYLE = {
  done: "bg-green-600 text-white border-green-600",
  na: "bg-gray-500 text-white border-gray-500",
  declined: "bg-amber-500 text-white border-amber-500",
};

// onOpenTab(tab): switch the staff form to another tab (auto lines' "Add" links)
export default function InductionStep({ member, contracts, adminUser, onStaffUpdated, onOpenTab }) {
  const [induction, setInduction] = useState(null);
  const [items, setItems] = useState([]);
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [autoSrc, setAutoSrc] = useState(null); // sources the auto lines were checked against (for "Add" links)
  const [reviews, setReviews] = useState([]);   // their performance reviews (Section 6 uses the probation one)

  const load = async () => {
    const [{ data: ind, error: e1 }, { data: ppl }, { data: rv }] = await Promise.all([
      supabase.from("staff_inductions").select("*").eq("staff_id", member.id).maybeSingle(),
      supabase.from("staff").select("id, name, role, active").eq("pharmacy_id", PHARMACY_ID).order("name"),
      supabase.from("performance_reviews").select("id, review_type, status, reviewer_staff_id, meeting_date, signed_at, created_at").eq("staff_id", member.id),
    ]);
    setReviews(rv || []);
    let rows = [];
    let e2 = null;
    let src = null;
    if (ind) {
      const res = await supabase.from("staff_induction_items").select("*").eq("induction_id", ind.id).order("sort_order");
      rows = res.data || [];
      e2 = res.error;
      if (!e2) {
        try {
          ({ items: rows, src } = await syncInductionAuto(supabase, ind, rows)); // auto lines tick / untick themselves
        } catch (err) {
          console.error("[induction auto]", err);
        }
      }
    }
    setError(e1 || e2 ? (e1 || e2).message : "");
    setInduction(ind || null);
    setItems(rows);
    setAutoSrc(src);
    setPeople(ppl || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member.id]);

  const nameOf = (id) => people.find((p) => Number(p.id) === Number(id))?.name || "";
  const supervisors = people.filter((p) => p.active !== false && p.role !== "Locum" && Number(p.id) !== Number(member.id));

  if (loading) return <p className="text-xs text-gray-400">Loading…</p>;
  if (error) return <p className="text-xs text-red-500">Couldn't load the induction: {error}</p>;

  if (!induction) {
    if (!starting) {
      return (
        <div className="space-y-2">
          <p className="text-xs text-gray-400">No induction started yet.</p>
          <button type="button" onClick={() => setStarting(true)} className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
            Start induction
          </button>
        </div>
      );
    }
    return (
      <StartInduction
        member={member}
        contracts={contracts}
        supervisors={supervisors}
        adminUser={adminUser}
        onCancel={() => setStarting(false)}
        onStarted={async (staffRow) => { if (staffRow) onStaffUpdated?.(staffRow); setStarting(false); await load(); }}
      />
    );
  }

  return (
    <Checklist
      induction={induction}
      items={items}
      member={member}
      supervisors={supervisors}
      nameOf={nameOf}
      onInductionChanged={setInduction}
      onItemsChanged={setItems}
      onDeleted={load}
      onReload={load}
      autoSrc={autoSrc}
      review={pickProbationReview(reviews)}
      onOpenTab={onOpenTab}
    />
  );
}

// ─── Start ───────────────────────────────────────────────────────────────────

function StartInduction({ member, contracts, supervisors, adminUser, onCancel, onStarted }) {
  const position = positionForRole(member.role);
  const latestAccepted = (contracts || []).find((c) => c.status === "accepted"); // contracts are newest first
  const [supervisorId, setSupervisorId] = useState("");
  const [isStudent, setIsStudent] = useState(latestAccepted?.contract_templates?.key === STUDENT_TEMPLATE_KEY);
  const [startDate, setStartDate] = useState(member.start_date || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const dueDate = dueDateFor(startDate);

  const handleStart = async () => {
    if (!position) { setError("Set this person's role first (Basics above)."); return; }
    if (!supervisorId) { setError("Choose a supervisor."); return; }
    if (!startDate) { setError("Enter their start date."); return; }
    setSaving(true);
    setError("");
    try {
      // Fill in an empty staff start date (never overwrite one that's set)
      let staffRow = null;
      if (!member.start_date) {
        const { data, error: e } = await supabase.from("staff").update({ start_date: startDate })
          .eq("id", member.id).is("start_date", null).select("*").maybeSingle();
        if (e) throw e;
        staffRow = data;
      }

      const { data: template, error: tErr } = await supabase.from("induction_template_items").select("*")
        .eq("pharmacy_id", PHARMACY_ID).eq("template_version", TEMPLATE_VERSION).eq("active", true).order("sort_order");
      if (tErr) throw tErr;
      const mine = templateItemsFor(template, position, isStudent);
      if (!mine.length) throw new Error(`No ${TEMPLATE_VERSION} checklist items found for this role.`);

      const pharmacyId = member.pharmacy_id || PHARMACY_ID;
      const { data: ind, error: iErr } = await supabase.from("staff_inductions").insert([{
        pharmacy_id: pharmacyId,
        staff_id: member.id,
        supervisor_staff_id: Number(supervisorId),
        start_date: startDate,
        due_date: dueDate,
        template_version: TEMPLATE_VERSION,
        is_student: isStudent,
        status: "in_progress",
        created_by: adminUser?.id ?? null,
      }]).select("id, created_at").single();
      if (iErr) throw iErr;

      const { error: itErr } = await supabase.from("staff_induction_items").insert(mine.map((t) => snapshotItem(t, ind.id, pharmacyId)));
      if (itErr) {
        await supabase.from("staff_inductions").delete().eq("id", ind.id); // don't leave an empty induction behind
        throw itErr;
      }

      // Section 3 lines linked to a library document -> policy read requests (read on the kiosk induction card).
      // An outstanding request they already have for that document is reused (one outstanding per document + person).
      // New ones get requested_at = the induction's created_at, so Delete can tell them apart (reused = requested earlier).
      const docIds = [...new Set(mine.filter((t) => t.section === "3" && t.document_id).map((t) => String(t.document_id)))];
      if (docIds.length) {
        const { data: existing, error: exErr } = await supabase.from("policy_read_requests").select("id, document_id")
          .eq("staff_id", member.id).eq("status", "outstanding").in("document_id", docIds);
        if (exErr) throw exErr;
        const have = new Set((existing || []).map((r) => String(r.document_id)));
        if (existing?.length) {
          const { error: e } = await supabase.from("policy_read_requests").update({ induction_id: ind.id }).in("id", existing.map((r) => r.id));
          if (e) throw e;
        }
        const toAdd = docIds.filter((d) => !have.has(d)).map((d) => ({
          pharmacy_id: pharmacyId,
          document_id: d,
          staff_id: member.id,
          requested_by: adminUser?.id ?? null,
          requested_at: ind.created_at,
          status: "outstanding",
          induction_id: ind.id,
        }));
        if (toAdd.length) {
          const { error: e } = await supabase.from("policy_read_requests").insert(toAdd);
          if (e) throw new Error(`Induction started, but the policies couldn't be sent (${e.message}). Delete the induction and start again.`);
        }
      }
      onStarted(staffRow);
    } catch (err) {
      setError("Couldn't start the induction: " + (err?.message || String(err)));
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-gray-700">Start induction — {member.name}</div>
        <button type="button" onClick={onCancel} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
      </div>
      {!position && <p className="text-xs text-amber-700">No role set — choose a role in Basics and save first.</p>}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Supervisor</label>
        <select value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)} className={inputCls}>
          <option value="">— Select supervisor —</option>
          {supervisors.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      {!member.start_date && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Start date</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-48 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
          <p className="text-[11px] text-gray-400 mt-1">Also saved as their start date on the staff record.</p>
        </div>
      )}
      <label className="flex items-start gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={isStudent} onChange={(e) => setIsStudent(e.target.checked)} className="mt-0.5" />
        <span>
          Pharmacy student
          <span className="block text-xs text-gray-400">Adds the student lines (placement agreement, university details, AHPRA student registration)</span>
        </span>
      </label>
      <p className="text-xs text-gray-500">Complete by: <span className="font-medium text-gray-700">{dueDate ? fmtDateShort(dueDate) : "—"}</span> (start date + 3 months)</p>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button type="button" onClick={handleStart} disabled={saving} className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-40">
        {saving ? "Starting…" : "Start induction"}
      </button>
    </div>
  );
}

// ─── Checklist ───────────────────────────────────────────────────────────────

function Checklist({ induction, items, member, supervisors, nameOf, onInductionChanged, onItemsChanged, onDeleted, onReload, autoSrc, review, onOpenTab }) {
  const [open, setOpen] = useState({}); // section key -> expanded
  const [error, setError] = useState("");
  const locked = induction.status === "signed_off";
  const progress = inductionProgress(items);

  const updateItem = async (item, patch) => {
    setError("");
    const prev = items;
    onItemsChanged(items.map((i) => (i.id === item.id ? { ...i, ...patch } : i)));
    const { error: err } = await supabase.from("staff_induction_items").update(patch).eq("id", item.id);
    if (err) { onItemsChanged(prev); setError("Couldn't save: " + err.message); }
  };

  const setAnswer = (item, answer) => {
    if (locked) return;
    if (item.result === answer && item.signed_via !== "auto") { // tapping Done on an auto tick makes it a manual Done
      updateItem(item, { result: null, signed_via: null, signed_at: null, signed_by_staff_id: null }); // untick
    } else {
      updateItem(item, {
        result: answer, signed_via: "admin", signed_at: new Date().toISOString(), signed_by_staff_id: null,
        ...(item.signed_via === "auto" && item.section !== "3" ? { note: null } : {}), // drop the auto note when Admin takes over
      });
    }
  };

  const changeSupervisor = async (id) => {
    setError("");
    const { data, error: err } = await supabase.from("staff_inductions")
      .update({ supervisor_staff_id: id ? Number(id) : null, updated_at: new Date().toISOString() })
      .eq("id", induction.id).select("*").single();
    if (err) { setError("Couldn't change supervisor: " + err.message); return; }
    onInductionChanged(data);
  };

  const addOther = async (section, wording) => {
    setError("");
    const inSection = items.filter((i) => i.section === section.key);
    const sort = Math.max(1000, ...inSection.map((i) => i.sort_order || 0)) + 10; // after the template lines
    const { data, error: err } = await supabase.from("staff_induction_items").insert([{
      pharmacy_id: induction.pharmacy_id || PHARMACY_ID,
      induction_id: induction.id,
      is_custom: true,
      section: section.key,
      group_heading: section.otherHeading,
      wording,
      sort_order: sort,
      allowed_answers: ["done", "na"],
      kind: "manual",
    }]).select("*").single();
    if (err) { setError("Couldn't add the item: " + err.message); return false; }
    onItemsChanged([...items, data]);
    return true;
  };

  // Ticks every unanswered line in the section as Done (lines can still be changed one by one)
  const markSectionDone = async (rows) => {
    if (locked) return;
    const ids = rows.filter((i) => !i.result && (i.allowed_answers || ["done"]).includes("done")).map((i) => i.id);
    if (!ids.length) return;
    setError("");
    const patch = { result: "done", signed_via: "admin", signed_at: new Date().toISOString(), signed_by_staff_id: null };
    const prev = items;
    onItemsChanged(items.map((i) => (ids.includes(i.id) ? { ...i, ...patch } : i)));
    const { error: err } = await supabase.from("staff_induction_items").update(patch).in("id", ids);
    if (err) { onItemsChanged(prev); setError("Couldn't save: " + err.message); }
  };

  const deleteInduction = async () => {
    if (locked) return;
    if (!window.confirm(`Delete ${member.name}'s induction and all its ticks? This can't be undone.`)) return;
    setError("");
    // Outstanding requests this induction CREATED (requested_at = its created_at) are cancelled. Reused ones (outstanding
    // before it started) stay outstanding, and read ones are kept as evidence — their induction_id is cleared by the FK.
    const { error: cErr } = await supabase.from("policy_read_requests")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("induction_id", induction.id).eq("status", "outstanding").gte("requested_at", induction.created_at);
    if (cErr) { setError("Couldn't cancel its policy requests: " + cErr.message); return; }
    const { error: err } = await supabase.from("staff_inductions").delete().eq("id", induction.id).eq("status", "in_progress"); // lines go with it (cascade)
    if (err) { setError("Couldn't delete: " + err.message); return; }
    onDeleted();
  };

  const removeOther = async (item) => {
    if (!window.confirm(`Remove "${item.wording}"?`)) return;
    const { error: err } = await supabase.from("staff_induction_items").delete().eq("id", item.id);
    if (err) { setError("Couldn't remove: " + err.message); return; }
    onItemsChanged(items.filter((i) => i.id !== item.id));
  };

  const currentSupervisorListed = supervisors.some((p) => Number(p.id) === Number(induction.supervisor_staff_id));

  const renderSection = (section) => {
    const rows = items.filter((i) => i.section === section.key).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    if (!rows.length && !section.otherHeading) return null;
    const p = inductionProgress(rows);
    const isOpen = !!open[section.key];
    // Group by heading, keeping sort order
    const groups = [];
    for (const r of rows) {
      const last = groups[groups.length - 1];
      if (last && last.heading === (r.group_heading || "")) last.rows.push(r);
      else groups.push({ heading: r.group_heading || "", rows: [r] });
    }
    return (
      <div key={section.key} className="rounded-lg border border-gray-200">
        <button
          type="button"
          onClick={() => setOpen((o) => ({ ...o, [section.key]: !o[section.key] }))}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-50"
        >
          <span>
            <span className="text-sm font-medium text-gray-800">{section.title}</span>
            {section.sub && <span className="text-xs text-gray-400"> · {section.sub}</span>}
          </span>
          <span className="flex items-center gap-2 shrink-0">
            <span className={`text-[11px] ${p.total && p.done === p.total ? "text-green-700 font-medium" : "text-gray-500"}`}>{p.done} of {p.total}</span>
            <span className="text-gray-400 text-xs">{isOpen ? "▲" : "▼"}</span>
          </span>
        </button>
        {isOpen && (
          <div className="border-t px-3 py-2 space-y-3">
            {groups.map((g) => (
              <div key={g.heading || "_"} className="space-y-1">
                {g.heading && <div className="text-[11px] font-semibold text-gray-500 uppercase">{g.heading}</div>}
                {g.rows.map((item) => (
                  <ItemRow key={item.id} item={item} locked={locked} nameOf={nameOf} autoSrc={autoSrc} onOpenTab={onOpenTab} onAnswer={setAnswer} onNote={(note) => updateItem(item, { note })} onRemove={removeOther} />
                ))}
              </div>
            ))}
            {section.otherHeading && !locked && <AddOther section={section} onAdd={addOther} />}
            {section.markAll && !locked && p.done < p.total && (
              <button type="button" onClick={() => markSectionDone(rows)} className="text-xs px-3 py-1 rounded-lg border border-green-300 text-green-700 hover:bg-green-50">
                Mark section done
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const rebuildPdf = async () => {
    setError("");
    const res = await adminFetch("/api/inductions/rebuild-pdf", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: induction.id }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setError("Couldn't rebuild the PDF: " + (body.error || res.status)); return; }
    await onReload();
    alert("PDF rebuilt.");
  };

  const reopen = async () => {
    const reason = window.prompt(`Reopen ${member.name}'s induction? Both sign-offs are cleared; every tick is kept.\n\nReason:`);
    if (reason === null) return;
    if (!reason.trim()) { alert("A reason is needed to reopen."); return; }
    setError("");
    const res = await adminFetch("/api/inductions/reopen", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: induction.id, reason }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setError("Couldn't reopen: " + (body.error || res.status)); return; }
    await onReload();
  };

  return (
    <div className="space-y-3">
      {locked && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 space-y-2">
          <div className="text-sm font-medium text-green-800">✓ Induction complete {fmtDateShort(perthDateOf(induction.signed_off_at))}</div>
          <div className="text-xs text-green-700">
            Signed off by {nameOf(induction.signed_off_by_staff_id) || "—"}{induction.signed_off_via === "me" ? " (staff app)" : " (Admin)"}
          </div>
          <div className="flex flex-wrap gap-2">
            {induction.pdf_path
              ? <button type="button" onClick={() => openInductionPdf(induction.id)} className="text-xs px-3 py-1.5 rounded-lg bg-white border border-green-300 text-green-800 hover:bg-green-100">Open PDF</button>
              : <span className="text-xs text-amber-700">No PDF yet</span>}
            <button type="button" onClick={rebuildPdf} className="text-xs px-3 py-1.5 rounded-lg bg-white border text-gray-600 hover:bg-gray-50">Rebuild PDF</button>
            <button type="button" onClick={reopen} className="text-xs px-3 py-1.5 rounded-lg bg-white border text-gray-500 hover:text-red-600">Reopen induction</button>
          </div>
        </div>
      )}
      {!locked && induction.reopened_at && (
        <p className="text-[11px] text-amber-700">Reopened {fmtDateShort(perthDateOf(induction.reopened_at))}: {induction.reopened_reason}</p>
      )}

      {/* Section 1 */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 grid grid-cols-2 gap-x-4 gap-y-1">
        <div className="col-span-2 text-sm font-medium text-gray-800">1. {member.name}</div>
        <div>Role: <span className="text-gray-800">{member.role || "—"}{induction.is_student ? " (student)" : ""}</span></div>
        <div>Start date: <span className="text-gray-800">{fmtDateShort(induction.start_date)}</span></div>
        <div>Supervisor: <span className="text-gray-800">{nameOf(induction.supervisor_staff_id) || "—"}</span></div>
        <div>Complete by: <span className="text-gray-800">{fmtDateShort(induction.due_date)}</span></div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-gray-700">
          <span className="font-medium">{progress.done} of {progress.total}</span>
          {" · "}due {fmtDateShort(induction.due_date)}
          {" · "}supervisor {nameOf(induction.supervisor_staff_id) || "—"}
        </div>
        {!locked && (
          <select
            value={induction.supervisor_staff_id ? String(induction.supervisor_staff_id) : ""}
            onChange={(e) => changeSupervisor(e.target.value)}
            className="text-xs border rounded-lg px-2 py-1 max-w-[11rem]"
            title="Change supervisor"
          >
            <option value="">— Supervisor —</option>
            {!currentSupervisorListed && induction.supervisor_staff_id && (
              <option value={String(induction.supervisor_staff_id)}>{nameOf(induction.supervisor_staff_id) || "Former supervisor"}</option>
            )}
            {supervisors.map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
          </select>
        )}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}

      {SECTIONS.filter((s) => s.key !== "office").map(renderSection)}
      {renderSection(SECTIONS.find((s) => s.key === "office"))}
      <SectionSix
        induction={induction}
        items={items}
        member={member}
        review={review}
        nameOf={nameOf}
        locked={locked}
        onInductionChanged={onInductionChanged}
        onReload={onReload}
        onOpenTab={onOpenTab}
      />

      {!locked && (
        <div className="pt-1">
          <button type="button" onClick={deleteInduction} className="text-[11px] text-gray-400 hover:text-red-600">Delete induction</button>
        </div>
      )}
    </div>
  );
}

// ─── Section 6: probation review, completed in time, confirmation + supervisor sign-off ──
function SectionSix({ induction, items, member, review, nameOf, locked, onInductionChanged, onReload, onOpenTab }) {
  const [reason, setReason] = useState(induction.late_reason || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => { setReason(induction.late_reason || ""); }, [induction.late_reason]);

  const r = inductionReadiness(induction, items, review);
  const reviewSigned = review?.status === "signed";
  const supervisorName = nameOf(induction.supervisor_staff_id);

  const save = async (patch) => {
    setError("");
    const { data, error: err } = await supabase.from("staff_inductions")
      .update({ ...patch, updated_at: new Date().toISOString() }).eq("id", induction.id).eq("status", "in_progress").select("*").single();
    if (err) { setError("Couldn't save: " + err.message); return; }
    onInductionChanged(data);
  };

  const signOff = async () => {
    if (!window.confirm(`Sign off ${member.name}'s induction as supervisor (${supervisorName})? It will be closed and the PDF filed.`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await adminFetch("/api/inductions/sign-off", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: induction.id, as: "admin" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't sign off");
      if (body.pdfError) setNotice(`Signed off, but the PDF failed (${body.pdfError}) — use Rebuild PDF.`);
      await onReload();
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const inTime = r.allAnswered ? (r.late ? "No" : "Yes") : r.late ? "No — past the due date" : "Not finished yet";
  const row = (label, value) => (
    <div className="flex gap-2 text-xs"><span className="w-40 shrink-0 text-gray-500">{label}</span><span className="text-gray-800 min-w-0">{value}</span></div>
  );

  return (
    <div className="rounded-lg border border-gray-200 p-3 space-y-3">
      <div className="text-sm font-medium text-gray-800">6. Probation review and sign-off</div>

      {/* Probation review */}
      <div className="space-y-1">
        {!review ? (
          <div className="text-xs text-amber-700">
            No probation review yet.{" "}
            {onOpenTab && <button type="button" onClick={() => onOpenTab("reviews")} className="text-blue-600 hover:underline">Open Reviews</button>}
          </div>
        ) : !reviewSigned ? (
          <div className="text-xs text-amber-700">
            Waiting on probation review.{" "}
            {onOpenTab && <button type="button" onClick={() => onOpenTab("reviews", review.id)} className="text-blue-600 hover:underline">Open review</button>}
          </div>
        ) : (
          <>
            {row("Probation reviewer", nameOf(review.reviewer_staff_id) || "—")}
            {row("Review date", <>{fmtDateShort(reviewDateOf(review))}{onOpenTab && <> · <button type="button" onClick={() => onOpenTab("reviews", review.id)} className="text-blue-600 hover:underline">Open review</button></>}</>)}
          </>
        )}
      </div>

      {/* Outcome */}
      <div className="space-y-1.5">
        <div className="text-xs text-gray-500">Probation outcome</div>
        <div className="flex flex-wrap items-center gap-2">
          {OUTCOMES.map((o) => (
            <button
              key={o.key}
              type="button"
              disabled={locked || !reviewSigned}
              onClick={() => save({ probation_outcome: o.key, ...(o.key !== "extended" ? { probation_extended_to: null } : {}) })}
              className={`text-xs px-2.5 py-1 rounded-lg border disabled:opacity-50 ${induction.probation_outcome === o.key ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}
            >
              {o.label}
            </button>
          ))}
          {induction.probation_outcome === "extended" && (
            <label className="text-xs text-gray-600 flex items-center gap-1">
              to
              <input
                type="date"
                disabled={locked}
                value={induction.probation_extended_to || ""}
                onChange={(e) => save({ probation_extended_to: e.target.value || null })}
                className="border rounded-lg px-2 py-1 text-xs"
              />
            </label>
          )}
        </div>
        {!reviewSigned && !locked && <p className="text-[11px] text-gray-400">Available once the probation review is signed.</p>}
      </div>

      {/* Completed within 3 months */}
      <div className="space-y-1.5">
        {row("Completed within 3 months", <>{inTime}{r.lastDate ? <span className="text-gray-400"> (last line {fmtDateShort(r.lastDate)}, due {fmtDateShort(induction.due_date)})</span> : null}</>)}
        {r.late && (
          <textarea
            value={reason}
            disabled={locked}
            onChange={(e) => setReason(e.target.value)}
            onBlur={() => { if (reason.trim() !== (induction.late_reason || "")) save({ late_reason: reason.trim() || null }); }}
            rows={2}
            placeholder="Reason it took longer than 3 months"
            className="w-full border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        )}
      </div>

      {/* Confirmation + sign-off */}
      <div className="border-t pt-3 space-y-2">
        {row("Employee confirmation", induction.employee_confirmed_at
          ? <span className="text-green-700">Confirmed on the {induction.employee_confirmed_via || "kiosk"} {fmtDateShort(perthDateOf(induction.employee_confirmed_at))}</span>
          : r.ready ? <span className="text-amber-700">Waiting for {member.name} to confirm on the kiosk (shows when they're rostered on)</span>
          : <span className="text-gray-400">After everything below is done</span>)}
        {row("Supervisor sign-off", locked
          ? `${nameOf(induction.signed_off_by_staff_id) || "—"} · ${fmtDateShort(perthDateOf(induction.signed_off_at))}`
          : <span className="text-gray-400">Not signed off</span>)}
        {!locked && (
          <>
            {!r.ready && (
              <ul className="text-xs text-amber-700 list-disc pl-5">
                {r.missing.map((m) => <li key={m}>{m}</li>)}
              </ul>
            )}
            <button
              type="button"
              onClick={signOff}
              disabled={busy || !r.ready || !induction.employee_confirmed_at || !induction.supervisor_staff_id}
              className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-40"
            >
              {busy ? "Signing off…" : `Sign off as supervisor — ${supervisorName || "no supervisor set"}`}
            </button>
            {r.ready && !induction.employee_confirmed_at && <p className="text-[11px] text-gray-400">Sign-off unlocks after {member.name} confirms on the kiosk.</p>}
          </>
        )}
        {error && <p className="text-xs text-red-500">{error}</p>}
        {notice && <p className="text-xs text-amber-700">{notice}</p>}
      </div>
    </div>
  );
}

function ItemRow({ item, locked, nameOf, autoSrc, onOpenTab, onAnswer, onNote, onRemove }) {
  const [editingNote, setEditingNote] = useState(false);
  const [note, setNote] = useState(item.note || "");
  // Section 3 line linked to a library document: Done comes from the kiosk read (Admin can only mark N/A)
  const linked = item.section === "3" && !!item.document_id;
  const answers = (item.allowed_answers?.length ? item.allowed_answers : ["done", "na"]).filter((a) => !linked || a !== "done");

  const saveNote = () => {
    setEditingNote(false);
    const v = note.trim() || null;
    if (v !== (item.note || null)) onNote(v);
  };

  return (
    <div className="py-1.5 border-b border-gray-100 last:border-b-0">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm text-gray-700 min-w-0">
          {item.wording}
          {item.pharmacist_only && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100 align-middle">Pharmacist</span>}
          {item.is_custom && !locked && (
            <button type="button" onClick={() => onRemove(item)} className="ml-1.5 text-[11px] text-gray-400 hover:text-red-500">Remove</button>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          {answers.map((a) => (
            <button
              key={a}
              type="button"
              disabled={locked}
              onClick={() => onAnswer(item, a)}
              title={item.result === a ? "Click again to untick" : ""}
              className={`text-[11px] px-2 py-0.5 rounded border disabled:opacity-60 ${item.result === a ? ANSWER_STYLE[a] : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}
            >
              {answerLabel(a, item.section)}
            </button>
          ))}
        </div>
      </div>
      {linked ? (
        <div className="mt-0.5 text-[11px]">
          {item.result === "done" ? <span className="text-green-700">{item.note || `Read ${fmtDayMonth(item.signed_at)}`}</span>
            : item.result ? <span className="text-gray-500">{answerLabel(item.result, item.section)} · {VIA_LABEL[item.signed_via] || "—"}{item.signed_at ? ` · ${fmtDayMonth(item.signed_at)}` : ""}</span>
            : <span className="text-amber-700">Waiting to be read on the kiosk</span>}
        </div>
      ) : isAutoLine(item) && item.signed_via === "auto" && item.result === "done" ? (
        <div className="mt-0.5 text-[11px] text-green-700">✓ Auto · {item.note || "on file"}</div>
      ) : (
      <div className="flex items-center gap-2 mt-0.5 text-[11px]">
        {isAutoLine(item) && !item.result && !locked && (() => {
          const tab = addTabFor(item.auto_source, autoSrc);
          const label = tab === "profile" && ["service_vaccinating", "doc_first_aid"].includes(item.auto_source) ? "Tick Vaccinating" : AUTO_SOURCES[item.auto_source]?.add;
          return label && tab && onOpenTab
            ? <button type="button" onClick={() => onOpenTab(tab)} className="text-blue-600 hover:underline">{label}</button>
            : null;
        })()}
        {item.result && (
          <span className="text-gray-500">{answerLabel(item.result, item.section)} · {(item.signed_via === "me" && nameOf(item.signed_by_staff_id)) || VIA_LABEL[item.signed_via] || item.signed_via || "—"}{item.signed_at ? ` · ${fmtDayMonth(item.signed_at)}` : ""}</span>
        )}
        {editingNote ? (
          <input
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={saveNote}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            placeholder={item.note_hint || "Note"}
            className="flex-1 border rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        ) : item.note ? (
          <button type="button" disabled={locked} onClick={() => setEditingNote(true)} className="text-gray-600 italic text-left">“{item.note}”</button>
        ) : !locked ? (
          <button type="button" onClick={() => setEditingNote(true)} className="text-gray-400 hover:text-blue-600">+ {item.note_hint ? item.note_hint.toLowerCase() : "note"}</button>
        ) : null}
      </div>
      )}
    </div>
  );
}

function AddOther({ section, onAdd }) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    const v = text.trim();
    if (!v) return;
    setSaving(true);
    const ok = await onAdd(section, v);
    setSaving(false);
    if (ok) setText("");
  };
  return (
    <div className="flex gap-2 pt-1">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        placeholder={`Add other item — ${section.otherHeading.toLowerCase()}`}
        className="flex-1 border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
      />
      <button type="button" onClick={submit} disabled={saving || !text.trim()} className="text-xs px-3 py-1 rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-40">
        Add other item
      </button>
    </div>
  );
}
