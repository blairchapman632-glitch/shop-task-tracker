import { useEffect, useState } from "react";
import Link from "next/link";
import supabase from "../lib/supabaseClient";

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";

const fileExt = (name = "") => {
  const m = name.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : "";
};

const extTag = (ext) => {
  if (ext === "pdf") return { label: "PDF", cls: "bg-red-50 text-red-600 border-red-100" };
  if (ext === "doc" || ext === "docx") return { label: "DOC", cls: "bg-blue-50 text-blue-600 border-blue-100" };
  if (ext === "xls" || ext === "xlsx") return { label: "XLS", cls: "bg-green-50 text-green-600 border-green-100" };
  return { label: (ext || "FILE").toUpperCase().slice(0, 4), cls: "bg-gray-100 text-gray-500 border-gray-200" };
};

export default function DocumentsPage() {
  const [folders, setFolders] = useState([]);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFolder, setActiveFolder] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const load = async () => {
      const { data: f } = await supabase
        .from("document_folders")
        .select("*")
        .eq("pharmacy_id", PHARMACY_ID)
        .order("sort_order");
      const { data: d } = await supabase
        .from("pharmacy_documents")
        .select("*")
        .eq("pharmacy_id", PHARMACY_ID)
        .eq("active", true)
        .order("title");
      setFolders(f || []);
      setDocs(d || []);
      if (f && f.length) setActiveFolder(f[0].id);
      setLoading(false);
    };
    load();
  }, []);

  const term = search.trim().toLowerCase();
  const searching = term.length > 0;
  const folderName = (id) => folders.find((f) => f.id === id)?.name || "";
  const folderDocs = searching
    ? docs.filter((d) => (d.title || "").toLowerCase().includes(term))
    : docs.filter((d) => d.folder_id === activeFolder);
  const activeFolderObj = folders.find((f) => f.id === activeFolder);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="max-w-3xl mx-auto px-4 pt-5 pb-2 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 leading-tight">QSPP Library</h1>
          <p className="text-xs text-slate-400 leading-tight mt-0.5">Policies &amp; procedures</p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition-colors shrink-0"
        >
          🏠 Home
        </Link>
      </div>

      {loading ? (
        <div className="max-w-3xl mx-auto px-4 py-10 text-sm text-slate-400">Loading…</div>
      ) : (
        <div className="max-w-3xl mx-auto px-4 py-5">
          {/* Search */}
          <div className="relative mb-4">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search all documents…"
              className="w-full border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>

          {/* Folder chips */}
          <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-1 px-1">
            {folders.map((f) => {
              const count = docs.filter((d) => d.folder_id === f.id).length;
              const active = activeFolder === f.id && !searching;
              return (
                <button
                  key={f.id}
                  onClick={() => { setActiveFolder(f.id); setSearch(""); }}
                  className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    active
                      ? "bg-slate-800 text-white border-slate-800"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {f.name}
                  <span className={`ml-1.5 text-xs ${active ? "text-slate-300" : "text-slate-400"}`}>{count}</span>
                </button>
              );
            })}
          </div>

          {/* Section label */}
          <div className="mb-2.5 px-1 text-xs font-semibold text-slate-400 uppercase tracking-wide">
            {searching ? `Search results · ${folderDocs.length}` : activeFolderObj?.name || ""}
          </div>

          {/* Document list */}
          {folderDocs.length === 0 ? (
            <p className="text-sm text-slate-400 px-1 py-12 text-center">
              {searching ? "No documents match your search." : "No documents in this folder yet."}
            </p>
          ) : (
            <div className="space-y-1.5">
              {folderDocs.map((doc) => {
                const tag = extTag(fileExt(doc.title));
                return (
                  <a
                    key={doc.id}
                    href={doc.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 bg-white rounded-xl border border-slate-100 px-3.5 py-3 hover:border-slate-300 hover:shadow-sm transition-all"
                  >
                    <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-md border ${tag.cls}`}>
                      {tag.label}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-slate-800 truncate">{doc.title}</span>
                      {searching && (
                        <span className="block text-[11px] text-slate-400 truncate">{folderName(doc.folder_id)}</span>
                      )}
                    </span>
                  </a>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}