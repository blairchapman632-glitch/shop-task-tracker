// GET ?id=&which=issued|accepted -> { url } (10-minute signed URL)
// TODO(#11 auth pass): Admin routes have no server-side auth yet (same as the rest of Admin).
import supabaseAdmin from "../../../lib/supabaseAdmin";
import { signedUrl, fail } from "../../../lib/contractServer";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { id, which } = req.query;
    if (!id || !["issued", "accepted"].includes(which)) return res.status(400).json({ error: "id and which=issued|accepted required" });
    const { data, error } = await supabaseAdmin().from("employment_contracts")
      .select("issued_file_path, accepted_file_path").eq("id", String(id)).maybeSingle();
    if (error) throw error;
    const path = which === "accepted" ? data?.accepted_file_path : data?.issued_file_path;
    if (!path) return res.status(404).json({ error: "No file for that contract" });
    res.status(200).json({ url: await signedUrl(path) });
  } catch (err) {
    fail(res, err);
  }
}
