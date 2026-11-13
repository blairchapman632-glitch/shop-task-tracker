// Bits shown under a sent memo: Download PDF, updates, private replies, and — managers only — seen-by and every
// person's reply thread.
// Replies are PRIVATE: a staff member only ever sees their own thread (their replies + managers' answers to them);
// managers (manager mode) see every thread. Not a group chat. The server enforces this (/api/memos/read for staff,
// /api/memos with the manager PIN for managers).
import { useEffect, useState } from "react";
import { memoCall, readCall, downloadMemoPdf } from "../../lib/memosClient";

const when = (ts) => new Date(ts).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Perth" });
const whenLong = (ts) => new Date(ts).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Australia/Perth" });
const BOX = "bg-white rounded-[14px] border border-[#E5E7EB] px-5 py-4 mt-4";

// kioskStaffId: on the kiosk, the person reading (lets a private memo's recipient download it)
export function PdfButton({ memo, pin = null, kioskStaffId = null, className = "" }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const go = async () => {
    setBusy(true); setErr("");
    try { await downloadMemoPdf(memo, pin, kioskStaffId); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <span className="inline-flex flex-col items-end">
      <button onClick={go} disabled={busy}
        className={`min-h-[44px] px-4 rounded-[12px] text-sm font-medium text-slate-700 bg-white border border-[#E5E7EB] hover:bg-slate-50 disabled:opacity-50 ${className}`}>
        {busy ? "Making PDF…" : `⬇ Download PDF${pin ? " (with seen-by)" : ""}`}
      </button>
      {err && <span className="text-xs text-red-600 mt-1">{err}</span>}
    </span>
  );
}

// ── Updates (a manager's updates / corrections after sending) — shown to everyone who can see the memo ──
export function MemoUpdates({ updates }) {
  if (!updates?.length) return null;
  return (
    <div className="bg-[#EFF6FF] rounded-[14px] border border-[#BFDBFE] px-5 py-4 mt-4 space-y-3">
      <h3 className="text-sm font-semibold text-[#1E3A8A]">📌 {updates.length === 1 ? "Update" : "Updates"}</h3>
      {updates.map((u) => (
        <div key={u.id}>
          <div className="text-xs text-[#1E3A8A]">{whenLong(u.created_at)} · {u.author_name}</div>
          <p className="text-sm text-slate-800 whitespace-pre-wrap break-words">{u.body}</p>
        </div>
      ))}
    </div>
  );
}

// Managers: "Add an update" under a sent memo. Push only if "Notify recipients" is ticked.
export function AddUpdate({ memo, manager, onAdded }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [notify, setNotify] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const save = async () => {
    setBusy(true); setErr("");
    try {
      const r = await memoCall({ action: "add-update", pin: manager.pin, id: memo.id, body: text, notify: notify && !memo.imported });
      onAdded(r.updates);
      setText(""); setNotify(false); setOpen(false);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="mt-4 min-h-[44px] px-4 rounded-[12px] text-sm font-semibold text-[#1D4ED8] bg-white border border-[#BFDBFE] hover:bg-[#EFF6FF]">
        ✏️ Add an update
      </button>
    );
  }
  return (
    <div className={BOX}>
      <h3 className="text-sm font-semibold text-slate-700">✏️ Add an update</h3>
      <p className="text-xs text-slate-500 mt-0.5">Shown under the memo, with today&apos;s date and your name, to everyone who can see it — and in the PDF.</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000} autoFocus
        className="mt-2 w-full rounded-[10px] border border-slate-200 px-3 py-2 text-sm resize-y" placeholder="e.g. Correction: the stocktake is on Tuesday 9 Dec, not Monday." />
      {!memo.imported && (
        <label className="flex items-center gap-2 mt-2 text-sm text-slate-700 cursor-pointer">
          <input type="checkbox" className="h-5 w-5" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          Notify recipients (phone notification)
        </label>
      )}
      {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
      <div className="flex justify-end gap-2 mt-2">
        <button onClick={() => { setOpen(false); setErr(""); }} className="min-h-[40px] px-4 rounded-[10px] text-sm text-slate-600 border border-slate-300">Cancel</button>
        <button onClick={save} disabled={busy || !text.trim()} className="min-h-[40px] px-4 rounded-[10px] text-sm font-semibold text-white bg-[#1D4ED8] disabled:opacity-40">
          {busy ? "Adding…" : "Add update"}
        </button>
      </div>
    </div>
  );
}

// ── A staff member's own private thread + reply box ──
// load() -> { thread }, post(body) -> { thread }
function ThreadMessages({ messages, mineLabel = "You" }) {
  return (
    <div className="space-y-2">
      {messages.map((m) => (
        <div key={m.id} className={`rounded-xl px-3 py-2 ${m.from_manager ? "bg-[#FFFBEB] border border-[#FDE68A]" : "bg-slate-50 border border-slate-200"}`}>
          <div className="text-xs text-slate-500">{m.from_manager ? m.author_name : mineLabel} · {when(m.created_at)}</div>
          <p className="text-sm text-slate-800 whitespace-pre-wrap break-words">{m.body}</p>
        </div>
      ))}
    </div>
  );
}

export function MyReplyThread({ load, post }) {
  const [thread, setThread] = useState(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    let live = true;
    load().then((r) => live && setThread(r.thread || [])).catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const send = async () => {
    setBusy(true); setErr("");
    try { setThread((await post(text.trim())).thread || []); setText(""); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className={BOX}>
      <h3 className="text-sm font-semibold text-slate-700">💬 Reply</h3>
      <p className="text-xs text-slate-500 mt-0.5 mb-2">Only you and the managers see your reply — it isn&apos;t shared with other staff.</p>
      {thread === null && !err ? <p className="text-sm text-slate-400">Loading…</p>
        : thread?.length ? <ThreadMessages messages={thread} /> : null}
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={2000} placeholder="Write a reply…"
        className="mt-2 w-full rounded-[10px] border border-slate-200 px-3 py-2 text-sm resize-y" />
      {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
      <div className="flex justify-end mt-2">
        <button onClick={send} disabled={busy || !text.trim()} className="min-h-[40px] px-4 rounded-[10px] text-sm font-semibold text-white bg-[#1D4ED8] disabled:opacity-40">
          {busy ? "Sending…" : "Send reply"}
        </button>
      </div>
    </div>
  );
}

// Kiosk / shop computers: nothing of anyone's replies shows until the person taps "Reply" and enters their own PIN
// (checked by the server on every request); then only their own thread.
//   staffId: the person (kiosk: the selected photo). staffList (Messages → Staff memos on the computer, where nobody is
//   selected): they pick their name first.
export function KioskReply({ memoId, staffId = null, person = null, staffList = null }) {
  const [step, setStep] = useState("button"); // button | pin | thread
  const [picked, setPicked] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [checking, setChecking] = useState(false);
  const who = staffId || (picked ? Number(picked) : null);
  const whoPerson = person || (staffList || []).find((p) => Number(p.id) === Number(who)) || null;
  const call = (body) => readCall({ ...body, memo_id: memoId, staff_id: Number(who), pin }, true);
  if (!staffId && !staffList) {
    return <p className="mt-4 text-sm text-slate-500">To reply, tap your photo first, then open the memo from your job card.</p>;
  }
  if (step === "button") {
    return (
      <button onClick={() => setStep("pin")} className="mt-4 min-h-[48px] px-6 rounded-[12px] text-sm font-semibold text-[#1D4ED8] bg-white border border-[#BFDBFE] hover:bg-[#EFF6FF]">
        💬 Reply
      </button>
    );
  }
  if (step === "pin") {
    const check = async () => {
      if (!who) { setErr("Choose your name."); return; }
      if (!/^\d{4}$/.test(pin)) { setErr("Enter your 4-digit PIN."); return; }
      setChecking(true); setErr("");
      try { await call({ action: "thread" }); setStep("thread"); } catch (e) { setErr(e.status === 401 ? "Incorrect PIN." : e.message); setPin(""); } finally { setChecking(false); }
    };
    return (
      <div className={`${BOX} max-w-sm`}>
        <h3 className="text-sm font-semibold text-slate-700">💬 Reply{whoPerson ? ` as ${whoPerson.name}` : ""}</h3>
        <p className="text-xs text-slate-500 mt-0.5">Enter your own PIN. Only you and the managers see your reply.</p>
        {!staffId && (
          <select value={picked} onChange={(e) => { setPicked(e.target.value); setErr(""); }} className="mt-2 w-full h-11 rounded-lg border border-gray-300 bg-white px-2 text-sm">
            <option value="">Choose your name…</option>
            {staffList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <input type="text" inputMode="numeric" maxLength={4} value={pin} autoFocus={!!staffId} autoComplete="off" name="memo_reply_pin" data-1p-ignore data-lpignore="true"
          style={{ WebkitTextSecurity: "disc", textSecurity: "disc" }} placeholder="••••"
          onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setErr(""); }} onKeyDown={(e) => e.key === "Enter" && check()}
          className="mt-2 w-full border rounded-lg px-4 py-3 text-center text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-400" />
        {err && <p className="text-sm text-red-500 mt-2">{err}</p>}
        <div className="flex gap-2 mt-3">
          <button onClick={() => { setStep("button"); setPin(""); setPicked(""); setErr(""); }} className="flex-1 min-h-[44px] border border-gray-300 rounded-lg text-sm text-gray-600">Cancel</button>
          <button onClick={check} disabled={checking} className="flex-1 min-h-[44px] bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-40">{checking ? "Checking…" : "Continue"}</button>
        </div>
      </div>
    );
  }
  return <MyReplyThread load={() => call({ action: "thread" })} post={(body) => call({ action: "reply", body })} />;
}

// ── Managers: every person's thread on a memo ("💬 Replies (N, X new)") ──
export function ManagerReplies({ memo, manager, onChanged }) {
  const [threads, setThreads] = useState(null);
  const [open, setOpen] = useState(null);     // staff id
  const [answer, setAnswer] = useState({});   // { [staffId]: text }
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    let live = true;
    memoCall({ action: "threads", pin: manager.pin, id: memo.id }).then((r) => live && setThreads(r.threads || [])).catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [memo.id, manager.pin]);
  const total = (threads || []).reduce((n, t) => n + t.messages.filter((m) => !m.from_manager).length, 0);
  const unread = (threads || []).reduce((n, t) => n + t.unread, 0);
  const openThread = async (t) => {
    if (open === t.staff_id) { setOpen(null); return; }
    setOpen(t.staff_id);
    if (t.unread) {
      try { setThreads((await memoCall({ action: "thread-read", pin: manager.pin, id: memo.id, staff_id: t.staff_id })).threads); onChanged?.(); } catch { /* shown next load */ }
    }
  };
  const send = async (t) => {
    setBusy(true); setErr("");
    try {
      setThreads((await memoCall({ action: "answer", pin: manager.pin, id: memo.id, staff_id: t.staff_id, body: answer[t.staff_id] || "" })).threads);
      setAnswer((a) => ({ ...a, [t.staff_id]: "" }));
      onChanged?.();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className={BOX}>
      <h3 className="text-sm font-semibold text-slate-700">
        💬 Replies ({total}{unread ? `, ${unread} new` : ""}) <span className="font-normal text-xs text-slate-400">— managers only; each person sees only their own</span>
      </h3>
      {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
      {threads === null && !err ? <p className="text-sm text-slate-400 mt-2">Loading…</p>
        : !threads?.length ? <p className="text-sm text-slate-400 mt-2">No replies yet.</p>
        : (
          <div className="mt-2 divide-y divide-slate-100">
            {threads.map((t) => (
              <div key={t.staff_id} className="py-2">
                <button onClick={() => openThread(t)} className="w-full flex items-center justify-between gap-2 text-left min-h-[40px]">
                  <span className="text-sm font-medium text-slate-800">
                    {t.unread > 0 && <span className="inline-block h-2 w-2 rounded-full bg-red-500 mr-2 align-middle" />}
                    {t.name}
                    <span className="font-normal text-xs text-slate-400"> · {t.messages.length} message{t.messages.length === 1 ? "" : "s"} · {when(t.last_at)}</span>
                  </span>
                  <span className="text-xs text-[#1D4ED8] underline">{open === t.staff_id ? "Hide" : t.unread ? `${t.unread} new` : "Open"}</span>
                </button>
                {open === t.staff_id && (
                  <div className="mt-2 pl-1">
                    <ThreadMessages messages={t.messages} mineLabel={t.name} />
                    <textarea value={answer[t.staff_id] || ""} onChange={(e) => setAnswer((a) => ({ ...a, [t.staff_id]: e.target.value }))} rows={2} maxLength={2000}
                      placeholder={`Answer ${t.name.split(" ")[0]} (only they see it)…`}
                      className="mt-2 w-full rounded-[10px] border border-slate-200 px-3 py-2 text-sm resize-y" />
                    <div className="flex justify-end mt-2">
                      <button onClick={() => send(t)} disabled={busy || !(answer[t.staff_id] || "").trim()} className="min-h-[40px] px-4 rounded-[10px] text-sm font-semibold text-white bg-[#1D4ED8] disabled:opacity-40">
                        {busy ? "Sending…" : "Send answer"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

// Managers: "Seen by 9 of 12" + who has / hasn't. list: [{ staff_id, name, seen_at, seen_via }]
export const seenCount = (list) => `Seen by ${(list || []).filter((r) => r.seen_at).length} of ${(list || []).length}`;

export function SeenByPanel({ list }) {
  const [open, setOpen] = useState(false);
  if (!list) return null;
  const seen = list.filter((r) => r.seen_at).sort((a, b) => String(a.seen_at).localeCompare(String(b.seen_at)));
  const notSeen = list.filter((r) => !r.seen_at);
  return (
    <div className="bg-[#FFFBEB] rounded-[14px] border border-[#FDE68A] px-5 py-3 mb-4">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between gap-2 text-left min-h-[36px]">
        <span className="text-sm font-semibold text-[#78350F]">👁 {seenCount(list)} <span className="font-normal text-xs">(managers only)</span></span>
        <span className="text-xs text-[#78350F] underline">{open ? "Hide" : "Show who"}</span>
      </button>
      {open && (
        <div className="mt-2 grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-1">Seen ({seen.length})</div>
            {!seen.length ? <p className="text-slate-400">Nobody yet.</p> : seen.map((r) => (
              <div key={r.staff_id} className="flex justify-between gap-2 py-0.5">
                <span className="text-slate-800">{r.name}</span>
                <span className="text-xs text-slate-500 whitespace-nowrap">{when(r.seen_at)} · {r.seen_via === "kiosk" ? "shop computer" : "phone"}</span>
              </div>
            ))}
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-1">Not seen yet ({notSeen.length})</div>
            {!notSeen.length ? <p className="text-slate-400">Everyone has seen it.</p> : notSeen.map((r) => (
              <div key={r.staff_id} className="py-0.5 text-slate-700">{r.name}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
