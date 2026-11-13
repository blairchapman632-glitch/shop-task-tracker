// Shown on a memo section when someone else saved it first (version check in lib/memosServer saveSectionChecked).
// Nothing has been overwritten: "Load their version" shows theirs; "Keep mine" saves this screen's text over theirs.
export default function ConflictBanner({ who, onLoadTheirs, onKeepMine, busy }) {
  return (
    <div className="mb-3 rounded-lg bg-amber-50 border border-amber-300 px-3 py-2.5 text-sm text-amber-900 space-y-2">
      <p><span className="font-semibold">{who} saved this section while you were editing.</span> Your latest changes haven&apos;t been saved yet — nothing has been overwritten.</p>
      <div className="flex flex-wrap gap-2">
        <button onClick={onLoadTheirs} disabled={busy} className="min-h-[40px] px-3 rounded-lg bg-white border border-amber-300 font-medium disabled:opacity-40">Load their version</button>
        <button onClick={onKeepMine} disabled={busy} className="min-h-[40px] px-3 rounded-lg bg-amber-600 text-white font-semibold disabled:opacity-40">Keep mine (replace theirs)</button>
      </div>
    </div>
  );
}
