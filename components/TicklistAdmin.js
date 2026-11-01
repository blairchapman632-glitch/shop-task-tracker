// Tasks → Checklists → [tick-list checklist]: Lines (set up the jobs) and History (by month, printable).
// Lines are snapshotted onto each month's sheet (lib/ticklist.js), so edits here only apply to new months.
import { useEffect, useState } from "react";
import supabase from "../lib/supabaseClient";
import { fmtDateShort, perthDateOf } from "../lib/performanceReview";
import { ticklistStatusLabel } from "../lib/ticklist";
import { fetchAllRows } from "../lib/trainingPlan";

const inputCls = "w-full rounded border border-gray-300 px-2 py-1.5 text-sm";
const monthName = (d) => new Date(`${String(d).slice(0, 7)}-01T00:00:00`).toLocaleDateString("en-AU", { month: "long", year: "numeric" });
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const statusStyle = (sheet) => (sheet.status === "completed" ? "bg-green-50 text-green-700 border-green-200" : "bg-amber-50 text-amber-700 border-amber-200");

export default function TicklistAdmin({ pharmacyId, task, nameOf, initialSheetId }) {
  const [view, setView] = useState(initialSheetId ? "history" : "lines");
  return (
    <div className="space-y-4">
      <div className="flex gap-1">
        {[{ k: "lines", l: "Lines" }, { k: "history", l: "History" }].map((t) => (
          <button key={t.k} onClick={() => setView(t.k)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${view === t.k ? "bg-gray-800 text-white" : "bg-white border text-gray-600 hover:bg-gray-50"}`}>
            {t.l}
          </button>
        ))}
      </div>
      {view === "lines" && <Lines pharmacyId={pharmacyId} taskId={task.id} />}
      {view === "history" && <History pharmacyId={pharmacyId} task={task} nameOf={nameOf} initialSheetId={initialSheetId} />}
    </div>
  );
}

// ─── Lines ───────────────────────────────────────────────────────────────────
function Lines({ pharmacyId, taskId }) {
  const [lines, setLines] = useState(null);
  const [used, setUsed] = useState(new Set()); // on a month's sheet at least once (can only be made inactive)
  const [error, setError] = useState("");
  const blank = { name: "", note: "", active: true };
  const [editing, setEditing] = useState(null); // line id | "new"
  const [form, setForm] = useState(blank);

  const load = async () => {
    const { data, error: err } = await supabase.from("checklist_task_lines").select("*")
      .eq("pharmacy_id", pharmacyId).eq("task_id", Number(taskId)).order("sort_order");
    setError(err ? err.message : "");
    const ids = (data || []).map((l) => l.id);
    const usedRows = ids.length
      ? await fetchAllRows(() => supabase.from("checklist_lines").select("task_line_id").in("task_line_id", ids).order("id")).catch(() => [])
      : [];
    setUsed(new Set(usedRows.map((r) => String(r.task_line_id))));
    setLines(data || []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [pharmacyId, taskId]);

  const startEdit = (l) => { setEditing(l ? l.id : "new"); setForm(l ? { ...blank, ...l, note: l.note || "" } : blank); };
  const save = async () => {
    if (!form.name.trim()) { alert("Enter the line name."); return; }
    const row = { name: form.name.trim(), note: form.note?.trim() || null, active: form.active !== false };
    const { error: err } = editing === "new"
      ? await supabase.from("checklist_task_lines").insert([{ ...row, pharmacy_id: pharmacyId, task_id: Number(taskId), sort_order: (lines.length + 1) * 10 }])
      : await supabase.from("checklist_task_lines").update(row).eq("id", editing);
    if (err) { alert("Couldn't save: " + err.message); return; }
    setEditing(null);
    load();
  };
  const move = async (index, dir) => {
    const j = index + dir;
    if (j < 0 || j >= lines.length) return;
    const order = [...lines];
    [order[index], order[j]] = [order[j], order[index]];
    await Promise.all(order.map((row, i) => supabase.from("checklist_task_lines").update({ sort_order: (i + 1) * 10 }).eq("id", row.id)));
    load();
  };
  const remove = async (l) => {
    if (!window.confirm(`Delete "${l.name}"? This can't be undone.`)) return;
    const { error: err } = await supabase.from("checklist_task_lines").delete().eq("id", l.id);
    if (err) { alert("Couldn't delete the line: " + err.message); return; }
    load();
  };

  const formRow = (
    <div className="px-4 py-3 bg-blue-50 border-t space-y-2">
      <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Line, e.g. DAA Claim" className={inputCls} autoFocus />
      <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} placeholder="Note / instructions (optional) — shown under the line on the kiosk" className={inputCls} />
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-sm text-gray-700">
          <input type="checkbox" checked={form.active !== false} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active
        </label>
        <div className="flex gap-2">
          <button onClick={() => setEditing(null)} className="px-3 py-1.5 text-xs border rounded bg-white">Cancel</button>
          <button onClick={save} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded">Save</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-gray-700">Lines</div>
          <div className="text-xs text-gray-400">Shown on the kiosk in this order — each is ticked Done or Not required this month. Changes apply to new months; past months keep what they had.</div>
        </div>
        <button onClick={() => startEdit(null)} className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg shrink-0">+ Line</button>
      </div>
      {error && <p className="px-4 py-2 text-sm text-red-500">{error}</p>}
      {editing === "new" && formRow}
      {lines === null ? <div className="px-4 py-4 text-sm text-gray-400">Loading…</div>
        : lines.length === 0 && editing !== "new" ? <div className="px-4 py-6 text-sm text-gray-400 text-center">No lines yet — add the first one.</div>
        : lines.map((l, i) => (
          <div key={l.id}>
            <div className={`px-4 py-2 border-t flex items-center gap-3 ${l.active === false ? "opacity-50" : ""}`}>
              <div className="flex flex-col">
                <button onClick={() => move(i, -1)} className="text-xs text-gray-400 hover:text-gray-700">▲</button>
                <button onClick={() => move(i, 1)} className="text-xs text-gray-400 hover:text-gray-700">▼</button>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800">{l.name}{l.active === false && <span className="ml-2 text-[10px] text-gray-500">Inactive</span>}</div>
                {l.note && <div className="text-xs text-gray-400 whitespace-pre-line">{l.note}</div>}
              </div>
              <button onClick={() => startEdit(l)} className="px-2 py-1 text-xs border border-blue-200 text-blue-600 rounded">Edit</button>
              {!used.has(String(l.id)) ? (
                <button onClick={() => remove(l)} className="px-2 py-1 text-xs border border-red-200 text-red-600 rounded">Delete</button>
              ) : (
                <span className="text-[10px] text-gray-400 w-16 text-center" title="Used on a month's checklist — make it inactive instead">in use</span>
              )}
            </div>
            {editing === l.id && formRow}
          </div>
        ))}
    </div>
  );
}

// ─── History ─────────────────────────────────────────────────────────────────
function History({ pharmacyId, task, nameOf, initialSheetId }) {
  const [sheets, setSheets] = useState(null);
  const [sheetLines, setSheetLines] = useState([]);
  const [openId, setOpenId] = useState(initialSheetId || null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("checklist_sheets").select("*").eq("pharmacy_id", pharmacyId).eq("task_id", Number(task.id))
        .order("period_month", { ascending: false });
      const ids = (data || []).map((s) => s.id);
      const lines = ids.length
        ? await fetchAllRows(() => supabase.from("checklist_lines").select("id, sheet_id, answer").in("sheet_id", ids).order("id")).catch(() => [])
        : [];
      setSheetLines(lines);
      setSheets(data || []);
    })();
  }, [pharmacyId, task.id, openId]);

  if (openId) return <SheetView sheetId={openId} task={task} nameOf={nameOf} onBack={() => setOpenId(null)} />;

  return (
    <div className="bg-white rounded-xl border overflow-hidden max-w-2xl">
      <div className="px-4 py-3 border-b text-sm font-semibold text-gray-700">By month</div>
      {sheets === null ? <div className="px-4 py-4 text-sm text-gray-400">Loading…</div>
        : sheets.length === 0 ? <div className="px-4 py-4 text-sm text-gray-400">No months yet — a month's sheet starts when someone opens the card on the kiosk.</div>
        : sheets.map((s) => (
          <button key={s.id} onClick={() => setOpenId(s.id)} className="w-full text-left px-4 py-2 border-t hover:bg-gray-50 flex items-center justify-between">
            <span className="text-sm text-gray-800">{monthName(s.period_month)}</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full border ${statusStyle(s)}`}>
              {ticklistStatusLabel(s, sheetLines.filter((l) => l.sheet_id === s.id))}
              {s.status === "completed" && ` · ${fmtDateShort(perthDateOf(s.completed_at))} · ${nameOf(s.completed_by_staff_id) || "—"}`}
            </span>
          </button>
        ))}
    </div>
  );
}

// One month's sheet, read-only. Printable.
function SheetView({ sheetId, task, nameOf, onBack }) {
  const [sheet, setSheet] = useState(null);
  const [lines, setLines] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      supabase.from("checklist_sheets").select("*").eq("id", sheetId).maybeSingle(),
      supabase.from("checklist_lines").select("*").eq("sheet_id", sheetId).order("sort_order"),
    ]).then(([{ data: s, error: e1 }, { data: l, error: e2 }]) => {
      setError(e1 || e2 ? (e1 || e2).message : !s ? "Sheet not found" : "");
      setSheet(s || null);
      setLines(l || []);
    });
  }, [sheetId]);

  const answerText = (l) => (l.answer === "done" ? "✓ Done" : l.answer === "not_required" ? "— Not required" : "");
  const subtitle = () => (sheet.completed_at
    ? `Completed ${fmtDateShort(perthDateOf(sheet.completed_at))} by ${nameOf(sheet.completed_by_staff_id) || "—"}`
    : ticklistStatusLabel(sheet, lines));

  const print = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    const rows = lines.map((l) => `<tr><td>${esc(l.item_name)}${l.line_note ? `<div class="note">${esc(l.line_note)}</div>` : ""}</td><td>${esc(answerText(l))}</td><td>${esc(l.answer ? nameOf(l.entered_by_staff_id) || "—" : "")}</td><td>${esc(l.answer ? fmtDateShort(perthDateOf(l.entered_at)) : "")}</td></tr>`).join("");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(task.title)} — ${esc(monthName(sheet.period_month))}</title>
      <style>body{font:12px system-ui,sans-serif;margin:24px;color:#111}h1{font-size:18px;margin:0 0 4px}p{margin:0 0 12px;color:#555}
      table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:5px 7px;text-align:left;vertical-align:top}th{background:#f3f4f6}.note{font-size:10px;color:#666}</style>
      </head><body><h1>${esc(task.title)} — ${esc(monthName(sheet.period_month))}</h1><p>${esc(subtitle())}</p>
      <table><thead><tr><th>Line</th><th>Answer</th><th>By</th><th>Date</th></tr></thead><tbody>${rows}</tbody></table>
      <script>window.onload=function(){window.print()}</script></body></html>`);
    w.document.close();
  };

  if (error) return <div className="bg-white rounded-xl border p-4 text-sm text-red-500">{error} <button onClick={onBack} className="ml-2 text-blue-600">Back</button></div>;
  if (!sheet) return <div className="text-sm text-gray-400 py-8 text-center">Loading…</div>;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-sm text-blue-600">‹ History</button>
        <button onClick={print} className="px-3 py-1.5 text-xs border rounded-lg bg-white hover:bg-gray-50">🖨 Print</button>
      </div>
      <div className="bg-white rounded-xl border p-4">
        <div className="text-base font-semibold text-gray-800">{task.title} — {monthName(sheet.period_month)}</div>
        <div className="text-xs text-gray-500 mt-0.5">{subtitle()}</div>
      </div>
      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b">
            <tr>{["Line", "Answer", "By", "Date"].map((h) => <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500">{h}</th>)}</tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="px-3 py-1.5 text-gray-800">{l.item_name}{l.line_note && <div className="text-[10px] text-gray-400">{l.line_note}</div>}</td>
                <td className={`px-3 py-1.5 ${l.answer === "done" ? "text-green-700 font-medium" : "text-gray-500"}`}>{answerText(l)}</td>
                <td className="px-3 py-1.5 text-gray-600">{l.answer ? nameOf(l.entered_by_staff_id) || "—" : ""}</td>
                <td className="px-3 py-1.5 text-gray-600">{l.answer ? fmtDateShort(perthDateOf(l.entered_at)) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
