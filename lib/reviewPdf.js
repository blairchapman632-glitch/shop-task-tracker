// Performance review PDF — drawn from scratch with pdf-lib (no template). SERVER-SIDE ONLY (pages/api/reviews/*).
// Layout follows the paper form QSPP-4.9-PERF-FORM: header, sections 1–6 in order, office-use block.
// Pure function of its input, so Part 2 can regenerate the PDF when staff add comments.

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { sanitise, fmtDateLong } from "./contractPdf";
import {
  FORM_TITLE, FORM_DOC_ID, FORM_VERSION_NUMBER, FORM_QSPP_REF, FORM_VERSION,
  RATING_OPTIONS, PREP_QUESTIONS, SECTIONS, REVIEW_TYPE_LABEL, LABELS, DISPENSARY_HEADING, areasFor, perthDateOf,
} from "./performanceReview";

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 50;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_H = 30;

const BLACK = rgb(0.1, 0.1, 0.1);
const GREY = rgb(0.42, 0.42, 0.42);
const LIGHT = rgb(0.85, 0.85, 0.85);
const SHADE = rgb(0.94, 0.95, 0.97);

// input: {
//   review,                       — performance_reviews row (signed fields already set when signing)
//   staffName, reviewerName,      — names
//   pharmacy: { name, address, phone },
//   nextDue,                      — "YYYY-MM-DD" or null
// }
// Returns { bytes: Uint8Array, warnings: string[] }
export async function buildReviewPdf({ review, staffName, reviewerName, pharmacy = {}, nextDue }) {
  const warnings = [];
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  pdf.setTitle(`${FORM_TITLE} — ${staffName || ""}`);
  pdf.setProducer("Chalkboard");

  const clean = (f, s) => {
    const { text, changed } = sanitise(f, s ?? "");
    if (changed) warnings.push(`Some characters couldn't be printed in the PDF font and were replaced ("${String(s).slice(0, 40)}").`);
    return text;
  };

  // Word-wrap to a width; keeps blank lines, breaks over-long words
  const wrap = (str, f, size, width) => {
    const out = [];
    for (const para of clean(f, str).replace(/\r/g, "").split("\n")) {
      if (!para.trim()) { out.push(""); continue; }
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
    return out;
  };

  let page;
  let y;
  const newPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  };
  const ensure = (h) => { if (y - h < MARGIN + FOOTER_H) newPage(); };
  const draw = (str, x, yy, f = font, size = 10, color = BLACK) => {
    if (str) page.drawText(str, { x, y: yy, size, font: f, color });
  };

  // Paragraph of wrapped text (splits across pages line by line)
  const para = (str, { f = font, size = 10, color = BLACK, x = MARGIN, width = CONTENT_W, lead = 1.35, empty = "—" } = {}) => {
    const lines = String(str ?? "").trim() ? wrap(str, f, size, width) : [empty];
    for (const ln of lines) {
      ensure(size * lead);
      y -= size * lead;
      draw(ln, x, y + size * 0.25, f, size, ln === empty ? GREY : color);
    }
  };

  const sectionHeading = (title) => {
    ensure(40);
    y -= 14;
    page.drawRectangle({ x: MARGIN, y: y - 18, width: CONTENT_W, height: 20, color: SHADE });
    draw(clean(bold, title), MARGIN + 6, y - 12, bold, 11.5);
    y -= 26;
  };

  const label = (str) => {
    ensure(26);
    y -= 12;
    draw(clean(bold, str), MARGIN, y, bold, 9, GREY);
    y -= 2;
  };

  // Two-column label/value grid for short fields
  const grid = (rows) => {
    const colW = CONTENT_W / 2;
    for (let i = 0; i < rows.length; i += 2) {
      ensure(30);
      y -= 12;
      [rows[i], rows[i + 1]].forEach((r, j) => {
        if (!r) return;
        const x = MARGIN + j * colW;
        draw(clean(bold, r[0]), x, y, bold, 8.5, GREY);
        const v = wrap(r[1] || "—", font, 10, colW - 10)[0] || "—";
        draw(v, x, y - 13, font, 10, r[1] ? BLACK : GREY);
      });
      y -= 18;
    }
  };

  const checkbox = (x, yy, checked) => {
    page.drawRectangle({ x, y: yy, width: 9, height: 9, borderColor: BLACK, borderWidth: 0.8 });
    if (checked) {
      page.drawLine({ start: { x: x + 1.5, y: yy + 1.5 }, end: { x: x + 7.5, y: yy + 7.5 }, thickness: 1.2, color: BLACK });
      page.drawLine({ start: { x: x + 1.5, y: yy + 7.5 }, end: { x: x + 7.5, y: yy + 1.5 }, thickness: 1.2, color: BLACK });
    }
  };

  // ── Header ──
  newPage();
  const pharmName = clean(bold, pharmacy.name || "");
  if (pharmName) draw(pharmName, MARGIN, y - 12, bold, 13);
  const subLines = [pharmacy.address, pharmacy.phone ? `Phone ${pharmacy.phone}` : ""].filter(Boolean);
  subLines.forEach((s, i) => draw(clean(font, s), MARGIN, y - 27 - i * 12, font, 9, GREY));
  const rightX = PAGE_W - MARGIN;
  [`Document ID: ${FORM_DOC_ID}`, `Version: ${FORM_VERSION_NUMBER}`, FORM_QSPP_REF].forEach((s, i) => {
    draw(s, rightX - font.widthOfTextAtSize(s, 8.5), y - 10 - i * 11, font, 8.5, GREY);
  });
  y -= 27 + Math.max(subLines.length, 2) * 12 + 8;
  draw(FORM_TITLE, MARGIN, y - 18, bold, 18);
  y -= 26;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 1, color: BLACK });
  y -= 2;

  // ── 1. Review details ──
  sectionHeading(SECTIONS[0]);
  grid([
    ["Staff member", staffName],
    ["Position", review.position],
    ["Review type", REVIEW_TYPE_LABEL[review.review_type] || review.review_type],
    ["Reviewer", reviewerName],
    ["Meeting date", fmtDateLong(review.meeting_date)],
    ["Date of last review", fmtDateLong(review.last_review_date)],
  ]);

  // ── 2. Staff member's preparation ──
  sectionHeading(SECTIONS[1]);
  const prep = review.staff_prep || {};
  PREP_QUESTIONS.forEach((q, i) => {
    label(`${i + 1}. ${q.label}`);
    para(prep[q.key], { empty: "Not completed" });
  });

  // ── 3. Performance ──
  sectionHeading(SECTIONS[2]);
  const ratings = review.ratings || {};
  const optW = 72;
  const optsX = PAGE_W - MARGIN - optW * RATING_OPTIONS.length;
  const areaTextW = optsX - MARGIN - 10;
  for (const area of areasFor(review.include_dispensary_areas)) {
    if (area.key === "dispensing") { // first dispensary area — paper form heading
      ensure(60);
      y -= 14;
      draw(clean(bold, DISPENSARY_HEADING), MARGIN, y, bold, 9.5, GREY);
      y -= 2;
    }
    const r = ratings[area.key] || {};
    const labelLines = wrap(area.label, bold, 10, areaTextW);
    const descLines = wrap(area.description || "", font, 8.5, areaTextW);
    ensure(labelLines.length * 13 + descLines.length * 11 + 30);
    y -= 6;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.5, color: LIGHT });
    y -= 13;
    const top = y;
    RATING_OPTIONS.forEach((o, i) => {
      const x = optsX + i * optW;
      const on = r.rating === o.key;
      checkbox(x, top - 1, on);
      draw(o.label, x + 13, top, on ? bold : font, 9, on ? BLACK : GREY);
    });
    labelLines.forEach((ln, i) => draw(ln, MARGIN, top - i * 13, bold, 10));
    y = top - (labelLines.length - 1) * 13;
    descLines.forEach((ln) => { y -= 11; draw(ln, MARGIN, y, font, 8.5, GREY); });
    if (String(r.comment || "").trim()) {
      y -= 4;
      para(`Comment: ${r.comment}`, { size: 9.5 });
    }
    y -= 4;
  }
  label(LABELS.goalsProgress);
  para(review.goals_progress);
  label(LABELS.overallSummary);
  para(review.overall_summary);

  // ── 4. Goals and training ──
  sectionHeading(SECTIONS[3]);
  const goals = (Array.isArray(review.goals) ? review.goals : []).filter((g) => g && (g.goal || g.actions || g.target_date));
  if (!goals.length) para("", { empty: "No goals recorded" });
  goals.forEach((g, i) => {
    ensure(50);
    label(`${LABELS.goal} ${i + 1}`);
    para(g.goal);
    if (String(g.actions || "").trim()) para(`${LABELS.actions}: ${g.actions}`, { size: 9.5 });
    if (g.target_date) para(`${LABELS.targetDate}: ${fmtDateLong(g.target_date)}`, { size: 9.5 });
  });
  ensure(30);
  y -= 16;
  checkbox(MARGIN, y - 1, !!review.training_added);
  draw(
    `${LABELS.trainingAdded}${review.training_added && review.training_added_date ? ` on ${fmtDateLong(review.training_added_date)}` : ""}`,
    MARGIN + 14, y, font, 10,
  );
  y -= 6;

  // ── 5. Staff member's comments ──
  sectionHeading(SECTIONS[4]);
  if (String(review.staff_comments || "").trim()) {
    para(review.staff_comments);
    if (review.staff_comments_at) para(`Added ${fmtDateLong(perthDateOf(review.staff_comments_at))}`, { size: 8.5, color: GREY });
  } else {
    para("", {
      empty: review.comment_window_ends
        ? `No comments. The staff member may add comments until ${fmtDateLong(review.comment_window_ends)}.`
        : "No comments.",
    });
  }

  // ── 6. Sign-off ──
  sectionHeading(SECTIONS[5]);
  const signedDate = perthDateOf(review.signed_at);
  grid([
    ["Reviewer", reviewerName],
    ["Signed electronically by", review.signed_name],
    ["Date signed", fmtDateLong(signedDate)],
    ["Next review due", fmtDateLong(nextDue)],
  ]);

  // Office use
  ensure(110);
  y -= 10;
  const boxTop = y;
  const rows = [
    ["Signed by", review.signed_name || ""],
    ["Date", fmtDateLong(signedDate)],
    ["Copy given to staff member", review.copy_given ? `Yes${review.copy_given_date ? ` — ${fmtDateLong(review.copy_given_date)}` : ""}` : "No"],
    ["Next review due", fmtDateLong(nextDue)],
    ["Filed in personnel file", review.status === "signed" ? "Yes (electronic)" : ""],
  ];
  const boxH = 22 + rows.length * 15;
  page.drawRectangle({ x: MARGIN, y: boxTop - boxH, width: CONTENT_W, height: boxH, borderColor: BLACK, borderWidth: 0.8 });
  draw("OFFICE USE", MARGIN + 8, boxTop - 14, bold, 9);
  rows.forEach(([k, v], i) => {
    const yy = boxTop - 30 - i * 15;
    draw(clean(bold, k), MARGIN + 8, yy, bold, 9, GREY);
    draw(clean(font, v) || "—", MARGIN + 170, yy, font, 9.5, v ? BLACK : GREY);
  });
  y = boxTop - boxH;

  // ── Footer on every page ──
  const pages = pdf.getPages();
  const who = clean(font, staffName || "");
  pages.forEach((p, i) => {
    const left = `${FORM_VERSION}${who ? `  ·  ${who}` : ""}`;
    const right = `Page ${i + 1} of ${pages.length}`;
    p.drawLine({ start: { x: MARGIN, y: MARGIN + 12 }, end: { x: PAGE_W - MARGIN, y: MARGIN + 12 }, thickness: 0.5, color: LIGHT });
    p.drawText(left, { x: MARGIN, y: MARGIN, size: 8, font, color: GREY });
    p.drawText(right, { x: PAGE_W - MARGIN - font.widthOfTextAtSize(right, 8), y: MARGIN, size: 8, font, color: GREY });
  });

  const bytes = await pdf.save({ useObjectStreams: false });
  return { bytes, warnings: [...new Set(warnings)] };
}
