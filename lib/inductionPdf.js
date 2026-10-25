// Staff induction checklist PDF (QSPP-4.9-induction-checklist v2.2) — drawn with pdf-lib. SERVER-SIDE ONLY.
// Order follows the paper form: header, Section 1, Getting started (practical), Sections 2–4, 5 (probation + sign-off), Office use.
// Every line shows its result, date, who (name / Admin / Auto / Read · kiosk) and note.
// Stored in the PRIVATE staff-inductions bucket (it includes immunisation status) — lib/inductionSignoff.js.

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { sanitise, fmtDateLong } from "./contractPdf";
import { perthDateOf, todayPerth } from "./performanceReview";
import { LOGO_BASE64 } from "./locumLogo";
import { SECTIONS, SIGNOFF_TITLE, FORM_META, answerLabel, outcomeText, signerLabel, reviewDateOf } from "./induction";

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 45;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_H = 30;
const RESULT_W = 150; // right-hand column: result / date · who

const BLACK = rgb(0.1, 0.1, 0.1);
const GREY = rgb(0.42, 0.42, 0.42);
const LIGHT = rgb(0.85, 0.85, 0.85);
const SHADE = rgb(0.94, 0.95, 0.97);
const GREEN = rgb(0.08, 0.45, 0.2);

// input: {
//   induction, items,                     — staff_inductions row + all its staff_induction_items
//   staff: { name, role },
//   names: (staffId) => name,              — supervisor, signers, reviewer
//   review,                                — the probation review (or null)
//   pharmacy: { name, address, phone },
// }
// Returns { bytes, warnings }
export async function buildInductionPdf({ induction, items, staff, names, review, pharmacy = {} }) {
  const warnings = [];
  const nameOf = (id) => (id ? names(id) || "" : "");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  pdf.setTitle(`${FORM_META.title} — ${staff?.name || ""}`);
  pdf.setProducer("Chalkboard");

  let logo = null;
  try { logo = await pdf.embedJpg(Buffer.from(LOGO_BASE64, "base64")); } catch { warnings.push("Logo couldn't be added."); }

  const clean = (f, s) => {
    const { text, changed } = sanitise(f, s ?? "");
    if (changed) warnings.push(`Some characters couldn't be printed in the PDF font and were replaced ("${String(s).slice(0, 40)}").`);
    return text;
  };
  const wrap = (str, f, size, width) => {
    const out = [];
    for (const para of clean(f, str).replace(/\r/g, "").split("\n")) {
      if (!para.trim()) continue;
      let line = "";
      for (let word of para.split(/\s+/).filter(Boolean)) {
        while (f.widthOfTextAtSize(word, size) > width) {
          let i = word.length - 1;
          while (i > 1 && f.widthOfTextAtSize(word.slice(0, i), size) > width) i--;
          if (line) { out.push(line); line = ""; }
          out.push(word.slice(0, i));
          word = word.slice(i);
        }
        const test = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(test, size) <= width) line = test;
        else { out.push(line); line = word; }
      }
      if (line) out.push(line);
    }
    return out.length ? out : [""];
  };

  let page;
  let y;
  const newPage = () => { page = pdf.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; };
  const ensure = (h) => { if (y - h < MARGIN + FOOTER_H) newPage(); };
  const draw = (str, x, yy, f = font, size = 10, color = BLACK) => { if (str) page.drawText(str, { x, y: yy, size, font: f, color }); };
  const fmt = (d) => (d ? fmtDateLong(d) : "");

  const sectionHeading = (title, sub) => {
    ensure(50);
    y -= 12;
    page.drawRectangle({ x: MARGIN, y: y - 18, width: CONTENT_W, height: 20, color: SHADE });
    draw(clean(bold, title), MARGIN + 6, y - 12, bold, 11.5);
    if (sub) {
      const s = clean(font, sub);
      draw(s, PAGE_W - MARGIN - 6 - font.widthOfTextAtSize(s, 8.5), y - 12, font, 8.5, GREY);
    }
    y -= 24;
  };

  const grid = (rows) => {
    const colW = CONTENT_W / 2;
    for (let i = 0; i < rows.length; i += 2) {
      const pair = [rows[i], rows[i + 1]].filter(Boolean);
      const lines = pair.map((r) => wrap(r[1] || "—", font, 10, colW - 12));
      const h = 14 + Math.max(...lines.map((l) => l.length)) * 12;
      ensure(h + 4);
      y -= 11;
      pair.forEach((r, j) => {
        const x = MARGIN + j * colW;
        draw(clean(bold, r[0]), x, y, bold, 8.5, GREY);
        lines[j].forEach((ln, k) => draw(ln, x, y - 12 - k * 12, font, 10, r[1] ? BLACK : GREY));
      });
      y -= h - 7;
    }
  };

  // One checklist line: wording on the left, result + date · who on the right, note underneath
  const itemRow = (item) => {
    const textW = CONTENT_W - RESULT_W - 12;
    const words = wrap(item.wording, font, 9.5, textW);
    const res = item.result ? answerLabel(item.result, item.section) : "Not answered";
    const meta = item.result ? [fmtDateLong(perthDateOf(item.signed_at)), signerLabel(item, nameOf)].filter(Boolean).join(" · ") : "";
    const metaLines = meta ? wrap(meta, font, 8, RESULT_W) : [];
    const note = item.note && !(item.signed_via === "auto" && item.section === "3") ? item.note : ""; // policy reads: note = "Read … · kiosk"
    const noteLines = note ? wrap(`Note: ${note}`, font, 8.5, textW) : [];
    const tags = [item.pharmacist_only ? "Pharmacist" : "", item.is_custom ? "Added" : ""].filter(Boolean).join(" · ");
    const h = Math.max(words.length * 12 + (tags ? 10 : 0) + noteLines.length * 10.5, 12 + metaLines.length * 10) + 6;
    ensure(h + 2);
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.4, color: LIGHT });
    let yy = y - 11;
    words.forEach((ln, k) => draw(ln, MARGIN, yy - k * 12, font, 9.5));
    yy -= words.length * 12;
    if (tags) { draw(clean(font, tags), MARGIN, yy + 2, font, 7.5, GREY); yy -= 10; }
    noteLines.forEach((ln, k) => draw(ln, MARGIN, yy + 1 - k * 10.5, font, 8.5, GREY));
    const rx = PAGE_W - MARGIN - RESULT_W;
    draw(clean(bold, res), rx, y - 11, bold, 9.5, item.result ? (item.result === "done" ? GREEN : BLACK) : GREY);
    metaLines.forEach((ln, k) => draw(ln, rx, y - 22 - k * 10, font, 8, GREY));
    y -= h;
  };

  const sectionItems = (key) => (items || []).filter((i) => i.section === key).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const itemsBlock = (key) => {
    const rows = sectionItems(key);
    if (!rows.length) { ensure(16); y -= 14; draw("No lines.", MARGIN, y, font, 9, GREY); return; }
    let heading = null;
    for (const r of rows) {
      if ((r.group_heading || "") !== heading) {
        heading = r.group_heading || "";
        if (heading) { ensure(40); y -= 14; draw(clean(bold, heading.toUpperCase()), MARGIN, y, bold, 8.5, GREY); y -= 4; }
      }
      itemRow(r);
    }
    y -= 2;
  };

  // ── Header ──
  newPage();
  let logoW = 0;
  if (logo) {
    const dims = logo.scaleToFit(110, 48);
    page.drawImage(logo, { x: MARGIN, y: y - dims.height, width: dims.width, height: dims.height });
    logoW = dims.width + 12;
  }
  // The logo already carries the pharmacy name — only type it when there's no logo
  const pharmName = logo ? "" : clean(bold, pharmacy.name || "");
  if (pharmName) draw(pharmName, MARGIN, y - 13, bold, 12);
  [pharmacy.address, pharmacy.phone ? `Phone ${pharmacy.phone}` : ""].filter(Boolean)
    .forEach((s, i) => draw(clean(font, s), MARGIN + logoW, y - (logo ? 13 : 27) - i * 11, font, 8.5, GREY));
  const meta = [
    `Document ID: ${FORM_META.docId}`,
    `Version: ${FORM_META.version}`,
    `Effective: ${FORM_META.effective || "—"}`,
    `Review due: ${FORM_META.reviewDue || "—"}`,
    `Owner: ${FORM_META.owner || "—"}`,
    FORM_META.qsppRefs ? `QSPP: ${FORM_META.qsppRefs}` : "",
  ].filter(Boolean);
  meta.forEach((s, i) => { const t = clean(font, s); draw(t, PAGE_W - MARGIN - font.widthOfTextAtSize(t, 8), y - 9 - i * 10, font, 8, GREY); });
  y -= Math.max(56, meta.length * 10 + 8);
  draw(FORM_META.title, MARGIN, y - 18, bold, 18);
  y -= 26;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1, color: BLACK });
  y -= 2;

  // ── 1. Staff details ──
  sectionHeading("1. Staff details");
  grid([
    ["Staff member", staff?.name],
    ["Position", `${staff?.role || ""}${induction.is_student ? " (pharmacy student)" : ""}`],
    ["Start date", fmt(induction.start_date)],
    ["Supervisor", nameOf(induction.supervisor_staff_id)],
    ["Complete by", fmt(induction.due_date)],
    ["Checklist version", `${FORM_META.docId} ${induction.template_version || ""}`.trim()],
  ]);

  // ── Getting started, Sections 2–4 (and an older induction's "Your training" lines, if it has any) ──
  for (const s of SECTIONS.filter((x) => x.key !== "office")) {
    if (s.key === "5" && !sectionItems("5").length) continue; // retired section — hidden when empty
    sectionHeading(s.sub ? `${s.title} — ${s.sub}` : s.title, s.pdfLabel || "");
    itemsBlock(s.key);
  }

  // ── 5. Probation review and sign-off ──
  sectionHeading(SIGNOFF_TITLE);
  const lastDate = (items || []).filter((i) => i.result && i.signed_at).map((i) => perthDateOf(i.signed_at)).sort().pop() || null;
  const inTime = lastDate ? lastDate <= induction.due_date : null;
  grid([
    ["Probation reviewer", review ? nameOf(review.reviewer_staff_id) : ""],
    ["Probation review date", review ? fmt(reviewDateOf(review)) : ""],
    ["Probation outcome", outcomeText(induction)],
    ["Completed within 3 months", inTime === null ? "" : inTime ? "Yes" : `No${induction.late_reason ? ` — ${induction.late_reason}` : ""}`],
    ["Employee confirmation", induction.employee_confirmed_at
      ? `Confirmed ${fmt(perthDateOf(induction.employee_confirmed_at))}${induction.employee_confirmed_via ? ` (${induction.employee_confirmed_via})` : ""}` : ""],
    ["Supervisor sign-off", induction.signed_off_at
      ? `${nameOf(induction.signed_off_by_staff_id)} — ${fmt(perthDateOf(induction.signed_off_at))}${induction.signed_off_via === "me" ? " (staff app)" : induction.signed_off_via === "admin" ? " (Admin)" : ""}` : ""],
  ]);

  // ── Office use ──
  sectionHeading("OFFICE USE");
  itemsBlock("office");

  // ── Footer on every page ──
  const pages = pdf.getPages();
  const filed = `Filed ${fmtDateLong(perthDateOf(induction.signed_off_at) || todayPerth())}`;
  const who = clean(font, staff?.name || "");
  pages.forEach((p, i) => {
    const left = `${FORM_META.docId} v${FORM_META.version}${who ? `  ·  ${who}` : ""}  ·  ${filed}`;
    const right = `Page ${i + 1} of ${pages.length}`;
    p.drawLine({ start: { x: MARGIN, y: MARGIN + 12 }, end: { x: PAGE_W - MARGIN, y: MARGIN + 12 }, thickness: 0.5, color: LIGHT });
    p.drawText(left, { x: MARGIN, y: MARGIN, size: 8, font, color: GREY });
    p.drawText(right, { x: PAGE_W - MARGIN - font.widthOfTextAtSize(right, 8), y: MARGIN, size: 8, font, color: GREY });
  });

  const bytes = await pdf.save({ useObjectStreams: false });
  return { bytes, warnings: [...new Set(warnings)] };
}
