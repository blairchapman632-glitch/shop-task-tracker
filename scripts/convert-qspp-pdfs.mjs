// One-off: give every active QSPP library document a staff PDF (pharmacy_documents.pdf_url / pdf_file_name).
//   - Word (.docx/.doc) and Excel (.xlsx/.xls) masters: download, convert with LibreOffice (soffice --headless), upload the
//     PDF next to the original in the pharmacy-documents bucket, set the staff PDF columns.
//   - PDF masters: the staff PDF is the same file (no upload).
// Masters are NEVER modified or deleted. Rows that already have a staff PDF are skipped, so it's safe to re-run.
//
// Run from the repo folder (reads .env.local for the Supabase URL + service role key):
//   node scripts/convert-qspp-pdfs.mjs            -> DRY RUN: lists what it would do, changes nothing
//   node scripts/convert-qspp-pdfs.mjs --apply    -> does it
// LibreOffice is found at C:\Program Files\LibreOffice\program\soffice.exe, or set SOFFICE to its full path.
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { pathToFileURL } from "url";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "pharmacy-documents";
const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";
const CONVERT = new Set(["docx", "doc", "xlsx", "xls"]);
const APPLY = process.argv.includes("--apply");

// ── setup ──
const envFile = path.join(process.cwd(), ".env.local");
if (!fs.existsSync(envFile)) { console.error("Run this from the shop-task-tracker folder (can't find .env.local)."); process.exit(1); }
const env = Object.fromEntries(fs.readFileSync(envFile, "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.trim().startsWith("#"))
  .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) { console.error(".env.local needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."); process.exit(1); }
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const findSoffice = () => {
  const candidates = [process.env.SOFFICE, "C:\\Program Files\\LibreOffice\\program\\soffice.exe", "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe"].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || null;
};

const work = fs.mkdtempSync(path.join(os.tmpdir(), "qspp-pdf-"));
const profile = path.join(work, "lo-profile"); // own LibreOffice profile, so an open LibreOffice window doesn't interfere
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
// Log on the Desktop (OneDrive Desktop if that's where it is), else the home folder
const logDir = [path.join(os.homedir(), "OneDrive", "Desktop"), path.join(os.homedir(), "Desktop")].find((p) => fs.existsSync(p)) || os.homedir();
const logFile = path.join(logDir, `qspp-pdf-${APPLY ? "run" : "dry-run"}-${stamp}.txt`);
const logLines = [];
const log = (s = "") => { console.log(s); logLines.push(s); };

const ext = (name) => (String(name || "").split("?")[0].match(/\.([a-z0-9]+)$/i)?.[1] || "").toLowerCase();
const pathFromUrl = (url) => {
  const marker = `/${BUCKET}/`;
  const i = String(url || "").indexOf(marker);
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
};
const pdfPathFor = (masterPath) => masterPath.replace(/\.[a-z0-9]+$/i, "") + ".pdf"; // next to the original
const publicUrl = (p) => db.storage.from(BUCKET).getPublicUrl(p).data.publicUrl;

// Staff PDF columns on the document + the matching (latest) version-history row
async function setStaffPdf(doc, pdfPath) {
  const now = new Date().toISOString();
  const pdf = { pdf_url: publicUrl(pdfPath), pdf_file_name: pdfPath };
  const { error } = await db.from("pharmacy_documents").update({ ...pdf, pdf_updated_at: now }).eq("id", doc.id).is("pdf_url", null);
  if (error) throw new Error(`saving the PDF on the document: ${error.message}`);
  const { data: versions } = await db.from("document_versions").select("id").eq("document_id", doc.id).eq("file_name", doc.master)
    .is("pdf_url", null).order("created_at", { ascending: false }).limit(1);
  if (versions?.length) await db.from("document_versions").update(pdf).eq("id", versions[0].id);
}

async function convert(doc) {
  if (taken.has(doc.pdfPath)) throw new Error(`"${doc.pdfPath}" is already another library file — upload this PDF by hand`);
  const e = ext(doc.master);
  const local = path.join(work, `${doc.id}.${e}`);
  const { data: blob, error: dErr } = await db.storage.from(BUCKET).download(doc.master);
  if (dErr) throw new Error(`downloading the master: ${dErr.message}`);
  fs.writeFileSync(local, Buffer.from(await blob.arrayBuffer()));
  try {
    execFileSync(SOFFICE, ["--headless", "--norestore", `-env:UserInstallation=${pathToFileURL(profile).href}`,
      "--convert-to", "pdf", "--outdir", work, local], { timeout: 180000, stdio: "pipe" });
  } catch (err) {
    throw new Error(`LibreOffice couldn't convert it: ${String(err.stderr || err.message).trim().slice(0, 300)}`);
  }
  const outPdf = path.join(work, `${doc.id}.pdf`);
  if (!fs.existsSync(outPdf) || fs.statSync(outPdf).size === 0) throw new Error("LibreOffice produced no PDF");
  const { error: uErr } = await db.storage.from(BUCKET).upload(doc.pdfPath, fs.readFileSync(outPdf), { contentType: "application/pdf", upsert: false });
  let reused = false;
  if (uErr) {
    // Left over from an earlier run of this same master -> use it (never overwrite anything in the bucket)
    if (/exist/i.test(uErr.message)) reused = true;
    else throw new Error(`uploading the PDF: ${uErr.message}`);
  }
  await setStaffPdf(doc, doc.pdfPath);
  fs.rmSync(local, { force: true });
  fs.rmSync(outPdf, { force: true });
  return reused;
}

// ── main ──
const SOFFICE = findSoffice();
log(`QSPP staff PDFs — ${APPLY ? "APPLYING CHANGES" : "DRY RUN (nothing will change)"} — ${new Date().toLocaleString("en-AU", { timeZone: "Australia/Perth" })}`);
log(`LibreOffice: ${SOFFICE || "NOT FOUND"}`);
log("");

const { data: rows, error } = await db.from("pharmacy_documents")
  .select("id, title, file_name, file_url, pdf_url").eq("pharmacy_id", PHARMACY_ID).eq("active", true).is("pdf_url", null).order("title").range(0, 1999);
if (error) { log(`Couldn't load documents: ${error.message}`); process.exit(1); }

const docs = rows.map((r) => {
  const master = r.file_name || pathFromUrl(r.file_url);
  return { ...r, master, type: ext(master), pdfPath: master ? pdfPathFor(master) : null };
});
// Files already belonging to library documents / versions — a converted PDF must never land on one of these
const [{ data: allDocs }, { data: allVers }] = await Promise.all([
  db.from("pharmacy_documents").select("file_name, pdf_file_name").range(0, 4999),
  db.from("document_versions").select("file_name, pdf_file_name").range(0, 4999),
]);
const taken = new Set([...(allDocs || []), ...(allVers || [])].flatMap((x) => [x.file_name, x.pdf_file_name]).filter(Boolean));
const pdfMasters = docs.filter((d) => d.type === "pdf");
const toConvert = docs.filter((d) => CONVERT.has(d.type));
const other = docs.filter((d) => d.type !== "pdf" && !CONVERT.has(d.type));

log(`Active documents without a staff PDF: ${docs.length}`);
log(`  ${pdfMasters.length} already PDF (staff PDF = same file)`);
log(`  ${toConvert.length} to convert (${toConvert.filter((d) => d.type.startsWith("doc")).length} Word, ${toConvert.filter((d) => d.type.startsWith("xls")).length} Excel)`);
if (other.length) log(`  ${other.length} other / unknown type — skipped, upload a PDF for these by hand`);
log("");

if (!APPLY) {
  for (const d of pdfMasters) log(`LINK     ${d.title}  [${d.master}]`);
  for (const d of toConvert) log(`CONVERT  ${d.title}  [${d.master}]  ->  ${d.pdfPath}`);
  for (const d of other) log(`SKIP     ${d.title}  [${d.master || "no file"}]`);
  if (toConvert.length && !SOFFICE) log("\n⚠ LibreOffice isn't installed (or not where expected) — install it before running with --apply.");
  log("\nDry run only. To do it:  node scripts/convert-qspp-pdfs.mjs --apply");
} else {
  if (toConvert.length && !SOFFICE) { log("LibreOffice not found — install it, or set SOFFICE to soffice.exe's full path."); process.exit(1); }
  const failed = [];
  const excelDone = [];
  let linked = 0, converted = 0;
  for (const d of pdfMasters) {
    try { await setStaffPdf(d, d.master); linked++; log(`✓ linked     ${d.title}`); }
    catch (err) { failed.push({ d, why: err.message }); log(`✗ FAILED     ${d.title} — ${err.message}`); }
  }
  for (const [i, d] of toConvert.entries()) {
    try {
      const reused = await convert(d);
      converted++;
      if (d.type.startsWith("xls")) excelDone.push(d);
      log(`✓ converted  (${i + 1}/${toConvert.length}) ${d.title}${reused ? "  (PDF already in the bucket from an earlier run — reused)" : ""}`);
    } catch (err) {
      failed.push({ d, why: err.message });
      log(`✗ FAILED     (${i + 1}/${toConvert.length}) ${d.title} — ${err.message}`);
    }
  }
  log("");
  log(`Done: ${linked} PDF masters linked, ${converted} converted, ${failed.length} failed, ${other.length} skipped (other type).`);
  if (excelDone.length) {
    log("\nCheck these converted EXCEL files — spreadsheets can convert badly (cut-off columns, many pages):");
    for (const d of excelDone) log(`  • ${d.title}\n    ${publicUrl(d.pdfPath)}`);
  }
  if (failed.length) {
    log("\nFailed (nothing was changed for these — fix and re-run, or upload a PDF in Admin → Replace files):");
    for (const f of failed) log(`  • ${f.d.title} [${f.d.master}] — ${f.why}`);
  }
}

fs.writeFileSync(logFile, logLines.join("\r\n"));
fs.rmSync(work, { recursive: true, force: true });
console.log(`\nLog saved to ${logFile}`);
