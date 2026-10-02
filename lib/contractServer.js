// Shared helpers for the employment contract API routes. SERVER-SIDE ONLY.
import crypto from "crypto";
import supabaseAdmin from "./supabaseAdmin";
import { fillContract, buildPdfValues } from "./contractPdf";

export const CONTRACT_BUCKET = "employment-contracts";
export const SIGNED_URL_SECONDS = 600; // 10 minutes

export const sha256 = (bytes) => crypto.createHash("sha256").update(Buffer.from(bytes)).digest("hex");

export async function loadTemplate(templateId) {
  const { data, error } = await supabaseAdmin().from("contract_templates").select("*").eq("id", templateId).maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error("Contract template not found"), { status: 404 });
  return data;
}

export async function loadStaff(staffId) {
  const { data, error } = await supabaseAdmin()
    .from("staff").select("id, name, pharmacy_id, role").eq("id", Number(staffId)).maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error("Staff member not found"), { status: 404 });
  return data;
}

// The pharmacy's contract signatory: { name, title, signature } — signature is the handwritten image
// ({ bytes, type }) or null if none is set
export async function loadSignatory(pharmacyId) {
  const out = { name: "", title: "", signature: null };
  if (!pharmacyId) return out;
  const db = supabaseAdmin();
  const { data: settings } = await db.from("pharmacy_settings")
    .select("contract_signatory_name, contract_signatory_title, contract_signature_path")
    .eq("pharmacy_id", String(pharmacyId)).maybeSingle();
  out.name = settings?.contract_signatory_name || "";
  out.title = settings?.contract_signatory_title || "";
  const path = settings?.contract_signature_path;
  if (path) {
    const { data: file, error } = await db.storage.from(CONTRACT_BUCKET).download(path);
    if (!error && file) out.signature = { bytes: new Uint8Array(await file.arrayBuffer()), type: /\.png$/i.test(path) ? "png" : "jpg" };
  }
  return out;
}

// Fill a template with stored form values (+ raw PDF extras) -> { bytes, warnings }
// Preview, issue and accept all come through here, so the signature logic is identical for all three.
export async function renderContract(template, values, extra = {}) {
  const { data: file, error } = await supabaseAdmin().storage.from(CONTRACT_BUCKET).download(template.file_path);
  if (error || !file) {
    throw Object.assign(new Error(`Couldn't load template file "${template.file_path}" — has it been uploaded to the ${CONTRACT_BUCKET} bucket?`), { status: 500 });
  }
  const templateBytes = new Uint8Array(await file.arrayBuffer());
  const signatory = await loadSignatory(template.pharmacy_id);
  // Letter-page sign-off comes from Settings (not the Admin contract form)
  const pdfValues = buildPdfValues(template.fields, values, {
    signatory_name: signatory.name,
    signatory_title: signatory.title,
    ...extra,
  });
  return fillContract(templateBytes, pdfValues, { signature: signatory.signature });
}

export async function uploadPdf(path, bytes) {
  const { error } = await supabaseAdmin().storage.from(CONTRACT_BUCKET)
    .upload(path, Buffer.from(bytes), { contentType: "application/pdf", upsert: true });
  if (error) throw error;
}

export async function signedUrl(path) {
  if (!path) return null;
  const { data, error } = await supabaseAdmin().storage.from(CONTRACT_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error) throw error;
  return data.signedUrl;
}

// Uniform error response
export const fail = (res, err) => {
  console.error("[contracts]", err);
  res.status(err?.status || 500).json({ error: err?.message || String(err) });
};
