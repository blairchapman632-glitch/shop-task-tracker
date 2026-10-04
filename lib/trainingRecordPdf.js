// Staff training record PDF (QSPP 2.4.1.5) — built in the browser with pdf-lib and downloaded, never stored.
// Lists one person's training records in a date range with a total of hours.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { sanitise, fmtDateLong } from "./contractPdf";
import { fmtDateShort } from "./performanceReview";

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 50;
const FOOTER_H = 30;
const BLACK = rgb(0.1, 0.1, 0.1);
const GREY = rgb(0.42, 0.42, 0.42);
const LIGHT = rgb(0.85, 0.85, 0.85);
const SHADE = rgb(0.94, 0.95, 0.97);

// Columns: x offset + width
const COLS = [
  { key: "date", label: "Date", w: 80 },
  { key: "title", label: "Training", w: 215 },
  { key: "provider", label: "Provider / type", w: 145 },
  { key: "hours", label: "Hours", w: 55, right: true },
];

// input: { staffName, role, pharmacy: { name, address, phone }, from, to, generatedOn, records: [{ training_date, topic, provider, hours }] }
// -> { bytes, warnings }
export async function buildTrainingRecordPdf({ staffName, role, pharmacy = {}, from, to, generatedOn, records }) {
  const warnings = [];
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  pdf.setTitle(`Training record — ${staffName || ""}`);
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
  const draw = (s, x, yy, f = font, size = 10, color = BLACK) => { if (s) page.drawText(s, { x, y: yy, size, font: f, color }); };

  const tableHeader = () => {
    page.drawRectangle({ x: MARGIN, y: y - 16, width: PAGE_W - MARGIN * 2, height: 18, color: SHADE });
    let x = MARGIN + 4;
    for (const c of COLS) {
      const tx = c.right ? x + c.w - 8 - bold.widthOfTextAtSize(c.label, 9) : x;
      draw(c.label, tx, y - 11, bold, 9);
      x += c.w;
    }
    y -= 22;
  };
  const newPage = (withHeader) => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
    if (withHeader) tableHeader();
  };

  // ── Header ──
  newPage(false);
  const pharmName = clean(bold, pharmacy.name || "");
  if (pharmName) draw(pharmName, MARGIN, y - 12, bold, 13);
  const sub = [pharmacy.address, pharmacy.phone ? `Phone ${pharmacy.phone}` : ""].filter(Boolean);
  sub.forEach((s, i) => draw(clean(font, s), MARGIN, y - 27 - i * 12, font, 9, GREY));
  const gen = `Generated ${fmtDateLong(generatedOn)}`;
  draw(gen, PAGE_W - MARGIN - font.widthOfTextAtSize(gen, 8.5), y - 10, font, 8.5, GREY);
  y -= 27 + Math.max(sub.length, 1) * 12 + 8;
  draw("Training Record", MARGIN, y - 18, bold, 18);
  y -= 26;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1, color: BLACK });
  y -= 18;
  draw("Staff member", MARGIN, y, bold, 8.5, GREY);
  draw("Period", MARGIN + 250, y, bold, 8.5, GREY);
  y -= 13;
  draw(clean(font, `${staffName || ""}${role ? ` (${role})` : ""}`), MARGIN, y, font, 10.5);
  draw(`${fmtDateLong(from)} to ${fmtDateLong(to)}`, MARGIN + 250, y, font, 10.5);
  y -= 22;

  // ── Table ──
  tableHeader();
  const rows = [...(records || [])].sort((a, b) => String(a.training_date).localeCompare(String(b.training_date)));
  let total = 0;
  if (!rows.length) {
    draw("No training recorded in this period.", MARGIN + 4, y - 10, font, 10, GREY);
    y -= 20;
  }
  for (const r of rows) {
    const hrs = Number(r.hours) || 0;
    total += hrs;
    const cells = {
      date: [fmtDateShort(r.training_date)],
      title: wrap(r.topic || "", font, 9.5, COLS[1].w - 10),
      provider: wrap(r.provider || "", font, 9.5, COLS[2].w - 10),
      hours: [String(Math.round(hrs * 100) / 100)],
    };
    const h = Math.max(...Object.values(cells).map((l) => l.length)) * 12 + 6;
    if (y - h < MARGIN + FOOTER_H + 30) newPage(true);
    let x = MARGIN + 4;
    for (const c of COLS) {
      cells[c.key].forEach((ln, i) => {
        const tx = c.right ? x + c.w - 8 - font.widthOfTextAtSize(ln, 9.5) : x;
        draw(ln, tx, y - 10 - i * 12, font, 9.5);
      });
      x += c.w;
    }
    y -= h;
    page.drawLine({ start: { x: MARGIN, y: y + 2 }, end: { x: PAGE_W - MARGIN, y: y + 2 }, thickness: 0.5, color: LIGHT });
  }

  // Total
  if (y < MARGIN + FOOTER_H + 30) newPage(false);
  y -= 8;
  const totalText = String(Math.round(total * 100) / 100);
  const hoursX = MARGIN + 4 + COLS.slice(0, 3).reduce((s, c) => s + c.w, 0);
  draw("Total hours", hoursX - 8 - bold.widthOfTextAtSize("Total hours", 10), y - 10, bold, 10);
  draw(totalText, hoursX + COLS[3].w - 8 - bold.widthOfTextAtSize(totalText, 10), y - 10, bold, 10);

  // Footer
  const pages = pdf.getPages();
  const who = clean(font, staffName || "");
  pages.forEach((p, i) => {
    const left = `Training record${who ? `  ·  ${who}` : ""}`;
    const right = `Page ${i + 1} of ${pages.length}`;
    p.drawLine({ start: { x: MARGIN, y: MARGIN + 12 }, end: { x: PAGE_W - MARGIN, y: MARGIN + 12 }, thickness: 0.5, color: LIGHT });
    p.drawText(left, { x: MARGIN, y: MARGIN, size: 8, font, color: GREY });
    p.drawText(right, { x: PAGE_W - MARGIN - font.widthOfTextAtSize(right, 8), y: MARGIN, size: 8, font, color: GREY });
  });

  const bytes = await pdf.save({ useObjectStreams: false });
  return { bytes, warnings: [...new Set(warnings)] };
}
