// Login check for Admin API routes. SERVER-SIDE ONLY.
// The browser sends the dashboard login's Supabase access token (lib/adminFetch.js). The token must be a real
// login whose profiles row has a pharmacy (staff /me logins have none), and every record a route touches must
// belong to that pharmacy. Proves "the pharmacy's dashboard account", not which person passed the Admin PIN —
// per-person admin rights are the #11 auth pass. Relies on the browser being unable to edit profiles
// (insert/update/delete revoked from anon + authenticated).
import supabaseAdmin from "./supabaseAdmin";

const httpError = (status, message) => Object.assign(new Error(message), { status });

// -> { userId, pharmacyId }; throws 401 (not logged in) or 403 (not a dashboard login)
export async function requireDashboard(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw httpError(401, "Not logged in");
  const db = supabaseAdmin();
  const { data: userData, error } = await db.auth.getUser(token);
  const userId = userData?.user?.id;
  if (error || !userId) throw httpError(401, "Not logged in");
  const { data: profile, error: pErr } = await db.from("profiles").select("pharmacy_id").eq("id", userId).maybeSingle();
  if (pErr) throw pErr;
  if (!profile?.pharmacy_id) throw httpError(403, "This login can't use Admin — sign in with the pharmacy dashboard account.");
  return { userId, pharmacyId: String(profile.pharmacy_id) };
}

// Throws 403 unless the record's pharmacy is the logged-in pharmacy
export function assertSamePharmacy(auth, pharmacyId) {
  if (!pharmacyId || String(pharmacyId) !== auth.pharmacyId) throw httpError(403, "That record belongs to a different pharmacy.");
}
