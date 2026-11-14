// /me → To do: staff memo sections I've been asked for (draft memos only; /api/memos/contribute "mine").
//   Not written yet → "Add your section to the …" (counts in the To do badge, like the kiosk job)
//   Written         → "Your section for the …" — can still be opened and changed until the memo is sent (not counted)
// Tapping opens only my section (ContributorSection) full screen.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { contributeCall } from "../../lib/memosClient";

// The editor library is big — only loaded when a section is opened
const ContributorSection = dynamic(() => import("./ContributorSection"), {
  ssr: false,
  loading: () => <p className="text-sm text-slate-400">Loading…</p>,
});

// -> [{ section_id, memo_title, heading, written }] or null
export const fetchMyMemoAsks = async () => {
  try {
    const { asks } = await contributeCall({ action: "mine" });
    return asks || [];
  } catch (err) {
    console.error("[my-memo-asks]", err);
    return null;
  }
};

export const memoAsksToDo = (asks) => (asks || []).filter((a) => !a.written).length;

// openSectionId: from the "… asked you for a section" push (/me?tab=todo&section=<id>) — opened once it's in my asks
export function MyMemoAsksSection({ asks, onChanged, openSectionId, onOpenedFromLink }) {
  const [open, setOpen] = useState(null); // section_id
  useEffect(() => {
    if (!openSectionId || !asks?.some((a) => String(a.section_id) === String(openSectionId))) return;
    setOpen(String(openSectionId));
    onOpenedFromLink?.();
  }, [openSectionId, asks]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!asks?.length) return null;
  const todo = asks.filter((a) => !a.written);
  const done = asks.filter((a) => a.written);
  const row = (a) => (
    <button key={a.section_id} type="button" onClick={() => setOpen(a.section_id)}
      className={`w-full text-left rounded-xl border px-3 py-3 ${a.written ? "border-gray-200 bg-white" : "border-blue-200 bg-blue-50"}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-gray-800">{a.written ? `Your section for the ${a.memo_title}` : `Add your section to the ${a.memo_title}`}</span>
        <span className={`shrink-0 text-xs ${a.written ? "text-green-700" : "text-blue-700 font-semibold"}`}>{a.written ? "Written ✓ · Edit" : "To write"}</span>
      </div>
      {a.note && <p className="text-xs text-amber-800 mt-0.5 truncate">📝 {String(a.note).split("\n").find((l) => l.trim()) || ""}</p>}
      {a.heading && <p className="text-xs text-gray-500 mt-0.5">{a.heading}</p>}
    </button>
  );
  return (
    <div className="bg-white rounded-2xl shadow-sm border p-4">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">📰 Staff memo</div>
      <div className="space-y-2">
        {todo.map(row)}
        {done.map(row)}
      </div>
      {done.length > 0 && <p className="text-[11px] text-gray-400 mt-2">You can change your section until the memo is sent.</p>}

      {/* Full screen, on top of /me (portal, so nothing on the page can sit over it). On an iPhone home-screen app the
          page runs under the status bar: a solid strip the height of the status bar stays at the top, and the section's
          header (title + Close) sticks just below it. */}
      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-50 bg-[#F8FAFC] overflow-y-auto overscroll-contain">
          <div className="sticky top-0 z-20 bg-[#F8FAFC]" style={{ height: "env(safe-area-inset-top, 0px)" }} />
          <div className="max-w-lg mx-auto px-4 pt-2" style={{ paddingBottom: "calc(4rem + env(safe-area-inset-bottom, 0px))" }}>
            <ContributorSection sectionId={open} onClose={(changed) => { setOpen(null); if (changed) onChanged?.(); }} />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
