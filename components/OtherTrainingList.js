// One person's "other training" (courses, in-house sessions, drills — not S2/S3 hours). Admin → Staff → Training and
// /training. kiosk = { staffId, pin } on /training (PIN-checked file links); omit in Admin (dashboard login).
import { fmtDateShort } from "../lib/performanceReview";
import { kindLabel, openOtherTrainingFile } from "../lib/otherTraining";

export default function OtherTrainingList({ records, kiosk = null, emptyText = "None recorded yet." }) {
  if (records === null) return <p className="text-sm text-gray-400">Loading…</p>;
  if (!records.length) return <p className="text-sm text-gray-400">{emptyText}</p>;
  return (
    <div className="divide-y rounded-lg border border-gray-200">
      {records.map((r) => (
        <div key={r.id} className="px-3 py-2 flex items-start gap-3">
          <span className="text-xs text-gray-500 w-20 shrink-0 pt-0.5">{fmtDateShort(r.training_date)}</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-gray-800 break-words">{r.topic}</div>
            <div className="text-xs text-gray-500">
              {kindLabel(r.kind)}{r.provider ? ` · ${r.provider}` : ""}{r.duration_hours != null ? ` · ${Number(r.duration_hours)} h` : ""}
            </div>
            {r.outcome && <div className="text-xs text-gray-500 mt-0.5 whitespace-pre-line break-words">{r.outcome}</div>}
          </div>
          {r.attachment_path && (
            <button type="button" onClick={() => openOtherTrainingFile(r, kiosk)} className="shrink-0 min-h-[32px] text-xs text-blue-600 hover:underline">📎 File</button>
          )}
        </div>
      ))}
    </div>
  );
}
