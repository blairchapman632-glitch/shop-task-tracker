// /qspp → Library.
//   Left: "All documents", then folders grouped by domain (collapsible, with counts). Right: search + document list.
//   Each row: file icon, title, "v1.0 · review 30 Sep 2027". Staff click → the staff PDF (never the master);
//   no PDF yet → "Not available yet".
//   Manager mode (manager = { id, name }): "X of Y read" pills, No PDF / PDF older badges, + Upload, Manage folders,
//   and clicking a row opens the side panel (components/qspp/DocPanel) instead of the PDF. Also a summary strip
//   (Active / Reviews overdue / Due in 60 days / Retired) and a Folders | List switch — List is the Document Register
//   (components/qspp/RegisterList); a tile opens List with that filter.
// Staff load only STAFF_DOC_COLUMNS (no master link); manager mode loads everything, retired documents included.
import { useEffect, useMemo, useRef, useState } from "react";
import supabase from "../../lib/supabaseClient";
import { REQUEST_COLUMNS, docProgress } from "../../lib/policyReads";
import { groupFolders, groupShortLabel, pdfStatus, STAFF_DOC_COLUMNS } from "../../lib/docFolders";
import { fmtDateShort } from "../../lib/performanceReview";
import { fetchAllRows } from "../../lib/trainingPlan";
import { uploadDocuments } from "../../lib/qsppDocs";
import { KioskPolicies } from "./KioskPolicies";
import DocPanel from "./DocPanel";
import FileIcon from "./FileIcon";
import ManageFoldersModal from "./ManageFoldersModal";
import RegisterList, { reviewState } from "./RegisterList";
import { todayPerth } from "../../lib/performanceReview";

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";
const ALL = "all";

// openDocId: open that document's side panel once manager mode is on and loaded (from /qspp?doc=…), then onOpenedDoc()
export default function Library({ manager, openDocId = null, onOpenedDoc }) {
  const [folders, setFolders] = useState([]);
  const [docs, setDocs] = useState([]); // manager: active + retired; staff: active only
  const [staffList, setStaffList] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeFolder, setActiveFolder] = useState(ALL);
  const [openGroups, setOpenGroups] = useState(new Set());
  const [search, setSearch] = useState("");
  const [showPolicies, setShowPolicies] = useState(false);
  const [panelId, setPanelId] = useState(null);
  const [managingFolders, setManagingFolders] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [view, setView] = useState("folders"); // manager: folders | list
  const [listFilter, setListFilter] = useState("all");
  const [pharmacyName, setPharmacyName] = useState(""); // register PDF header (pharmacy_settings.name)
  const uploadRef = useRef(null);
  const isManager = !!manager;

  const loadRequests = async () => {
    try {
      setRequests(await fetchAllRows(() => supabase.from("policy_read_requests").select(REQUEST_COLUMNS).eq("pharmacy_id", PHARMACY_ID).order("id")));
    } catch (err) {
      setError("Couldn't load read requests: " + (err?.message || String(err)));
    }
  };

  // Reload when manager mode turns on / off (staff never load master links)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const docsQuery = isManager
        ? supabase.from("pharmacy_documents").select("*").eq("pharmacy_id", PHARMACY_ID).order("title")
        : supabase.from("pharmacy_documents").select(STAFF_DOC_COLUMNS).eq("pharmacy_id", PHARMACY_ID).eq("active", true).order("title");
      const [{ data: f }, { data: d, error: dErr }, { data: s }] = await Promise.all([
        supabase.from("document_folders").select("*").eq("pharmacy_id", PHARMACY_ID).order("sort_order"),
        docsQuery,
        supabase.from("staff").select("id, name, role, active").eq("pharmacy_id", PHARMACY_ID).or("role.is.null,role.neq.Locum").order("name"),
      ]);
      if (cancelled) return;
      setError(dErr ? dErr.message : "");
      setFolders(f || []);
      setDocs(d || []);
      setStaffList(s || []);
      if (isManager) {
        await loadRequests();
        const { data: ps } = await supabase.from("pharmacy_settings").select("name").eq("pharmacy_id", PHARMACY_ID).maybeSingle();
        if (!cancelled) setPharmacyName(ps?.name || "");
      } else { setRequests([]); setPanelId(null); setView("folders"); }
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManager]);

  const groups = useMemo(() => groupFolders(folders), [folders]);
  const folderOrder = useMemo(() => new Map(groups.flatMap((g) => g.folders).map((f, i) => [f.id, i])), [groups]);
  const folderName = (id) => folders.find((f) => f.id === id)?.name || "";
  const activeDocs = docs.filter((d) => d.active !== false);
  const docCount = (folderId) => activeDocs.filter((d) => d.folder_id === folderId).length;
  const term = search.trim().toLowerCase();
  const searching = term.length > 0;
  const listed = (searching
    ? activeDocs.filter((d) => (d.title || "").toLowerCase().includes(term))
    : activeFolder === ALL ? activeDocs : activeDocs.filter((d) => d.folder_id === activeFolder))
    .sort((a, b) => (folderOrder.get(a.folder_id) ?? 9999) - (folderOrder.get(b.folder_id) ?? 9999)
      || String(a.title || "").localeCompare(String(b.title || "")));
  const showFolderName = searching || activeFolder === ALL;
  const activeFolderObj = folders.find((f) => f.id === activeFolder);
  const panelDoc = docs.find((d) => d.id === panelId) || null;

  // The group holding the current folder starts open
  useEffect(() => {
    const g = groups.find((x) => x.folders.some((f) => f.id === activeFolder));
    if (g) setOpenGroups((s) => (s.has(g.name) ? s : new Set(s).add(g.name)));
  }, [activeFolder, groups]);

  useEffect(() => {
    if (!isManager || loading || !openDocId) return;
    const d = docs.find((x) => String(x.id) === String(openDocId));
    if (d) { setPanelId(d.id); if (d.active !== false) setActiveFolder(d.folder_id); }
    onOpenedDoc?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManager, loading, openDocId]);

  const pickFolder = (id) => { setActiveFolder(id); setSearch(""); };
  const toggleGroup = (name) => setOpenGroups((s) => { const n = new Set(s); if (n.has(name)) n.delete(name); else n.add(name); return n; });

  const onDocChanged = (id, changes) => setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, ...changes } : d)));
  const onDocDeleted = (id) => { setDocs((prev) => prev.filter((d) => d.id !== id)); setPanelId(null); };

  const handleUpload = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length || !activeFolderObj || !manager) return;
    setUploading(true);
    setError("");
    try {
      const rows = await uploadDocuments(supabase, { pharmacyId: PHARMACY_ID, folder: activeFolderObj, files, staffId: manager.id });
      setDocs((prev) => [...prev, ...rows]);
    } catch (err) {
      setError("Upload failed: " + (err?.message || String(err)));
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <div className="max-w-6xl mx-auto px-4 py-10 text-sm text-gray-400">Loading…</div>;

  const folderBtn = (id, label, count, indent) => {
    const active = activeFolder === id && !searching;
    return (
      <button
        key={id}
        onClick={() => pickFolder(id)}
        className={`w-full min-h-[44px] flex items-center gap-2 ${indent ? "pl-7" : "pl-3"} pr-3 py-2 text-left text-sm rounded-[10px] transition-colors ${
          active ? "bg-[#EFF6FF] text-[#1E3A8A] font-semibold" : "text-slate-700 hover:bg-slate-50"
        }`}
      >
        <span className="flex-1 min-w-0 leading-snug">{label}</span>
        <span className={`text-xs ${active ? "text-[#1D4ED8]" : "text-slate-400"}`}>{count}</span>
      </button>
    );
  };

  const today = todayPerth();
  const tiles = [
    { key: "active", label: "Active documents", n: activeDocs.length, tone: "text-slate-800" },
    { key: "overdue", label: "Reviews overdue", n: docs.filter((d) => reviewState(d, today) === "overdue").length, tone: "text-red-700" },
    { key: "due60", label: "Reviews due in 60 days", n: docs.filter((d) => reviewState(d, today) === "due60").length, tone: "text-amber-700" },
    { key: "retired", label: "Retired", n: docs.filter((d) => d.active === false).length, tone: "text-slate-500" },
  ];
  const openList = (filter) => { setListFilter(filter); setView("list"); };

  return (
    <div className="max-w-6xl mx-auto px-4 pb-10">
      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

      {isManager && (
        <div className="mb-4 space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {tiles.map((t) => (
              <button key={t.key} onClick={() => openList(t.key)}
                className={`text-left bg-white rounded-[14px] border px-4 py-3 hover:bg-slate-50 ${view === "list" && listFilter === t.key ? "border-[#BFDBFE] ring-1 ring-[#BFDBFE]" : "border-[#E5E7EB]"}`}>
                <div className={`text-2xl font-semibold ${t.tone}`}>{t.n}</div>
                <div className="text-xs text-[#475569] mt-0.5">{t.label}</div>
              </button>
            ))}
          </div>
          <div className="inline-flex p-1 rounded-[12px] bg-white border border-[#E5E7EB]">
            {[{ k: "folders", l: "Folders" }, { k: "list", l: "List" }].map((o) => (
              <button key={o.k} onClick={() => setView(o.k)}
                className={`min-h-[36px] px-4 rounded-[9px] text-sm ${view === o.k ? "bg-[#EFF6FF] text-[#1E3A8A] font-semibold" : "text-slate-600 hover:bg-slate-50"}`}>
                {o.l}
              </button>
            ))}
          </div>
        </div>
      )}

      {isManager && view === "list" ? (
        <RegisterList
          docs={docs}
          groups={groups}
          folderName={folderName}
          staffName={(id) => staffList.find((x) => Number(x.id) === Number(id))?.name || ""}
          manager={manager}
          pharmacyName={pharmacyName}
          filter={listFilter}
          onFilter={setListFilter}
          onOpen={(d) => setPanelId(d.id)}
        />
      ) : (
      <div className="md:grid md:grid-cols-[280px_1fr] md:gap-5 md:items-start space-y-4 md:space-y-0">
        {/* Folders */}
        <nav className="bg-white rounded-[14px] border border-[#E5E7EB] p-2 md:sticky md:top-4 md:max-h-[calc(100vh-2rem)] md:overflow-y-auto">
          {folderBtn(ALL, "All documents", activeDocs.length, false)}
          {groups.map((g) => {
            const open = openGroups.has(g.name);
            const total = g.folders.reduce((n, f) => n + docCount(f.id), 0);
            return (
              <div key={g.name} className="mt-1">
                <button onClick={() => toggleGroup(g.name)} title={g.name}
                  className="w-full min-h-[44px] flex items-center gap-2 px-3 py-1.5 text-left rounded-[10px] hover:bg-slate-50">
                  <span className="w-3 shrink-0 text-center text-slate-400 text-base leading-none" aria-hidden="true">{open ? "⌄" : "›"}</span>
                  <span className="flex-1 min-w-0 text-[14px] font-semibold text-[#334155] leading-snug line-clamp-2">{groupShortLabel(g.name)}</span>
                  <span className="text-xs text-slate-400 shrink-0">{total}</span>
                </button>
                {open && g.folders.map((f) => folderBtn(f.id, f.name, docCount(f.id), true))}
              </div>
            );
          })}
          {isManager && (
            <button onClick={() => setManagingFolders(true)} className="w-full min-h-[44px] mt-2 border-t border-[#E5E7EB] pt-2 text-sm text-[#1D4ED8] hover:underline">Manage folders</button>
          )}
        </nav>

        {/* Documents */}
        <section className="min-w-0 space-y-3">
          <button onClick={() => setShowPolicies(true)}
            className="w-full min-h-[44px] flex items-center justify-between px-4 rounded-[12px] bg-[#EFF6FF] border border-[#BFDBFE] text-[#1E3A8A] text-sm font-medium hover:bg-[#DBEAFE]">
            <span>Policies to read</span>
            <span className="font-semibold">Open →</span>
          </button>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search all documents…"
                className="w-full min-h-[44px] border border-[#E5E7EB] rounded-[12px] pl-10 pr-4 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#BFDBFE]" />
            </div>
            {isManager && activeFolderObj && !searching && (
              <>
                <button onClick={() => uploadRef.current?.click()} disabled={uploading} title={`Upload into ${activeFolderObj.name}`}
                  className="min-h-[44px] px-4 rounded-[12px] text-sm font-semibold bg-[#1D4ED8] text-white disabled:opacity-40 shrink-0">
                  {uploading ? "Uploading…" : "+ Upload"}
                </button>
                <input ref={uploadRef} type="file" multiple className="hidden" onChange={(e) => { handleUpload(e.target.files); e.target.value = ""; }} />
              </>
            )}
          </div>

          <div className="px-1 text-xs font-semibold text-slate-500 uppercase tracking-wide">
            {searching ? `Search results · ${listed.length}` : activeFolder === ALL ? `All documents · ${listed.length}` : `${activeFolderObj?.name || ""} · ${listed.length}`}
          </div>

          {listed.length === 0 ? (
            <div className="bg-white rounded-[14px] border border-[#E5E7EB] py-12 text-center text-sm text-slate-400">
              {searching ? "No documents match your search." : "No documents in this folder yet."}
            </div>
          ) : (
            <div className="bg-white rounded-[14px] border border-[#E5E7EB] divide-y divide-[#F1F5F9] overflow-hidden">
              {listed.map((doc) => (
                <DocRow
                  key={doc.id}
                  doc={doc}
                  isManager={isManager}
                  folder={showFolderName ? folderName(doc.folder_id) : ""}
                  progress={isManager ? docProgress(doc.id, requests, staffList) : null}
                  onOpenPanel={() => setPanelId(doc.id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
      )}

      {showPolicies && <KioskPolicies staffList={staffList} onClose={() => setShowPolicies(false)} />}
      {isManager && panelDoc && (
        <DocPanel
          doc={panelDoc}
          groups={groups}
          folderName={folderName}
          staffList={staffList}
          requests={requests}
          manager={manager}
          onClose={() => setPanelId(null)}
          onChanged={onDocChanged}
          onDeleted={onDocDeleted}
          onRequestsChanged={loadRequests}
        />
      )}
      {isManager && managingFolders && (
        <ManageFoldersModal folders={folders} groups={groups} docs={docs} onClose={() => setManagingFolders(false)} onFoldersChanged={setFolders} />
      )}
    </div>
  );
}

// One document row: icon, title, "v1.0 · review 30 Sep 2027" (+ folder when listing all / searching).
// Staff: opens the staff PDF. Manager: badges + read pill, opens the side panel.
function DocRow({ doc, isManager, folder, progress, onOpenPanel }) {
  const meta = [`v${doc.version || "1.0"}`, doc.review_date ? `review ${fmtDateShort(doc.review_date)}` : "", folder].filter(Boolean).join(" · ");
  const st = isManager ? pdfStatus(doc) : null;
  const dim = !isManager && !doc.pdf_url; // staff: no PDF yet
  const inner = (
    <>
      <FileIcon dim={dim} />
      <span className="flex-1 min-w-0">
        <span className={`block text-sm font-medium truncate ${dim ? "text-slate-400" : "text-slate-800"}`}>{doc.title}</span>
        <span className="block text-xs text-[#475569] truncate">{meta}</span>
      </span>
      {isManager && (
        <span className="flex items-center gap-1.5 shrink-0">
          {st === "missing" && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border bg-red-50 text-red-700 border-red-200">No PDF</span>}
          {st === "stale" && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border bg-amber-50 text-amber-800 border-amber-200">PDF older</span>}
          {progress?.total > 0 && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border bg-green-50 text-green-700 border-green-200">{progress.read} of {progress.total} read</span>
          )}
        </span>
      )}
      {dim && <span className="shrink-0 text-xs text-slate-400">Not available yet</span>}
    </>
  );
  const cls = "w-full min-h-[56px] flex items-center gap-3 px-4 py-2.5 text-left";
  if (isManager) return <button onClick={onOpenPanel} className={`${cls} hover:bg-slate-50`}>{inner}</button>;
  if (!doc.pdf_url) return <div className={cls}>{inner}</div>;
  return <a href={doc.pdf_url} target="_blank" rel="noopener noreferrer" className={`${cls} hover:bg-slate-50`}>{inner}</a>;
}
