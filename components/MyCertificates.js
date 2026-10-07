// /me → Training → Certificates (staff side) and the To do "Training" nudges.
// Data: pages/api/me/certificates.js (login token, own certificates only, no storage paths).
// Status rules: lib/staffDocuments.js sectionStatus — the same function Admin uses.
// Staff can upload a new file (newest counts; older files stay as history), open files, and add a date where it's
// empty. No editing existing dates, no delete, no replace.
import { useEffect, useState } from "react";
import { callMeApi } from "./MyReview";
import { DOC_BUCKET, putFile, openSignedUrl } from "../lib/staffFiles";
import { sectionDocs, sectionStatus, docExpiry, DOC_STATE_STYLE } from "../lib/staffDocuments";
import { STATE_STYLE } from "../lib/trainingPlan";
import { fmtDateShort } from "../lib/performanceReview";

const API = "/api/me/certificates";
const ACCEPT = ".pdf,.jpg,.jpeg,.png";
const cardCls = "bg-white rounded-2xl shadow-sm border p-4";
const fmtUploaded = (iso) => (iso ? new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "");
const dateField = (sec) => (sec.kind === "service" ? "completion_date" : sec.kind === "typed" || sec.kind === "other_qual" ? "expiry_date" : null);

// To do badge + list: Admin's Needs attention items for me -> [{ key, item, state, label, sub, section }] (null if unavailable)
export const fetchMyTrainingNudges = async () => {
  try {
    const out = await callMeApi(`${API}?view=todo`);
    return out?.attention || [];
  } catch (err) {
    console.error("[my-certificates]", err);
    return [];
  }
};

// To do → Training group
export function TrainingNudges({ items, onOpen }) {
  if (!items?.length) return null;
  return (
    <div className="bg-white rounded-2xl shadow-sm border p-5">
      <div className="text-base font-semibold text-gray-800 mb-2">Training</div>
      <div className="divide-y">
        {items.map((i) => (
          <button key={i.key} type="button" onClick={() => onOpen(i.sub, i.section)} className="w-full flex items-center justify-between gap-2 py-2 text-left">
            <span className="text-sm text-gray-700 min-w-0">{i.item}</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full border shrink-0 ${STATE_STYLE[i.state] || STATE_STYLE.neutral}`}>{i.label} ›</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function CertificatesView({ focusSection = null }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    callMeApi(API)
      .then((d) => { if (!cancelled) { if (d) setData(d); else setError("Please log in with your email to see your certificates."); } })
      .catch((err) => { if (!cancelled) setError(err?.message || String(err)); });
    return () => { cancelled = true; };
  }, []);

  // Scroll to the section a To do nudge pointed at
  useEffect(() => {
    if (!data || !focusSection) return;
    const el = document.getElementById(`cert-${focusSection}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [data, focusSection]);

  if (error) return <div className={`${cardCls} text-sm text-red-500 text-center`}>{error}</div>;
  if (!data) return <div className="text-sm text-gray-400 text-center mt-10">Loading…</div>;
  if (!data.sections.length) return <div className={`${cardCls} text-sm text-gray-400 text-center`}>No certificates are needed for your role.</div>;

  const addDoc = (doc) => setData((d) => ({ ...d, docs: [doc, ...d.docs] }));
  const updateDoc = (doc) => setData((d) => ({ ...d, docs: d.docs.map((x) => (x.id === doc.id ? doc : x)) }));

  let lastGroup = null;
  return (
    <div className="space-y-3">
      {data.sections.map((sec) => {
        const header = sec.group && sec.group !== lastGroup
          ? <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">{sec.group}</div>
          : null;
        lastGroup = sec.group || null;
        return (
          <div key={sec.key}>
            {header}
            <Section sec={sec} docs={data.docs} onAdded={addDoc} onUpdated={updateDoc} highlight={focusSection === sec.key} />
          </div>
        );
      })}
    </div>
  );
}

function Section({ sec, docs, onAdded, onUpdated, highlight }) {
  const files = sectionDocs(sec, docs);
  const status = sectionStatus(sec, docs);
  const multi = sec.kind === "other_qual";
  const current = multi ? files : files.slice(0, 1);
  const older = multi ? [] : files.slice(1);
  const [showOlder, setShowOlder] = useState(false);

  return (
    <div id={`cert-${sec.key}`} className={`${cardCls} scroll-mt-20 space-y-2 ${highlight ? "ring-2 ring-blue-300" : ""}`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-gray-800">{sec.title}</div>
          <div className="text-[11px] text-gray-400">
            {sec.required ? "Required" : "Optional"}
            {sec.kind === "service" ? ` · ${sec.certificate?.renew_months ? `renews every ${sec.certificate.renew_months} months` : "one-off"}` : ""}
          </div>
        </div>
        {status && status.state !== "none" && (
          <span className={`text-[11px] px-2 py-0.5 rounded-full border shrink-0 ${DOC_STATE_STYLE[status.state]}`}>{status.label}</span>
        )}
      </div>
      {current.map((d) => <FileRow key={d.id} doc={d} sec={sec} onUpdated={onUpdated} />)}
      {older.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowOlder((v) => !v)} className="text-xs text-gray-500 hover:text-gray-700">
            {showOlder ? "Hide" : "Show"} older files ({older.length})
          </button>
          {showOlder && <div className="mt-1.5 space-y-1.5">{older.map((d) => <FileRow key={d.id} doc={d} sec={sec} onUpdated={onUpdated} older />)}</div>}
        </div>
      )}
      <Uploader sec={sec} hasFiles={files.length > 0} onAdded={onAdded} />
    </div>
  );
}

function FileRow({ doc, sec, onUpdated, older = false }) {
  const field = dateField(sec);
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const exp = docExpiry(doc, sec);
  const name = sec.kind === "other_qual" ? (doc.title || "Untitled qualification") : (doc.filename || sec.title);

  const open = () => openSignedUrl(async () => {
    const out = await callMeApi(API, { action: "url", id: doc.id });
    if (!out?.url) throw new Error("Please log in with your email.");
    return out.url;
  });

  const saveDate = async () => {
    if (!date) { setError("Choose a date."); return; }
    setBusy(true); setError("");
    try {
      const out = await callMeApi(API, { action: "add-date", id: doc.id, date });
      if (!out) throw new Error("Please log in with your email.");
      onUpdated(out.doc);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const hasDate = field && doc[field];
  return (
    <div className={`rounded-lg border px-3 py-2 ${older ? "border-gray-100 bg-white opacity-75" : "border-gray-100 bg-gray-50"}`}>
      <div className="flex items-center gap-2">
        <span className="text-sm">📄</span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-gray-700 truncate">{name}</div>
          <div className="text-[11px] text-gray-400">
            {older && "Older · "}Uploaded {fmtUploaded(doc.uploaded_at)}
            {sec.kind === "other_qual" && doc.filename ? ` · ${doc.filename}` : ""}
          </div>
        </div>
        {doc.has_file && <button type="button" onClick={open} className="text-xs text-blue-600 hover:underline shrink-0">Open</button>}
      </div>
      {field && hasDate && (
        <div className="text-[11px] text-gray-500 mt-1">
          {field === "completion_date" ? `Completed ${fmtDateShort(doc.completion_date)}` : `Expires ${fmtDateShort(doc.expiry_date)}`}
          {field === "completion_date" && exp ? ` · expires ${fmtDateShort(exp)}` : ""}
        </div>
      )}
      {field && !hasDate && (
        <div className="mt-1.5 space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-600">
            <span>{field === "completion_date" ? "Date you completed it" : sec.kind === "other_qual" ? "Expiry date (if it has one)" : "Expiry date"}</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border rounded px-1.5 py-1 text-xs bg-white" />
            <button type="button" onClick={saveDate} disabled={busy || !date} className="text-xs px-2 py-1 rounded bg-blue-600 text-white disabled:opacity-40">
              {busy ? "Saving…" : "Add date"}
            </button>
          </div>
          {error && <p className="text-[11px] text-red-500">{error}</p>}
        </div>
      )}
    </div>
  );
}

function Uploader({ sec, hasFiles, onAdded }) {
  const field = dateField(sec);
  const needsTitle = sec.kind === "other_qual";
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleFile = async (file) => {
    if (!file) return;
    if (needsTitle && !title.trim()) { setError("Enter the qualification name first."); return; }
    setBusy(true); setError("");
    try {
      const ext = (String(file.name).split(".").pop() || "").toLowerCase();
      const t = await callMeApi(API, { action: "upload-url", section_key: sec.key, ext });
      if (!t) throw new Error("Please log in with your email.");
      await putFile(DOC_BUCKET, t.path, t.token, file);
      const out = await callMeApi(API, { action: "save", section_key: sec.key, path: t.path, filename: file.name, date: date || null, title: title.trim() || null });
      onAdded(out.doc);
      setDate(""); setTitle(""); setOpen(false);
    } catch (err) {
      setError("Upload failed: " + (err?.message || String(err)));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-blue-600">
        + {needsTitle ? "Add a qualification" : hasFiles ? "Upload a newer file" : "Upload"}
      </button>
    );
  }
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 space-y-2">
      {needsTitle && (
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Qualification name"
          className="w-full border rounded-lg px-2 py-1.5 text-sm bg-white" />
      )}
      {field && (
        <label className="flex flex-wrap items-center gap-2 text-[11px] text-gray-600">
          {field === "completion_date" ? "Date you completed it (optional)" : "Expiry date (optional)"}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border rounded px-1.5 py-1 text-xs bg-white" />
        </label>
      )}
      <label className={`flex items-center gap-2 w-full border-2 border-dashed rounded-lg px-3 py-2.5 bg-white ${busy ? "border-blue-200 cursor-wait" : "border-gray-200 cursor-pointer hover:border-blue-300"}`}>
        <span className="text-gray-400">📎</span>
        <span className="text-xs text-gray-500">{busy ? "Uploading…" : "Choose file (PDF or photo)"}</span>
        <input type="file" accept={ACCEPT} className="hidden" disabled={busy}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; handleFile(f); }} />
      </label>
      {error && <p className="text-[11px] text-red-500">{error}</p>}
      <button type="button" onClick={() => { setOpen(false); setError(""); }} disabled={busy} className="text-xs text-gray-500">Cancel</button>
    </div>
  );
}
