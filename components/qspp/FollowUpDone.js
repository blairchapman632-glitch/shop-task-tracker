// QSPP → incident / feedback: the assigned follow-up.
//   Not done yet: "Follow-up assigned to <name>" + a short note (required) + that person's own PIN + "Follow-up done"
//   (/api/qspp/register action follow-up-done — the server checks the PIN belongs to the assigned person).
//   Done: "Follow-up done by <name>, <date>" and the note — locked.
// readOnly: just show who it's assigned to / the done note (manager editor, resolved entries).
import { useState } from "react";
import { qsppCall } from "../../lib/qsppClient";
import { perthDateOf } from "../../lib/performanceReview";

const PIN_STYLE = { WebkitTextSecurity: "disc" };

export default function FollowUpDone({ kind, row, staffName, onDone, readOnly = false }) {
  const [note, setNote] = useState("");
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  if (!row.assigned_to_staff_id) return null;
  const who = staffName(row.assigned_to_staff_id) || "the person assigned";
  const open = kind === "incident" ? !row.date_resolved : !row.closed_date;

  if (row.follow_up_done_at) {
    return (
      <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2.5">
        <div className="text-xs font-semibold text-green-800">
          ✓ Follow-up done by {staffName(row.follow_up_done_by_staff_id) || who}, {String(perthDateOf(row.follow_up_done_at)).split("-").reverse().join("/")}
        </div>
        <div className="text-sm text-green-900 whitespace-pre-line mt-0.5">{row.follow_up_done_note}</div>
      </div>
    );
  }
  if (readOnly || !open) {
    return <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700"><span className="text-xs font-semibold text-slate-500">Follow-up assigned to </span>{who}<span className="text-xs text-slate-400"> — not done yet</span></div>;
  }

  const done = async () => {
    if (!note.trim()) { setError("Add a short note saying what was done."); return; }
    if (!/^\d{4}$/.test(pin)) { setError(`${who.split(" ")[0]}: enter your 4-digit PIN.`); return; }
    setSaving(true);
    setError("");
    try {
      const { row: updated } = await qsppCall({ action: "follow-up-done", kind, id: row.id, note: note.trim(), pin });
      onDone(updated);
    } catch (err) {
      setError(err.message);
      setPin("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 space-y-2">
      <div className="text-sm text-amber-900"><span className="font-semibold">Follow-up assigned to {who}</span></div>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} placeholder="What was done (required)"
        className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm bg-white" />
      <div className="flex gap-2">
        <input type="text" inputMode="numeric" autoComplete="off" maxLength={4} value={pin} placeholder={`${who.split(" ")[0]}'s PIN`}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} style={PIN_STYLE}
          className="w-32 border border-amber-200 rounded-lg px-3 py-2 text-sm bg-white tracking-widest" />
        <button type="button" onClick={done} disabled={saving}
          className="flex-1 min-h-[40px] rounded-lg text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-40">
          {saving ? "Saving…" : "Follow-up done"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
