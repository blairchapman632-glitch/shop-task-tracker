// /qspp side panel → Replace files: the master (Word / Excel / PDF — admin only), the staff PDF, or both.
// Recorded as the manager who unlocked manager mode. onSave({ masterFile, pdfFile, version, note }) does the upload.
import { useState } from "react";
import { isPdfName, nextMinorVersion } from "../../lib/docFolders";

export default function ReplaceFilesModal({ doc, managerName, onClose, onSave }) {
  const [masterFile, setMasterFile] = useState(null);
  const [pdfFile, setPdfFile] = useState(null);
  const [version, setVersion] = useState(nextMinorVersion(doc.version));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const pdfOk = !pdfFile || isPdfName(pdfFile.name);
  const canSave = (masterFile || pdfFile) && pdfOk && (!masterFile || version.trim()) && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError("");
    try {
      await onSave({ masterFile, pdfFile, version: version.trim(), note });
    } catch (err) {
      setError(err?.message || String(err));
      setSaving(false);
    }
  };

  const inputCls = "w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400";
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-800">Replace files</h2>
            <p className="text-xs text-gray-500 mt-0.5 break-words">{doc.title} · currently v{doc.version || "1.0"}</p>
          </div>
          <button type="button" onClick={onClose} className="w-11 h-11 -m-2 text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <label className="block">
          <span className="block text-xs font-medium text-gray-600 mb-1">Master — Word, Excel or PDF <span className="text-gray-400 font-normal">(admin only · optional)</span></span>
          <input type="file" onChange={(e) => setMasterFile(e.target.files?.[0] || null)} className="block w-full text-sm" />
          {masterFile && isPdfName(masterFile.name) && !pdfFile && (
            <span className="block text-[11px] text-green-700 mt-1">This PDF will also be the staff PDF.</span>
          )}
          {masterFile && !isPdfName(masterFile.name) && !pdfFile && (
            <span className="block text-[11px] text-amber-700 mt-1">Staff will keep seeing the old PDF until you upload a new one — save it as PDF from Word and add it below.</span>
          )}
        </label>

        <label className="block">
          <span className="block text-xs font-medium text-gray-600 mb-1">Staff PDF <span className="text-gray-400 font-normal">(what staff open · optional)</span></span>
          <input type="file" accept="application/pdf,.pdf" onChange={(e) => setPdfFile(e.target.files?.[0] || null)} className="block w-full text-sm" />
          {!pdfOk && <span className="block text-[11px] text-red-600 mt-1">The staff file must be a PDF.</span>}
        </label>

        {masterFile && (
          <label className="block">
            <span className="block text-xs font-medium text-gray-600 mb-1">Version</span>
            <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="e.g. 1.1" className={inputCls} />
          </label>
        )}

        <label className="block">
          <span className="block text-xs font-medium text-gray-600 mb-1">What changed <span className="text-gray-400 font-normal">(optional)</span></span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={inputCls} />
        </label>

        <p className="text-[11px] text-gray-400">
          Recorded as {managerName || "the manager"}. Replacing a file doesn't reset who has read it — use "Ask staff to read" to send a new request.
        </p>
        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="min-h-[44px] px-4 rounded-xl border border-gray-300 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button type="button" onClick={save} disabled={!canSave} className="min-h-[44px] px-4 rounded-xl bg-[#1D4ED8] text-white text-sm font-semibold disabled:opacity-40">
            {saving ? "Uploading…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
