import { useEffect, useState } from "react";
import supabase from "../lib/supabaseClient";

export default function ResetPage() {
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Supabase fires PASSWORD_RECOVERY when it picks up the recovery token from the URL.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") { setReady(true); setChecking(false); }
    });
    // Fallback: if a session already exists (token already processed), allow reset.
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) setReady(true);
      setChecking(false);
    });
    return () => { sub?.subscription?.unsubscribe?.(); };
  }, []);

  const handleSave = async () => {
    setErr("");
    if (password.length < 6) { setErr("Password must be at least 6 characters."); return; }
    if (password !== confirm) { setErr("Passwords don't match."); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setDone(true);
    setTimeout(() => { window.location.href = "/me?p=byford"; }, 1800);
  };

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50 px-6">
      <div className="bg-white rounded-2xl shadow-sm border p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <img src="/icons/icon-192.png" alt="" className="w-14 h-14 rounded-xl mx-auto mb-3" />
          <h1 className="text-lg font-bold text-gray-800">Set a new password</h1>
        </div>

        {checking ? (
          <p className="text-sm text-gray-400 text-center">Checking your link…</p>
        ) : done ? (
          <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-4 text-center text-sm text-green-700 font-medium">
            ✅ Password updated. Taking you to the app…
          </div>
        ) : !ready ? (
          <div className="text-center text-sm text-gray-600">
            This reset link is invalid or has expired.
            <a href="/me?p=byford" className="block mt-3 text-blue-600 underline text-xs">Back to login</a>
          </div>
        ) : (
          <>
            <label className="block text-xs font-medium text-gray-600 mb-1">New password</label>
            <input
              type="password" autoComplete="new-password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border rounded-lg px-3 py-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="••••••••"
            />
            <label className="block text-xs font-medium text-gray-600 mb-1">Confirm new password</label>
            <input
              type="password" autoComplete="new-password" value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              className="w-full border rounded-lg px-3 py-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="••••••••"
            />
            {err && <p className="text-sm text-red-500 mb-3">{err}</p>}
            <button onClick={handleSave} disabled={busy} className="w-full bg-blue-600 text-white rounded-lg py-2.5 font-medium disabled:opacity-40">
              {busy ? "Saving…" : "Update password"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}