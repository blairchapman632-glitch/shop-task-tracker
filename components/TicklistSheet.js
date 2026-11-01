// Kiosk — a tick-list checklist sheet (e.g. Pharmacy Claims), opened from its monthly task card on Today's Jobs →
// On the List. Each line is "✓ Done" or "— Not required this month"; saves as you go, so lines can be answered by
// different people on different shifts (the card stays until every line is answered). Tapping the chosen answer
// again clears it. When the last line is answered the sheet completes (lib/ticklist.js) — after that answers can
// still be switched while the sheet is open, but not cleared.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import supabase from "../lib/supabaseClient";
import { fmtDateShort, perthDateOf, todayPerth } from "../lib/performanceReview";
import { loadOrCreateTicklistSheet, answerLine, completeIfAllAnswered, answeredCount } from "../lib/ticklist";

const monthName = (ym) => new Date(`${ym}-01T00:00:00`).toLocaleDateString("en-AU", { month: "long", year: "numeric" });

export default function TicklistSheet({ task, periodMonth, staffId, staffName, nameOf, pharmacyId, onClose, onCompleted }) {
  const [sheet, setSheet] = useState(null);
  const [lines, setLines] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(new Set()); // line ids saving
  const [justCompleted, setJustCompleted] = useState(false); // completed on this screen — closing tells the kiosk

  const locked = sheet?.status === "completed";
  const canEdit = !!staffId;
  const carried = String(periodMonth).slice(0, 7) !== todayPerth().slice(0, 7);

  useEffect(() => {
    let cancelled = false;
    loadOrCreateTicklistSheet(supabase, { pharmacyId, taskId: task.id, periodMonth, staffId })
      .then(({ sheet: s, lines: l }) => { if (!cancelled) { setSheet(s); setLines(l); } })
      .catch((err) => { if (!cancelled) setError(err?.message || String(err)); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id, periodMonth]);

  const setBusyId = (id, on) => setBusy((b) => { const n = new Set(b); if (on) n.add(id); else n.delete(id); return n; });

  const choose = async (line, answer) => {
    if (!canEdit || busy.has(line.id)) return;
    const next = line.answer === answer ? null : answer; // tap the chosen one again = clear
    if (!next && locked) return; // a completed sheet can be switched, not cleared
    setBusyId(line.id, true);
    setError("");
    try {
      const saved = await answerLine(supabase, { line, answer: next, staffId });
      setLines((ls) => ls.map((l) => (l.id === saved.id ? saved : l)));
      if (next && !locked) {
        const done = await completeIfAllAnswered(supabase, { pharmacyId, taskId: task.id, sheet, staffId });
        if (done) { setSheet(done); setJustCompleted(true); }
        else if (lines.every((l) => l.id === line.id || l.answer)) {
          // Every line looked answered here but the sheet didn't complete: another screen finished or changed it
          const { data } = await supabase.from("checklist_sheets").select("*").eq("id", sheet.id).maybeSingle();
          if (data) setSheet(data);
        }
      }
    } catch (err) {
      setError("Couldn't save: " + (err?.message || String(err)));
    } finally {
      setBusyId(line.id, false);
    }
  };

  const close = () => (justCompleted ? onCompleted() : onClose());
  const answered = answeredCount(lines);

  return createPortal(
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={close} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[92vh]" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
            <div>
              <h2 className="font-semibold text-gray-800">☑️ {task.title} — {monthName(String(periodMonth).slice(0, 7))}</h2>
              <div className="text-xs text-gray-500 mt-0.5">
                {locked
                  ? `Completed by ${nameOf(sheet.completed_by_staff_id) || "—"} · ${fmtDateShort(perthDateOf(sheet.completed_at))}`
                  : `${answered} of ${lines.length} answered${carried ? " · carried over from last month" : ""} · saves as you go`}
              </div>
            </div>
            <button onClick={close} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
          </div>

          <div className="px-5 py-4 overflow-y-auto space-y-3">
            {!staffId && (
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Tap your photo on the home screen first, then open the checklist.</div>
            )}
            {staffId && !locked && <div className="text-xs text-blue-800 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">Filling in as <span className="font-semibold">{staffName}</span></div>}
            {locked && (
              <div className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                ✓ All lines answered — checklist complete.{justCompleted ? " You can still switch an answer before closing." : ""}
              </div>
            )}
            {error && <p className="text-sm text-red-500">{error}</p>}
            {!sheet && !error && <p className="text-sm text-gray-400">Loading…</p>}
            {sheet && lines.length === 0 && (
              <p className="text-sm text-gray-500">No lines set up for this checklist yet — a manager can add them in Tasks → Checklists.</p>
            )}

            {sheet && lines.map((l) => (
              <div key={l.id} className={`rounded-lg border px-3 py-2.5 ${l.answer === "done" ? "border-green-200 bg-green-50/40" : l.answer === "not_required" ? "border-gray-200 bg-gray-50" : "border-gray-200 bg-white"}`}>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800">{l.item_name}</div>
                    {l.line_note && <div className="text-[11px] text-gray-500 whitespace-pre-line">{l.line_note}</div>}
                    {l.answer && (
                      <div className={`text-[11px] mt-0.5 ${l.answer === "done" ? "text-green-700" : "text-gray-500"}`}>
                        {l.answer === "done" ? "Done" : "Not required"} · {nameOf(l.entered_by_staff_id) || "—"} · {fmtDateShort(perthDateOf(l.entered_at))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={!canEdit || busy.has(l.id)}
                      onClick={() => choose(l, "done")}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium disabled:opacity-60 ${l.answer === "done" ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-700 border-gray-300"}`}
                    >
                      ✓ Done
                    </button>
                    <button
                      type="button"
                      disabled={!canEdit || busy.has(l.id)}
                      onClick={() => choose(l, "not_required")}
                      className={`px-3 py-2 rounded-lg border text-sm disabled:opacity-60 ${l.answer === "not_required" ? "bg-gray-600 text-white border-gray-600" : "bg-white text-gray-600 border-gray-300"}`}
                    >
                      — Not required this month
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="px-5 py-3 border-t shrink-0">
            <button onClick={close} className="w-full border border-gray-300 rounded-lg py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
              {locked ? "Close" : "Close — finish later"}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
