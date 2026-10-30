// Policies to read on /me (staff side): Open (the staff PDF only — never the master) + "I have read and understood",
// same rules as the kiosk (no PDF yet = "Not available yet", tick greyed out; opening first isn't required).
// Data: pages/api/policies/mine; tick: pages/api/policies/acknowledge (own requests only, Supabase access token).
// Open is a plain link to the PDF in a new tab — on iPhone home-screen apps that opens Safari's viewer with "Done" back to
// the app; Android opens a Chrome tab. (No blob / iframe: those stall or show blank on iOS.)
import { useEffect, useRef, useState } from "react";
import { callMeApi } from "./MyReview";
import { perthDateOf, fmtDateShort } from "../lib/performanceReview";

const READ_PREVIEW = 5; // "Policies read" shows this many newest first, then "Show all (N)"

// Display only: strip a trailing file extension from a policy title
const displayTitle = (t) => String(t || "").replace(/\.(docx|doc|pdf|xlsx)$/i, "");

// -> { outstanding: [{ id, title, pdf_url, requested_at }], read: [{ id, title, read_at, read_via }] } or null
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
      📄 You have {n} {n === 1 ? "policy" : "policies"} to read — tap to read {n === 1 ? "it" : "them"}.
    </button>
  );
}

// To do tab section. onChanged() reloads the list after a tick.
export function MyPoliciesSection({ data, focus, onChanged }) {
  const ref = useRef(null);
  const [showAllRead, setShowAllRead] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  const acknowledge = async (p) => {
    setBusyId(p.id);
    setError("");
    try {
      await callMeApi("/api/policies/acknowledge", { id: p.id });
    } catch (err) {
      // e.g. already ticked on the kiosk — the reload below clears it either way
      setError(err?.message || String(err));
    }
    await onChanged?.();
    setBusyId(null);
  };
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
          <div className="mt-2 space-y-2">
            {data.outstanding.map((p) => (
              <div key={p.id} className="rounded-xl border border-gray-200 px-3.5 py-3 space-y-2">
                <div className="text-sm font-medium text-gray-800 break-words">{displayTitle(p.title)}</div>
                <div className="flex gap-2">
                  {p.pdf_url ? (
                    <a href={p.pdf_url} target="_blank" rel="noopener noreferrer"
                      className="flex-1 text-center border border-gray-300 rounded-lg py-2.5 text-sm text-gray-700 active:bg-gray-50">
                      Open
                    </a>
                  ) : (
                    <span className="flex-1 text-center border border-gray-200 rounded-lg py-2.5 text-sm text-gray-400 bg-gray-50">Not available yet</span>
                  )}
                  <button type="button" onClick={() => acknowledge(p)} disabled={!!busyId || !p.pdf_url}
                    className="flex-[2] bg-blue-600 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-40">
                    {busyId === p.id ? "Saving…" : "I have read and understood"}
                  </button>
                </div>
              </div>
            ))}
            {error && <p className="text-sm text-red-500">{error}</p>}
            <p className="text-xs text-gray-400">Open shows the policy. On iPhone, tap Done (top left) to come back here.</p>
          </div>
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
