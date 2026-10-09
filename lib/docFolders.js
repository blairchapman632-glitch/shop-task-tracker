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

// File-type tag from the stored file name (titles no longer carry the extension).
export function fileTag(fileName = "") {
  const m = (fileName || "").match(/\.([a-z0-9]+)$/i);
  const ext = m ? m[1].toLowerCase() : "";
  if (ext === "pdf") return { label: "PDF", cls: "bg-red-50 text-red-600 border-red-100" };
  if (ext === "doc" || ext === "docx") return { label: "DOC", cls: "bg-blue-50 text-blue-600 border-blue-100" };
  if (ext === "xls" || ext === "xlsx") return { label: "XLS", cls: "bg-green-50 text-green-600 border-green-100" };
  return { label: "FILE", cls: "bg-gray-100 text-gray-500 border-gray-200" };
}
