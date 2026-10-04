// Performance reviews on /me (Part 2 — staff side). Staff only ever see their own Section 2 form (while the
// review is in progress) or a comment box (signed, inside the comment window) — never the reviewer's content.
// Everything goes through pages/api/reviews/{my-review,save-prep,save-comment} with the Supabase access token.
import { useEffect, useRef, useState } from "react";
import supabase from "../lib/supabaseClient";
import { PREP_QUESTIONS, REVIEW_TYPE_LABEL, fmtDateShort, perthDateOf } from "../lib/performanceReview";

const authHeaders = async () => {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : null;
};

const call = async (path, body) => {
  const headers = await authHeaders();
  if (!headers) return null; // legacy ?token= link (no Auth session) — reviews not available
  const res = await fetch(path, body
    ? { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : { headers });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || "Something went wrong");
  return out;
};

// -> { mode: "prep"|"comment"|null, review } or null
export const fetchMyReview = async () => {
  try {
    return await call("/api/reviews/my-review");
  } catch (err) {
    console.error("[my-review]", err);
    return null;
  }
};

// Banner / badge conditions
export const prepWaiting = (r) => r?.mode === "prep" && !r.review?.staff_prep_updated_at;
export const commentInvite = (r) => r?.mode === "comment" && !r.review?.staff_comments;

// Roster tab banner (null when nothing to say)
export function MyReviewBanner({ data, onOpen }) {
  let text = null;
  if (prepWaiting(data)) {
    const when = data.review.meeting_date ? ` on ${fmtDateShort(data.review.meeting_date)}` : "";
    text = `📝 Your performance review is ready. Please fill in your part before your meeting${when}.`;
  } else if (commentInvite(data)) {
    text = `Your review is complete. You can add your own comments until ${fmtDateShort(data.review.comment_window_ends)} (optional).`;
  }
  if (!text) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full max-w-lg mx-auto mb-4 block text-left rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
    >
      {text} <span className="font-semibold underline whitespace-nowrap">Open →</span>
    </button>
  );
}

// Profile tab section
export function MyReviewSection({ data, onChanged, focus }) {
  const ref = useRef(null);
  useEffect(() => {
    if (focus && ref.current) ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focus, data?.mode]);

  if (!data?.mode || !data.review) return null;
  return (
    <div ref={ref} className="bg-white rounded-2xl shadow-sm border p-5 scroll-mt-20">
      <div className="text-base font-semibold text-gray-800">My performance review</div>
      {data.mode === "prep"
        ? <PrepForm key={data.review.id} review={data.review} onChanged={onChanged} />
        : <CommentForm key={data.review.id} review={data.review} onChanged={onChanged} />}
    </div>
  );
}

function PrepForm({ review, onChanged }) {
  const [answers, setAnswers] = useState(() => Object.fromEntries(PREP_QUESTIONS.map((q) => [q.key, review.staff_prep?.[q.key] || ""])));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const submitted = !!review.staff_prep_updated_at;

  const handleSubmit = async () => {
    setSaving(true); setErr(""); setMsg("");
    try {
      const out = await call("/api/reviews/save-prep", { id: review.id, answers });
      if (!out) throw new Error("Please log in with your email to fill in your review.");
      setMsg("✓ Thanks — your answers have been sent to your reviewer.");
      onChanged(out);
    } catch (e) {
      setErr(e?.message || String(e));
      if (/no longer be changed/i.test(e?.message || "")) onChanged(await fetchMyReview());
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-1 space-y-4">
      <div className="text-sm text-gray-500">
        {REVIEW_TYPE_LABEL[review.review_type] || ""} review
        {review.meeting_date ? <> · meeting on <span className="font-medium text-gray-700">{fmtDateShort(review.meeting_date)}</span></> : ""}
      </div>
      <p className="text-sm text-gray-600">
        Please answer these before your meeting. You can come back and change your answers any time until the review is finished.
      </p>
      {PREP_QUESTIONS.map((q, i) => (
        <div key={q.key}>
          <label className="block text-sm font-medium text-gray-700 mb-1">{i + 1}. {q.label}</label>
          <textarea
            value={answers[q.key]}
            onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))}
            rows={3}
            maxLength={4000}
            className="w-full border rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
      ))}
      {err && <p className="text-sm text-red-500">{err}</p>}
      {msg && <p className="text-sm text-green-600">{msg}</p>}
      <button type="button" onClick={handleSubmit} disabled={saving} className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-medium disabled:opacity-40">
        {saving ? "Sending…" : submitted ? "Update my answers" : "Submit"}
      </button>
      {submitted && <p className="text-center text-xs text-gray-400">Last sent {fmtDateShort(perthDateOf(review.staff_prep_updated_at))}</p>}
    </div>
  );
}

function CommentForm({ review, onChanged }) {
  const [text, setText] = useState(review.staff_comments || "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const handleSave = async () => {
    setSaving(true); setErr(""); setMsg("");
    try {
      const out = await call("/api/reviews/save-comment", { id: review.id, comment: text });
      if (!out) throw new Error("Please log in with your email to add comments.");
      setMsg(text.trim() ? "✓ Your comments have been saved." : "✓ Your comments have been removed.");
      onChanged(out);
    } catch (e) {
      setErr(e?.message || String(e));
      if (/can't be added/i.test(e?.message || "")) onChanged(await fetchMyReview());
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-1 space-y-3">
      <p className="text-sm text-gray-600">Your review is complete. If you'd like, you can add your own comments — this is optional.</p>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Your comments on the review</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          maxLength={4000}
          className="w-full border rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <p className="text-xs text-gray-400 mt-1">You can add or change comments until {fmtDateShort(review.comment_window_ends)}.</p>
      </div>
      {err && <p className="text-sm text-red-500">{err}</p>}
      {msg && <p className="text-sm text-green-600">{msg}</p>}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving || text.trim() === (review.staff_comments || "").trim()}
        className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-medium disabled:opacity-40"
      >
        {saving ? "Saving…" : "Save comments"}
      </button>
    </div>
  );
}
