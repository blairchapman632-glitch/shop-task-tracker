// Kiosk: a sent staff memo full screen — from the person's own "Read the [title]" job card, or the What's on
// "From the …" line. staffId = the person reading (the job's person / whoever is selected), or null. Loaded through
// /api/memos/read with the kiosk login, so a memo sent only to some people opens only for them. Closing calls
// onClose(); the kiosk page then marks it seen for that person.
// Replies are private: nothing shows until the person taps "💬 Reply" and enters their own PIN — then only their own
// thread (components/memos/MemoExtras KioskReply).
import { useEffect, useState } from "react";
import MemoView from "./MemoView";
import { PdfButton, KioskReply } from "./MemoExtras";
import { readCall } from "../../lib/memosClient";

export default function KioskMemoReader({ memoId, staffId = null, forName, person = null, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    readCall({ action: "get", memo_id: memoId, ...(staffId ? { staff_id: Number(staffId) } : {}) }, true)
      .then((r) => live && setData(r)).catch((err) => live && setError(err.message));
    return () => { live = false; };
  }, [memoId, staffId]);

  return (
    <div className="fixed inset-0 z-50 bg-[#F8FAFC] overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-6 pb-16">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="text-sm text-slate-500">{forName ? <>Reading as <span className="font-semibold text-slate-700">{forName}</span></> : "Staff memo"}</div>
          <div className="flex items-center gap-2">
            {data && <PdfButton memo={data.memo} kioskStaffId={staffId} />}
            <button onClick={onClose} className="min-h-[44px] px-6 rounded-[12px] text-sm font-semibold text-white bg-[#1D4ED8]">Close</button>
          </div>
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p>
          : !data ? <p className="text-sm text-slate-400">Loading…</p>
          : (
            <>
              <MemoView memo={data.memo} sections={data.sections} policies={data.policies} dates={data.dates} updates={data.updates} />
              {!data.memo.imported && <KioskReply memoId={memoId} staffId={staffId} person={person} />}
              <div className="mt-6 flex justify-center">
                <button onClick={onClose} className="min-h-[48px] px-10 rounded-[12px] text-sm font-semibold text-white bg-[#1D4ED8]">Close</button>
              </div>
            </>
          )}
      </div>
    </div>
  );
}
