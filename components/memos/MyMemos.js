// /me → Messages → Memos (Stage 3): sent staff memos this person received, newest first, unread ones marked.
// Opening one marks it seen (/api/memos/read "seen", via phone). They can reply privately (only they and the managers
// see it; a manager's answer makes the memo show as new again) and download the PDF. Nobody's read status or replies
// but their own are ever shown.
import { useEffect, useState } from "react";
import MemoView from "./MemoView";
import { MyReplyThread, PdfButton } from "./MemoExtras";
import { readCall } from "../../lib/memosClient";
import { fmtMemoDate, MEMO_TOPICS } from "../../lib/memos";

// -> { memos: [{ id, title, sent_at, seen }], unread } or null
export const fetchMyMemos = async () => {
  try {
    return await readCall({ action: "mine" });
  } catch (err) {
    console.error("[my-memos]", err);
    return null;
  }
};

export default function MyMemos({ data, openId, onOpened, onChanged }) {
  const [reading, setReading] = useState(openId ? String(openId) : null);
  useEffect(() => { if (openId) setReading(String(openId)); }, [openId]);

  const [topic, setTopic] = useState("");

  if (reading) return <ReadMemo id={reading} onBack={() => { setReading(null); onOpened?.(null); }} onSeen={onChanged} />;
  if (!data) return <p className="text-sm text-gray-400 text-center py-6">Loading…</p>;
  if (!data.memos.length) return <p className="text-sm text-gray-400 text-center py-6">No staff memos yet.</p>;
  // Topic filter: only the topics my memos actually have
  const topics = MEMO_TOPICS.filter((t) => data.memos.some((m) => (m.topics || []).includes(t)));
  const shown = topic ? data.memos.filter((m) => (m.topics || []).includes(topic)) : data.memos;
  return (
    <div className="space-y-2">
      {topics.length > 0 && (
        <select value={topic} onChange={(e) => setTopic(e.target.value)} className="w-full h-10 rounded-lg border border-gray-200 bg-white px-2 text-sm">
          <option value="">All topics</option>
          {topics.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      )}
      {!shown.length && <p className="text-sm text-gray-400 text-center py-4">No memos with that topic.</p>}
      {shown.map((m) => (
        <button key={m.id} onClick={() => setReading(m.id)}
          className={`w-full text-left rounded-xl border px-4 py-3 ${m.seen ? "bg-white border-gray-200" : "bg-blue-50 border-blue-200"}`}>
          <div className="flex items-start justify-between gap-2">
            <span className={`text-sm break-words ${m.seen ? "text-gray-800" : "font-semibold text-gray-900"}`}>
              {!m.seen && <span className="inline-block h-2 w-2 rounded-full bg-blue-600 mr-2 align-middle" />}
              {m.title}
            </span>
            <span className="shrink-0 text-xs text-gray-500">{fmtMemoDate(m.sent_at)}</span>
          </div>
          {!m.seen && <div className="text-xs text-blue-700 mt-0.5 font-medium">{m.new_answer ? "💬 New answer to your reply" : "New — tap to read"}</div>}
          {(m.topics || []).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {m.topics.map((t) => <span key={t} className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#EFF6FF] text-[#1E3A8A]">{t}</span>)}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}

function ReadMemo({ id, onBack, onSeen }) {
  const [memo, setMemo] = useState(null);
  const [error, setError] = useState("");
  // Through /api/memos/read with my login, so memos sent just to me (or my role) open too
  useEffect(() => {
    let live = true;
    readCall({ action: "get", memo_id: id })
      .then((r) => {
        if (!live) return;
        setMemo(r);
        // Opened = seen (only counts if they're a recipient — the server checks)
        readCall({ action: "seen", memo_id: id }).then(() => onSeen?.()).catch(() => {});
      })
      .catch((err) => live && setError(err.message));
    return () => { live = false; };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="pb-6">
      <div className="flex items-start justify-between gap-2 mb-3">
        <button onClick={onBack} className="min-h-[44px] px-3 rounded-xl text-sm font-medium text-gray-700 bg-white border border-gray-200">← All memos</button>
        {memo && <PdfButton memo={memo.memo} />}
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p>
        : !memo ? <p className="text-sm text-gray-400">Loading…</p>
        : (
          <>
            <MemoView memo={memo.memo} sections={memo.sections} policies={memo.policies} dates={memo.dates} updates={memo.updates} />
            {/* My own private thread (opening it marks managers' answers read) — no PIN on /me */}
            {!memo.memo.imported && (
              <MyReplyThread
                load={async () => { const r = await readCall({ action: "thread", memo_id: id }); onSeen?.(); return r; }}
                post={(body) => readCall({ action: "reply", memo_id: id, body })} />
            )}
          </>
        )}
    </div>
  );
}
