// Employment contract PDFs — fills the fillable (AcroForm) offer-of-employment templates with pdf-lib.
// SERVER-SIDE ONLY (used by pages/api/contracts/*).

import { PDFDocument, PDFName, PDFArray, PDFDict, StandardFonts } from "pdf-lib";

const BASE_SIZE = 10;
const MIN_SIZE = 6;

// ── Formatting helpers ──────────────────────────────────────────────────────

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// "2026-11-02" -> "2 November 2026" (string maths, no Date/timezone involved)
export const fmtDateLong = (s) => {
  if (!s) return "";
  const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return String(s);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

// "09:00" -> "9:00am", "13:30" -> "1:30pm"
export const fmtTimeShort = (t) => {
  if (!t) return "";
  const [h, m] = String(t).split(":").map(Number);
  if (isNaN(h)) return String(t);
  const suffix = h >= 12 ? "pm" : "am";
  return `${h % 12 || 12}:${String(m || 0).padStart(2, "0")}${suffix}`;
};

// 8.5 -> "8.5", 8 -> "8", 7.25 -> "7.25"
export const fmtHours = (h) => {
  const n = Number(h);
  if (h === "" || h == null || isNaN(n)) return "";
  return String(Math.round(n * 100) / 100);
};

// Now in Perth: { date: "YYYY-MM-DD", stamp: "2 October 2026 3:41pm" }
export const perthNow = () => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Perth", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date()).map((p) => [p.type, p.value])
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return { date, stamp: `${fmtDateLong(date)} ${fmtTimeShort(`${parts.hour}:${parts.minute}`)}` };
};

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

// Turn the stored Admin form values (keyed by the template's "fields" JSON) into PDF field strings.
// extra = raw PDF values added on top (e.g. employee_signature at acceptance).
export function buildPdfValues(templateFields, values, extra = {}) {
  const out = {};
  for (const f of templateFields || []) {
    const v = values?.[f.key];
    if (f.type === "hours_table") {
      const table = v || {};
      let total = 0;
      for (const d of DAY_KEYS) {
        const row = table[d] || {};
        const worked = row.start && row.finish;
        out[`${d}_start`] = worked ? fmtTimeShort(row.start) : "—";
        out[`${d}_finish`] = worked ? fmtTimeShort(row.finish) : "—";
        out[`${d}_hours`] = worked && fmtHours(row.hours) !== "" ? fmtHours(row.hours) : "—";
        if (worked && !isNaN(Number(row.hours))) total += Number(row.hours) || 0;
      }
      out.total_hours = fmtHours(total);
    } else if (f.type === "date") {
      out[f.key] = fmtDateLong(v);
    } else if (f.type === "money") {
      const n = Number(v);
      out[f.key] = v === "" || v == null || isNaN(n) ? "" : `$${n.toFixed(2)} per hour`;
    } else {
      out[f.key] = v == null ? "" : String(v);
    }
  }
  return { ...out, ...extra };
}

// ── WinAnsi safety ──────────────────────────────────────────────────────────

// Letters that don't decompose to a plain letter via NFKD
const LOOKALIKE = { "Ł": "L", "ł": "l", "Đ": "D", "đ": "d", "Ħ": "H", "ħ": "h", "ı": "i", "Ŀ": "L", "ŀ": "l", "ŉ": "n", "Ŧ": "T", "ŧ": "t", "ĸ": "k", "‐": "-", "‑": "-", "−": "-" };

// Helvetica (standard font) can only encode WinAnsi. Replace what it can't encode instead of throwing.
export const sanitise = (font, text) => {
  let out = "";
  let changed = false;
  for (const ch of String(text)) {
    if (ch === "\n" || ch === "\r") { out += ch; continue; }
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      changed = true;
      // Try the plain letter without accents ("ă" -> "a", "Ł" -> "L")
      const base = LOOKALIKE[ch] || ch.normalize("NFKD").replace(/[̀-ͯ]/g, "");
      let ok = "";
      try { if (base) { font.encodeText(base); ok = base; } } catch { /* fall through */ }
      out += ok || "?";
    }
  }
  return { text: out, changed };
};

// ── Fill + flatten ──────────────────────────────────────────────────────────

const SIGNATURE_SLOT = "employer_signature_image";

// The page a widget sits on (widgets don't always carry /P)
const pageOfWidget = (pdf, widget) => {
  const ref = pdf.context.getObjectRef(widget.dict);
  return pdf.getPages().find((p) => {
    const annots = p.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
    if (!annots) return false;
    for (let i = 0; i < annots.size(); i++) if (annots.get(i) === ref) return true;
    return false;
  }) || null;
};

// templateBytes: Uint8Array/ArrayBuffer of a fillable template. values: { pdfFieldName: string }
// options.signature: { bytes, type: "png" | "jpg" } — drawn in the employer_signature_image slot (letter page).
//   The employer boxes in the attachments always show the typed name (employer_signature).
// Returns { bytes: Uint8Array, warnings: string[] }
export async function fillContract(templateBytes, values, options = {}) {
  const warnings = [];
  const src = await PDFDocument.load(templateBytes);
  const helv = await src.embedFont(StandardFonts.Helvetica);
  const form = src.getForm();

  values = { ...(values || {}) };
  delete values[SIGNATURE_SLOT]; // slot stays empty — the image is drawn over it after flattening

  // Record the signature slot(s) now — flattening removes the widgets
  const sigSlots = [];
  try {
    for (const w of form.getTextField(SIGNATURE_SLOT).acroField.getWidgets()) {
      const page = pageOfWidget(src, w);
      if (page) sigSlots.push({ page, rect: w.getRectangle() });
    }
  } catch { /* template has no signature slot */ }

  let sigImage = null;
  if (options.signature?.bytes && sigSlots.length) {
    try {
      sigImage = options.signature.type === "png"
        ? await src.embedPng(options.signature.bytes)
        : await src.embedJpg(options.signature.bytes);
    } catch (err) {
      warnings.push(`Couldn't use the signature image (${err?.message || err}) — the signature space was left blank.`);
    }
  }

  for (const [name, raw] of Object.entries(values)) {
    let field;
    try {
      field = form.getTextField(name);
    } catch {
      // Not every template has every field (e.g. reports_to on pharmacist templates) — skip quietly
      // unless it actually had something to say.
      if (raw) console.warn(`[contractPdf] template has no text field "${name}" — skipped`);
      continue;
    }
    const { text, changed } = sanitise(helv, raw ?? "");
    if (changed) warnings.push(`"${name}": some characters can't be printed in the PDF font and were replaced (${String(raw)} → ${text}).`);
    field.setText(text);

    let size = BASE_SIZE;
    if (!field.isMultiline() && text) {
      const widths = field.acroField.getWidgets().map((w) => w.getRectangle().width);
      const avail = Math.min(...widths) - 4;
      while (size > MIN_SIZE && helv.widthOfTextAtSize(text, size) > avail) size -= 0.5;
      if (helv.widthOfTextAtSize(text, size) > avail) warnings.push(`"${name}" is too long to fit its box even at ${MIN_SIZE}pt.`);
    }
    field.setFontSize(size);
  }

  form.updateFieldAppearances(helv);
  form.flatten({ updateFieldAppearances: false });

  // Signature image goes on AFTER flattening: drawn before, the flattened field's white background covers it.
  // Fit inside the slot, keep the aspect ratio, bottom-left aligned.
  if (sigImage) {
    const aspect = sigImage.width / sigImage.height;
    for (const { page, rect } of sigSlots) {
      let w = rect.width;
      let h = w / aspect;
      if (h > rect.height) { h = rect.height; w = h * aspect; }
      page.drawImage(sigImage, { x: rect.x, y: rect.y, width: w, height: h });
    }
  }

  // Flattening leaves dangling widget refs in each page's /Annots. Drop those (and any surviving widgets),
  // keep everything else — the Fair Work hyperlinks are Link annotations and must survive.
  const ctx = src.context;
  for (const page of src.getPages()) {
    const annots = page.node.lookupMaybe(PDFName.of("Annots"), PDFArray);
    if (!annots) continue;
    const keep = [];
    for (let i = 0; i < annots.size(); i++) {
      const ref = annots.get(i);
      const obj = ctx.lookup(ref);
      if (!obj) continue;
      if (obj instanceof PDFDict && obj.get(PDFName.of("Subtype")) === PDFName.of("Widget")) continue;
      keep.push(ref);
    }
    if (keep.length) page.node.set(PDFName.of("Annots"), ctx.obj(keep));
    else page.node.delete(PDFName.of("Annots"));
  }

  // Copy into a fresh document — without this, viewers report xref errors.
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, src.getPageIndices());
  pages.forEach((p) => out.addPage(p));
  const bytes = await out.save({ useObjectStreams: false });
  return { bytes, warnings };
}
