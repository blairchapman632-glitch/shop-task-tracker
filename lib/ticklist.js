// Tick-list checklists (tasks.checklist_type 'ticklist', e.g. Pharmacy Claims) — shared by the kiosk sheet
// (components/TicklistSheet.js) and Tasks → Checklists (components/TicklistAdmin.js). Browser client (RLS off).
// Tables: checklist_task_lines (the task's lines, set up in Checklists → Lines), checklist_sheets (kind 'ticklist',
// one per task per month) + checklist_lines (the month's snapshot: item_name, line_note, task_line_id; answer
// 'done' | 'not_required', who + when = entered_by_staff_id / entered_at).
// The sheet completes when every line is answered: a normal completion of the task for the sheet's month (points,
// Activity), and Insights counts the month as done. "Nothing this month" on the card still skips the whole month.
// (A later "reading" type, e.g. fridge temps, could add its own columns to the same tables.)

export const ANSWER_LABEL = { done: "✓ Done", not_required: "— Not required" };
export const answeredCount = (lines) => (lines || []).filter((l) => l.answer).length;
export const ticklistStatusLabel = (sheet, lines) => (sheet.status === "completed"
  ? "Complete" : `In progress — ${answeredCount(lines)} of ${(lines || []).length}`);

// The month's sheet — created (with a snapshot of the task's active lines) if it doesn't exist yet. Two kiosks
// opening it at once: the unique index keeps one, the loser just reloads it. A sheet opened before any lines were
// set up takes the snapshot the next time it's opened.
export async function loadOrCreateTicklistSheet(supabase, { pharmacyId, taskId, periodMonth, staffId }) {
  const find = () => supabase.from("checklist_sheets").select("*").eq("task_id", Number(taskId)).eq("period_month", periodMonth).maybeSingle();
  const loadLines = async (sheetId) => {
    const { data, error } = await supabase.from("checklist_lines").select("*").eq("sheet_id", sheetId).order("sort_order");
    if (error) throw error;
    return data || [];
  };
  let { data: sheet, error } = await find();
  if (error) throw error;
  if (!sheet) {
    const { data: created, error: cErr } = await supabase.from("checklist_sheets").insert([{
      pharmacy_id: pharmacyId, kind: "ticklist", task_id: Number(taskId), period_month: periodMonth,
      status: "in_progress", started_by_staff_id: staffId ? Number(staffId) : null,
    }]).select("*").single();
    if (cErr && cErr.code !== "23505") throw cErr;
    if (cErr) { ({ data: sheet, error } = await find()); if (error) throw error; }
    else sheet = created;
  }
  let lines = await loadLines(sheet.id);
  if (!lines.length && sheet.status === "in_progress") {
    const { data: defs, error: dErr } = await supabase.from("checklist_task_lines").select("*")
      .eq("pharmacy_id", pharmacyId).eq("task_id", Number(taskId)).eq("active", true).order("sort_order");
    if (dErr) throw dErr;
    const rows = (defs || []).map((d, i) => ({
      pharmacy_id: pharmacyId, sheet_id: sheet.id, task_line_id: d.id, sort_order: d.sort_order ?? i,
      item_name: d.name, line_note: d.note || null,
    }));
    if (rows.length) {
      const { error: lErr } = await supabase.from("checklist_lines").insert(rows);
      if (lErr && lErr.code !== "23505") throw lErr; // 23505 = another kiosk took the snapshot first
      lines = await loadLines(sheet.id);
    }
  }
  return { sheet, lines };
}

// Answer a line ('done' | 'not_required'), or clear it (null). Records who + when. -> the saved line
export async function answerLine(supabase, { line, answer, staffId }) {
  const patch = answer
    ? { answer, entered_by_staff_id: staffId ? Number(staffId) : null, entered_at: new Date().toISOString() }
    : { answer: null, entered_by_staff_id: null, entered_at: null };
  const { data, error } = await supabase.from("checklist_lines").update(patch).eq("id", line.id).select("*").single();
  if (error) throw error;
  return data;
}

// After an answer: if every line on the sheet is now answered (checked in the database, so two kiosks can't both
// miss it), complete the sheet and record a normal completion of the task for the sheet's month. Only the screen
// that flips the sheet to completed writes the completion. -> the completed sheet, or null
export async function completeIfAllAnswered(supabase, { pharmacyId, taskId, sheet, staffId }) {
  const { data: lines, error } = await supabase.from("checklist_lines").select("id, answer").eq("sheet_id", sheet.id);
  if (error) throw error;
  if (!lines?.length || lines.some((l) => !l.answer)) return null;
  const nowIso = new Date().toISOString();
  const { data: done, error: sErr } = await supabase.from("checklist_sheets")
    .update({ status: "completed", completed_by_staff_id: Number(staffId), completed_at: nowIso })
    .eq("id", sheet.id).eq("status", "in_progress").select("*");
  if (sErr) throw sErr;
  if (!done?.length) return null; // already completed on another screen
  const { error: cErr } = await supabase.from("completions").insert([{
    task_id: Number(taskId), staff_id: Number(staffId), pharmacy_id: pharmacyId, completed_at: nowIso, period_start: sheet.period_month,
  }]);
  if (cErr) throw cErr;
  return done[0];
}
