// QSPP library helpers shared by the kiosk /documents page and Admin → QSPP → Documents.

export const OTHER_GROUP = "Other";

// Group folders by group_name. Groups are ordered by the lowest sort_order of their
// folders; folders with no group_name go in an "Other" group at the end.
export function groupFolders(folders = []) {
  const map = new Map();
  for (const f of folders) {
    const name = (f.group_name || "").trim() || OTHER_GROUP;
    if (!map.has(name)) map.set(name, { name, sort: Infinity, folders: [] });
    const g = map.get(name);
    g.folders.push(f);
    g.sort = Math.min(g.sort, f.sort_order ?? Infinity);
  }
  const bySort = (a, b) => (a.sort_order ?? Infinity) - (b.sort_order ?? Infinity);
  const groups = [...map.values()];
  groups.forEach((g) => g.folders.sort(bySort));
  return groups.sort((a, b) => {
    const ao = a.name === OTHER_GROUP, bo = b.name === OTHER_GROUP;
    if (ao !== bo) return ao ? 1 : -1;
    return a.sort - b.sort;
  });
}

// Title for a newly uploaded file: drop the extension and a leading section prefix
// like "1.2 - ", so it matches the library's existing titles.
export function titleFromFileName(name = "") {
  const title = (name || "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/^\d+(\.\d+)*\s*[-–—]\s*/, "")
    .trim();
  return title || name;
}

// Next minor version: "1.0" → "1.1", "1.9" → "1.10", "2" → "2.1". Unparseable → "".
export function nextMinorVersion(v) {
  const m = String(v ?? "").trim().match(/^(\d+)(?:\.(\d+))?$/);
  if (!m) return "";
  return `${m[1]}.${m[2] === undefined ? 1 : Number(m[2]) + 1}`;
}

// "9 Oct 2026" in Perth time, from a timestamp
export function perthDate(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("en-AU", { timeZone: "Australia/Perth", day: "numeric", month: "short", year: "numeric" });
}

// Keep a file name readable but safe as a storage key (no slashes, ?, # or odd characters)
export function storageSafeName(name = "") {
  return (name || "file").replace(/[^A-Za-z0-9 ._\-()&,+']/g, "_");
}

// ── Master + staff PDF ──
// Every document has a MASTER (file_url / file_name: the original Word / Excel / PDF — admin only, for editing) and a
// STAFF PDF (pdf_url / pdf_file_name) — the only file staff ever see. A PDF master is its own staff PDF.
// Staff screens select STAFF_DOC_COLUMNS so the master link is never loaded there.
export const STAFF_DOC_COLUMNS = "id, folder_id, title, version, review_date, sort_order, active, pdf_url, pdf_file_name";
export const isPdfName = (name = "") => /\.pdf$/i.test(String(name || "").split("?")[0]);
// "missing" = staff can't open it; "stale" = master replaced after the PDF was uploaded; "ok"
export function pdfStatus(doc) {
  if (!doc?.pdf_url) return "missing";
  const master = Date.parse(doc.updated_at || doc.uploaded_at || "");
  const pdf = Date.parse(doc.pdf_updated_at || "");
  if (Number.isFinite(master) && Number.isFinite(pdf) && master - pdf > 60 * 1000) return "stale";
  return "ok";
}
// Public link that downloads instead of opening (Supabase storage ?download=)
export const downloadUrl = (url, fileName) =>
  url ? `${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(String(fileName || "").split("/").pop() || "")}` : "";

// File-type tag from the stored file name (titles no longer carry the extension).
export function fileTag(fileName = "") {
  const m = (fileName || "").match(/\.([a-z0-9]+)$/i);
  const ext = m ? m[1].toLowerCase() : "";
  if (ext === "pdf") return { label: "PDF", cls: "bg-red-50 text-red-600 border-red-100" };
  if (ext === "doc" || ext === "docx") return { label: "DOC", cls: "bg-blue-50 text-blue-600 border-blue-100" };
  if (ext === "xls" || ext === "xlsx") return { label: "XLS", cls: "bg-green-50 text-green-600 border-green-100" };
  return { label: "FILE", cls: "bg-gray-100 text-gray-500 border-gray-200" };
}
