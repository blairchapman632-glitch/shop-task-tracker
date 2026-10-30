// /qspp manager mode → "Manage folders": add, rename / regroup, delete (only empty folders — retired documents count).
import { useState } from "react";
import supabase from "../../lib/supabaseClient";
import { OTHER_GROUP } from "../../lib/docFolders";
import { addFolder, renameFolder, deleteFolder } from "../../lib/qsppDocs";

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";

// folders: all folders; groups: groupFolders(folders); docs: every document (active + retired)
export default function ManageFoldersModal({ folders, groups, docs, onClose, onFoldersChanged }) {
  const [editing, setEditing] = useState(null); // folder id
  const [name, setName] = useState("");
  const [group, setGroup] = useState("");
  const [newName, setNewName] = useState("");
  const [newGroup, setNewGroup] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const groupNames = [...new Set(folders.map((f) => (f.group_name || "").trim()).filter(Boolean))];

  const run = async (fn) => {
    setBusy(true);
    setError("");
    try { await fn(); } catch (err) { setError(err?.message || String(err)); }
    setBusy(false);
  };

  const saveEdit = (f) => run(async () => {
    if (!name.trim()) { setEditing(null); return; }
    const changes = await renameFolder(supabase, f.id, { name, group });
    onFoldersChanged(folders.map((x) => (x.id === f.id ? { ...x, ...changes } : x)));
    setEditing(null);
  });
  const remove = (f) => {
    const active = docs.filter((d) => d.folder_id === f.id && d.active !== false).length;
    const retired = docs.filter((d) => d.folder_id === f.id && d.active === false).length;
    if (active || retired) {
      alert(`This folder still has ${active} document${active === 1 ? "" : "s"}${retired ? ` and ${retired} retired` : ""}. Move them first${retired ? " (restore retired ones to move them)" : ""}.`);
      return;
    }
    if (!window.confirm(`Delete the empty folder "${f.name}"?`)) return;
    run(async () => { await deleteFolder(supabase, f.id); onFoldersChanged(folders.filter((x) => x.id !== f.id)); });
  };
  const add = () => run(async () => {
    if (!newName.trim()) return;
    const maxSort = folders.reduce((m, f) => Math.max(m, f.sort_order || 0), 0);
    const row = await addFolder(supabase, { pharmacyId: PHARMACY_ID, name: newName, group: newGroup, sortOrder: maxSort + 1 });
    onFoldersChanged([...folders, row]);
    setNewName("");
    setNewGroup("");
  });

  const input = "min-h-[40px] border border-gray-300 rounded-lg px-2.5 text-sm";
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-gray-800">Manage folders</h2>
          <button onClick={onClose} className="w-11 h-11 -m-2 text-gray-400 hover:text-gray-600 text-2xl">×</button>
        </div>
        <datalist id="qspp-folder-groups">{groupNames.map((g) => <option key={g} value={g} />)}</datalist>
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4">
          {error && <p className="text-sm text-red-500">{error}</p>}
          {groups.map((g) => (
            <div key={g.name}>
              <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">{g.name}</div>
              <div className="rounded-xl border border-gray-200 divide-y">
                {g.folders.map((f) => (
                  <div key={f.id} className="px-3 py-2">
                    {editing === f.id ? (
                      <div className="space-y-1.5">
                        <input value={name} onChange={(e) => setName(e.target.value)} className={`${input} w-full`} autoFocus />
                        <input value={group} onChange={(e) => setGroup(e.target.value)} list="qspp-folder-groups" placeholder={`Group (blank = ${OTHER_GROUP})`} className={`${input} w-full`} />
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setEditing(null)} className="min-h-[40px] px-3 text-sm text-gray-500">Cancel</button>
                          <button onClick={() => saveEdit(f)} disabled={busy} className="min-h-[40px] px-3 rounded-lg bg-[#1D4ED8] text-white text-sm">Save</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="flex-1 text-sm text-gray-800">{f.name}</span>
                        <span className="text-xs text-gray-400">{docs.filter((d) => d.folder_id === f.id && d.active !== false).length}</span>
                        <button onClick={() => { setEditing(f.id); setName(f.name); setGroup(f.group_name || ""); }} className="min-h-[40px] px-2 text-xs text-blue-600">Rename / group</button>
                        <button onClick={() => remove(f)} disabled={busy} className="min-h-[40px] px-2 text-xs text-red-500">Delete</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="border-t px-5 py-3 space-y-2">
          <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Add folder</div>
          <div className="flex flex-wrap gap-2">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Folder name" className={`${input} flex-1 min-w-[160px]`} />
            <input value={newGroup} onChange={(e) => setNewGroup(e.target.value)} list="qspp-folder-groups" placeholder="Group (e.g. Domain 2)" className={`${input} flex-1 min-w-[140px]`} />
            <button onClick={add} disabled={busy || !newName.trim()} className="min-h-[40px] px-4 rounded-lg bg-[#1D4ED8] text-white text-sm font-medium disabled:opacity-40">+ Add</button>
          </div>
        </div>
      </div>
    </div>
  );
}
