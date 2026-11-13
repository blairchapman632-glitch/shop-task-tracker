// Messages → Staff memos (replaces staff emails / newsletters). No login (shop computers).
//   Anyone: the archive of sent memos, newest first — search title / text, filter by topic, open one to read.
//   "🔒 Manager" / "New staff memo" → the person's own PIN, if they're ticked "QSPP manager" in Admin
//   (lib/adminPin checkQsppManagerPin, re-checked by /api/memos on every save) → Drafts: start, edit, preview, delete.
//   Manager mode lives in memory only: auto-locks after 10 minutes with no activity, and on leaving / reloading.
// openMemoId (from /messages?tab=memos&memo=<id>) opens that sent memo; onCloseMemo clears it from the address.
import { useEffect, useMemo, useRef, useState } from "react";
import ManagerPinModal from "../qspp/ManagerPinModal";
import MemoView from "./MemoView";
import MemoEditor from "./MemoEditor";
import supabase from "../../lib/supabaseClient";
import { memoCall } from "../../lib/memosClient";
import { MEMO_TOPICS, defaultMemoTitle, fmtMemoDate, memoSearchText, memoPlainText } from "../../lib/memos";
import { todayPerth } from "../../lib/performanceReview";

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";
const IDLE_LOCK_MS = 10 * 60 * 1000;

// First bit of plain text for the archive list
function snippet(sections) {
  for (const s of sections) {
    const text = memoPlainText(s.body);
    if (text) return text.length > 160 ? `${text.slice(0, 160)}…` : text;
  }
  return "";
}

export default function StaffMemos({ openMemoId, onCloseMemo }) {
  const [manager, setManager] = useState(null); // { id, name, pin } while unlocked
  const [askPin, setAskPin] = useState(false);
  const [afterUnlock, setAfterUnlock] = useState(null); // "new" → start a memo once unlocked
  const lastActivity = useRef(Date.now());
  const [sent, setSent] = useState(null);       // { memos, sections }
  const [drafts, setDrafts] = useState(null);
  const [staffList, setStaffList] = useState([]);
  const [view, setView] = useState({ kind: "list" }); // list | read { id } | edit { id }
  const [search, setSearch] = useState("");
  const [topic, setTopic] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadSent = () => memoCall({ action: "list" }).then(setSent).catch((err) => setError(err.message));
  const loadDrafts = (m = manager) => (m ? memoCall({ action: "drafts", pin: m.pin }).then(({ memos }) => setDrafts(memos)).catch((err) => setError(err.message)) : setDrafts(null));

  useEffect(() => {
    loadSent();
    supabase.from("staff").select("id, name, role, active").eq("pharmacy_id", PHARMACY_ID).eq("active", true)
      .or("role.is.null,role.neq.Locum").order("name").then(({ data }) => setStaffList(data || []));
  }, []);
  useEffect(() => { loadDrafts(); }, [manager]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (openMemoId) setView({ kind: "read", id: String(openMemoId) }); }, [openMemoId]);

  const lock = () => {
    setManager(null);
    setView((v) => (v.kind === "edit" ? { kind: "list" } : v));
  };
  // Auto-lock after 10 minutes with no taps / keys / scrolling
  useEffect(() => {
    if (!manager) return;
    lastActivity.current = Date.now();
    const bump = () => { lastActivity.current = Date.now(); };
    const events = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true, capture: true }));
    const timer = setInterval(() => { if (Date.now() - lastActivity.current > IDLE_LOCK_MS) lock(); }, 15000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump, { capture: true }));
      clearInterval(timer);
    };
  }, [manager]);

  const startMemo = async (m) => {
    setBusy(true);
    setError("");
    try {
      const { memo } = await memoCall({ action: "create", pin: m.pin, title: defaultMemoTitle(todayPerth()) });
      setView({ kind: "edit", id: memo.id });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const onNew = () => {
    if (manager) startMemo(manager);
    else { setAfterUnlock("new"); setAskPin(true); }
  };

  const backToList = () => {
    setView({ kind: "list" });
    onCloseMemo?.();
    loadDrafts();
    loadSent();
  };

  const sectionsByMemo = useMemo(() => {
    const out = {};
    for (const s of sent?.sections || []) (out[s.memo_id] ||= []).push(s);
    return out;
  }, [sent]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (sent?.memos || []).filter((m) => (!topic || (m.topics || []).includes(topic))
      && (!q || memoSearchText(m, sectionsByMemo[m.id] || []).includes(q)));
  }, [sent, sectionsByMemo, search, topic]);

  const reading = view.kind === "read" ? (sent?.memos || []).find((m) => m.id === view.id) : null;

  return (
    <div>
      {/* Manager mode */}
      <div className="flex items-center justify-end gap-2 mb-4">
        {manager ? (
          <>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#FEF3C7] text-[#78350F]">
              Manager mode · {manager.name.split(" ")[0]}
            </span>
            <button onClick={lock} className="min-h-[44px] px-4 rounded-[12px] text-sm font-medium text-slate-700 bg-white border border-[#E5E7EB] hover:bg-slate-50">🔒 Lock</button>
          </>
        ) : (
          <button onClick={() => { setAfterUnlock(null); setAskPin(true); }} className="min-h-[44px] px-4 rounded-[12px] text-sm font-medium text-slate-700 bg-white border border-[#E5E7EB] hover:bg-slate-50">🔒 Manager</button>
        )}
      </div>

      {view.kind === "edit" && manager && (
        <MemoEditor key={view.id} memoId={view.id} manager={manager} staffList={staffList} onBack={backToList} onDeleted={backToList} />
      )}

      {view.kind === "read" && (
        <div className="pb-16">
          <button onClick={backToList} className="mb-3 min-h-[44px] px-3 rounded-[12px] text-sm font-medium text-slate-700 bg-white border border-[#E5E7EB] hover:bg-slate-50">← All memos</button>
          {reading ? <MemoView memo={reading} sections={sectionsByMemo[reading.id] || []} />
            : sent ? <p className="text-sm text-slate-500">That memo wasn&apos;t found.</p>
            : <p className="text-sm text-slate-400">Loading…</p>}
        </div>
      )}

      {view.kind === "list" && (
        <div className="pb-16 space-y-5">
          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end">
            <button onClick={onNew} disabled={busy} className="min-h-[44px] px-4 rounded-[12px] text-sm font-semibold text-white bg-[#1D4ED8] disabled:opacity-40">
              {busy ? "Starting…" : "+ New staff memo"}
            </button>
          </div>

          {/* Drafts (managers) */}
          {manager && (
            <div>
              <h2 className="text-sm font-semibold text-slate-600 mb-2">Drafts</h2>
              {drafts === null ? <p className="text-sm text-slate-400">Loading…</p>
                : !drafts.length ? <p className="text-sm text-slate-400">No drafts.</p>
                : (
                  <div className="space-y-2">
                    {drafts.map((d) => (
                      <button key={d.id} onClick={() => setView({ kind: "edit", id: d.id })}
                        className="w-full text-left bg-white rounded-[14px] border border-[#FDE68A] px-4 py-3 hover:bg-[#FFFBEB]">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#FEF3C7] text-[#78350F]">Draft</span>
                          <span className="font-semibold text-slate-800">{d.title}</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          Last changed {fmtMemoDate(d.updated_at)}{d.created_by_name ? ` · started by ${d.created_by_name}` : ""}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
            </div>
          )}

          {/* Archive */}
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search memos…"
                className="flex-1 min-w-[180px] h-11 rounded-[12px] border border-[#E5E7EB] bg-white px-3 text-sm" />
              <select value={topic} onChange={(e) => setTopic(e.target.value)} className="h-11 rounded-[12px] border border-[#E5E7EB] bg-white px-2 text-sm">
                <option value="">All topics</option>
                {MEMO_TOPICS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            {sent === null ? <p className="text-sm text-slate-400">Loading…</p>
              : !sent.memos.length ? <p className="text-sm text-slate-400">No memos have been sent yet.</p>
              : !shown.length ? <p className="text-sm text-slate-400">No memos match.</p>
              : (
                <div className="space-y-2">
                  {shown.map((m) => {
                    const snip = snippet(sectionsByMemo[m.id] || []);
                    return (
                      <button key={m.id} onClick={() => setView({ kind: "read", id: m.id })}
                        className="w-full text-left bg-white rounded-[14px] border border-[#E5E7EB] px-4 py-3 hover:bg-slate-50">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <span className="font-semibold text-slate-800">{m.title}</span>
                          <span className="text-xs text-slate-500">{fmtMemoDate(m.sent_at)}</span>
                        </div>
                        {snip && <p className="text-sm text-slate-500 mt-1">{snip}</p>}
                        {(m.topics || []).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {m.topics.map((t) => <span key={t} className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#EFF6FF] text-[#1E3A8A]">{t}</span>)}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
          </div>
        </div>
      )}

      {askPin && (
        <ManagerPinModal
          kind="qspp"
          onClose={() => { setAskPin(false); setAfterUnlock(null); }}
          onUnlock={(user) => {
            setManager(user);
            setAskPin(false);
            if (afterUnlock === "new") startMemo(user);
            setAfterUnlock(null);
          }}
        />
      )}
    </div>
  );
}
