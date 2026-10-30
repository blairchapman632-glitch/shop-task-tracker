// /qspp "🔒 Manager" — enter the admin PIN (same as Admin) to unlock manager mode. onUnlock({ id, name })
import { useState } from "react";
import supabase from "../../lib/supabaseClient";
import { checkAdminPin } from "../../lib/adminPin";

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";

export default function ManagerPinModal({ onUnlock, onClose }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const submit = async () => {
    if (pin.length !== 4 || checking) return;
    setChecking(true);
    setError("");
    const user = await checkAdminPin(supabase, PHARMACY_ID, pin);
    setChecking(false);
    if (!user) { setError("Incorrect PIN or no admin access."); setPin(""); return; }
    onUnlock(user);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="text-2xl mb-1">🔒</div>
        <h2 className="text-lg font-semibold text-gray-800">Manager mode</h2>
        <p className="text-sm text-gray-500 mb-5">Enter your admin PIN</p>
        <input
          type="text"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="••••"
          autoComplete="off"
          name="qspp_manager_pin"
          data-1p-ignore
          data-lpignore="true"
          style={{ WebkitTextSecurity: "disc", textSecurity: "disc" }}
          className="w-full border border-gray-300 rounded-xl px-4 py-3 text-center text-2xl tracking-widest mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
          autoFocus
        />
        {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 min-h-[44px] rounded-xl border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={submit} disabled={pin.length !== 4 || checking}
            className="flex-1 min-h-[44px] rounded-xl bg-[#1D4ED8] text-white text-sm font-semibold disabled:opacity-40">
            {checking ? "Checking…" : "Unlock"}
          </button>
        </div>
      </div>
    </div>
  );
}
