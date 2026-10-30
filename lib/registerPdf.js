// QSPP register PDFs (Document Register, Incident register, Feedback register) — one layout, built in the browser
// with pdf-lib and downloaded, never stored. A4 landscape; header "<pharmacy> — <heading>", generated date + who,
// the filter + count; column headings repeat on every page; "Page N of M" in the footer.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { sanitise, fmtDateLong } from "./contractPdf";

const PAGE_W = 841.89; // A4 landscape
const PAGE_H = 595.28;
const MARGIN = 36;
const FOOTER_H = 26;
const BLACK = rgb(0.1, 0.1, 0.1);
const GREY = rgb(0.42, 0.42, 0.42);
const LIGHT = rgb(0.85, 0.85, 0.85);
const SHADE = rgb(0.94, 0.95, 0.97);
const RED = rgb(0.75, 0.1, 0.1);
const SIZE = 8.5;
const LINE = 10.5;
export const PRINTABLE_W = PAGE_W - MARGIN * 2; // ≈ 769 — column widths should add up to this

// input: { heading, pharmacyName, generatedOn (YYYY-MM-DD), generatedBy, filterLabel, itemWord ("document"),
//          columns: [{ key, label, w }], rows: [{ [key]: display string, _red: [keys shown red + bold] }] }
// -> { bytes, warnings }
export async function buildRegisterPdf({ heading, pharmacyName, generatedOn, generatedBy, filterLabel, itemWord = "item", columns, rows }) {
  const warnings = [];
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const title = `${pharmacyName ? `${pharmacyName} — ` : ""}${heading}`;
  pdf.setTitle(title);
  pdf.setProducer("Chalkboard");

  const clean = (f, s) => {
    const { text, changed } = sanitise(f, s ?? "");
    if (changed) warnings.push(`Some characters couldn't be printed in the PDF font and were replaced ("${String(s).slice(0, 40)}").`);
    return text.replace(/[\r\n]+/g, " ");
  };
  const wrap = (str, f, size, width) => {
    const lines = [];
    let line = "";
    for (let word of clean(f, str).split(/\s+/).filter(Boolean)) {
      while (f.widthOfTextAtSize(word, size) > width) { // break over-long words
        let i = word.length - 1;
        while (i > 1 && f.widthOfTextAtSize(word.slice(0, i), size) > width) i--;
        if (line) { lines.push(line); line = ""; }
        lines.push(word.slice(0, i));
        word = word.slice(i);
      }
      const test = line ? `${line} ${word}` : word;
      if (f.widthOfTextAtSize(test, size) <= width) line = test;
      else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  };

  let page;
  let y;
  const draw = (s, x, yy, f = font, size = SIZE, color = BLACK) => { if (s) page.drawText(s, { x, y: yy, size, font: f, color }); };
  const tableHeader = () => {
    page.drawRectangle({ x: MARGIN, y: y - 15, width: PRINTABLE_W, height: 17, color: SHADE });
    let x = MARGIN + 4;
    for (const c of columns) { draw(c.label, x, y - 10, bold, 8.5); x += c.w; }
    y -= 21;
  };
  const newPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  };

  // ── Header (first page) ──
  newPage();
  draw(clean(bold, title), MARGIN, y - 14, bold, 16);
  const meta = `Generated ${fmtDateLong(generatedOn)}${generatedBy ? ` by ${generatedBy}` : ""}`;
  draw(clean(font, meta), MARGIN, y - 29, font, 9, GREY);
  const shown = clean(font, `${filterLabel ? `${filterLabel} · ` : ""}${rows.length} ${itemWord}${rows.length === 1 ? "" : "s"}`);
  draw(shown, PAGE_W - MARGIN - font.widthOfTextAtSize(shown, 9), y - 29, font, 9, GREY);
  y -= 38;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1, color: BLACK });
  y -= 8;
  tableHeader();

  if (!rows.length) {
    draw(`No ${itemWord}s match this filter.`, MARGIN + 4, y - 10, font, 10, GREY);
  }
  for (const r of rows) {
    const red = new Set(r._red || []);
    const cells = Object.fromEntries(columns.map((c) => [c.key, wrap(r[c.key] || "—", red.has(c.key) ? bold : font, SIZE, c.w - 8)]));
    const h = Math.max(...Object.values(cells).map((l) => l.length)) * LINE + 5;
    if (y - h < MARGIN + FOOTER_H) { newPage(); tableHeader(); }
    let x = MARGIN + 4;
    for (const c of columns) {
      const isRed = red.has(c.key);
      cells[c.key].forEach((ln, i) => draw(ln, x, y - 9 - i * LINE, isRed ? bold : font, SIZE, isRed ? RED : BLACK));
      x += c.w;
    }
    y -= h;
    page.drawLine({ start: { x: MARGIN, y: y + 1 }, end: { x: PAGE_W - MARGIN, y: y + 1 }, thickness: 0.5, color: LIGHT });
  }

  // Footer on every page
  const pages = pdf.getPages();
  const left = clean(font, title);
  pages.forEach((p, i) => {
    const right = `Page ${i + 1} of ${pages.length}`;
    p.drawLine({ start: { x: MARGIN, y: MARGIN + 10 }, end: { x: PAGE_W - MARGIN, y: MARGIN + 10 }, thickness: 0.5, color: LIGHT });
    p.drawText(left, { x: MARGIN, y: MARGIN - 2, size: 7.5, font, color: GREY });
    p.drawText(right, { x: PAGE_W - MARGIN - font.widthOfTextAtSize(right, 7.5), y: MARGIN - 2, size: 7.5, font, color: GREY });
  });

  const bytes = await pdf.save({ useObjectStreams: false });
  return { bytes, warnings: [...new Set(warnings)] };
}

// Browser: save the bytes as a download
export function downloadPdf(bytes, fileName) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
