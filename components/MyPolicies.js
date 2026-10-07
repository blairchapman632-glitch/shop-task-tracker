// Policies to read on /me (staff side) — READ-ONLY. Staff read and tick policies on the kiosk (Today's Jobs, or
// QSPP Library → Policies to read); opening files on iPhone stalls, so /me only lists them.
// Data comes from pages/api/policies/mine (own requests only, Supabase access token).
// (pages/api/policies/acknowledge still exists but /me no longer calls it.)
import { useEffect, useRef, useState } from "react";
import { callMeApi } from "./MyReview";
import { perthDateOf, fmtDateShort } from "../lib/performanceReview";

const READ_PREVIEW = 5; // "Policies read" shows this many newest first, then "Show all (N)"

// Display only: strip a trailing file extension from a policy title
const displayTitle = (t) => String(t || "").replace(/\.(docx|doc|pdf|xlsx)$/i, "");

// -> { outstanding: [{ id, title, file_url, requested_at }], read: [{ id, title, read_at, read_via }] } or null
export const fetchMyPolicies = async () => {
  try {
    return await callMeApi("/api/policies/mine");
  } catch (err) {
    console.error("[my-policies]", err);
    return null;
  }
};

export const policiesToRead = (data) => data?.outstanding?.length || 0;

// Roster tab banner
export function MyPoliciesBanner({ data, onOpen }) {
  const n = policiesToRead(data);
  if (!n) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full max-w-lg mx-auto mb-4 block text-left rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800"
    >
      📄 You have {n} {n === 1 ? "policy" : "policies"} to read — find {n === 1 ? "it" : "them"} in Today's Jobs on the kiosk.
    </button>
  );
}

// To do tab section (read-only)
export function MyPoliciesSection({ data, focus }) {
  const ref = useRef(null);
  const [showAllRead, setShowAllRead] = useState(false);
  useEffect(() => {
    if (focus && ref.current) ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focus]);

  if (!data || (!data.outstanding?.length && !data.read?.length)) return null;
  return (
    <div
      ref={ref}
      className="bg-white rounded-2xl shadow-sm border p-5 space-y-4 scroll-mt-20"
    >
      <div>
        <div className="text-base font-semibold text-gray-800">Policies</div>
        <div className="text-sm font-semibold text-gray-700 mt-2">To read</div>
        {data.outstanding.length === 0 ? (
          <p className="text-sm text-gray-500 mt-1">✓ You're all caught up.</p>
        ) : (
          <>
            <ul className="mt-1.5 divide-y">
              {data.outstanding.map((p) => (
                <li key={p.id} className="py-1.5 text-sm text-gray-700 break-words">{p.title}</li>
              ))}
            </ul>
            <p className="text-xs text-gray-400 mt-1">Read and tick these on the kiosk — they're in Today's Jobs when you're rostered on.</p>
          </>
        )}
      </div>
      {data.read.length > 0 && (
        <div>
          <div className="text-sm font-semibold text-gray-700">Policies read</div>
          <div className="mt-1.5 divide-y">
            {(showAllRead ? data.read : data.read.slice(0, READ_PREVIEW)).map((p) => (
              <div key={p.id} className="flex items-start justify-between gap-2 py-1.5">
                <span className="text-sm text-gray-700 break-words">{displayTitle(p.title)}</span>
                <span className="text-xs text-gray-400 shrink-0">
                  {fmtDateShort(perthDateOf(p.read_at))}{p.read_via ? ` · ${p.read_via}` : ""}
                </span>
              </div>
            ))}
          </div>
          {data.read.length > READ_PREVIEW && (
            <button
              type="button"
              onClick={() => setShowAllRead((v) => !v)}
              className="mt-1 text-sm font-medium text-blue-600"
            >
              {showAllRead ? "Show less" : `Show all (${data.read.length})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
