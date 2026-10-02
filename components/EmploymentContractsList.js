// Admin → Staff → Documents: every signed employment contract for a staff member, paper or electronic,
// newest first (newest = Current, others = Previous). Nothing is ever replaced.
// Paper: locum_documents rows of type 'signed_contract' — new uploads are private (pages/api/contracts/paper.js).
// Electronic: employment_contracts rows with status 'accepted' (read-only here).
import { useState } from "react";
import supabase from "../lib/supabaseClient";
import { openContractFile } from "./ContractTab";

// Sort key in ms: paper = date signed (Perth midnight), else upload time; electronic = accepted_at
const paperTime = (d) => (d.signed_date ? new Date(`${d.signed_date}T00:00:00+08:00`).getTime() : new Date(d.uploaded_at).getTime());
const fmtDay = (ymd) => new Date(`${ymd}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
const fmtIso = (iso) => new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Perth" });

// paperDocs: locum_documents rows of type 'signed_contract'; contracts: employment_contracts rows (with template label)
export default function EmploymentContractsList({ staffId, paperDocs, contracts, onChanged }) {
  const [showUpload, setShowUpload] = useState(false);
  const [signedDate, setSignedDate] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dateEdits, setDateEdits] = useState({}); // doc id -> date being set on an undated upload

  const rows = [
    ...(paperDocs || []).map((d) => ({ kind: "paper", key: `p${d.id}`, time: paperTime(d), tie: new Date(d.uploaded_at).getTime(), doc: d })),
    ...(contracts || []).filter((c) => c.status === "accepted" && c.accepted_at)
      .map((c) => ({ kind: "electronic", key: `e${c.id}`, time: new Date(c.accepted_at).getTime(), tie: new Date(c.accepted_at).getTime(), contract: c })),
  ].sort((a, b) => b.time - a.time || b.tie - a.tie);

  const post = async (body) => {
    const res = await fetch("/api/contracts/paper", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || `Upload failed (${res.status})`);
    return out;
  };

  const upload = async () => {
    setError("");
    if (!signedDate) { setError("Date signed is required."); return; }
    if (!file) { setError("Choose the contract file."); return; }
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["pdf", "jpg", "jpeg", "png"].includes(ext)) { setError("Please choose a PDF, JPG or PNG file."); return; }
    setBusy(true);
    try {
      // Browser uploads straight to the private bucket with a one-time upload token from the server
      const { path, token } = await post({ action: "upload-url", staff_id: staffId, ext });
      const { error: upErr } = await supabase.storage.from("employment-contracts").uploadToSignedUrl(path, token, file);
      if (upErr) throw upErr;
      await post({ action: "save", staff_id: staffId, path, filename: file.name, signed_date: signedDate });
      setShowUpload(false); setSignedDate(""); setFile(null);
      await onChanged?.();
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const viewPaper = async (doc) => {
    const win = window.open("", "_blank"); // open now, while we still have the click (popup blockers)
    try {
      const res = await fetch(`/api/contracts/paper?id=${doc.id}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.url) throw new Error(body.error || "Couldn't open file");
      if (win) win.location.href = body.url; else window.open(body.url, "_blank");
    } catch (err) {
      if (win) win.close();
      setError(err?.message || String(err));
    }
  };

  const deletePaper = async (doc) => {
    if (!window.confirm(`Delete this paper contract${doc.filename ? ` (${doc.filename})` : ""}? The file is removed permanently.`)) return;
    setError("");
    try {
      const res = await fetch(`/api/contracts/paper?id=${doc.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Delete failed");
      await onChanged?.();
    } catch (err) {
      setError(err?.message || String(err));
    }
  };

  const saveDate = async (doc) => {
    const d = dateEdits[doc.id];
    if (!d) return;
    const { error: err } = await supabase.from("locum_documents").update({ signed_date: d }).eq("id", doc.id);
    if (err) { setError("Couldn't set date: " + err.message); return; }
    setDateEdits((m) => { const n = { ...m }; delete n[doc.id]; return n; });
    await onChanged?.();
  };

  const badge = (current) => (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border shrink-0 ${current ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-gray-500 border-gray-200"}`}>
      {current ? "Current" : "Previous"}
    </span>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-xs font-medium text-gray-600">Employment contracts</div>
        {!showUpload && (
          <button type="button" onClick={() => { setShowUpload(true); setError(""); }} className="text-xs text-blue-600 hover:underline">+ Upload paper contract</button>
        )}
      </div>

      {showUpload && (
        <div className="mb-2 rounded-lg border border-gray-200 bg-white p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-gray-600 mb-1">Date signed *</label>
              <input type="date" value={signedDate} onChange={(e) => setSignedDate(e.target.value)} className="w-full border rounded-lg px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-600 mb-1">File (PDF, JPG, PNG) *</label>
              <label className="flex items-center gap-1 border rounded-lg px-2 py-1.5 text-xs text-gray-600 cursor-pointer hover:bg-gray-50">
                <span>📎</span>
                <span className="truncate">{file ? file.name : "Choose file"}</span>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => { setShowUpload(false); setFile(null); setSignedDate(""); setError(""); }} className="flex-1 border border-gray-300 rounded-lg py-1.5 text-xs text-gray-600">Cancel</button>
            <button type="button" onClick={upload} disabled={busy} className="flex-1 bg-blue-600 text-white rounded-lg py-1.5 text-xs font-medium disabled:opacity-40">{busy ? "Uploading…" : "Upload"}</button>
          </div>
          <p className="text-[11px] text-gray-400">Stored privately — contracts contain pay rates and addresses.</p>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-xs text-gray-400">No signed contract on file.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r, i) => {
            if (r.kind === "electronic") {
              const c = r.contract;
              return (
                <div key={r.key} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                  <span className="text-sm">✍️</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-gray-700 truncate">Accepted electronically — {c.contract_templates?.label || "Contract"}</div>
                    <div className="text-[11px] text-gray-400">Electronic · {fmtIso(c.accepted_at)}</div>
                  </div>
                  {badge(i === 0)}
                  <button type="button" onClick={() => openContractFile(c.id, "accepted")} className="text-xs text-blue-600 hover:underline shrink-0">View</button>
                </div>
              );
            }
            const d = r.doc;
            return (
              <div key={r.key} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                <span className="text-sm">📄</span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-gray-700 truncate">{d.filename || "Paper contract"}</div>
                  {d.signed_date ? (
                    <div className="text-[11px] text-gray-400">Paper · signed {fmtDay(d.signed_date)}</div>
                  ) : (
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className="text-[11px] text-amber-600">Paper · Date not set</span>
                      <input type="date" value={dateEdits[d.id] || ""} onChange={(e) => setDateEdits((m) => ({ ...m, [d.id]: e.target.value }))} className="border rounded px-1 py-0.5 text-[11px]" />
                      {dateEdits[d.id] && <button type="button" onClick={() => saveDate(d)} className="text-[11px] text-blue-600 hover:underline">Save</button>}
                    </div>
                  )}
                </div>
                {badge(i === 0)}
                <button type="button" onClick={() => viewPaper(d)} className="text-xs text-blue-600 hover:underline shrink-0">View</button>
                <button type="button" onClick={() => deletePaper(d)} className="text-xs text-red-500 hover:text-red-700 shrink-0">Delete</button>
              </div>
            );
          })}
        </div>
      )}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
