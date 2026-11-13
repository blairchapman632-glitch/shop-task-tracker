// Performance review Section 2 on the shop computer (kiosk "Answer your review questions" → "Answer here").
// 1. The person's own staff PIN first — checked on the server (/api/kiosk/review "open"); nothing about the review
//    reaches this browser until it's right.
// 2. A full page with the SAME form as /me → To do (components/MyReview.js PrepForm). Same record as the phone.
// 3. Every save and Send re-sends the kiosk login + staff id + PIN, and the server re-checks them each time.
// 4. Unsent typing is kept as a draft (staff_prep_draft — never shown to the reviewer): 10 s after they stop typing,
//    and when the page closes (Close, or 3 minutes with no typing or tapping — warned 30 s before).
// The PIN and the answers live only in this component's memory and go when it closes.
import { useCallback, useEffect, useRef, useState } from "react";
import { adminFetch } from "../lib/adminFetch";
import { PrepForm, startingAnswers } from "./MyReview";
import { PREP_QUESTIONS } from "../lib/performanceReview";

const IDLE_MS = 3 * 60 * 1000;
const WARN_MS = 30 * 1000;
const DRAFT_DELAY_MS = 10 * 1000;
const SENT_CLOSE_MS = 4000;

async function kioskCall(body) {
  const res = await adminFetch("/api/kiosk/review", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(out.error || `Something went wrong (${res.status})`), { status: res.status });
  return out;
}

// Same shape and trimming as the server, so "nothing changed" compares like for like
const clean = (a) => Object.fromEntries(PREP_QUESTIONS.map((q) => [q.key, String(a?.[q.key] ?? "").trim()]));
const same = (a, b) => PREP_QUESTIONS.every((q) => clean(a)[q.key] === clean(b)[q.key]);

export default function KioskReview({ staffId, person, onClose }) {
  const [pin, setPin] = useState(null);       // set once the server has accepted it
  const [review, setReview] = useState(null);
  const [nothing, setNothing] = useState(false);
  return pin ? (
    <ReviewPage staffId={staffId} pin={pin} person={person} initial={review} nothing={nothing} onClose={onClose} />
  ) : (
    <PinBox person={person} onClose={() => onClose(false)}
      onCheck={async (p) => {
        const out = await kioskCall({ action: "open", staff_id: Number(staffId), pin: p });
        setReview(out.review || null);
        setNothing(!out.review);
        setPin(p);
      }} />
  );
}

function PinBox({ person, onCheck, onClose }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const submit = async () => {
    if (pin.length !== 4) { setError("Enter your 4-digit PIN."); return; }
    setChecking(true); setError("");
    try {
      await onCheck(pin);
    } catch (err) {
      setError(err.status === 401 ? "Incorrect PIN." : err.message);
      setPin("");
      setChecking(false);
    }
  };
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center pointer-events-auto" onClick={(e) => e.stopPropagation()}>
          <div className="flex justify-end -mt-2 -mr-2">
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
          </div>
          <p className="text-sm font-semibold text-gray-800 mb-3">📝 Answer your review questions</p>
          <img src={person?.photo_url || "/placeholder.png"} alt={person?.name || ""} className="w-14 h-14 rounded-full object-cover mx-auto mb-2" />
          <div className="font-medium text-gray-800 mb-4">{person?.name || "Staff member"}</div>
          <input
            type="text" inputMode="numeric" maxLength={4} value={pin}
            autoComplete="off" name="review_kiosk_pin" data-1p-ignore data-lpignore="true"
            style={{ WebkitTextSecurity: "disc", textSecurity: "disc" }}
            onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="••••" autoFocus
            className="w-full border rounded-lg px-4 py-3 text-center text-2xl tracking-widest mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 border border-gray-300 rounded-lg py-2.5 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={submit} disabled={checking} className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-40">{checking ? "Checking…" : "Continue"}</button>
          </div>
        </div>
      </div>
    </>
  );
}

function ReviewPage({ staffId, pin, person, initial, nothing, onClose }) {
  const [review, setReview] = useState(initial);
  const [sent, setSent] = useState(false);
  const [warning, setWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(30);
  const [closing, setClosing] = useState(false);
  const [closeErr, setCloseErr] = useState("");

  const answersRef = useRef(initial ? startingAnswers(initial) : null); // what's on screen now
  const savedDraftRef = useRef(initial?.staff_prep_draft || null);      // the draft the server holds
  const sentRef = useRef(initial?.staff_prep || {});                    // what the reviewer can see
  const draftTimer = useRef(null);
  const inflight = useRef(Promise.resolve());
  const doneRef = useRef(false);                                         // closed or sent — no more draft saves
  const base = { staff_id: Number(staffId), pin };

  // The draft the server should hold for what's on screen: null when it matches what was sent
  const wantedDraft = () => (answersRef.current && !same(answersRef.current, sentRef.current) ? clean(answersRef.current) : null);
  const draftChanged = () => {
    const want = wantedDraft();
    const have = savedDraftRef.current;
    return want === null ? have !== null : (have === null || !same(want, have));
  };

  // One save at a time, in order
  const saveDraft = useCallback(() => {
    inflight.current = inflight.current.catch(() => {}).then(async () => {
      if (!review || !draftChanged()) return;
      const want = wantedDraft();
      const out = await kioskCall({ ...base, action: "draft", id: review.id, answers: want });
      savedDraftRef.current = out.review?.staff_prep_draft || null;
    });
    return inflight.current;
  }, [review]); // eslint-disable-line react-hooks/exhaustive-deps

  const onAnswers = (a) => {
    answersRef.current = a;
    clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => { if (!doneRef.current) saveDraft().catch(() => {}); }, DRAFT_DELAY_MS);
  };

  const finish = useCallback((didSend) => {
    doneRef.current = true;
    clearTimeout(draftTimer.current);
    answersRef.current = null;
    onClose(didSend);
  }, [onClose]);

  // Close: keep any unsent typing first. force = close even if that save fails (the timeout).
  const close = useCallback(async (force) => {
    if (doneRef.current) return;
    if (sent) { finish(true); return; }
    clearTimeout(draftTimer.current);
    setClosing(true); setCloseErr("");
    try {
      await saveDraft();
      finish(false);
    } catch (err) {
      if (force) { finish(false); return; }
      setCloseErr(`Couldn't keep your unsent answers (${err.message}).`);
      setClosing(false);
    }
  }, [sent, saveDraft, finish]);

  // 3 minutes with no typing or tapping -> close (warned 30 s before)
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    let warnT, closeT, tick;
    const arm = () => {
      clearTimeout(warnT); clearTimeout(closeT); clearInterval(tick);
      setWarning(false);
      warnT = setTimeout(() => {
        setWarning(true);
        const until = Date.now() + WARN_MS;
        setSecondsLeft(Math.ceil(WARN_MS / 1000));
        tick = setInterval(() => setSecondsLeft(Math.max(0, Math.ceil((until - Date.now()) / 1000))), 1000);
      }, IDLE_MS - WARN_MS);
      closeT = setTimeout(() => closeRef.current(true), IDLE_MS);
    };
    arm();
    const events = ["pointerdown", "keydown", "input"];
    events.forEach((e) => document.addEventListener(e, arm, true));
    return () => {
      clearTimeout(warnT); clearTimeout(closeT); clearInterval(tick);
      events.forEach((e) => document.removeEventListener(e, arm, true));
    };
  }, []);

  // Sent: confirmation, then back to the kiosk home
  useEffect(() => {
    if (!sent) return;
    const t = setTimeout(() => finish(true), SENT_CLOSE_MS);
    return () => clearTimeout(t);
  }, [sent, finish]);

  // Leaving some other way (e.g. the page reloads): last try at keeping unsent typing
  useEffect(() => () => { if (!doneRef.current) saveDraft().catch(() => {}); }, [saveDraft]);

  const send = async (answers) => {
    clearTimeout(draftTimer.current);
    await inflight.current.catch(() => {}); // no draft save landing after the Send
    const out = await kioskCall({ ...base, action: "send", id: review.id, answers });
    doneRef.current = true;
    return out;
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#F8FAFC] overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-6 pb-16 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img src={person?.photo_url || "/placeholder.png"} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold text-gray-800 truncate">📝 My performance review</div>
              <div className="text-sm text-gray-500 truncate">{person?.name || ""}</div>
            </div>
          </div>
          <button onClick={() => close(false)} disabled={closing} className="shrink-0 border border-gray-300 bg-white rounded-lg px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            {closing ? "Saving…" : "Close"}
          </button>
        </div>

        {closeErr && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 flex items-center justify-between gap-3">
            <span>{closeErr}</span>
            <button onClick={() => finish(false)} className="shrink-0 underline font-medium">Close anyway</button>
          </div>
        )}

        {warning && !sent && (
          <div className="rounded-lg bg-amber-50 border border-amber-300 px-4 py-3 text-sm text-amber-900 flex items-center justify-between gap-3">
            <span>Still there? This page closes in {secondsLeft} seconds. Anything you haven't sent will be kept for next time.</span>
            <button className="shrink-0 bg-amber-600 text-white rounded-lg px-4 py-2 font-medium">Keep going</button>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border p-5">
          {sent ? (
            <div className="text-center py-6 space-y-4">
              <p className="text-green-700 font-medium">✓ Thanks — your answers have been sent to your reviewer.</p>
              <button onClick={() => finish(true)} className="bg-blue-600 text-white rounded-xl px-8 py-3 text-sm font-medium">Done</button>
            </div>
          ) : nothing || !review ? (
            <p className="text-sm text-gray-600">There's nothing waiting for you to answer right now.</p>
          ) : (
            <PrepForm review={review} send={send} onAnswers={onAnswers}
              onChanged={(out) => {
                // reloaded = the review was signed off meanwhile ("can no longer be changed") — not a Send
                if (out?.review && !out.reloaded) { setReview(out.review); setSent(true); }
                else { doneRef.current = true; setReview(null); }
              }}
              reload={async () => ({ reloaded: true })} />
          )}
        </div>
      </div>
    </div>
  );
}
