// Messages → Staff memos, manager mode → one draft memo. Everything saves as you go through /api/memos (PIN re-checked
// there): title + topic tags on the memo; each section's heading, formatted text (RichTextEditor — what you see is what
// staff get), images (several), PDF attachments, author + signature line. ▲▼ reorder, Remove section, Preview (the
// same MemoView staff will see), Delete draft. "📤 Send…" (Stage 3): saves everything typed, then SendModal — all active
// staff or chosen roles, a confirm with the count and any asks still waiting (left out) — then /api/memos "send".
// "Ask for a section from…" (Stage 2): a slot per ticked person, who writes it from their kiosk job or /me → To do
// (/api/memos/contribute). Each asked slot shows Waiting / Written / Nothing this month; the manager can still edit it,
// move it, or remove the ask (their job clears). Each ask can carry a note ("Note for Kelly", plain text, who asked is
// shown) — they see it above their section; it's never part of the memo (not in Preview / the sent memo / the PDF).
// Section saves are version-checked (lib/memosServer saveSectionChecked): if the asked person (or another manager)
// saved since this screen last loaded the section, nothing is overwritten — the section shows "Load their version" /
// "Keep mine". The draft re-checks every 20 s, so new contributions appear without reloading.
import { useEffect, useRef, useState } from "react";
import MemoView from "./MemoView";
import RichTextEditor from "./RichTextEditor";
import ConflictBanner from "./ConflictBanner";
import { memoCall, uploadMemoFile } from "../../lib/memosClient";
import { MEMO_TOPICS, fmtMemoDate, fmtMemoDateRange, isAsked, askStatus } from "../../lib/memos";
import { loadCategories } from "../../lib/calendar";
import { todayPerth } from "../../lib/performanceReview";
import supabase from "../../lib/supabaseClient";

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";

const TEXT_SAVE_MS = 800;
const POLL_MS = 20000;
const newer = (a, b) => String(a || "") > String(b || "");

// Saves in order, one at a time; tells the caller "saving" / "saved" / an error. .busy() = a save still running.
function useSaveQueue(onStatus) {
  const chain = useRef(Promise.resolve());
  const pending = useRef(0);
  const run = (fn) => {
    pending.current += 1;
    onStatus("saving");
    chain.current = chain.current.then(fn).then(
      () => { pending.current -= 1; if (!pending.current) onStatus("saved"); },
      (err) => { pending.current -= 1; onStatus(err?.conflict ? null : (err?.message || "Couldn't save")); },
    );
    return chain.current;
  };
  run.busy = () => pending.current > 0;
  run.wait = () => chain.current.catch(() => {}); // resolves once every save queued so far has finished
  return run;
}

// Runs fn when the page is being closed or left (pagehide — React doesn't unmount then)
function useOnPageHide(fn) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const h = () => ref.current();
    window.addEventListener("pagehide", h);
    return () => window.removeEventListener("pagehide", h);
  }, []);
}

function SaveBadge({ status }) {
  if (!status) return null;
  if (status === "saving") return <span className="text-xs text-slate-400">Saving…</span>;
  if (status === "saved") return <span className="text-xs text-green-700">Saved ✓</span>;
  return <span className="text-xs text-red-600">⚠ {status}</span>;
}

const STATUS_STYLE = {
  Waiting: "bg-[#FEF3C7] text-[#78350F]",
  Written: "bg-green-100 text-green-800",
  "Nothing this month": "bg-slate-100 text-slate-600",
};
export const AskChip = ({ section }) => {
  const st = askStatus(section);
  return <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_STYLE[st]}`}>{st}</span>;
};

export default function MemoEditor({ memoId, manager, staffList, onBack, onDeleted, onSent }) {
  const [memo, setMemo] = useState(null);
  const [sections, setSections] = useState([]);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState(null);
  const [preview, setPreview] = useState(false);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const titleTimer = useRef(null);
  const titlePending = useRef(null); // a title typed but not saved yet
  const queue = useSaveQueue(setStatus);
  // Each section registers "save what's typed now, then wait" (-> false if it has an unresolved clash), so Send never
  // goes ahead of text still being saved
  const flushers = useRef(new Map());
  const registerFlush = (id, fn) => { if (fn) flushers.current.set(id, fn); else flushers.current.delete(id); };
  const [sending, setSending] = useState(false); // the Send confirm step is open
  const [policies, setPolicies] = useState([]);  // Stage 4: policies to read (read requests made on Send)
  const [dates, setDates] = useState([]);        // Stage 4: dates (What's on events made on Send)
  const [addingPolicy, setAddingPolicy] = useState(false);
  const [addingDate, setAddingDate] = useState(false);
  const [categories, setCategories] = useState([]);
  useEffect(() => {
    loadCategories(supabase, PHARMACY_ID).then((c) => setCategories(c.filter((x) => x.active !== false))).catch(() => {});
  }, []);

  useEffect(() => {
    let live = true;
    memoCall({ action: "get", id: memoId, pin: manager.pin })
      .then(({ memo: m, sections: s, policies: p, dates: d }) => { if (!live) return; setMemo(m); setTitle(m.title); setSections(s); setPolicies(p || []); setDates(d || []); })
      .catch((err) => live && setError(err.message));
    return () => { live = false; };
  }, [memoId, manager.pin]);

  // Re-check every 20 s: new / changed sections from the asked staff (keeps whichever copy is newer)
  useEffect(() => {
    if (!memo) return undefined;
    const t = setInterval(async () => {
      try {
        const { sections: fresh } = await memoCall({ action: "get", id: memoId, pin: manager.pin });
        setSections((cur) => {
          const byId = Object.fromEntries(cur.map((s) => [s.id, s]));
          return fresh.map((f) => (byId[f.id] && !newer(f.updated_at, byId[f.id].updated_at) ? { ...byId[f.id], sort_order: f.sort_order } : f));
        });
      } catch { /* try again next time */ }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [memo, memoId, manager.pin]);

  const saveMemo = (patch) => queue(async () => {
    if ("title" in patch) titlePending.current = null;
    const { memo: m } = await memoCall({ action: "update-memo", pin: manager.pin, id: memoId, patch }, { keepalive: true });
    setMemo((prev) => ({ ...prev, ...m }));
  });

  const onTitle = (v) => {
    setTitle(v);
    clearTimeout(titleTimer.current);
    titlePending.current = v.trim() ? v : null;
    if (!v.trim()) { setStatus("The title can't be empty"); return; }
    titleTimer.current = setTimeout(() => saveMemo({ title: v }), TEXT_SAVE_MS);
  };
  // Locking / leaving the tab or page: save a title typed in the last second (keepalive, so it survives the page going)
  const saveTitleNow = () => {
    clearTimeout(titleTimer.current);
    const v = titlePending.current;
    if (v === null) return;
    titlePending.current = null;
    memoCall({ action: "update-memo", pin: manager.pin, id: memoId, patch: { title: v } }, { keepalive: true }).catch(() => {});
  };
  useEffect(() => () => saveTitleNow(), []); // eslint-disable-line react-hooks/exhaustive-deps
  useOnPageHide(saveTitleNow);

  const toggleTopic = (t) => {
    const next = (memo.topics || []).includes(t) ? memo.topics.filter((x) => x !== t) : [...(memo.topics || []), t];
    setMemo((m) => ({ ...m, topics: next }));
    saveMemo({ topics: MEMO_TOPICS.filter((x) => next.includes(x)) });
  };

  const run = async (fn) => {
    setBusy(true);
    setError("");
    try { await fn(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const addSection = () => run(async () => {
    const { section } = await memoCall({ action: "add-section", pin: manager.pin, memo_id: memoId });
    setSections((s) => [...s, section]);
  });
  const ask = (ids, notes) => run(async () => {
    const { sections: s } = await memoCall({ action: "ask", pin: manager.pin, memo_id: memoId, staff_ids: ids, ...(notes ? { notes } : {}) });
    setSections(s);
    setAsking(false);
  });
  const moveSection = (id, dir) => run(async () => {
    const { sections: s } = await memoCall({ action: "move-section", pin: manager.pin, id, dir });
    setSections(s);
  });
  const removeSection = (sec) => {
    const who = isAsked(sec) ? staffList.find((p) => Number(p.id) === Number(sec.requested_staff_id))?.name : null;
    const msg = who
      ? `Remove the ask for ${who}? Their section${sec.body || (sec.images || []).length ? " (and what they've written)" : ""} will be deleted and their job will disappear.`
      : `Remove the section "${sec.heading || "untitled"}"? Its text, images and PDFs will be deleted.`;
    if (!window.confirm(msg)) return;
    run(async () => {
      const { sections: s } = await memoCall({ action: "delete-section", pin: manager.pin, id: sec.id });
      setSections(s);
    });
  };
  // Policies to read / dates (drafts only — the server re-checks the PIN and that it's still a draft)
  const addPolicies = (ids) => run(async () => {
    const r = await memoCall({ action: "add-policies", pin: manager.pin, memo_id: memoId, document_ids: ids });
    setPolicies(r.policies);
    setAddingPolicy(false);
  });
  const removePolicy = (p) => run(async () => setPolicies((await memoCall({ action: "remove-policy", pin: manager.pin, id: p.id })).policies));
  const movePolicy = (p, dir) => run(async () => setPolicies((await memoCall({ action: "move-policy", pin: manager.pin, id: p.id, dir })).policies));
  const addDate = (date) => run(async () => {
    const r = await memoCall({ action: "add-date", pin: manager.pin, memo_id: memoId, date });
    setDates(r.dates);
    setAddingDate(false);
  });
  const removeDate = (d) => run(async () => setDates((await memoCall({ action: "remove-date", pin: manager.pin, id: d.id })).dates));

  // Send: save everything typed first, then the confirm step
  const openSend = () => run(async () => {
    clearTimeout(titleTimer.current);
    if (titlePending.current !== null) saveMemo({ title: titlePending.current });
    const results = await Promise.all([...flushers.current.values()].map((fn) => fn()));
    await queue.wait();
    if (results.includes(false)) throw new Error("A section has a save clash — choose “Load their version” or “Keep mine” first.");
    if (!title.trim()) throw new Error("Give the memo a title first.");
    setSending(true);
  });
  const doSend = (to) => run(async () => {
    const out = await memoCall({ action: "send", pin: manager.pin, id: memoId, to });
    setSending(false);
    if (out.warnings?.length) window.alert(`The memo was sent, but:\n\n${out.warnings.join("\n\n")}`);
    if (onSent) onSent(memoId); else onBack();
  });

  const deleteDraft = () => {
    if (!window.confirm(`Delete the draft "${memo.title}"? This can't be undone.`)) return;
    run(async () => {
      await memoCall({ action: "delete", pin: manager.pin, id: memoId });
      onDeleted();
    });
  };

  if (error && !memo) return <div><p className="text-sm text-red-600">{error}</p><button onClick={onBack} className="mt-3 text-sm text-[#1D4ED8] underline">← Back</button></div>;
  if (!memo) return <p className="text-sm text-slate-400">Loading…</p>;

  const liveMemo = { ...memo, title };
  const asked = sections.filter(isAsked);
  const nameOf = (id) => staffList.find((p) => Number(p.id) === Number(id))?.name || "Someone";

  return (
    <div className="pb-16">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <button onClick={onBack} className="min-h-[44px] px-3 rounded-[12px] text-sm font-medium text-slate-700 bg-white border border-[#E5E7EB] hover:bg-slate-50">← All memos</button>
        <div className="flex items-center gap-2">
          <SaveBadge status={status} />
          <button onClick={() => setPreview(true)} className="min-h-[44px] px-4 rounded-[12px] text-sm font-semibold text-[#1D4ED8] bg-white border border-[#BFDBFE] hover:bg-[#EFF6FF]">👁 Preview</button>
        </div>
      </div>

      {/* The memo */}
      <div className="bg-white rounded-[14px] border border-[#E5E7EB] px-4 py-4 mb-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FEF3C7] text-[#78350F]">Draft</span>
          <span className="text-xs text-slate-400">Started {fmtMemoDate(memo.created_at)}{memo.created_by_name ? ` by ${memo.created_by_name}` : ""}</span>
        </div>
        <label className="block">
          <span className="text-xs font-semibold text-slate-500">Title</span>
          <input value={title} onChange={(e) => onTitle(e.target.value)} maxLength={200}
            className="mt-1 w-full h-11 rounded-[10px] border border-slate-200 px-3 text-lg font-semibold text-slate-800" />
        </label>
        <div>
          <span className="text-xs font-semibold text-slate-500">Topics</span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {MEMO_TOPICS.map((t) => {
              const on = (memo.topics || []).includes(t);
              return (
                <button key={t} onClick={() => toggleTopic(t)}
                  className={`min-h-[36px] px-3 rounded-full text-sm border ${on ? "bg-[#1D4ED8] border-[#1D4ED8] text-white font-medium" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                  {on ? "✓ " : ""}{t}
                </button>
              );
            })}
          </div>
        </div>
        {/* Sections asked of staff */}
        <div className="pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-500">Sections asked of staff</span>
            <button onClick={() => setAsking(true)} disabled={busy} className="min-h-[40px] px-3 rounded-[10px] text-sm font-semibold text-[#1D4ED8] bg-white border border-[#BFDBFE] hover:bg-[#EFF6FF] disabled:opacity-40">
              ✉️ Ask for a section from…
            </button>
          </div>
          {asked.length ? (
            <ul className="mt-2 space-y-1">
              {asked.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
                  <span className="font-medium">{nameOf(s.requested_staff_id)}</span>
                  <AskChip section={s} />
                  <span className="text-xs text-slate-400 truncate">{s.heading}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-1 text-xs text-slate-400">Nobody asked yet. They&apos;ll get a job on the kiosk and in their phone&apos;s To do.</p>}
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-4">
        {sections.map((s, i) => (s.declined_at ? (
          <DeclinedSlot key={s.id} section={s} name={nameOf(s.requested_staff_id)} busy={busy}
            onAskAgain={() => ask([Number(s.requested_staff_id)])} onRemove={() => removeSection(s)} />
        ) : (
          <SectionEditor key={s.id} section={s} index={i} count={sections.length} memoId={memoId} manager={manager} staffList={staffList}
            askedName={isAsked(s) ? nameOf(s.requested_staff_id) : null}
            askedByName={s.requested_by_staff_id ? nameOf(s.requested_by_staff_id) : null} registerFlush={registerFlush}
            busy={busy} onMove={(dir) => moveSection(s.id, dir)} onRemove={() => removeSection(s)}
            onSaved={(next) => setSections((all) => all.map((x) => (x.id === next.id ? next : x)))} />
        )))}
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <button onClick={addSection} disabled={busy} className="min-h-[44px] px-4 rounded-[12px] text-sm font-semibold text-white bg-[#1D4ED8] disabled:opacity-40">+ Add a section</button>
          <button onClick={() => setAsking(true)} disabled={busy} className="min-h-[44px] px-4 rounded-[12px] text-sm font-semibold text-[#1D4ED8] bg-white border border-[#BFDBFE] hover:bg-[#EFF6FF] disabled:opacity-40">✉️ Ask for a section from…</button>
        </div>
        <button onClick={deleteDraft} disabled={busy} className="min-h-[44px] px-4 rounded-[12px] text-sm font-medium text-red-600 bg-white border border-red-200 hover:bg-red-50 disabled:opacity-40">Delete draft</button>
      </div>

      {/* Policies to read (Stage 4) */}
      <div className="mt-6 bg-white rounded-[14px] border border-[#E5E7EB] px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-semibold text-slate-800">📄 Policies to read</div>
            <p className="text-xs text-slate-500">On Send, everyone the memo goes to is asked to read these (the usual policy read requests — no duplicates if they already have one open).</p>
          </div>
          <button onClick={() => setAddingPolicy(true)} disabled={busy} className="min-h-[40px] px-3 rounded-[10px] text-sm font-semibold text-[#1D4ED8] bg-white border border-[#BFDBFE] hover:bg-[#EFF6FF] disabled:opacity-40">+ Add a policy to read</button>
        </div>
        {policies.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-100">
            {policies.map((p, i) => (
              <li key={p.id} className="flex items-center gap-2 py-2">
                <span className="flex-1 min-w-0 text-sm text-slate-800 break-words">
                  {p.title}{p.version ? <span className="text-xs text-slate-400"> · v{p.version}</span> : null}
                  {!p.active && <span className="text-xs text-red-600"> · retired — won&apos;t be requested</span>}
                </span>
                <button onClick={() => movePolicy(p, -1)} disabled={busy || i === 0} className="h-9 w-9 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-30" title="Move up">▲</button>
                <button onClick={() => movePolicy(p, 1)} disabled={busy || i === policies.length - 1} className="h-9 w-9 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-30" title="Move down">▼</button>
                <button onClick={() => removePolicy(p)} disabled={busy} className="h-9 px-3 rounded-lg border border-red-200 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40">Remove</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Dates (Stage 4) */}
      <div className="mt-4 bg-white rounded-[14px] border border-[#E5E7EB] px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-semibold text-slate-800">📅 Dates</div>
            <p className="text-xs text-slate-500">Added to the What&apos;s on calendar when the memo is sent (nothing is added while it&apos;s a draft).</p>
          </div>
          <button onClick={() => setAddingDate(true)} disabled={busy} className="min-h-[40px] px-3 rounded-[10px] text-sm font-semibold text-[#1D4ED8] bg-white border border-[#BFDBFE] hover:bg-[#EFF6FF] disabled:opacity-40">+ Add a date</button>
        </div>
        {dates.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-100">
            {dates.map((d) => (
              <li key={d.id} className="flex items-center gap-2 py-2">
                <span className="flex-1 min-w-0 text-sm text-slate-800 break-words">
                  <span className="font-medium">{fmtMemoDateRange(d.start_date, d.end_date)}</span> — {d.title}
                  {d.category_name && <span className="text-xs text-slate-500"> · {d.category_name}</span>}
                </span>
                <button onClick={() => removeDate(d)} disabled={busy} className="h-9 px-3 rounded-lg border border-red-200 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40">Remove</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {addingPolicy && <PolicyPicker manager={manager} already={policies.map((p) => String(p.document_id))} busy={busy} error={error} onAdd={addPolicies} onClose={() => { setAddingPolicy(false); setError(""); }} />}
      {addingDate && <DateForm categories={categories} busy={busy} error={error} onAdd={addDate} onClose={() => { setAddingDate(false); setError(""); }} />}

      {/* Send */}
      <div className="mt-6 bg-white rounded-[14px] border-2 border-[#BFDBFE] px-4 py-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-slate-800">Ready to send?</div>
          <p className="text-xs text-slate-500">You&apos;ll choose who it goes to and check it before it&apos;s sent. Once sent it can&apos;t be changed — corrections go as a reply.</p>
        </div>
        <button onClick={openSend} disabled={busy} className="min-h-[48px] px-6 rounded-[12px] text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-40">
          {busy && !sending ? "Saving…" : "📤 Send…"}
        </button>
      </div>

      {asking && <AskModal staffList={staffList} sections={sections} busy={busy} onAsk={ask} onClose={() => setAsking(false)} />}
      {sending && (
        <SendModal title={title} staffList={staffList} sections={sections} nameOf={nameOf} busy={busy} error={error}
          policies={policies.filter((p) => p.active)} dates={dates}
          onSend={doSend} onClose={() => { setSending(false); setError(""); }} />
      )}

      {preview && (
        <div className="fixed inset-0 z-50 bg-black/40 overflow-y-auto" onClick={() => setPreview(false)}>
          <div className="max-w-3xl mx-auto px-4 py-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#FEF3C7] text-[#78350F]">Preview — this is how staff will see it</span>
              <button onClick={() => setPreview(false)} className="min-h-[44px] px-4 rounded-[12px] text-sm font-medium text-slate-700 bg-white border border-[#E5E7EB]">✕ Close</button>
            </div>
            {asked.some((s) => askStatus(s) === "Waiting") && (
              <p className="mb-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
                Sections still waiting to be written aren&apos;t shown (they&apos;re left out if the memo is sent before they&apos;re written).
              </p>
            )}
            <MemoView memo={{ ...liveMemo, status: "sent", sent_at: new Date().toISOString(), sent_by_name: manager.name }} sections={sections}
              policies={policies} dates={dates} />
          </div>
        </div>
      )}
    </div>
  );
}

// "Ask for a section from…": tick any active staff (this memo only). Already asked = ticked and locked (their note is
// edited on their slot); "Nothing this month" people can be ticked to ask again (their old note comes back, editable).
// Each ticked person gets an optional "Note for [first name]" (plain text); "Same note for everyone" fills them all.
function AskModal({ staffList, sections, busy, onAsk, onClose }) {
  const slotOf = (id) => sections.find((s) => Number(s.requested_staff_id) === Number(id));
  const [picked, setPicked] = useState([]);
  const [notes, setNotes] = useState({});    // { [staffId]: note }
  const [same, setSame] = useState("");
  const toggle = (id) => {
    if (picked.includes(id)) { setPicked((p) => p.filter((x) => x !== id)); return; }
    setPicked((p) => [...p, id]);
    // A new tick starts with their old note (asked again) or the "same note" text
    setNotes((n) => (id in n ? n : { ...n, [id]: slotOf(id)?.request_note || same }));
  };
  const setAll = (v) => {
    setSame(v);
    setNotes((n) => ({ ...n, ...Object.fromEntries(picked.map((id) => [id, v])) }));
  };
  const first = (name) => String(name || "").split(" ")[0];
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-3 border-b">
          <h2 className="font-semibold text-slate-800">✉️ Ask for a section from…</h2>
          <p className="text-xs text-slate-500 mt-1">For this memo only. Each person gets a job on the kiosk and in their phone&apos;s To do: “Add your section to the …”. A note is optional — they see it above their section; it&apos;s never part of the memo.</p>
          <label className="block mt-3">
            <span className="text-xs font-semibold text-slate-500">Same note for everyone (optional)</span>
            <textarea value={same} onChange={(e) => setAll(e.target.value)} rows={2} maxLength={1000}
              placeholder="e.g. Please keep it to a few lines and add a photo if you have one."
              className="mt-1 w-full rounded-[10px] border border-slate-200 px-3 py-2 text-sm" />
          </label>
        </div>
        <div className="px-3 py-2 overflow-y-auto">
          {staffList.map((p) => {
            const id = Number(p.id);
            const slot = slotOf(id);
            const locked = slot && !slot.declined_at;
            const on = locked || picked.includes(id);
            return (
              <div key={id} className={`px-2 py-2 rounded-lg ${locked ? "opacity-60" : ""}`}>
                <label className={`flex items-center gap-3 ${locked ? "" : "cursor-pointer"}`}>
                  <input type="checkbox" className="h-5 w-5" checked={!!on} disabled={!!locked} onChange={() => toggle(id)} />
                  <span className="text-sm text-slate-800 flex-1">{p.name}<span className="text-xs text-slate-400"> · {p.role || "Staff"}</span></span>
                  {slot && <AskChip section={slot} />}
                </label>
                {!locked && picked.includes(id) && (
                  <textarea value={notes[id] || ""} onChange={(e) => setNotes((n) => ({ ...n, [id]: e.target.value }))} rows={2} maxLength={1000}
                    placeholder={`Note for ${first(p.name)} (optional) — e.g. Please cover Christmas pack ordering and collection dates.`}
                    className="mt-1.5 ml-8 w-[calc(100%-2rem)] rounded-[10px] border border-slate-200 px-3 py-2 text-sm" />
                )}
              </div>
            );
          })}
        </div>
        <div className="px-5 py-3 border-t flex gap-2">
          <button onClick={onClose} className="flex-1 min-h-[44px] rounded-xl border border-slate-300 text-sm font-medium text-slate-600">Cancel</button>
          <button onClick={() => onAsk(picked, Object.fromEntries(picked.map((id) => [id, notes[id] || ""])))} disabled={!picked.length || busy}
            className="flex-1 min-h-[44px] rounded-xl bg-[#1D4ED8] text-white text-sm font-semibold disabled:opacity-40">
            {busy ? "Asking…" : picked.length ? `Ask ${picked.length} ${picked.length === 1 ? "person" : "people"}` : "Ask"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeclinedSlot({ name, busy, onAskAgain, onRemove }) {
  return (
    <div className="bg-slate-50 rounded-[14px] border border-dashed border-slate-300 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-sm text-slate-600">
        <span className="font-medium">{name}</span>
        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-200 text-slate-600">Nothing this month</span>
        <span className="text-xs text-slate-400">— left out of the memo</span>
      </div>
      <div className="flex gap-1">
        <button onClick={onAskAgain} disabled={busy} className="h-9 px-3 rounded-lg text-sm text-[#1D4ED8] bg-white border border-[#BFDBFE] disabled:opacity-40">Ask again</button>
        <button onClick={onRemove} disabled={busy} className="h-9 px-3 rounded-lg text-sm text-red-600 bg-white border border-red-200 disabled:opacity-40">Remove</button>
      </div>
    </div>
  );
}


// The manager's note on an asked slot ("Note for Kelly", plain text). Shown to the asked person above their section;
// never part of the memo. Saves ~1 s after typing stops (update-note — not section content, so no version clash).
function AskNote({ section, manager, askedName, askedByName, onSaved }) {
  const [note, setNote] = useState(section.request_note || "");
  const [status, setStatus] = useState(null);
  const timer = useRef(null);
  const pending = useRef(null);
  const saveNow = async () => {
    clearTimeout(timer.current);
    if (pending.current === null) return;
    const v = pending.current;
    pending.current = null;
    setStatus("saving");
    try {
      const { section: s } = await memoCall({ action: "update-note", pin: manager.pin, id: section.id, note: v }, { keepalive: true });
      onSaved(s);
      setStatus("saved");
    } catch (err) {
      setStatus(err.message);
    }
  };
  useEffect(() => () => { saveNow(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useOnPageHide(saveNow);
  const first = String(askedName || "").split(" ")[0];
  return (
    <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-amber-900">
          📝 Note for {first}{askedByName ? <span className="font-normal text-amber-800"> · asked by {askedByName}</span> : null}
          <span className="font-normal text-amber-700"> — only {first} sees this, not part of the memo</span>
        </span>
        <SaveBadge status={status} />
      </div>
      <textarea value={note} rows={2} maxLength={1000} placeholder={`Optional — e.g. Please cover Christmas pack ordering and collection dates.`}
        onChange={(e) => { setNote(e.target.value); pending.current = e.target.value; setStatus("saving"); clearTimeout(timer.current); timer.current = setTimeout(saveNow, TEXT_SAVE_MS); }}
        onBlur={saveNow}
        className="mt-1 w-full rounded-[8px] border border-amber-200 bg-white px-2.5 py-1.5 text-sm text-slate-800" />
    </div>
  );
}

// "Add a policy to read": current (not retired) QSPP library documents, search + tick one or more
function PolicyPicker({ manager, already, busy, error, onAdd, onClose }) {
  const [docs, setDocs] = useState(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState([]);
  useEffect(() => {
    memoCall({ action: "policy-options", pin: manager.pin }).then((r) => setDocs(r.documents || [])).catch((e) => setErr(e.message));
  }, [manager.pin]);
  const shown = (docs || []).filter((d) => !q.trim() || `${d.title} ${d.folder}`.toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-3 border-b">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-semibold text-slate-800">📄 Add a policy to read</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the QSPP library…" autoFocus
            className="mt-3 w-full h-11 rounded-[10px] border border-slate-200 px-3 text-sm" />
        </div>
        <div className="px-3 py-2 overflow-y-auto flex-1">
          {err ? <p className="text-sm text-red-600 px-2">{err}</p>
            : docs === null ? <p className="text-sm text-slate-400 px-2">Loading…</p>
            : !shown.length ? <p className="text-sm text-slate-400 px-2">No current documents match.</p>
            : shown.map((d) => {
              const added = already.includes(String(d.id));
              return (
                <label key={d.id} className={`flex items-center gap-3 px-2 py-2 rounded-lg ${added ? "opacity-50" : "cursor-pointer hover:bg-slate-50"}`}>
                  <input type="checkbox" className="h-5 w-5" checked={added || picked.includes(d.id)} disabled={added} onChange={() => toggle(d.id)} />
                  <span className="flex-1 min-w-0 text-sm text-slate-800 break-words">
                    {d.title}{d.version ? <span className="text-xs text-slate-400"> · v{d.version}</span> : null}
                    {d.folder && <span className="block text-xs text-slate-400">{d.folder}</span>}
                  </span>
                  {added && <span className="text-xs text-slate-500">Added</span>}
                </label>
              );
            })}
        </div>
        {error && <p className="px-5 pt-2 text-sm text-red-600">{error}</p>}
        <div className="px-5 py-3 border-t flex gap-2">
          <button onClick={onClose} className="flex-1 min-h-[44px] border border-slate-300 rounded-[12px] text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={() => onAdd(picked)} disabled={busy || !picked.length} className="flex-1 min-h-[44px] rounded-[12px] text-sm font-semibold text-white bg-[#1D4ED8] disabled:opacity-40">
            {busy ? "Adding…" : `Add ${picked.length || ""}`.trim()}
          </button>
        </div>
      </div>
    </div>
  );
}

// "Add a date": title, one day or a range, What's on category. The event itself is made on Send.
function DateForm({ categories, busy, error, onAdd, onClose }) {
  const today = todayPerth();
  const [title, setTitle] = useState("");
  const [range, setRange] = useState(false);
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [cat, setCat] = useState(categories.find((c) => !c.manager_only)?.id || categories[0]?.id || "");
  const bad = !title.trim() || !start || (range && (!end || end < start));
  const field = "w-full h-11 rounded-[10px] border border-slate-200 px-3 text-sm bg-white";
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-semibold text-slate-800">📅 Add a date</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
        </div>
        <label className="block">
          <span className="text-xs font-semibold text-slate-500">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus placeholder="e.g. Christmas orders close" className={`mt-1 ${field}`} />
        </label>
        <div className="flex gap-2">
          {[{ v: false, l: "One day" }, { v: true, l: "Date range" }].map((o) => (
            <button key={o.l} onClick={() => setRange(o.v)}
              className={`flex-1 min-h-[40px] rounded-[10px] text-sm border ${range === o.v ? "bg-[#1D4ED8] border-[#1D4ED8] text-white font-medium" : "bg-white border-slate-200 text-slate-600"}`}>{o.l}</button>
          ))}
        </div>
        <div className="flex gap-2">
          <label className="block flex-1">
            <span className="text-xs font-semibold text-slate-500">{range ? "From" : "Date"}</span>
            <input type="date" value={start} onChange={(e) => { setStart(e.target.value); if (end < e.target.value) setEnd(e.target.value); }} className={`mt-1 ${field}`} />
          </label>
          {range && (
            <label className="block flex-1">
              <span className="text-xs font-semibold text-slate-500">To</span>
              <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} className={`mt-1 ${field}`} />
            </label>
          )}
        </div>
        <label className="block">
          <span className="text-xs font-semibold text-slate-500">What&apos;s on category</span>
          <select value={cat} onChange={(e) => setCat(e.target.value)} className={`mt-1 ${field}`}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}{c.manager_only ? " (manager only)" : ""}</option>)}
          </select>
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 min-h-[44px] border border-slate-300 rounded-[12px] text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={() => onAdd({ title: title.trim(), start_date: start, end_date: range ? end : null, category_id: cat || null })} disabled={busy || bad}
            className="flex-1 min-h-[44px] rounded-[12px] text-sm font-semibold text-white bg-[#1D4ED8] disabled:opacity-40">{busy ? "Adding…" : "Add date"}</button>
        </div>
      </div>
    </div>
  );
}

// Send step: "Send to" all active staff (default) or chosen roles, then a confirm showing the title, how many people
// it goes to, and any asked sections still waiting (they're left out). staffList = active staff, not locums.
function SendModal({ title, staffList, sections, nameOf, busy, error, policies = [], dates = [], onSend, onClose }) {
  const roles = [...new Set(staffList.map((p) => p.role).filter(Boolean))].sort();
  const [mode, setMode] = useState("all");
  const [picked, setPicked] = useState([]);       // roles
  const [people, setPeople] = useState([]);       // staff ids
  const [confirm, setConfirm] = useState(false);
  const chosen = mode === "all" ? staffList
    : mode === "roles" ? staffList.filter((p) => picked.includes(p.role))
    : staffList.filter((p) => people.includes(Number(p.id)));
  const togglePerson = (id) => setPeople((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const waiting = sections.filter((s) => isAsked(s) && askStatus(s) === "Waiting");
  const nothing = sections.filter((s) => isAsked(s) && askStatus(s) === "Nothing this month");
  const toggle = (r) => setPicked((p) => (p.includes(r) ? p.filter((x) => x !== r) : [...p, r]));
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-semibold text-slate-800">📤 Send staff memo</h2>
          <button onClick={onClose} disabled={busy} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
        </div>
        {!confirm ? (
          <>
            <div>
              <div className="text-xs font-semibold text-slate-500 mb-2">Send to</div>
              <label className="flex items-center gap-3 py-1.5 cursor-pointer">
                <input type="radio" className="h-5 w-5" checked={mode === "all"} onChange={() => setMode("all")} />
                <span className="text-sm text-slate-800">All active staff <span className="text-slate-400">({staffList.length})</span></span>
              </label>
              <label className="flex items-center gap-3 py-1.5 cursor-pointer">
                <input type="radio" className="h-5 w-5" checked={mode === "roles"} onChange={() => setMode("roles")} />
                <span className="text-sm text-slate-800">Only these roles</span>
              </label>
              {mode === "roles" && (
                <div className="ml-8 mt-1 space-y-1">
                  {roles.map((r) => (
                    <label key={r} className="flex items-center gap-3 py-1 cursor-pointer">
                      <input type="checkbox" className="h-5 w-5" checked={picked.includes(r)} onChange={() => toggle(r)} />
                      <span className="text-sm text-slate-700">{r} <span className="text-slate-400">({staffList.filter((p) => p.role === r).length})</span></span>
                    </label>
                  ))}
                </div>
              )}
              <label className="flex items-center gap-3 py-1.5 cursor-pointer">
                <input type="radio" className="h-5 w-5" checked={mode === "people"} onChange={() => setMode("people")} />
                <span className="text-sm text-slate-800">Only these people</span>
              </label>
              {mode === "people" && (
                <div className="ml-8 mt-1 space-y-1 max-h-64 overflow-y-auto">
                  {staffList.map((p) => (
                    <label key={p.id} className="flex items-center gap-3 py-1 cursor-pointer">
                      <input type="checkbox" className="h-5 w-5" checked={people.includes(Number(p.id))} onChange={() => togglePerson(Number(p.id))} />
                      <span className="text-sm text-slate-700">{p.name} <span className="text-slate-400">· {p.role || "Staff"}</span></span>
                    </label>
                  ))}
                </div>
              )}
              {mode !== "all" && (
                <p className="mt-2 text-xs text-slate-500">Only the people it goes to (and managers) can see it, and its dates don&apos;t go on What&apos;s on.</p>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 min-h-[44px] border border-slate-300 rounded-[12px] text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={() => setConfirm(true)} disabled={!chosen.length} className="flex-1 min-h-[44px] rounded-[12px] text-sm font-semibold text-white bg-[#1D4ED8] disabled:opacity-40">Next</button>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 space-y-1">
              <div className="text-lg font-semibold text-slate-800 break-words">{title}</div>
              <div className="text-sm text-slate-700">
                Goes to <span className="font-semibold">{chosen.length} {chosen.length === 1 ? "person" : "people"}</span>
                {mode === "all" ? " (all active staff)" : mode === "roles" ? ` (${picked.join(", ")})` : `: ${chosen.map((p) => p.name).join(", ")}`}
              </div>
              <div className="text-xs text-slate-500">
                {mode === "all"
                  ? "Each gets a phone notification and a “Read the memo” job on the kiosk. Everyone can find it in Staff memos."
                  : "Each gets a phone notification and a “Read the memo” job on the kiosk. Only they (and managers) can see it."}
              </div>
            </div>
            {policies.length > 0 && (
              <div className="rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] px-4 py-3 text-sm text-[#1E3A8A]">
                <div className="font-semibold">📄 Each person will be asked to read:</div>
                <ul className="list-disc pl-5 mt-1">{policies.map((p) => <li key={p.id}>{p.title}</li>)}</ul>
                <div className="text-xs mt-1">Anyone who already has one of these to read isn&apos;t asked again.</div>
              </div>
            )}
            {dates.length > 0 && mode !== "all" && (
              <p className="text-xs text-slate-500">📅 The dates show in the memo but aren&apos;t added to What&apos;s on (it isn&apos;t going to all staff).</p>
            )}
            {dates.length > 0 && mode === "all" && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-700">
                <div className="font-semibold">📅 Added to What&apos;s on:</div>
                <ul className="list-disc pl-5 mt-1">{dates.map((d) => <li key={d.id}>{fmtMemoDateRange(d.start_date, d.end_date)} — {d.title}</li>)}</ul>
              </div>
            )}
            {waiting.length > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
                <div className="font-semibold">⚠ Still waiting — these will be left out:</div>
                <ul className="list-disc pl-5 mt-1">{waiting.map((s) => <li key={s.id}>{nameOf(s.requested_staff_id)}</li>)}</ul>
                <div className="text-xs mt-1">Their “Add your section” jobs will disappear.</div>
              </div>
            )}
            {nothing.length > 0 && (
              <p className="text-xs text-slate-500">“Nothing this month”: {nothing.map((s) => nameOf(s.requested_staff_id)).join(", ")} — left out.</p>
            )}
            <p className="text-xs text-slate-500">Once sent, the memo can&apos;t be changed. Notes to the people you asked are never included.</p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => setConfirm(false)} disabled={busy} className="flex-1 min-h-[44px] border border-slate-300 rounded-[12px] text-sm text-slate-600 hover:bg-slate-50">← Back</button>
              <button onClick={() => onSend({ mode, roles: mode === "roles" ? picked : [], staff_ids: mode === "people" ? people : [] })} disabled={busy}
                className="flex-1 min-h-[48px] rounded-[12px] text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-40">
                {busy ? "Sending…" : `Send to ${chosen.length}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// One section: text fields save ~1 s after typing stops (and on leaving the field); images / PDFs / author save at once
function SectionEditor({ section, index, count, memoId, manager, staffList, askedName, askedByName, busy, onMove, onRemove, onSaved, registerFlush }) {
  const [heading, setHeading] = useState(section.heading || "");
  const [sigName, setSigName] = useState(section.signature_name || "");
  const [sigRole, setSigRole] = useState(section.signature_role || "");
  const [status, setStatus] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [conflict, setConflict] = useState(null); // their saved version, while unresolved
  const [editorKey, setEditorKey] = useState(0);  // bumped to reload the text box with someone else's text
  const queue = useSaveQueue(setStatus);
  const pendingText = useRef({});
  const timer = useRef(null);
  const latest = useRef(section);
  latest.current = section;
  const base = useRef(section.updated_at);   // the version this screen last loaded / saved
  const local = useRef({ heading: section.heading || "", body: section.body || "", signature_name: section.signature_name || "", signature_role: section.signature_role || "" });
  const conflictRef = useRef(null);
  conflictRef.current = conflict;

  const save = (patch) => queue(async () => {
    try {
      const { section: s } = await memoCall({ action: "update-section", pin: manager.pin, id: section.id, base: base.current, patch }, { keepalive: true });
      base.current = s.updated_at;
      onSaved(s);
    } catch (err) {
      if (err.conflict && err.section) {
        // Keep the text fields that didn't make it, so "Keep mine" saves them
        for (const k of ["heading", "body", "signature_name", "signature_role"]) if (k in patch) pendingText.current[k] = patch[k];
        setConflict(err.section);
      }
      throw err;
    }
  });
  const flush = () => {
    clearTimeout(timer.current);
    if (conflictRef.current) return; // wait until the clash is sorted
    const patch = pendingText.current;
    pendingText.current = {};
    if (Object.keys(patch).length) save(patch);
  };
  const editText = (field, value) => {
    local.current[field] = value;
    pendingText.current = { ...pendingText.current, [field]: value };
    if (conflictRef.current) return;
    setStatus("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, TEXT_SAVE_MS);
  };
  // Locking (Lock button, 10 minutes idle, leaving the Staff memos tab) unmounts this: save what's typed
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps
  // Send: save what's typed now and wait for it (false = an unresolved clash)
  const flushWait = useRef(null);
  flushWait.current = async () => { flush(); await queue.wait(); return !conflictRef.current; };
  useEffect(() => {
    if (!registerFlush) return undefined;
    registerFlush(section.id, () => flushWait.current());
    return () => registerFlush(section.id, null);
  }, [section.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Closing / leaving the page doesn't unmount — send what's typed straight away (keepalive), not behind other saves.
  // Still version-checked, so it can never overwrite someone else's newer text.
  useOnPageHide(() => {
    clearTimeout(timer.current);
    if (conflictRef.current) return;
    const patch = pendingText.current;
    if (!Object.keys(patch).length) return;
    pendingText.current = {};
    memoCall({ action: "update-section", pin: manager.pin, id: section.id, base: base.current, patch }, { keepalive: true }).catch(() => {});
  });

  // Show someone else's version (theirs replaces what's on screen)
  const adopt = (s) => {
    base.current = s.updated_at;
    pendingText.current = {};
    clearTimeout(timer.current);
    local.current = { heading: s.heading || "", body: s.body || "", signature_name: s.signature_name || "", signature_role: s.signature_role || "" };
    setHeading(s.heading || "");
    setSigName(s.signature_name || "");
    setSigRole(s.signature_role || "");
    setEditorKey((k) => k + 1);
  };
  // A newer copy arrived from the 20-second re-check and nothing's waiting to save here → show it
  useEffect(() => {
    if (conflictRef.current || !newer(section.updated_at, base.current)) return;
    if (Object.keys(pendingText.current).length || queue.busy()) return; // the save will catch the clash
    adopt(section);
  }, [section.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadTheirs = () => { const s = conflict; setConflict(null); adopt(s); onSaved(s); setStatus(null); };
  const keepMine = () => {
    const s = conflict;
    base.current = s.updated_at;
    setConflict(null);
    pendingText.current = {};
    save({ ...local.current });
  };

  const addFiles = async (kind, fileList) => {
    const files = [...(fileList || [])];
    if (!files.length) return;
    setUploading(true);
    setStatus("saving");
    const added = [];
    const errors = [];
    const getTicket = (ext) => memoCall({ action: "upload-url", pin: manager.pin, memo_id: memoId, kind, ext });
    for (const file of files) {
      try { added.push(await uploadMemoFile({ getTicket, kind, file })); } catch (err) { errors.push(err.message); }
    }
    const field = kind === "pdf" ? "attachments" : "images";
    if (added.length) await save({ [field]: [...(latest.current[field] || []), ...added] });
    if (errors.length) setStatus(errors.join(" "));
    else if (!added.length) setStatus(null);
    setUploading(false);
  };
  const removeFile = (field, path) => save({ [field]: (latest.current[field] || []).filter((f) => f.path !== path) });
  const moveImage = (i, dir) => {
    const list = [...(latest.current.images || [])];
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    save({ images: list });
  };

  const setAuthor = (id) => {
    const st = staffList.find((s) => String(s.id) === String(id));
    const patch = { author_staff_id: st ? Number(st.id) : null };
    if (st) {
      patch.signature_name = st.name; patch.signature_role = st.role || "";
      setSigName(st.name); setSigRole(st.role || "");
      local.current.signature_name = st.name; local.current.signature_role = st.role || "";
    }
    clearTimeout(timer.current);
    const pend = pendingText.current;
    pendingText.current = {};
    save({ ...pend, ...patch });
  };

  const tb = "min-w-[40px] h-9 px-2 rounded-lg text-sm text-slate-700 bg-white border border-slate-200 hover:bg-slate-50";
  const images = section.images || [];
  const attachments = section.attachments || [];

  return (
    <div className={`bg-white rounded-[14px] border px-4 py-4 ${askedName ? "border-[#BFDBFE]" : "border-[#E5E7EB]"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">Section {index + 1}</span>
          {askedName && <span className="text-xs text-[#1E3A8A]">✉️ Asked of <span className="font-semibold">{askedName}</span></span>}
          {askedName && <AskChip section={section} />}
          <SaveBadge status={status} />
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => { flush(); onMove(-1); }} disabled={busy || index === 0} title="Move up" className={`${tb} disabled:opacity-30`}>▲</button>
          <button onClick={() => { flush(); onMove(1); }} disabled={busy || index === count - 1} title="Move down" className={`${tb} disabled:opacity-30`}>▼</button>
          <button onClick={onRemove} disabled={busy} className="h-9 px-3 rounded-lg text-sm text-red-600 bg-white border border-red-200 hover:bg-red-50 disabled:opacity-40">{askedName ? "Remove the ask" : "Remove"}</button>
        </div>
      </div>
      {askedName && <AskNote section={section} manager={manager} askedName={askedName} askedByName={askedByName} onSaved={onSaved} />}
      {askedName && !conflict && (
        <p className="mb-2 text-xs text-slate-500">{askedName.split(" ")[0]} writes this from their job. You can edit it too — if you both change it at once, nothing is overwritten.</p>
      )}
      {conflict && <ConflictBanner who={askedName || "Someone else"} onLoadTheirs={loadTheirs} onKeepMine={keepMine} busy={queue.busy()} />}

      <input value={heading} placeholder="Section heading (e.g. Message from the Pharmacist in Charge)" maxLength={300}
        onChange={(e) => { setHeading(e.target.value); editText("heading", e.target.value); }} onBlur={flush}
        className="w-full h-11 rounded-[10px] border border-slate-200 px-3 text-base font-semibold text-slate-800 mb-2" />

      <RichTextEditor key={editorKey} value={local.current.body} onChange={(md) => editText("body", md)} onBlur={flush} />

      {/* Images */}
      {images.length > 0 && (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {images.map((img, i) => (
            <div key={img.path} className="relative rounded-lg border border-slate-200 overflow-hidden bg-slate-50">
              <img src={img.url} alt={img.name || ""} className="w-full h-28 object-cover" />
              <div className="absolute top-1 right-1 flex gap-1">
                {images.length > 1 && <button onClick={() => moveImage(i, -1)} disabled={i === 0} className="w-7 h-7 rounded bg-white/90 text-xs border border-slate-200 disabled:opacity-30" title="Move earlier">◀</button>}
                {images.length > 1 && <button onClick={() => moveImage(i, 1)} disabled={i === images.length - 1} className="w-7 h-7 rounded bg-white/90 text-xs border border-slate-200 disabled:opacity-30" title="Move later">▶</button>}
                <button onClick={() => removeFile("images", img.path)} className="w-7 h-7 rounded bg-white/90 text-xs text-red-600 border border-red-200" title="Remove image">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {attachments.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          {attachments.map((f) => (
            <div key={f.path} className="flex items-center gap-2 text-sm">
              <span>📄</span>
              <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-[#1D4ED8] underline break-all">{f.name}</a>
              <button onClick={() => removeFile("attachments", f.path)} className="ml-1 h-7 px-2 rounded text-xs text-red-600 border border-red-200">Remove</button>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <label className={`inline-flex items-center min-h-[40px] px-3 rounded-[10px] text-sm border border-slate-200 text-slate-700 cursor-pointer hover:bg-slate-50 ${uploading || conflict ? "opacity-40 pointer-events-none" : ""}`}>
          {uploading ? "Uploading…" : "🖼 Add images"}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="hidden"
            onChange={(e) => { addFiles("image", e.target.files); e.target.value = ""; }} />
        </label>
        <label className={`inline-flex items-center min-h-[40px] px-3 rounded-[10px] text-sm border border-slate-200 text-slate-700 cursor-pointer hover:bg-slate-50 ${uploading || conflict ? "opacity-40 pointer-events-none" : ""}`}>
          📄 Attach PDF
          <input type="file" accept="application/pdf,.pdf" multiple className="hidden"
            onChange={(e) => { addFiles("pdf", e.target.files); e.target.value = ""; }} />
        </label>
      </div>

      {/* Author + signature */}
      <div className="mt-4 pt-3 border-t border-slate-100 grid gap-2 sm:grid-cols-3">
        <label className="block">
          <span className="text-xs font-semibold text-slate-500">Written by</span>
          <select value={section.author_staff_id ?? ""} onChange={(e) => setAuthor(e.target.value)}
            className="mt-1 w-full h-10 rounded-[10px] border border-slate-200 px-2 text-sm bg-white">
            <option value="">—</option>
            {staffList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-500">Signed (name)</span>
          <input value={sigName} maxLength={200} onChange={(e) => { setSigName(e.target.value); editText("signature_name", e.target.value); }} onBlur={flush}
            className="mt-1 w-full h-10 rounded-[10px] border border-slate-200 px-3 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-500">Signed (role)</span>
          <input value={sigRole} maxLength={200} placeholder="e.g. Pharmacist in Charge" onChange={(e) => { setSigRole(e.target.value); editText("signature_role", e.target.value); }} onBlur={flush}
            className="mt-1 w-full h-10 rounded-[10px] border border-slate-200 px-3 text-sm" />
        </label>
      </div>
    </div>
  );
}
