// "Add your section to the …" — the asked person writing THEIR OWN section of a draft staff memo (kiosk job and
// /me → To do). Only their slot is loaded (/api/memos/contribute) — never the other sections or the rest of the memo.
// Heading + text (the same RichTextEditor as the manager) + images + PDF attachments. Text saves with the Save button;
// images and PDFs save as they're added / removed (the server only accepts files uploaded for this person's own section). Saves are version-checked: if a manager changed this section since it was opened, nothing is
// overwritten — "Load their version" / "Keep mine". "Nothing this month" clears the slot and the job. The manager's
// note ("Blair asked: …") shows at the top when there is one.
// kiosk: { staffId, pin } on the kiosk (PIN already entered — the server re-checks it on every save); null on /me (the
// staff login). The section's author is that person. onClose(changed) closes the panel.
import { useEffect, useRef, useState } from "react";
import RichTextEditor from "./RichTextEditor";
import ConflictBanner from "./ConflictBanner";
import { contributeCall, uploadMemoFile } from "../../lib/memosClient";

export default function ContributorSection({ sectionId, kiosk = null, onClose }) {
  const [section, setSection] = useState(null);
  const [memoTitle, setMemoTitle] = useState("");
  const [note, setNote] = useState(null); // the manager's note { text, by } — shown here only, never part of the memo
  const [error, setError] = useState("");
  const [heading, setHeading] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [conflict, setConflict] = useState(null);
  const [editorKey, setEditorKey] = useState(0);
  const body = useRef("");
  const base = useRef(null);
  const changed = useRef(false);
  const call = (b) => contributeCall({ ...b, section_id: sectionId }, kiosk);

  const show = (s) => {
    setSection(s);
    base.current = s.updated_at;
    body.current = s.body || "";
    setHeading(s.heading || "");
    setEditorKey((k) => k + 1);
    setDirty(false);
  };

  useEffect(() => {
    let live = true;
    call({ action: "get" })
      .then(({ section: s, memo_title, note: n, asked_by }) => { if (live) { setMemoTitle(memo_title); setNote(n ? { text: n, by: asked_by } : null); show(s); } })
      .catch((err) => live && setError(err.message));
    return () => { live = false; };
  }, [sectionId, kiosk?.staffId, kiosk?.pin]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (patch, okMsg) => {
    setBusy(true);
    setMsg("");
    try {
      const { section: s } = await call({ action: "save", base: base.current, patch });
      base.current = s.updated_at;
      setSection(s);
      changed.current = true;
      setMsg(okMsg);
      return true;
    } catch (err) {
      if (err.conflict && err.section) setConflict(err.section);
      else setMsg(`⚠ ${err.message}`);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveText = async () => {
    if (await save({ heading, body: body.current }, "Saved ✓ — you can come back and change it until the memo is sent.")) setDirty(false);
  };

  // Images and PDF attachments save straight away (same checks / size limits as the manager's — lib/memosClient uploadMemoFile)
  const addFiles = async (kind, fileList) => {
    const files = [...(fileList || [])];
    if (!files.length) return;
    setBusy(true);
    setMsg("Uploading…");
    const added = [];
    const errors = [];
    const getTicket = (ext) => call({ action: "upload-url", kind, ext });
    for (const file of files) {
      try { added.push(await uploadMemoFile({ getTicket, kind, file })); } catch (err) { errors.push(err.message); }
    }
    setBusy(false);
    const field = kind === "pdf" ? "attachments" : "images";
    const word = kind === "pdf" ? (added.length === 1 ? "PDF" : "PDFs") : (added.length === 1 ? "Image" : "Images");
    if (added.length) await save({ [field]: [...(section[field] || []), ...added] }, errors.length ? `⚠ ${errors.join(" ")}` : `${word} added ✓`);
    else setMsg(errors.length ? `⚠ ${errors.join(" ")}` : "");
  };
  const removeImage = (path) => save({ images: (section.images || []).filter((f) => f.path !== path) }, "Image removed");
  const removePdf = (path) => save({ attachments: (section.attachments || []).filter((f) => f.path !== path) }, "PDF removed");

  const nothing = async () => {
    if (!window.confirm(`Nothing to add to the ${memoTitle}? Your section will be taken out${dirty || section.body ? " (anything you've written goes too)" : ""} and the job will clear.`)) return;
    setBusy(true);
    try {
      await call({ action: "nothing" });
      onClose(true);
    } catch (err) {
      setMsg(`⚠ ${err.message}`);
      setBusy(false);
    }
  };

  const close = () => {
    if (dirty && !window.confirm("You have changes that aren't saved. Close without saving?")) return;
    onClose(changed.current);
  };

  const loadTheirs = () => { const s = conflict; setConflict(null); show(s); setMsg("Showing the latest version."); };
  const keepMine = async () => {
    const s = conflict;
    base.current = s.updated_at;
    setConflict(null);
    if (await save({ heading, body: body.current }, "Saved ✓")) setDirty(false);
  };

  return (
    <div className="space-y-3">
      {/* Header stays in view while scrolling — just below the status bar on an iPhone home-screen app */}
      <div className="sticky z-10 -mx-4 px-4 py-2 bg-[#F8FAFC] border-b border-slate-200 flex items-start justify-between gap-3"
        style={{ top: "env(safe-area-inset-top, 0px)" }}>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#1D4ED8]">Staff memo</p>
          <h2 className="text-lg font-bold text-slate-800 leading-snug break-words">Your section for the {memoTitle || "memo"}</h2>
          <p className="text-xs text-slate-500 mt-0.5">Only your section is shown here. You can change it until the memo is sent.</p>
        </div>
        <button onClick={close} className="shrink-0 min-h-[44px] px-4 rounded-[12px] text-sm font-medium text-slate-700 bg-white border border-[#E5E7EB]">✕ Close</button>
      </div>

      {error ? <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</p>
        : !section ? <p className="text-sm text-slate-400">Loading…</p>
        : (
          <>
            {note && (
              <div className="rounded-xl bg-amber-50 border border-amber-300 px-4 py-3 text-[15px] text-amber-900">
                <span className="font-semibold">{note.by ? `${note.by} asked:` : "Note from the manager:"}</span>{" "}
                <span className="whitespace-pre-line">{note.text}</span>
              </div>
            )}
            {conflict && <ConflictBanner who="A manager" onLoadTheirs={loadTheirs} onKeepMine={keepMine} busy={busy} />}
            <label className="block">
              <span className="text-xs font-semibold text-slate-500">Heading</span>
              <input value={heading} maxLength={300} onChange={(e) => { setHeading(e.target.value); setDirty(true); setMsg(""); }}
                className="mt-1 w-full h-11 rounded-[10px] border border-slate-200 bg-white px-3 text-base font-semibold text-slate-800" />
            </label>
            <div className="bg-white rounded-[10px]">
              <RichTextEditor key={editorKey} value={body.current} onChange={(md) => { body.current = md; setDirty(true); setMsg(""); }} />
            </div>

            {(section.images || []).length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {section.images.map((img) => (
                  <div key={img.path} className="relative rounded-lg border border-slate-200 overflow-hidden bg-slate-50">
                    <img src={img.url} alt={img.name || ""} className="w-full h-28 object-cover" />
                    <button onClick={() => removeImage(img.path)} disabled={busy || !!conflict} className="absolute top-1 right-1 w-8 h-8 rounded bg-white/90 text-sm text-red-600 border border-red-200 disabled:opacity-40" title="Remove image">✕</button>
                  </div>
                ))}
              </div>
            )}
            {(section.attachments || []).length > 0 && (
              <div className="flex flex-col gap-1.5">
                {section.attachments.map((f) => (
                  <div key={f.path} className="flex items-center gap-2 text-sm">
                    <span>📄</span>
                    <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-[#1D4ED8] underline break-all">{f.name}</a>
                    <button onClick={() => removePdf(f.path)} disabled={busy || !!conflict} className="ml-1 h-8 px-2 rounded text-xs text-red-600 border border-red-200 disabled:opacity-40">Remove</button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <label className={`inline-flex items-center min-h-[44px] px-3 rounded-[10px] text-sm border border-slate-200 bg-white text-slate-700 cursor-pointer hover:bg-slate-50 ${busy || conflict ? "opacity-40 pointer-events-none" : ""}`}>
                🖼 Add images
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="hidden"
                  onChange={(e) => { addFiles("image", e.target.files); e.target.value = ""; }} />
              </label>
              <label className={`inline-flex items-center min-h-[44px] px-3 rounded-[10px] text-sm border border-slate-200 bg-white text-slate-700 cursor-pointer hover:bg-slate-50 ${busy || conflict ? "opacity-40 pointer-events-none" : ""}`}>
                📄 Attach PDF
                <input type="file" accept="application/pdf,.pdf" multiple className="hidden"
                  onChange={(e) => { addFiles("pdf", e.target.files); e.target.value = ""; }} />
              </label>
            </div>

            {(section.signature_name || section.signature_role) && (
              <p className="text-sm italic text-slate-500">Signed: {[section.signature_name, section.signature_role].filter(Boolean).join(", ")}</p>
            )}
            {msg && <p className={`text-sm ${msg.startsWith("⚠") ? "text-red-600" : "text-green-700"}`}>{msg}</p>}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button onClick={nothing} disabled={busy} className="min-h-[44px] px-4 rounded-[12px] text-sm font-medium text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-40">
                Nothing this month
              </button>
              <button onClick={saveText} disabled={busy || !dirty || !!conflict} className="min-h-[44px] px-6 rounded-[12px] text-sm font-semibold text-white bg-[#1D4ED8] disabled:opacity-40">
                {busy ? "Saving…" : dirty ? "Save" : "Saved"}
              </button>
            </div>
          </>
        )}
    </div>
  );
}
