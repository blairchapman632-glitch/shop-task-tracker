// /qspp → Training overview (manager mode) → "Other training": courses, in-house sessions and drills (not S2/S3 hours).
// List newest first; filters by topic, kind and date range; search; + Add training (a group session = one record, many
// attendees); edit / delete; ↓ Export PDF (lib/registerPdf); "Training topics" (the manager-editable list).
import { useEffect, useState } from "react";
import supabase from "../../lib/supabaseClient";
import { fmtDateShort, todayPerth } from "../../lib/performanceReview";
import { buildRegisterPdf, downloadPdf } from "../../lib/registerPdf";
import { KINDS, kindLabel, OTHER_TOPIC, loadTopics, loadOtherTraining, openOtherTrainingFile } from "../../lib/otherTraining";
import OtherTrainingForm from "../OtherTrainingForm";

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";

export default function OtherTrainingAdmin({ manager }) {
  const [records, setRecords] = useState(null);
  const [topics, setTopics] = useState([]);       // active (for the form)
  const [allTopics, setAllTopics] = useState([]); // incl. inactive (topics editor)
  const [staffList, setStaffList] = useState([]);
  const [topicFilter, setTopicFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null); // record | "new"
  const [showTopics, setShowTopics] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  const loadAll = async () => {
    try {
      const [recs, all, staff] = await Promise.all([
        loadOtherTraining(supabase, PHARMACY_ID),
        loadTopics(supabase, PHARMACY_ID, { includeInactive: true }),
        supabase.from("staff").select("id, name, active").eq("pharmacy_id", PHARMACY_ID).or("role.is.null,role.neq.Locum").order("name"),
      ]);
      setRecords(recs);
      setAllTopics(all);
      setTopics(all.filter((t) => t.active !== false));
      setStaffList(staff.data || []);
    } catch (err) {
      setError(err?.message || String(err));
      setRecords([]);
    }
  };
  useEffect(() => { loadAll(); }, []);

  const staffName = (id) => staffList.find((s) => Number(s.id) === Number(id))?.name || "";
  const attendeeNames = (r) => (r.attendee_ids || []).map(staffName).filter(Boolean);
  const term = search.trim().toLowerCase();
  const list = (records || [])
    .filter((r) => !topicFilter || r.topic === topicFilter)
    .filter((r) => !kindFilter || r.kind === kindFilter)
    .filter((r) => (!from || r.training_date >= from) && (!to || r.training_date <= to))
    .filter((r) => !term || [r.topic, r.provider, r.outcome, ...attendeeNames(r)].some((v) => String(v || "").toLowerCase().includes(term)));
  const topicNames = [...new Set([...topics.map((t) => t.name).filter((n) => n !== OTHER_TOPIC), ...(records || []).map((r) => r.topic)])].sort();

  const exportPdf = async () => {
    setExporting(true);
    try {
      const { data: ps } = await supabase.from("pharmacy_settings").select("name").eq("pharmacy_id", PHARMACY_ID).maybeSingle();
      const filterLabel = [topicFilter || "All topics", kindFilter ? kindLabel(kindFilter) : "",
        from || to ? `${from ? fmtDateShort(from) : "…"} – ${to ? fmtDateShort(to) : "…"}` : "", term ? `search "${search.trim()}"` : ""].filter(Boolean).join(", ");
      const { bytes, warnings } = await buildRegisterPdf({
        heading: "Other Training Register", pharmacyName: ps?.name || "", generatedOn: todayPerth(), generatedBy: manager?.name || "",
        filterLabel, itemWord: "record",
        columns: [
          { key: "date", label: "Date", w: 62 },
          { key: "topic", label: "Topic", w: 140 },
          { key: "kind", label: "Kind", w: 72 },
          { key: "provider", label: "Provider / presenter", w: 100 },
          { key: "hours", label: "Hours", w: 40 },
          { key: "attendees", label: "Attendees", w: 160 },
          { key: "outcome", label: "Outcome / notes", w: 195 },
        ],
        rows: list.map((r) => ({
          date: fmtDateShort(r.training_date), topic: r.topic, kind: kindLabel(r.kind), provider: r.provider || "",
          hours: r.duration_hours != null ? String(Number(r.duration_hours)) : "", attendees: attendeeNames(r).join(", "), outcome: r.outcome || "",
        })),
      });
      downloadPdf(bytes, `other_training_${todayPerth()}.pdf`);
      if (warnings.length) alert(warnings.join("\n"));
    } catch (err) {
      alert("Couldn't create the PDF: " + (err?.message || String(err)));
    } finally {
      setExporting(false);
    }
  };

  const select = "min-h-[40px] border border-[#E5E7EB] rounded-[10px] px-2.5 text-sm bg-white";
  return (
    <div className="bg-white rounded-[14px] border border-[#E5E7EB] p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-base font-semibold text-slate-800">Other training</div>
          <div className="text-xs text-[#475569]">Courses, in-house sessions and drills — not counted towards S2/S3 hours.</div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowTopics(true)} className="min-h-[40px] px-3 rounded-[10px] text-sm bg-white border border-[#E5E7EB] text-slate-700 hover:bg-slate-50">Training topics</button>
          <button onClick={() => setEditing("new")} className="min-h-[40px] px-3 rounded-[10px] text-sm font-semibold bg-[#1D4ED8] text-white">+ Add training</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)} className={select}>
          <option value="">All topics</option>
          {topicNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} className={select}>
          <option value="">All kinds</option>
          {KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={select} title="From" />
        <span className="text-xs text-slate-400">to</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={select} title="To" />
        {(topicFilter || kindFilter || from || to) && (
          <button onClick={() => { setTopicFilter(""); setKindFilter(""); setFrom(""); setTo(""); }} className="text-xs text-slate-500 px-1">Clear</button>
        )}
      </div>
      <div className="flex gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search topic, provider, notes, attendee…"
          className="flex-1 min-h-[44px] border border-[#E5E7EB] rounded-[12px] px-4 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#BFDBFE]" />
        <button onClick={exportPdf} disabled={exporting}
          className="min-h-[44px] px-4 rounded-[12px] text-sm font-medium bg-white border border-[#E5E7EB] text-slate-700 hover:bg-slate-50 disabled:opacity-40 shrink-0">
          {exporting ? "Creating…" : "↓ Export PDF"}
        </button>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}

      {records === null ? <p className="text-sm text-slate-400">Loading…</p>
        : list.length === 0 ? <p className="text-sm text-slate-400 py-6 text-center">{records.length ? "Nothing matches." : "No other training recorded yet."}</p>
        : (
          <div className="divide-y divide-[#F1F5F9] rounded-[12px] border border-[#E5E7EB]">
            {list.map((r) => (
              <div key={r.id} className="flex items-start gap-3 px-3 py-2.5">
                <button onClick={() => setEditing(r)} className="flex-1 min-w-0 text-left">
                  <div className="text-sm font-medium text-slate-800">{r.topic}</div>
                  <div className="text-xs text-[#475569]">
                    {fmtDateShort(r.training_date)} · {kindLabel(r.kind)}{r.provider ? ` · ${r.provider}` : ""}{r.duration_hours != null ? ` · ${Number(r.duration_hours)} h` : ""}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">{attendeeNames(r).length} attendee{attendeeNames(r).length === 1 ? "" : "s"}: {attendeeNames(r).join(", ") || "—"}</div>
                </button>
                {r.attachment_path && <button onClick={() => openOtherTrainingFile(r)} className="shrink-0 min-h-[32px] text-xs text-[#1D4ED8] hover:underline">📎 File</button>}
              </div>
            ))}
          </div>
        )}

      {editing && (
        <OtherTrainingForm
          mode="manager"
          record={editing === "new" ? null : editing}
          topics={topics}
          staffList={staffList}
          pharmacyId={PHARMACY_ID}
          onClose={() => setEditing(null)}
          onSaved={(saved, opts) => {
            setRecords((prev) => {
              const rest = (prev || []).filter((x) => x.id !== saved.id);
              return [saved, ...rest].sort((a, b) => String(b.training_date).localeCompare(String(a.training_date)));
            });
            if (!opts?.keepOpen) setEditing(null);
          }}
          onDeleted={(id) => { setRecords((prev) => (prev || []).filter((x) => x.id !== id)); setEditing(null); }}
        />
      )}
      {showTopics && <TopicsModal topics={allTopics} onClose={() => setShowTopics(false)} onChanged={(t) => { setAllTopics(t); setTopics(t.filter((x) => x.active !== false)); }} />}
    </div>
  );
}

// Training topics (config, not code): add, rename, reorder, hide. "Other" always stays (free text).
function TopicsModal({ topics, onClose, onChanged }) {
  const [list, setList] = useState(topics);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const commit = (next) => { setList(next); onChanged(next); };

  const update = async (t, patch) => {
    setError("");
    const { error: err } = await supabase.from("training_topics").update(patch).eq("id", t.id);
    if (err) { setError(err.message); return; }
    commit(list.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
  };
  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    const maxSort = list.filter((x) => x.name !== OTHER_TOPIC).reduce((m, x) => Math.max(m, x.sort_order || 0), 0);
    const { data, error: err } = await supabase.from("training_topics")
      .insert([{ pharmacy_id: PHARMACY_ID, name, sort_order: maxSort + 10 }]).select("*").single();
    if (err) { setError(err.message); return; }
    setNewName("");
    commit([...list, data].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));
  };
  const move = async (i, dir) => {
    const order = list.filter((x) => x.name !== OTHER_TOPIC);
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    const renumbered = order.map((x, k) => ({ ...x, sort_order: (k + 1) * 10 }));
    await Promise.all(renumbered.map((x) => supabase.from("training_topics").update({ sort_order: x.sort_order }).eq("id", x.id)));
    commit([...renumbered, ...list.filter((x) => x.name === OTHER_TOPIC)]);
  };

  const ordered = list.filter((x) => x.name !== OTHER_TOPIC);
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-[14px] w-full max-w-md max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-slate-800">Training topics</h2>
          <button onClick={onClose} className="w-10 h-10 text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          <p className="text-xs text-slate-500">Shown in the topic list when adding training. Renaming doesn't change past records. "Other" (type your own) is always available.</p>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {ordered.map((t, i) => (
              <div key={t.id} className={`flex items-center gap-2 px-2 py-1.5 ${t.active === false ? "opacity-50" : ""}`}>
                <div className="flex flex-col">
                  <button onClick={() => move(i, -1)} className="text-[10px] text-slate-400 hover:text-slate-700 leading-none px-1">▲</button>
                  <button onClick={() => move(i, 1)} className="text-[10px] text-slate-400 hover:text-slate-700 leading-none px-1">▼</button>
                </div>
                <input defaultValue={t.name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== t.name) update(t, { name: v }); else e.target.value = t.name; }}
                  className="flex-1 min-h-[36px] text-sm px-2 rounded border border-transparent focus:border-slate-300 focus:outline-none" />
                <button onClick={() => update(t, { active: t.active === false })} className="text-xs text-slate-500 px-1 min-h-[36px]">{t.active === false ? "Show" : "Hide"}</button>
              </div>
            ))}
          </div>
        </div>
        <div className="border-t px-5 py-3 flex gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="New topic"
            className="flex-1 min-h-[40px] border border-slate-200 rounded-lg px-3 text-sm" />
          <button onClick={add} disabled={!newName.trim()} className="min-h-[40px] px-4 rounded-lg text-sm font-semibold bg-[#1D4ED8] text-white disabled:opacity-40">+ Add</button>
        </div>
      </div>
    </div>
  );
}
