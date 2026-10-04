// Policies to read on /me (staff side). Staff only see their own requests, via
// pages/api/policies/{mine,acknowledge} with the Supabase access token.
import { useEffect, useRef, useState } from "react";
import { callMeApi } from "./MyReview";
import { perthDateOf, fmtDateShort } from "../lib/performanceReview";

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
      📄 You have {n} {n === 1 ? "policy" : "policies"} to read. <span className="font-semibold underline whitespace-nowrap">Open →</span>
    </button>
  );
}

// Profile tab section
export function MyPoliciesSection({ data, onChanged, focus }) {
  const ref = useRef(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (focus && ref.current) ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focus]);

  if (!data || (!data.outstanding?.length && !data.read?.length)) return null;

  const handleRead = async (p) => {
    setBusyId(p.id);
    setError("");
    try {
      const out = await callMeApi("/api/policies/acknowledge", { id: p.id });
      if (!out) throw new Error("Please log in with your email to record this.");
      onChanged(await fetchMyPolicies());
    } catch (err) {
      setError(err?.message || String(err));
      onChanged(await fetchMyPolicies());
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div ref={ref} className="bg-white rounded-2xl shadow-sm border p-5 space-y-4 scroll-mt-20">
      <div>
        <div className="text-base font-semibold text-gray-800">Policies to read</div>
        {data.outstanding.length === 0 ? (
          <p className="text-sm text-gray-500 mt-1">✓ You're all caught up.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {data.outstanding.map((p) => (
              <div key={p.id} className="rounded-xl border border-gray-200 px-3 py-3 space-y-2">
                <div className="text-sm font-medium text-gray-800 break-words">{p.title}</div>
                <div className="text-xs text-gray-400">Asked {fmtDateShort(perthDateOf(p.requested_at))}</div>
                <div className="flex gap-2">
                  <a href={p.file_url} target="_blank" rel="noopener noreferrer" className="flex-1 text-center border border-gray-300 rounded-lg py-2 text-sm text-gray-700">
                    Open
                  </a>
                  <button type="button" onClick={() => handleRead(p)} disabled={busyId === p.id} className="flex-[2] bg-blue-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-40">
                    {busyId === p.id ? "Saving…" : "I have read and understood"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
      </div>
      {data.read.length > 0 && (
        <div>
          <div className="text-sm font-semibold text-gray-700">Policies read</div>
          <div className="mt-1.5 divide-y">
            {data.read.map((p) => (
              <div key={p.id} className="flex items-start justify-between gap-2 py-1.5">
                <span className="text-sm text-gray-700 break-words">{p.title}</span>
                <span className="text-xs text-gray-400 shrink-0">{fmtDateShort(perthDateOf(p.read_at))}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
