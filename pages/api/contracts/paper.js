// Paper employment contracts (Admin → Staff → Documents). Rows live in locum_documents (type 'signed_contract');
// new files go to the PRIVATE employment-contracts bucket at paper/<staff_id>/<timestamp>.<ext>.
// Older uploads may still be in the public locum-documents bucket (row has url, no storage_path).
//
//   POST   { action: "upload-url", staff_id, ext }                         -> { path, token }
//          (browser then uploads straight to storage with uploadToSignedUrl — avoids Vercel's 4.5 MB body limit)
//   POST   { action: "save", staff_id, path, filename, signed_date }      -> { doc }
//   GET    ?id=                                                           -> { url }  (10-minute signed URL)
//   DELETE ?id=                                                           -> { ok }   (removes file + row)
// Dashboard login required (lib/adminAuth.js); per-person admin rights are the #11 auth pass.
import supabaseAdmin from "../../../lib/supabaseAdmin";
import { CONTRACT_BUCKET, loadStaff, fail } from "../../../lib/contractServer";
import { requireDashboard, assertSamePharmacy } from "../../../lib/adminAuth";
import { docFile, signedLink } from "../../../lib/staffFilesServer";

const TYPE = "signed_contract";
const EXTS = ["pdf", "jpg", "jpeg", "png"];
const PUBLIC_BUCKET = "locum-documents";

const publicPath = (url) => {
  const marker = `/${PUBLIC_BUCKET}/`;
  const i = String(url || "").indexOf(marker);
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
};

const loadDoc = async (id) => {
  const { data, error } = await supabaseAdmin().from("locum_documents").select("*").eq("id", Number(id)).maybeSingle();
  if (error) throw error;
  if (!data || data.type !== TYPE) throw Object.assign(new Error("Contract document not found"), { status: 404 });
  return data;
};

export default async function handler(req, res) {
  try {
    const auth = await requireDashboard(req);
    const db = supabaseAdmin();

    if (req.method === "POST" && req.body?.action === "upload-url") {
      const { staff_id, ext } = req.body;
      const e = String(ext || "").toLowerCase();
      if (!EXTS.includes(e)) return res.status(400).json({ error: "Please choose a PDF, JPG or PNG file." });
      const staff = await loadStaff(staff_id);
      assertSamePharmacy(auth, staff.pharmacy_id);
      const path = `paper/${staff.id}/${Date.now()}.${e === "jpeg" ? "jpg" : e}`;
      const { data, error } = await db.storage.from(CONTRACT_BUCKET).createSignedUploadUrl(path);
      if (error) throw error;
      return res.status(200).json({ path: data.path || path, token: data.token });
    }

    if (req.method === "POST" && req.body?.action === "save") {
      const { staff_id, path, filename, signed_date } = req.body;
      const staff = await loadStaff(staff_id);
      assertSamePharmacy(auth, staff.pharmacy_id);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(signed_date || ""))) return res.status(400).json({ error: "Date signed is required." });
      if (!String(path || "").startsWith(`paper/${staff.id}/`)) return res.status(400).json({ error: "Invalid file path" });
      const { data: doc, error } = await db.from("locum_documents").insert([{
        staff_id: staff.id,
        pharmacy_id: staff.pharmacy_id,
        type: TYPE,
        url: null,
        storage_path: path,
        filename: String(filename || "").slice(0, 255) || null,
        signed_date,
      }]).select().single();
      if (error) {
        await db.storage.from(CONTRACT_BUCKET).remove([path]); // don't leave an orphaned file
        throw error;
      }
      return res.status(200).json({ doc });
    }

    if (req.method === "GET") {
      const doc = await loadDoc(req.query.id);
      assertSamePharmacy(auth, doc.pharmacy_id);
      const file = docFile(doc); // older uploads: path worked out from the (now private) locum-documents url
      if (!file) return res.status(404).json({ error: "No file for that document" });
      return res.status(200).json({ url: await signedLink(file.bucket, file.path) });
    }

    if (req.method === "DELETE") {
      const doc = await loadDoc(req.query.id);
      assertSamePharmacy(auth, doc.pharmacy_id);
      if (doc.storage_path) {
        await db.storage.from(CONTRACT_BUCKET).remove([doc.storage_path]);
      } else {
        const p = publicPath(doc.url);
        if (p) await db.storage.from(PUBLIC_BUCKET).remove([p]);
      }
      const { error } = await db.from("locum_documents").delete().eq("id", doc.id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    fail(res, err);
  }
}
