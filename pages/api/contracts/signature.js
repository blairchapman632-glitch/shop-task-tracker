// Contract signature image (Admin → Settings). Stored privately at settings/<pharmacy_id>/signature.<ext>.
//   GET    ?pharmacy_id=                          -> { path, url }  (url = 10-minute signed URL, or null)
//   POST   { pharmacy_id, data_url }               -> uploads PNG/JPG, saves pharmacy_settings.contract_signature_path
//   DELETE ?pharmacy_id=                          -> removes the file and clears the path
// TODO(#11 auth pass): Admin routes have no server-side auth yet (same as the rest of Admin).
import supabaseAdmin from "../../../lib/supabaseAdmin";
import { CONTRACT_BUCKET, signedUrl, fail } from "../../../lib/contractServer";

export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const loadSettings = async (pharmacyId) => {
  if (!UUID.test(String(pharmacyId || ""))) throw Object.assign(new Error("pharmacy_id required"), { status: 400 });
  const { data, error } = await supabaseAdmin().from("pharmacy_settings")
    .select("pharmacy_id, contract_signature_path").eq("pharmacy_id", String(pharmacyId)).maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error("Pharmacy settings not found"), { status: 404 });
  return data;
};

const setPath = async (pharmacyId, path) => {
  const { error } = await supabaseAdmin().from("pharmacy_settings")
    .update({ contract_signature_path: path, updated_at: new Date().toISOString() })
    .eq("pharmacy_id", String(pharmacyId));
  if (error) throw error;
};

export default async function handler(req, res) {
  try {
    const db = supabaseAdmin();

    if (req.method === "GET") {
      const s = await loadSettings(req.query.pharmacy_id);
      return res.status(200).json({ path: s.contract_signature_path || null, url: await signedUrl(s.contract_signature_path) });
    }

    if (req.method === "POST") {
      const { pharmacy_id, data_url } = req.body || {};
      const s = await loadSettings(pharmacy_id);
      const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(String(data_url || ""));
      if (!m) return res.status(400).json({ error: "Please choose a PNG or JPG image." });
      const ext = m[1].toLowerCase() === "png" ? "png" : "jpg";
      const bytes = Buffer.from(m[2], "base64");
      const path = `settings/${s.pharmacy_id}/signature.${ext}`;
      const { error: upErr } = await db.storage.from(CONTRACT_BUCKET)
        .upload(path, bytes, { contentType: ext === "png" ? "image/png" : "image/jpeg", upsert: true });
      if (upErr) throw upErr;
      // Switching PNG <-> JPG leaves the old file behind — remove it
      if (s.contract_signature_path && s.contract_signature_path !== path) {
        await db.storage.from(CONTRACT_BUCKET).remove([s.contract_signature_path]);
      }
      await setPath(s.pharmacy_id, path);
      return res.status(200).json({ path, url: await signedUrl(path) });
    }

    if (req.method === "DELETE") {
      const s = await loadSettings(req.query.pharmacy_id);
      if (s.contract_signature_path) await db.storage.from(CONTRACT_BUCKET).remove([s.contract_signature_path]);
      await setPath(s.pharmacy_id, null);
      return res.status(200).json({ path: null, url: null });
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    fail(res, err);
  }
}
