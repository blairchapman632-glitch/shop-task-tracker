// fetch() for Admin API routes: adds the dashboard login's access token (checked by lib/adminAuth.js).
import supabase from "./supabaseClient";

export async function adminFetch(url, options = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(url, { ...options, headers });
}
