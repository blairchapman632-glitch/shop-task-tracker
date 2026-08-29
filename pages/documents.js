import { useEffect, useState } from "react";
import Link from "next/link";
import supabase from "../lib/supabaseClient";

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";

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
  const folderDocs = docs.filter(
    (d) =>
      d.folder_id === activeFolder &&
      (!term || (d.title || "").toLowerCase().includes(term))
  );
  const activeFolderObj = folders.find((f) => f.id === activeFolder);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-5 py-4 flex items-center gap-3 sticky top-0 z-10">
        <Link href="/" className="text-gray-400 hover:text-gray-600 text-xl">←</Link>
        <div className="flex items-center gap-2">
          <span className="text-xl">📁</span>
          <h1 className="text-lg font-bold text-gray-800">QSPP</h1>
        </div>
      </div>

      {loading ? (
        <div className="p-6 text-sm text-gray-400">Loading…</div>
      ) : (
        <div className="max-w-3xl mx-auto px-4 py-4">
          {/* Search */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents…"
            className="w-full border rounded-lg px-4 py-2.5 text-sm mb-4 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />

          {/* Folder chips */}
          <div className="flex gap-2 overflow-x-auto pb-3 mb-2">
            {folders.map((f) => {
              const count = docs.filter((d) => d.folder_id === f.id).length;
              return (
                <button
                  key={f.id}
                  onClick={() => { setActiveFolder(f.id); setSearch(""); }}
                  className={`shrink-0 px-3.5 py-2 rounded-full text-sm font-medium border transition-colors ${
                    activeFolder === f.id
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {f.name} <span className={activeFolder === f.id ? "text-blue-100" : "text-gray-400"}>{count}</span>
                </button>
              );
            })}
          </div>

          {/* Document list */}
          <div className="mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">
            {activeFolderObj?.name || ""}
          </div>
          {folderDocs.length === 0 ? (
            <p className="text-sm text-gray-400 px-1 py-8 text-center">
              No documents{search ? " matching your search" : " in this folder"}.
            </p>
          ) : (
            <div className="space-y-2">
              {folderDocs.map((doc) => (
                <a
                  key={doc.id}
                  href={doc.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 px-4 py-3.5 hover:border-blue-200 hover:bg-blue-50 transition-colors"
                >
                  <span className="text-xl shrink-0">📄</span>
                  <span className="flex-1 min-w-0 text-sm font-medium text-gray-800">{doc.title}</span>
                  <span className="text-blue-600 text-lg shrink-0">›</span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}