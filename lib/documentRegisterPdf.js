// QSPP Document Register PDF (replaces the Word Document Review Register) — built in the browser with pdf-lib and
// downloaded, never stored. A4 landscape; column headings repeat on every page; "Page N of M" in the footer.
// Lists whatever /qspp → Library → List (the Document Register) is currently showing (its filters apply).
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

// Widths add up to the printable width (841.89 - 72 ≈ 769)
const COLS = [
  { key: "folder", label: "Folder", w: 150 },
  { key: "title", label: "Title", w: 215 },
  { key: "version", label: "Version", w: 45 },
  { key: "updated", label: "Last updated", w: 70 },
  { key: "updatedBy", label: "Updated by", w: 85 },
  { key: "review", label: "Review date", w: 70 },
  { key: "status", label: "Status", w: 134 },
];

// input: { pharmacyName, generatedOn (YYYY-MM-DD), generatedBy, filterLabel,
//          rows: [{ folder, title, version, updated, updatedBy, review, reviewOverdue, status }] } (all display strings)
// -> { bytes, warnings }
export async function buildDocumentRegisterPdf({ pharmacyName, generatedOn, generatedBy, filterLabel, rows }) {
  const warnings = [];
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const title = `${pharmacyName ? `${pharmacyName} — ` : ""}Document Register`;
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
    page.drawRectangle({ x: MARGIN, y: y - 15, width: PAGE_W - MARGIN * 2, height: 17, color: SHADE });
    let x = MARGIN + 4;
    for (const c of COLS) { draw(c.label, x, y - 10, bold, 8.5); x += c.w; }
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
  const shown = `${filterLabel ? `${filterLabel} · ` : ""}${rows.length} document${rows.length === 1 ? "" : "s"}`;
  draw(clean(font, shown), PAGE_W - MARGIN - font.widthOfTextAtSize(clean(font, shown), 9), y - 29, font, 9, GREY);
  y -= 38;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1, color: BLACK });
  y -= 8;
  tableHeader();

  if (!rows.length) {
    draw("No documents match this filter.", MARGIN + 4, y - 10, font, 10, GREY);
  }
  for (const r of rows) {
    const cells = Object.fromEntries(COLS.map((c) => [c.key, wrap(r[c.key] || "—", font, SIZE, c.w - 8)]));
    const h = Math.max(...Object.values(cells).map((l) => l.length)) * LINE + 5;
    if (y - h < MARGIN + FOOTER_H) { newPage(); tableHeader(); }
    let x = MARGIN + 4;
    for (const c of COLS) {
      const color = c.key === "review" && r.reviewOverdue ? RED : BLACK;
      const f = c.key === "review" && r.reviewOverdue ? bold : font;
      cells[c.key].forEach((ln, i) => draw(ln, x, y - 9 - i * LINE, f, SIZE, color));
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
