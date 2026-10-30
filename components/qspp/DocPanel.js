// /qspp manager mode — side panel for one document (full-screen sheet on a phone). Everything that used to be crammed
// into each Admin row: Open PDF, Download master, Replace files, title, folder, version, review date, updated by/when,
// read list + "Ask staff to read", History, Retire / Restore, and a small Delete (mistakes only).
// Actions: lib/qsppDocs. Reads: components/PolicyRequests.
import { useEffect, useState } from "react";
import supabase from "../../lib/supabaseClient";
import { perthDate, pdfStatus, downloadUrl } from "../../lib/docFolders";
import { replaceFiles, loadHistory, updateDoc, retireDoc, restoreDoc, deleteDoc } from "../../lib/qsppDocs";
import { AskToReadModal, PolicyProgress } from "../PolicyRequests";
import ReplaceFilesModal from "./ReplaceFilesModal";
import FileIcon from "./FileIcon";

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";

// onChanged(id, changes) — fields saved on the document; onDeleted(id); onRequestsChanged() — reload read requests
export default function DocPanel({ doc, groups, folderName, staffList, requests, manager, onClose, onChanged, onDeleted, onRequestsChanged }) {
  const [title, setTitle] = useState(doc.title || "");
  const [replacing, setReplacing] = useState(false);
  const [asking, setAsking] = useState(false);
  const [readsOpen, setReadsOpen] = useState(true);
  const [history, setHistory] = useState(null); // null = closed
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const staffName = (id) => staffList.find((s) => Number(s.id) === Number(id))?.name || "";
  const retired = doc.active === false;
  const st = pdfStatus(doc);
  const hasRequests = (requests || []).some((r) => String(r.document_id) === String(doc.id));

  useEffect(() => { setTitle(doc.title || ""); setHistory(null); setError(""); }, [doc.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Esc closes
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !replacing && !asking) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [replacing, asking, onClose]);

  const run = async (fn) => {
    setBusy(true);
    setError("");
    try { await fn(); } catch (err) { setError(err?.message || String(err)); }
    setBusy(false);
  };
  const save = (changes) => run(async () => { await updateDoc(supabase, doc.id, changes); onChanged(doc.id, changes); });

  const toggleHistory = () => {
    if (history) { setHistory(null); return; }
    run(async () => setHistory(await loadHistory(supabase, doc.id)));
  };

  const retire = () => {
    const reason = window.prompt(`Retire "${doc.title}"?\n\nStaff won't see it any more and its outstanding read requests are cancelled (read records are kept). You can restore it later.\n\nReason (optional):`, "");
    if (reason === null) return;
    run(async () => {
      const { changes, warning } = await retireDoc(supabase, { doc, staffId: manager?.id, reason });
      onChanged(doc.id, changes);
      onRequestsChanged();
      if (warning) setError(warning);
    });
  };
  const restore = () => {
    if (!window.confirm(`Restore "${doc.title}"? Staff will see it again in ${folderName(doc.folder_id) || "its folder"}.`)) return;
    run(async () => onChanged(doc.id, await restoreDoc(supabase, doc)));
  };
  const remove = () => {
    if (hasRequests) {
      alert("Staff have been asked to read this document, so it can't be deleted (the read records are QSPP evidence). Use Retire instead.");
      return;
    }
    if (!window.confirm("Delete this document and all its versions? This removes the files permanently.\n\nOnly use Delete for mistakes (e.g. a duplicate). To take a document out of use, Cancel and use Retire instead — it can be restored.")) return;
    run(async () => {
      const warning = await deleteDoc(supabase, doc);
      if (warning) alert(warning);
      onDeleted(doc.id);
    });
  };

  const label = "text-[11px] font-semibold text-gray-500 uppercase tracking-wide";
  const btn = "min-h-[44px] px-3 rounded-xl text-sm font-medium border flex items-center justify-center gap-1.5";

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <aside className="fixed z-50 inset-0 sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[460px] bg-white sm:border-l shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b">
          <FileIcon />
          <div className="flex-1 min-w-0">
            <textarea
              value={title}
              rows={2}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => { const t = title.trim(); if (t && t !== doc.title) save({ title: t }); else setTitle(doc.title || ""); }}
              className="w-full resize-none text-base font-semibold text-gray-800 leading-snug bg-transparent rounded-lg px-1 -mx-1 focus:outline-none focus:bg-gray-50 focus:ring-1 focus:ring-blue-300"
              title="Click to rename"
            />
            <div className="flex flex-wrap gap-1.5 mt-1">
              {retired && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-gray-100 text-gray-600 border-gray-200">Retired</span>}
              {st === "missing" && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-red-50 text-red-700 border-red-200">No PDF — staff can't open</span>}
              {st === "stale" && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-amber-50 text-amber-800 border-amber-200">PDF older than master</span>}
            </div>
          </div>
          <button onClick={onClose} className="w-11 h-11 -mr-2 -mt-1 text-gray-400 hover:text-gray-600 text-2xl leading-none" aria-label="Close">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {error && <p className="text-sm text-red-500">{error}</p>}

          {/* Files */}
          <div className="grid grid-cols-2 gap-2">
            {doc.pdf_url
              ? <a href={doc.pdf_url} target="_blank" rel="noopener noreferrer" className={`${btn} bg-[#1D4ED8] text-white border-[#1D4ED8]`}>Open PDF</a>
              : <span className={`${btn} bg-gray-50 text-gray-400 border-gray-200`}>No staff PDF</span>}
            <a href={downloadUrl(doc.file_url, doc.file_name)} className={`${btn} bg-white text-gray-700 border-gray-300 hover:bg-gray-50`}>Download master</a>
            <button onClick={() => setReplacing(true)} disabled={busy} className={`${btn} col-span-2 bg-white text-gray-700 border-gray-300 hover:bg-gray-50`}>Replace files…</button>
          </div>

          {/* Details */}
          <div className="space-y-3">
            <div>
              <div className={label}>Folder</div>
              <select value={doc.folder_id || ""} disabled={busy} onChange={(e) => save({ folder_id: e.target.value })}
                className="mt-1 w-full min-h-[44px] border border-gray-300 rounded-xl px-3 text-sm bg-white">
                {groups.map((g) => (
                  <optgroup key={g.name} label={g.name}>
                    {g.folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className={label}>Version</div>
                <div className="mt-1 min-h-[44px] flex items-center text-sm text-gray-800">v{doc.version || "1.0"}</div>
              </div>
              <div>
                <div className={label}>Review date</div>
                <input type="date" value={doc.review_date || ""} disabled={busy}
                  onChange={(e) => save({ review_date: e.target.value || null })}
                  className="mt-1 w-full min-h-[44px] border border-gray-300 rounded-xl px-3 text-sm" />
              </div>
            </div>
            <div className="text-xs text-gray-500 space-y-0.5">
              <div>Updated {perthDate(doc.updated_at || doc.uploaded_at) || "—"}{staffName(doc.updated_by_staff_id) && ` by ${staffName(doc.updated_by_staff_id)}`}</div>
              {doc.pdf_url && <div>Staff PDF {perthDate(doc.pdf_updated_at) ? `uploaded ${perthDate(doc.pdf_updated_at)}` : "set"}{staffName(doc.pdf_updated_by_staff_id) && ` by ${staffName(doc.pdf_updated_by_staff_id)}`}</div>}
              {retired && (
                <div className="text-gray-600">
                  Retired {perthDate(doc.retired_at) || "—"}{staffName(doc.retired_by_staff_id) && ` by ${staffName(doc.retired_by_staff_id)}`}
                  {doc.retired_reason && <> — “{doc.retired_reason}”</>}
                </div>
              )}
            </div>
          </div>

          {/* Who has read it */}
          <div>
            <div className="flex items-center justify-between">
              <div className={label}>Read by staff</div>
              {!retired && (
                <button onClick={() => setAsking(true)} className="min-h-[44px] px-3 -my-2 text-sm font-medium text-blue-600 hover:underline">Ask staff to read</button>
              )}
            </div>
            {hasRequests ? (
              <div className="-ml-6">
                <PolicyProgress doc={doc} requests={requests} staffList={staffList} adminUser={manager}
                  open={readsOpen} onToggle={() => setReadsOpen((o) => !o)} onChanged={onRequestsChanged} />
              </div>
            ) : (
              <p className="text-sm text-gray-400 mt-1">Nobody has been asked to read this yet.</p>
            )}
          </div>

          {/* History */}
          <div>
            <button onClick={toggleHistory} className="min-h-[44px] text-sm font-medium text-gray-700 hover:underline">
              {history ? "▲ Hide history" : "▼ Version history"}
            </button>
            {history && (
              <div className="rounded-xl border border-gray-200 divide-y">
                {history.length === 0 ? <div className="px-3 py-2 text-xs text-gray-400">No version history.</div> : history.map((v, i) => (
                  <div key={v.id} className="px-3 py-2 text-xs flex items-start gap-3">
                    <span className="font-semibold text-gray-700 w-10 shrink-0">v{v.version}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-gray-600">
                        {perthDate(v.created_at)}{staffName(v.updated_by_staff_id) && ` · ${staffName(v.updated_by_staff_id)}`}
                        {i === 0 && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-100 font-semibold">Current</span>}
                      </div>
                      {v.change_note && <div className="text-gray-500 mt-0.5 break-words">{v.change_note}</div>}
                    </div>
                    {v.pdf_url && <a href={v.pdf_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline shrink-0">PDF</a>}
                    <a href={downloadUrl(v.file_url, v.file_name)} className="text-gray-600 hover:underline shrink-0">Master</a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Retire / Restore + Delete */}
        <div className="border-t px-5 py-2 flex items-center justify-between gap-3">
          {retired ? (
            <button onClick={restore} disabled={busy} className="min-h-[44px] px-1 text-xs font-medium text-[#15803D] hover:underline">Restore</button>
          ) : (
            <button onClick={retire} disabled={busy} className="min-h-[44px] px-1 text-xs font-medium text-[#B45309] hover:underline">Retire…</button>
          )}
          <button onClick={remove} disabled={busy} className="min-h-[44px] px-1 text-xs font-medium text-red-600 hover:underline">Delete</button>
        </div>
      </aside>

      {replacing && (
        <ReplaceFilesModal
          doc={doc}
          managerName={manager?.name}
          onClose={() => setReplacing(false)}
          onSave={async (values) => {
            const changes = await replaceFiles(supabase, { pharmacyId: PHARMACY_ID, doc, folderName: folderName(doc.folder_id), staffId: manager?.id, ...values });
            onChanged(doc.id, changes);
            setReplacing(false);
            if (history) setHistory(await loadHistory(supabase, doc.id));
          }}
        />
      )}
      {asking && (
        <AskToReadModal
          doc={doc}
          staffList={staffList}
          requests={requests}
          adminUser={manager}
          onClose={() => setAsking(false)}
          onSent={async () => { setAsking(false); setReadsOpen(true); await onRequestsChanged(); }}
        />
      )}
    </>
  );
}
