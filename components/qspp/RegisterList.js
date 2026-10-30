// /qspp manager mode → Library → List view: the Document Register (every document, active and retired).
// Filter chips (All, Active, Retired, Review overdue, Due in 60 days) + search; Export PDF exports what's showing
// (lib/documentRegisterPdf). Retired rows are greyed with date / who / reason. Clicking a row opens the side panel.
import { useState } from "react";
import { perthDate, MIGRATION_UPDATED_BY } from "../../lib/docFolders";
import { fmtDateShort, todayPerth, addDaysStr } from "../../lib/performanceReview";

export const REGISTER_FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "retired", label: "Retired" },
  { key: "overdue", label: "Review overdue" },
  { key: "due60", label: "Due in 60 days" },
];

// Review overdue / due within 60 days — active documents only (retired ones are out of use)
export function reviewState(doc, today = todayPerth()) {
  if (doc.active === false || !doc.review_date) return null;
  const d = String(doc.review_date);
  if (d < today) return "overdue";
  if (d <= addDaysStr(today, 60)) return "due60";
  return null;
}
export const matchesFilter = (doc, filter, today) =>
  filter === "all" ? true
  : filter === "active" ? doc.active !== false
  : filter === "retired" ? doc.active === false
  : reviewState(doc, today) === filter;

export default function RegisterList({ docs, groups, folderName, staffName, manager, pharmacyName, filter, onFilter, onOpen }) {
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const today = todayPerth();
  const term = search.trim().toLowerCase();
  const folderOrder = new Map(groups.flatMap((g) => g.folders).map((f, i) => [f.id, i]));

  const rows = docs
    .filter((d) => matchesFilter(d, filter, today))
    .filter((d) => !term || (d.title || "").toLowerCase().includes(term) || folderName(d.folder_id).toLowerCase().includes(term))
    .sort((a, b) => (folderOrder.get(a.folder_id) ?? 9999) - (folderOrder.get(b.folder_id) ?? 9999)
      || String(a.title || "").localeCompare(String(b.title || "")));

  // No recorded updater: the QSPP migration text — except Reference Library (external documents) shows "—"
  const isReferenceLibrary = (d) => folderName(d.folder_id).trim().toLowerCase() === "reference library";
  const updatedByLabel = (d) => staffName(d.updated_by_staff_id) || (isReferenceLibrary(d) ? "—" : MIGRATION_UPDATED_BY);
  const reviewLabel = (d) => (d.review_date ? fmtDateShort(d.review_date) : "—");
  const statusText = (d) => (d.active !== false ? "Active"
    : `Retired ${perthDate(d.retired_at) || ""}${staffName(d.retired_by_staff_id) ? ` by ${staffName(d.retired_by_staff_id)}` : ""}${d.retired_reason ? ` — ${d.retired_reason}` : ""}`.trim());
  const filterLabel = [REGISTER_FILTERS.find((f) => f.key === filter)?.label || "All", term ? `search "${search.trim()}"` : ""].filter(Boolean).join(", ");

  const exportPdf = async () => {
    setBusy(true);
    try {
      const { buildDocumentRegisterPdf } = await import("../../lib/documentRegisterPdf");
      const { bytes, warnings } = await buildDocumentRegisterPdf({
        pharmacyName, generatedOn: today, generatedBy: manager?.name || "", filterLabel,
        rows: rows.map((d) => ({
          folder: folderName(d.folder_id) || "—", title: d.title, version: d.version ? `v${d.version}` : "—",
          updated: perthDate(d.updated_at || d.uploaded_at) || "—", updatedBy: updatedByLabel(d),
          review: reviewLabel(d), reviewOverdue: reviewState(d, today) === "overdue", status: statusText(d),
        })),
      });
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `document_register_${today}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      if (warnings.length) alert(warnings.join("\n"));
    } catch (err) {
      alert("Couldn't create the PDF: " + (err?.message || String(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {REGISTER_FILTERS.map((f) => (
          <button key={f.key} onClick={() => onFilter(f.key)}
            className={`min-h-[36px] px-3 rounded-full text-sm border transition-colors ${
              filter === f.key ? "bg-[#EFF6FF] border-[#BFDBFE] text-[#1E3A8A] font-semibold" : "bg-white border-[#E5E7EB] text-slate-600 hover:bg-slate-50"
            }`}>
            {f.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search titles and folders…"
            className="w-full min-h-[44px] border border-[#E5E7EB] rounded-[12px] pl-10 pr-4 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#BFDBFE]" />
        </div>
        <button onClick={exportPdf} disabled={busy}
          className="min-h-[44px] px-4 rounded-[12px] text-sm font-medium bg-white border border-[#E5E7EB] text-slate-700 hover:bg-slate-50 disabled:opacity-40 shrink-0">
          {busy ? "Creating…" : "↓ Export PDF"}
        </button>
      </div>

      <div className="px-1 text-xs font-semibold text-slate-500 uppercase tracking-wide">Document register · {rows.length}</div>

      <div className="bg-white rounded-[14px] border border-[#E5E7EB] overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-[#E5E7EB]">
            <tr>
              {["Folder", "Title", "Version", "Last updated", "Updated by", "Review date", "Status"].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-10 text-center text-slate-400">No documents match.</td></tr>
            ) : rows.map((d) => {
              const retired = d.active === false;
              const rs = reviewState(d, today);
              return (
                <tr key={d.id} onClick={() => onOpen(d)}
                  className={`border-t border-[#F1F5F9] align-top cursor-pointer hover:bg-slate-50 ${retired ? "text-slate-400" : "text-slate-700"}`}>
                  <td className="px-3 py-2.5 text-xs text-[#475569]">{folderName(d.folder_id) || "—"}</td>
                  <td className={`px-3 py-2.5 font-medium ${retired ? "text-slate-400" : "text-slate-800"}`}>{d.title}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{d.version ? `v${d.version}` : "—"}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{perthDate(d.updated_at || d.uploaded_at) || "—"}</td>
                  <td className={`px-3 py-2.5 text-xs ${staffName(d.updated_by_staff_id) ? "" : "text-slate-400"}`}>{updatedByLabel(d)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className={rs === "overdue" ? "text-red-700 font-semibold" : rs === "due60" ? "text-amber-700 font-medium" : ""}>{reviewLabel(d)}</span>
                    {rs === "overdue" && <span className="block text-[11px] text-red-600">overdue</span>}
                    {rs === "due60" && <span className="block text-[11px] text-amber-700">due soon</span>}
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    {retired
                      ? <span className="text-slate-500">{statusText(d)}</span>
                      : <span className="inline-block px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200 font-medium">Active</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
