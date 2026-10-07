// Staff Documents sections — reusable upload UI (Admin Documents tab, onboarding page; later /me).
// The caller owns the files and passes the actions, so each place can store files its own way:
//   actions.upload(file, fields) -> Promise   fields: { type, service_certificate_id?, completion_date?, expiry_date?, title? }
//   actions.remove(doc)          -> Promise
//   actions.open(doc)            -> opens the file (private storage — a short-lived signed link)
//   actions.update(doc, patch)   -> Promise   patch: { expiry_date | completion_date | title }
// Sections + status rules: lib/staffDocuments.js
import { useState } from "react";
import { sectionDocs, sectionStatus, docExpiry, unmatchedDocs, DOC_STATE_STYLE } from "../lib/staffDocuments";
import { docTypeLabel } from "../lib/trainingPlan";
import { fmtDateShort } from "../lib/performanceReview";

const ACCEPT = ".pdf,.jpg,.jpeg,.png";
const fmtUploaded = (iso) => (iso ? new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "");

// sections: from docSections(); contractNode: element shown for the "contract" section (Admin only)
// mode: "admin" | "staff" (staff wording; also hides the "older/other files" list)
export default function DocumentSections({ sections, docs, actions, contractNode = null, mode = "admin" }) {
  const unmatched = mode === "admin" ? unmatchedDocs(sections, docs) : [];
  let lastGroup = null;
  return (
    <div className="space-y-4">
      {sections.map((sec) => {
        if (sec.kind === "contract") {
          return contractNode ? <div key={sec.key}>{contractNode}</div> : null;
        }
        const groupHeader = sec.group && sec.group !== lastGroup
          ? <div className="text-xs font-semibold text-gray-700 pt-2 border-t">{sec.group}</div>
          : null;
        lastGroup = sec.group || null;
        return (
          <div key={sec.key} className="space-y-1.5">
            {groupHeader}
            <Section sec={sec} docs={docs} actions={actions} mode={mode} />
          </div>
        );
      })}
      {unmatched.length > 0 && (
        <div className="border-t pt-3">
          <div className="text-xs font-medium text-gray-600 mb-1">Older / other files</div>
          <p className="text-[11px] text-gray-400 mb-1.5">Files that don't belong to any of this person's current sections (kept for the record).</p>
          <div className="space-y-1.5">
            {unmatched.map((d) => (
              <FileRow key={d.id} doc={d} sec={null} actions={actions} label={d.type === "other_qualification" && d.title ? d.title : docTypeLabel(d.type)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ sec, docs, actions, mode }) {
  const files = sectionDocs(sec, docs);
  const status = sectionStatus(sec, docs);
  const multi = sec.kind === "multi" || sec.kind === "other_qual";
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xs font-medium text-gray-700">{sec.title}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${sec.required ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-500"}`}>
          {sec.required ? "Required" : "Optional"}
        </span>
        {sec.kind === "service" && (
          <span className="text-[10px] text-gray-400">{sec.certificate.renew_months ? `renews every ${sec.certificate.renew_months} months` : "one-off"}</span>
        )}
        {status && status.state !== "none" && (
          <span className={`ml-auto text-[11px] px-2 py-0.5 rounded-full border ${DOC_STATE_STYLE[status.state]}`}>{status.label}</span>
        )}
      </div>
      {files.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {files.map((d, i) => (
            <FileRow key={d.id} doc={d} sec={sec} actions={actions} older={!multi && i > 0} />
          ))}
        </div>
      )}
      <Uploader sec={sec} actions={actions} hasFiles={files.length > 0} mode={mode} />
    </div>
  );
}

function FileRow({ doc, sec, actions, older = false, label = null }) {
  const [busy, setBusy] = useState(false);
  const run = async (fn) => {
    setBusy(true);
    try { await fn(); } catch (err) { alert(err?.message || String(err)); } finally { setBusy(false); }
  };
  const exp = sec ? docExpiry(doc, sec) : (doc.expiry_date || null);
  const file = doc.filename || doc.type;
  const name = sec?.kind === "other_qual" ? (doc.title || "Untitled qualification") : label ? `${label} — ${file}` : file;
  return (
    <div className={`rounded-lg border px-3 py-2 ${older ? "border-gray-100 bg-white opacity-70" : "border-gray-100 bg-gray-50"}`}>
      <div className="flex items-center gap-2">
        <span className="text-sm">📄</span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-gray-700 truncate">{name}</div>
          <div className="text-[11px] text-gray-400">
            {older && "Older · "}Uploaded {fmtUploaded(doc.uploaded_at)}
            {sec?.kind === "other_qual" && doc.filename ? ` · ${doc.filename}` : ""}
          </div>
        </div>
        {(doc.url || doc.storage_path) && <button type="button" onClick={() => actions.open(doc)} className="text-xs text-blue-600 hover:underline shrink-0">View</button>}
        <button type="button" disabled={busy} onClick={() => { if (window.confirm("Remove this file?")) run(() => actions.remove(doc)); }} className="text-xs text-red-500 hover:text-red-700 shrink-0">
          Remove
        </button>
      </div>
      {/* Editable dates */}
      {sec?.kind === "service" && (
        <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px] text-gray-500">
          <label className="flex items-center gap-1">
            Completed
            <input type="date" value={doc.completion_date || ""} disabled={busy}
              onChange={(e) => run(() => actions.update(doc, { completion_date: e.target.value || null }))}
              className="border rounded px-1 py-0.5 text-[11px] bg-white" />
          </label>
          {sec.certificate.renew_months ? <span>{exp ? `→ expires ${fmtDateShort(exp)}` : "→ add the completion date"}</span> : <span>one-off, no expiry</span>}
        </div>
      )}
      {(sec?.kind === "typed" || sec?.kind === "other_qual") && (
        <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11px] text-gray-500">
          <label className="flex items-center gap-1">
            Expires
            <input type="date" value={doc.expiry_date || ""} disabled={busy}
              onChange={(e) => run(() => actions.update(doc, { expiry_date: e.target.value || null }))}
              className="border rounded px-1 py-0.5 text-[11px] bg-white" />
          </label>
          {sec.kind === "other_qual" && <span className="text-gray-400">optional</span>}
        </div>
      )}
    </div>
  );
}

function Uploader({ sec, actions, hasFiles, mode }) {
  const [busy, setBusy] = useState(false);
  const [completion, setCompletion] = useState("");
  const [title, setTitle] = useState("");
  const [expiry, setExpiry] = useState("");
  const [error, setError] = useState("");

  // Dates are optional at upload (a file with no date shows "Add … date" and can be dated on its row)
  const needsDate = sec.kind === "service";
  const needsTitle = sec.kind === "other_qual";
  const hasExpiry = sec.kind === "typed" || needsTitle;
  const ready = !needsTitle || title.trim();

  const handleFile = async (file) => {
    if (!file) return;
    if (!ready) { setError("Enter the qualification name first."); return; }
    setBusy(true);
    setError("");
    try {
      await actions.upload(file, {
        type: sec.type,
        service_certificate_id: sec.kind === "service" ? sec.certificate.id : null,
        completion_date: needsDate ? (completion || null) : null,
        title: needsTitle ? title.trim() : null,
        expiry_date: hasExpiry ? (expiry || null) : null,
      });
      setCompletion(""); setTitle(""); setExpiry("");
    } catch (err) {
      setError("Upload failed: " + (err?.message || String(err)));
    } finally {
      setBusy(false);
    }
  };

  const multi = sec.kind === "multi" || sec.kind === "other_qual";
  const label = busy ? "Uploading…"
    : multi ? (hasFiles ? "Add another" : `Upload ${sec.title.toLowerCase()}`)
    : hasFiles ? "Upload a newer file" : `Upload ${sec.title}`;

  return (
    <div className="space-y-1.5">
      {(needsDate || needsTitle || hasExpiry) && (
        <div className="flex flex-wrap items-center gap-2">
          {needsTitle && (
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Qualification name"
              className="flex-1 min-w-[160px] border rounded-lg px-2 py-1.5 text-xs" />
          )}
          {needsDate && (
            <label className="flex items-center gap-1 text-[11px] text-gray-600">
              {mode === "staff" ? "Date you completed it" : "Completion date"} (optional)
              <input type="date" value={completion} onChange={(e) => setCompletion(e.target.value)} className="border rounded px-1.5 py-1 text-xs" />
            </label>
          )}
          {hasExpiry && (
            <label className="flex items-center gap-1 text-[11px] text-gray-600">
              Expires (optional)
              <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="border rounded px-1.5 py-1 text-xs" />
            </label>
          )}
        </div>
      )}
      <label className={`flex items-center gap-2 w-full border-2 border-dashed rounded-lg px-3 py-2.5 transition-colors ${!ready ? "border-gray-100 bg-gray-50 cursor-not-allowed" : busy ? "border-blue-200 bg-blue-50 cursor-wait" : "border-gray-200 hover:border-blue-300 hover:bg-blue-50 cursor-pointer"}`}>
        <span className="text-gray-400">📎</span>
        <span className={`text-xs ${ready ? "text-gray-500" : "text-gray-300"}`}>{label}</span>
        <input type="file" accept={ACCEPT} className="hidden" disabled={busy || !ready}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; handleFile(f); }} />
      </label>
      {error && <p className="text-[11px] text-red-500">{error}</p>}
    </div>
  );
}
