// pages/login.js

import { useState } from "react";
import { useRouter } from "next/router";
import supabase from "../lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState("login");
  const [pharmacyName, setPharmacyName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === "signup") {
        const cleanPharmacyName = pharmacyName.trim();
        const cleanFullName = fullName.trim();

        if (!cleanPharmacyName) {
          alert("Please enter your pharmacy name.");
          setLoading(false);
          return;
        }

        if (!cleanFullName) {
          alert("Please enter your name.");
          setLoading(false);
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: cleanFullName,
              pharmacy_name: cleanPharmacyName,
            },
          },
        });

        if (error) throw error;

        const userId = data?.user?.id;

        if (!userId) {
          throw new Error("User account was created but no user id was returned.");
        }

        const slug = cleanPharmacyName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 50);

        let pharmacyId = null;

        const { data: existingPharmacy, error: existingPharmacyError } = await supabase
          .from("pharmacies")
          .select("id")
          .eq("slug", slug || `pharmacy-${Date.now()}`)
          .maybeSingle();

        if (existingPharmacyError) throw existingPharmacyError;

        if (existingPharmacy?.id) {
          pharmacyId = existingPharmacy.id;
        } else {
          const { data: pharmacy, error: pharmacyError } = await supabase
            .from("pharmacies")
            .insert([
              {
                name: cleanPharmacyName,
                slug: slug || `pharmacy-${Date.now()}`,
                owner_user_id: userId,
              },
            ])
            .select("id")
            .single();

          if (pharmacyError) throw pharmacyError;

          pharmacyId = pharmacy.id;
        }

        const { error: profileError } = await supabase
          .from("profiles")
          .update({
            full_name: cleanFullName,
            pharmacy_id: pharmacyId,
            role: "owner",
          })
          .eq("id", userId);

        if (profileError) throw profileError;

        alert("Account created successfully.");
        router.push("/");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;

      router.push("/");
    } catch (err) {
      console.error(err);
      alert(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">
          Pharmacy Login
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          {mode === "login"
            ? "Log in to your pharmacy app"
            : "Create your pharmacy app"}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {mode === "signup" && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Pharmacy name
                </label>
                <input
                  type="text"
                  value={pharmacyName}
                  onChange={(e) => setPharmacyName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder="e.g. Byford Pharmacy"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Your name
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder="e.g. Blair Chapman"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              placeholder="Password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {loading
              ? "Please wait..."
              : mode === "login"
              ? "Log in"
              : "Create account"}
          </button>
        </form>

        <div className="mt-4 text-sm">
          {mode === "login" ? (
            <button
              type="button"
              onClick={() => setMode("signup")}
              className="text-blue-600 hover:underline"
            >
              Need an account? Create your pharmacy app
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setMode("login")}
              className="text-blue-600 hover:underline"
            >
              Already have an account? Log in
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
