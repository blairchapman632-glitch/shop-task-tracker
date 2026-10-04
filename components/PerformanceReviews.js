// Performance reviews in Admin (Part 1 — manager side):
//   default export ReviewsTab  — staff form "Reviews" tab: list, start, edit, sign off, PDF, copy given
//   ReviewsOverview            — staff overview panel: who's due / in progress
// Form wording + due-date rules live in lib/performanceReview.js. PDFs are generated server-side (pages/api/reviews/*).
import { useEffect, useRef, useState } from "react";
import supabase from "../lib/supabaseClient";
import {
  FORM_VERSION, RATING_OPTIONS, PREP_QUESTIONS, SECTIONS, REVIEW_TYPE_LABEL, ALL_STAFF_AREAS, DISPENSARY_AREAS, DISPENSARY_HEADING, LABELS,
  areasFor, latestSigned, suggestedReviewType, reviewDue, nextDueAfter, todayPerth, perthDateOf, addDaysStr, fmtDateShort,
} from "../lib/performanceReview";

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";

const AUTOSAVE_MS = 1500;
const EDIT_FIELDS = [
  "review_type", "position", "reviewer_staff_id", "include_dispensary_areas", "meeting_date",
  "ratings", "goals_progress", "overall_summary", "goals", "training_added", "training_added_date",
];

const inputCls = "w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-600";
const sectionTitleCls = "text-xs font-semibold text-gray-500 uppercase tracking-wide";

const isPharmacistRole = (role) => role === "Pharmacist" || role === "Intern Pharmacist";

// Date a review is listed under: meeting date, else signed date, else started date
const reviewDate = (r) => r.meeting_date || perthDateOf(r.signed_at) || perthDateOf(r.created_at);

const StatusBadge = ({ status }) => (
  <span className={`text-[11px] px-2 py-0.5 rounded-full border shrink-0 ${status === "signed" ? "bg-green-50 text-green-700 border-green-200" : status === "in_progress" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-gray-50 text-gray-500 border-gray-200"}`}>
    {status === "signed" ? "Signed" : status === "in_progress" ? "In progress" : "Not started"}
  </span>
);

// Open the signed URL in a new tab (window opened first, while we still have the click — popup blockers)
const openReviewPdf = async (id) => {
  const win = window.open("", "_blank");
  try {
    const res = await fetch(`/api/reviews/pdf-url?id=${encodeURIComponent(id)}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.url) throw new Error(body.error || "Couldn't open the PDF");
    if (win) win.location.href = body.url; else window.open(body.url, "_blank");
  } catch (err) {
    if (win) win.close();
    alert(err?.message || String(err));
  }
};

// ─── Reviews tab ─────────────────────────────────────────────────────────────

export default function ReviewsTab({ member, adminUser }) {
  const [reviews, setReviews] = useState([]);
  const [people, setPeople] = useState([]); // all staff: id, name, can_conduct_reviews, active
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState("list"); // "list" | "start" | review id

  const load = async () => {
    const [{ data, error }, { data: ppl }] = await Promise.all([
      supabase.from("performance_reviews").select("*").eq("staff_id", member.id).order("created_at", { ascending: false }),
      supabase.from("staff").select("id, name, can_conduct_reviews, active").eq("pharmacy_id", PHARMACY_ID).order("name"),
    ]);
    setLoadError(error ? error.message : "");
    setReviews(data || []);
    setPeople(ppl || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member.id]);

  const nameOf = (id) => people.find((p) => Number(p.id) === Number(id))?.name || "";

  if (loading) return <p className="text-xs text-gray-400">Loading…</p>;
  if (loadError) return <p className="text-xs text-red-500">Couldn't load reviews: {loadError}</p>;

  if (view === "start") {
    return (
      <StartReview
        member={member}
        reviews={reviews}
        people={people}
        adminUser={adminUser}
        onCancel={() => setView("list")}
        onStarted={async (id) => { await load(); setView(id); }}
      />
    );
  }

  const open = reviews.find((r) => r.id === view);
  if (open) {
    return (
      <ReviewEditor
        key={open.id}
        review={open}
        member={member}
        people={people}
        nameOf={nameOf}
        onBack={async () => { await load(); setView("list"); }}
        onChanged={load}
        onDeleted={async () => { await load(); setView("list"); }}
      />
    );
  }

  const inProgress = reviews.find((r) => r.status === "in_progress");
  const due = reviewDue(member, reviews);
  const last = latestSigned(reviews);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={sectionTitleCls}>Performance reviews</div>
          <div className="text-xs text-gray-500 mt-1">
            {member.exclude_from_reviews ? "Excluded from performance reviews (Profile tab)."
              : member.active === false ? "Inactive — not due for review."
              : due?.noStartDate ? "Start date not set — add it on the Profile tab to work out when a review is due."
              : due ? <>Next review: <span className="font-medium text-gray-700">{REVIEW_TYPE_LABEL[due.type]}</span>, {due.dueNow ? <span className="text-red-600 font-medium">due now{due.dueDate < todayPerth() ? ` (since ${fmtDateShort(due.dueDate)})` : ""}</span> : `due ${fmtDateShort(due.dueDate)}`}</>
              : null}
          </div>
          {last && <div className="text-xs text-gray-400 mt-0.5">Last signed review: {fmtDateShort(perthDateOf(last.signed_at))}</div>}
        </div>
        {inProgress ? (
          <button type="button" onClick={() => setView(inProgress.id)} className="text-xs px-3 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 shrink-0">
            Continue review
          </button>
        ) : (
          <button type="button" onClick={() => setView("start")} className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 shrink-0">
            Start review
          </button>
        )}
      </div>

      {reviews.length === 0 ? (
        <p className="text-xs text-gray-400">No reviews yet.</p>
      ) : (
        <div className="space-y-1.5">
          {reviews.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setView(r.id)}
              className="w-full text-left rounded-lg border border-gray-100 bg-gray-50 hover:bg-gray-100 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-700">
                  {REVIEW_TYPE_LABEL[r.review_type] || r.review_type} review · {fmtDateShort(reviewDate(r))}
                </span>
                <StatusBadge status={r.status} />
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                Reviewer: {nameOf(r.reviewer_staff_id) || "—"}
                {r.status === "signed" && r.copy_given && " · Copy given"}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Start review ────────────────────────────────────────────────────────────

function StartReview({ member, reviews, people, adminUser, onCancel, onStarted }) {
  const reviewers = people.filter((p) => p.can_conduct_reviews && p.active !== false);
  const [type, setType] = useState(suggestedReviewType(member, reviews));
  const [includeDispensary, setIncludeDispensary] = useState(isPharmacistRole(member.role));
  const [reviewerId, setReviewerId] = useState(reviewers.length === 1 ? String(reviewers[0].id) : "");
  const [position, setPosition] = useState(member.role || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleStart = async () => {
    if (!reviewerId) { setError("Choose a reviewer."); return; }
    setSaving(true);
    setError("");
    const last = latestSigned(reviews);
    const { data, error: err } = await supabase.from("performance_reviews").insert([{
      pharmacy_id: member.pharmacy_id || PHARMACY_ID,
      staff_id: member.id,
      review_type: type,
      position: position.trim() || null,
      include_dispensary_areas: includeDispensary,
      reviewer_staff_id: Number(reviewerId),
      last_review_date: last ? (last.meeting_date || perthDateOf(last.signed_at)) : null,
      form_version: FORM_VERSION,
      status: "in_progress",
      created_by: adminUser?.id ?? null,
    }]).select("id").single();
    setSaving(false);
    if (err) { setError("Couldn't start the review: " + err.message); return; }
    onStarted(data.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className={sectionTitleCls}>Start review — {member.name}</div>
        <button type="button" onClick={onCancel} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Review type</label>
        <div className="flex gap-2">
          {["probation", "annual"].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`px-3 py-1.5 rounded-lg text-sm border ${type === t ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}
            >
              {REVIEW_TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-start gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={includeDispensary} onChange={(e) => setIncludeDispensary(e.target.checked)} className="mt-0.5" />
        <span>
          Include dispensary areas
          <span className="block text-xs text-gray-400">{DISPENSARY_HEADING}: {DISPENSARY_AREAS.map((a) => a.label).join(", ")}</span>
        </span>
      </label>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Reviewer</label>
        {reviewers.length === 0 ? (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            No one can conduct reviews yet. Turn on "Can conduct performance reviews" on a staff member's Profile tab first.
          </p>
        ) : (
          <select value={reviewerId} onChange={(e) => setReviewerId(e.target.value)} className={inputCls}>
            <option value="">— Select reviewer —</option>
            {reviewers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Position</label>
        <input value={position} onChange={(e) => setPosition(e.target.value)} className={inputCls} />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      <button type="button" onClick={handleStart} disabled={saving || reviewers.length === 0} className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-40">
        {saving ? "Starting…" : "Start review"}
      </button>
    </div>
  );
}

// ─── Review editor ───────────────────────────────────────────────────────────

const pickEditable = (r) => Object.fromEntries(EDIT_FIELDS.map((k) => [k, r[k]]));

function ReviewEditor({ review, member, people, nameOf, onBack, onChanged, onDeleted }) {
  const signed = review.status === "signed";
  const [draft, setDraft] = useState(() => ({
    ...pickEditable(review),
    ratings: review.ratings || {},
    goals: Array.isArray(review.goals) && review.goals.length ? review.goals : [{ goal: "", actions: "", target_date: "" }],
  }));
  const [saveState, setSaveState] = useState("saved"); // "saved" | "dirty" | "saving" | "error"
  const [saveError, setSaveError] = useState("");
  const draftRef = useRef(draft);
  const dirtyRef = useRef(false);
  const timerRef = useRef(null);

  const save = async () => {
    if (signed || !dirtyRef.current) return true;
    clearTimeout(timerRef.current);
    dirtyRef.current = false;
    setSaveState("saving");
    const d = draftRef.current;
    const payload = {
      ...d,
      position: d.position?.trim() || null,
      reviewer_staff_id: d.reviewer_staff_id ? Number(d.reviewer_staff_id) : null,
      meeting_date: d.meeting_date || null,
      training_added_date: d.training_added ? (d.training_added_date || null) : null,
      goals: (d.goals || []).map((g) => ({ ...g, target_date: g.target_date || null })),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.from("performance_reviews")
      .update(payload).eq("id", review.id).eq("status", "in_progress").select("id");
    if (error || !data?.length) {
      dirtyRef.current = true;
      setSaveState("error");
      setSaveError(error ? error.message : "This review has been signed or deleted elsewhere — reload it.");
      return false;
    }
    setSaveError("");
    setSaveState(dirtyRef.current ? "dirty" : "saved");
    return true;
  };

  const update = (patch) => {
    if (signed) return;
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      draftRef.current = next;
      return next;
    });
    dirtyRef.current = true;
    setSaveState("dirty");
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(save, AUTOSAVE_MS);
  };

  // Flush unsaved edits when leaving the editor (switching tab, closing the staff member)
  useEffect(() => () => {
    clearTimeout(timerRef.current);
    if (dirtyRef.current) save();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setRating = (key, patch) => update({ ratings: { ...draft.ratings, [key]: { ...(draft.ratings[key] || {}), ...patch } } });
  const setGoal = (i, patch) => update({ goals: draft.goals.map((g, j) => (j === i ? { ...g, ...patch } : g)) });

  const reviewers = people.filter((p) => (p.can_conduct_reviews && p.active !== false) || Number(p.id) === Number(draft.reviewer_staff_id));
  const areas = areasFor(draft.include_dispensary_areas);
  const prep = review.staff_prep || {};

  // ── Sign-off ──
  const [signName, setSignName] = useState("");
  const [signConfirm, setSignConfirm] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState("");

  const handleSign = async () => {
    setSignError("");
    if (!draft.reviewer_staff_id) { setSignError("Choose a reviewer first (Section 1)."); return; }
    if (!signName.trim()) { setSignError("Type your name to sign."); return; }
    if (!signConfirm) { setSignError("Tick the confirmation box."); return; }
    const missing = [];
    if (!draft.meeting_date) missing.push("no meeting date");
    const unrated = areas.filter((a) => !draft.ratings[a.key]?.rating).length;
    if (unrated) missing.push(`${unrated} area${unrated === 1 ? "" : "s"} not rated`);
    if (!String(draft.overall_summary || "").trim()) missing.push("no overall summary");
    const msg = (missing.length ? `Heads up: ${missing.join(", ")}.\n\n` : "")
      + "Sign this review? After signing, the review is locked and can't be edited or deleted.";
    if (!window.confirm(msg)) return;

    setSigning(true);
    try {
      if (!(await save())) throw new Error("Couldn't save your latest changes — not signed.");
      const res = await fetch("/api/reviews/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: review.id, signed_name: signName.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Signing failed");
      if (body.warnings?.length) alert("Signed, with notes:\n\n" + body.warnings.join("\n"));
      await onChanged();
    } catch (err) {
      setSignError(err?.message || String(err));
    } finally {
      setSigning(false);
    }
  };

  // ── Copy given (signed only) ──
  const [copyGiven, setCopyGiven] = useState(!!review.copy_given);
  const [copyDate, setCopyDate] = useState(review.copy_given_date || "");
  const [savingCopy, setSavingCopy] = useState(false);
  const copyChanged = copyGiven !== !!review.copy_given || (copyGiven && (copyDate || "") !== (review.copy_given_date || ""));

  const handleSaveCopy = async () => {
    setSavingCopy(true);
    try {
      const res = await fetch("/api/reviews/copy-given", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: review.id, copy_given: copyGiven, copy_given_date: copyGiven ? copyDate || todayPerth() : null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't save");
      if (body.warnings?.length) alert(body.warnings.join("\n"));
      await onChanged();
    } catch (err) {
      alert(err?.message || String(err));
    } finally {
      setSavingCopy(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete this in-progress review for ${member.name}? This can't be undone.`)) return;
    clearTimeout(timerRef.current);
    dirtyRef.current = false;
    const { data, error } = await supabase.from("performance_reviews")
      .delete().eq("id", review.id).eq("status", "in_progress").select("id");
    if (error) { alert("Couldn't delete: " + error.message); return; }
    if (!data?.length) { alert("This review has been signed, so it can't be deleted."); await onChanged(); return; }
    onDeleted();
  };

  const handleBack = async () => {
    if (!signed && dirtyRef.current && !(await save())) {
      if (!window.confirm("Your latest changes couldn't be saved. Leave anyway?")) return;
    }
    onBack();
  };

  const signedDate = perthDateOf(review.signed_at);

  return (
    <div className="space-y-5">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-2 sticky -top-4 bg-white py-2 z-10 border-b">
        <button type="button" onClick={handleBack} className="text-xs text-blue-600 hover:text-blue-700">← All reviews</button>
        <div className="flex items-center gap-2">
          {!signed && (
            <span className={`text-[11px] ${saveState === "error" ? "text-red-600" : saveState === "saved" ? "text-green-600" : "text-gray-400"}`}>
              {saveState === "saving" ? "Saving…" : saveState === "dirty" ? "Unsaved changes" : saveState === "error" ? "Not saved" : "✓ Saved"}
            </span>
          )}
          {!signed && (
            <button type="button" onClick={save} disabled={saveState === "saved" || saveState === "saving"} className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white disabled:opacity-40">
              Save
            </button>
          )}
          <StatusBadge status={review.status} />
        </div>
      </div>
      {saveError && <p className="text-xs text-red-500">{saveError}</p>}

      {/* Signed summary */}
      {signed && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-3 space-y-2">
          <div className="text-sm font-medium text-green-800">
            ✓ Signed by {review.signed_name} on {fmtDateShort(signedDate)} · Filed in personnel file
          </div>
          <div className="text-xs text-green-700">
            Next review due {fmtDateShort(nextDueAfter(review))}
            {review.comment_window_ends && ` · Staff comments open until ${fmtDateShort(review.comment_window_ends)}`}
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button type="button" onClick={() => openReviewPdf(review.id)} className="text-xs px-3 py-1.5 rounded-lg bg-green-700 text-white hover:bg-green-800">
              Download PDF
            </button>
            <label className="flex items-center gap-1.5 text-xs text-gray-700">
              <input
                type="checkbox"
                checked={copyGiven}
                onChange={(e) => { setCopyGiven(e.target.checked); if (e.target.checked && !copyDate) setCopyDate(todayPerth()); }}
              />
              Copy given to staff member
            </label>
            {copyGiven && (
              <input type="date" value={copyDate} onChange={(e) => setCopyDate(e.target.value)} className="border rounded-lg px-2 py-1 text-xs" />
            )}
            {copyChanged && (
              <button type="button" onClick={handleSaveCopy} disabled={savingCopy} className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white disabled:opacity-40">
                {savingCopy ? "Saving…" : "Save"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* 1. Review details */}
      <section className="space-y-3">
        <div className={sectionTitleCls}>{SECTIONS[0]}</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Staff member</label>
            <input value={member.name || ""} disabled className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Position</label>
            <input value={draft.position || ""} onChange={(e) => update({ position: e.target.value })} disabled={signed} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Review type</label>
            <select value={draft.review_type} onChange={(e) => update({ review_type: e.target.value })} disabled={signed} className={inputCls}>
              {["probation", "annual"].map((t) => <option key={t} value={t}>{REVIEW_TYPE_LABEL[t]}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Reviewer</label>
            <select value={draft.reviewer_staff_id || ""} onChange={(e) => update({ reviewer_staff_id: e.target.value })} disabled={signed} className={inputCls}>
              <option value="">— Select reviewer —</option>
              {reviewers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Meeting date</label>
            <input type="date" value={draft.meeting_date || ""} onChange={(e) => update({ meeting_date: e.target.value })} disabled={signed} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date of last review</label>
            <input value={review.last_review_date ? fmtDateShort(review.last_review_date) : "None"} disabled className={inputCls} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={!!draft.include_dispensary_areas} onChange={(e) => update({ include_dispensary_areas: e.target.checked })} disabled={signed} />
          Include dispensary areas
        </label>
      </section>

      {/* 2. Staff member's preparation (read-only — staff fill this in on their phone, Part 2) */}
      <section className="border-t pt-4 space-y-2">
        <div className={sectionTitleCls}>{SECTIONS[1]}</div>
        {!Object.values(prep).some((v) => String(v || "").trim()) && (
          <p className="text-xs text-gray-400">Not completed by the staff member yet.</p>
        )}
        {PREP_QUESTIONS.map((q, i) => (
          <div key={q.key} className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
            <div className="text-xs font-medium text-gray-600">{i + 1}. {q.label}</div>
            <div className={`text-sm mt-0.5 whitespace-pre-wrap ${prep[q.key] ? "text-gray-800" : "text-gray-300"}`}>{prep[q.key] || "—"}</div>
          </div>
        ))}
      </section>

      {/* 3. Performance */}
      <section className="border-t pt-4 space-y-3">
        <div className={sectionTitleCls}>{SECTIONS[2]}</div>
        {[{ title: "All staff", list: ALL_STAFF_AREAS }, ...(draft.include_dispensary_areas ? [{ title: DISPENSARY_HEADING, list: DISPENSARY_AREAS }] : [])].map((group) => (
          <div key={group.title} className="space-y-2">
            <div className="text-[11px] font-semibold text-gray-400 uppercase">{group.title}</div>
            {group.list.map((a) => {
              const r = draft.ratings[a.key] || {};
              return (
                <div key={a.key} className="rounded-lg border border-gray-200 px-3 py-2 space-y-2">
                  <div>
                    <div className="text-sm font-medium text-gray-800">{a.label}</div>
                    <div className="text-xs text-gray-400">{a.description}</div>
                  </div>
                  <div className="flex gap-1.5">
                    {RATING_OPTIONS.map((o) => (
                      <button
                        key={o.key}
                        type="button"
                        disabled={signed}
                        onClick={() => setRating(a.key, { rating: r.rating === o.key ? null : o.key })}
                        className={`flex-1 px-2 py-1.5 rounded-lg text-xs border ${r.rating === o.key
                          ? o.key === "needs_work" ? "bg-amber-500 text-white border-amber-500" : o.key === "strength" ? "bg-green-600 text-white border-green-600" : "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-gray-600 border-gray-300 enabled:hover:bg-gray-50"} disabled:cursor-default`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={r.comment || ""}
                    onChange={(e) => setRating(a.key, { comment: e.target.value })}
                    disabled={signed}
                    rows={2}
                    placeholder={signed ? "" : "Comment (optional)"}
                    className={`${inputCls} resize-y`}
                  />
                </div>
              );
            })}
          </div>
        ))}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{LABELS.goalsProgress}</label>
          <textarea value={draft.goals_progress || ""} onChange={(e) => update({ goals_progress: e.target.value })} disabled={signed} rows={3} className={`${inputCls} resize-y`} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{LABELS.overallSummary}</label>
          <textarea value={draft.overall_summary || ""} onChange={(e) => update({ overall_summary: e.target.value })} disabled={signed} rows={4} className={`${inputCls} resize-y`} />
        </div>
      </section>

      {/* 4. Goals and training */}
      <section className="border-t pt-4 space-y-3">
        <div className={sectionTitleCls}>{SECTIONS[3]}</div>
        {draft.goals.map((g, i) => (
          <div key={i} className="rounded-lg border border-gray-200 px-3 py-2 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-gray-600">{LABELS.goal} {i + 1}</div>
              {!signed && draft.goals.length > 1 && (
                <button type="button" onClick={() => update({ goals: draft.goals.filter((_, j) => j !== i) })} className="text-[11px] text-red-500 hover:text-red-600">
                  Remove
                </button>
              )}
            </div>
            <textarea value={g.goal || ""} onChange={(e) => setGoal(i, { goal: e.target.value })} disabled={signed} rows={2} placeholder={signed ? "" : LABELS.goal} className={`${inputCls} resize-y`} />
            <textarea value={g.actions || ""} onChange={(e) => setGoal(i, { actions: e.target.value })} disabled={signed} rows={2} placeholder={signed ? "" : LABELS.actions} className={`${inputCls} resize-y`} />
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600">{LABELS.targetDate}</label>
              <input type="date" value={g.target_date || ""} onChange={(e) => setGoal(i, { target_date: e.target.value })} disabled={signed} className="border rounded-lg px-2 py-1 text-sm disabled:bg-gray-50" />
            </div>
          </div>
        ))}
        {!signed && (
          <button type="button" onClick={() => update({ goals: [...draft.goals, { goal: "", actions: "", target_date: "" }] })} className="text-xs text-blue-600 hover:text-blue-700">
            + Add goal
          </button>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={!!draft.training_added}
              disabled={signed}
              onChange={(e) => update({ training_added: e.target.checked, training_added_date: e.target.checked ? (draft.training_added_date || todayPerth()) : null })}
            />
            {LABELS.trainingAdded}
          </label>
          {draft.training_added && (
            <input type="date" value={draft.training_added_date || ""} onChange={(e) => update({ training_added_date: e.target.value })} disabled={signed} className="border rounded-lg px-2 py-1 text-sm disabled:bg-gray-50" />
          )}
        </div>
      </section>

      {/* 5. Staff member's comments (read-only — Part 2) */}
      <section className="border-t pt-4 space-y-2">
        <div className={sectionTitleCls}>{SECTIONS[4]}</div>
        {review.staff_comments ? (
          <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
            <div className="text-sm text-gray-800 whitespace-pre-wrap">{review.staff_comments}</div>
            {review.staff_comments_at && <div className="text-[11px] text-gray-400 mt-1">Added {fmtDateShort(perthDateOf(review.staff_comments_at))}</div>}
          </div>
        ) : (
          <p className="text-xs text-gray-400">
            No comments from the staff member{signed && review.comment_window_ends ? ` (they can comment until ${fmtDateShort(review.comment_window_ends)})` : ""}.
          </p>
        )}
      </section>

      {/* 6. Sign-off */}
      <section className="border-t pt-4 space-y-3">
        <div className={sectionTitleCls}>{SECTIONS[5]}</div>
        {signed ? (
          <div className="text-sm text-gray-700 space-y-0.5">
            <div>Reviewer: {nameOf(review.reviewer_staff_id) || "—"}</div>
            <div>Signed electronically by <span className="font-medium">{review.signed_name}</span> on {fmtDateShort(signedDate)}</div>
            <div className="text-xs text-gray-400">{review.form_version || FORM_VERSION}</div>
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-500">
              The reviewer signs once the meeting has happened. Signing locks the review, saves the PDF to the personnel file
              and opens a comment window for the staff member.
            </p>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Reviewer's name</label>
              <input
                value={signName}
                onChange={(e) => setSignName(e.target.value)}
                placeholder={nameOf(draft.reviewer_staff_id) || "Type your full name"}
                className={inputCls}
              />
            </div>
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={signConfirm} onChange={(e) => setSignConfirm(e.target.checked)} className="mt-0.5" />
              I confirm this review was discussed with {member.name} and is complete.
            </label>
            {signError && <p className="text-sm text-red-500">{signError}</p>}
            <button type="button" onClick={handleSign} disabled={signing} className="w-full bg-green-700 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-40">
              {signing ? "Signing…" : "Sign and file review"}
            </button>
            <button type="button" onClick={handleDelete} className="w-full border border-red-200 text-red-600 rounded-lg py-2 text-sm hover:bg-red-50">
              Delete this review
            </button>
          </>
        )}
      </section>
    </div>
  );
}

// ─── Overview panel (shown when no staff member is selected) ────────────────

export function ReviewsOverview({ staffList, onOpen }) {
  const [reviews, setReviews] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.from("performance_reviews")
      .select("id, staff_id, status, review_type, signed_at, created_at")
      .eq("pharmacy_id", PHARMACY_ID)
      .then(({ data, error: err }) => {
        if (err) setError(err.message);
        setReviews(data || []);
      });
  }, []);

  const today = todayPerth();
  const soon = addDaysStr(today, 30);
  const rows = { dueNow: [], dueSoon: [], inProgress: [], noStart: [] };

  for (const s of staffList || []) {
    const mine = (reviews || []).filter((r) => Number(r.staff_id) === Number(s.id));
    const due = reviewDue(s, mine, today);
    if (!due) continue;
    const ip = mine.find((r) => r.status === "in_progress");
    const row = { staff: s, due, ip };
    if (due.noStartDate) { (ip ? rows.inProgress : rows.noStart).push(row); continue; }
    if (due.dueNow) rows.dueNow.push(row);
    else if (due.dueDate <= soon) rows.dueSoon.push(row);
    else if (ip) rows.inProgress.push(row);
  }
  const byDate = (a, b) => String(a.due.dueDate || "").localeCompare(String(b.due.dueDate || "")) || a.staff.name.localeCompare(b.staff.name);
  rows.dueNow.sort(byDate);
  rows.dueSoon.sort(byDate);
  rows.inProgress.sort(byDate);

  const Row = ({ staff, due, ip }) => {
    const overdue = due.dueDate && due.dueDate < today;
    return (
      <button
        type="button"
        onClick={() => onOpen(staff)}
        className="w-full grid grid-cols-[1fr_90px_130px_96px] items-center gap-2 px-3 py-2 border-b last:border-b-0 text-left hover:bg-gray-50"
      >
        <span className="text-sm font-medium text-gray-800 truncate">{staff.name}</span>
        <span className="text-xs text-gray-600">{REVIEW_TYPE_LABEL[ip?.review_type || due.type] || "—"}</span>
        <span className={`text-xs ${due.dueNow ? "text-red-600 font-medium" : "text-gray-600"}`}>
          {due.noStartDate ? "Start date not set" : due.dueNow && !overdue ? "Due now" : `${overdue ? "Overdue · " : ""}${fmtDateShort(due.dueDate)}`}
        </span>
        <span className="justify-self-end"><StatusBadge status={ip ? "in_progress" : "not_started"} /></span>
      </button>
    );
  };

  const Group = ({ title, list, empty }) => (
    <div>
      <div className="text-[11px] font-semibold text-gray-500 uppercase mb-1">{title} {list.length > 0 && <span className="text-gray-400 font-normal">({list.length})</span>}</div>
      {list.length === 0 ? (
        <p className="text-xs text-gray-400 px-1">{empty}</p>
      ) : (
        <div className="rounded-lg border border-gray-200 overflow-hidden">{list.map((r) => <Row key={r.staff.id} {...r} />)}</div>
      )}
    </div>
  );

  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      <div className="max-w-3xl space-y-6">
        <p className="text-sm text-gray-400">Select a staff member to edit, or add a new one.</p>

        <section className="space-y-4">
          <h2 className="font-semibold text-gray-800">Performance reviews</h2>
          {error ? (
            <p className="text-xs text-red-500">Couldn't load reviews: {error}</p>
          ) : reviews === null ? (
            <p className="text-xs text-gray-400">Loading…</p>
          ) : (
            <>
              <Group title="Due now / overdue" list={rows.dueNow} empty="No one is due." />
              <Group title="Due in the next 30 days" list={rows.dueSoon} empty="No one is due in the next 30 days." />
              <Group title="In progress" list={rows.inProgress} empty="No other reviews in progress." />
              {rows.noStart.length > 0 && <Group title="Start date not set" list={rows.noStart} empty="" />}
            </>
          )}
        </section>

        {/* More overview sections can go here later */}
      </div>
    </div>
  );
}
