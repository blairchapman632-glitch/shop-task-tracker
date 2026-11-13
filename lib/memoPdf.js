// Staff memo PDF — drawn with pdf-lib in the same plain style as the other Chalkboard PDFs (lib/reviewPdf.js).
// SERVER-SIDE ONLY (pages/api/memos/pdf.js). Title, date sent, sent by, then each section: heading, formatted text
// (lib/memos.js parseMemoText — bold / italic / headings / lists / links), JPG + PNG images, PDF attachment names,
// signature. Optional last page: who has seen it (manager mode only).
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { sanitise } from "./contractPdf";
import { parseMemoText, fmtMemoDate, fmtMemoDateRange } from "./memos";

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 50;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_H = 30;

const BLACK = rgb(0.1, 0.1, 0.1);
const GREY = rgb(0.42, 0.42, 0.42);
const LIGHT = rgb(0.85, 0.85, 0.85);
const BLUE = rgb(0.11, 0.31, 0.85);
const SHADE = rgb(0.94, 0.95, 0.97);
const CHIP = rgb(0.94, 0.96, 1);
const CHIP_BORDER = rgb(0.75, 0.83, 0.99);
const CHIP_TEXT = rgb(0.12, 0.23, 0.54);

// Emoji can't be printed in the PDF font — leave them out rather than print "?"
const noEmoji = (s) => String(s ?? "").replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}\u{20E3}]/gu, "").replace(/ {2,}/g, " ");

// input: { memo, sections, sentByName, pharmacyName, seenBy?: [{ name, seen_at, seen_via }] | null, fetchImage(url) -> bytes }
export async function buildMemoPdf({ memo, sections, sentByName, pharmacyName, seenBy = null, fetchImage, policies = [], dates = [], updates = [] }) {
  const pdf = await PDFDocument.create();
  const fonts = {
    r: await pdf.embedFont(StandardFonts.Helvetica),
    b: await pdf.embedFont(StandardFonts.HelveticaBold),
    i: await pdf.embedFont(StandardFonts.HelveticaOblique),
    bi: await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
  };
  const font = fonts.r;
  const bold = fonts.b;
  pdf.setTitle(noEmoji(memo.title));
  pdf.setProducer("Chalkboard");

  const clean = (f, s) => sanitise(f, noEmoji(s)).text;

  let page;
  let y;
  const newPage = () => { page = pdf.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; };
  const ensure = (h) => { if (y - h < MARGIN + FOOTER_H) newPage(); };
  const draw = (str, x, yy, f = font, size = 10.5, color = BLACK) => { if (str) page.drawText(str, { x, y: yy, size, font: f, color }); };

  // ── Rich text: inline parts -> words with a font each, wrapped across runs ──
  const fontFor = (st) => (st.b && st.i ? fonts.bi : st.b ? fonts.b : st.i ? fonts.i : fonts.r);
  const wordsOf = (parts, st = {}, out = []) => {
    for (const p of parts || []) {
      if (p.t === "br") out.push({ br: true });
      else if (p.t === "text") {
        const f = fontFor(st);
        const pieces = clean(f, p.text).split(/(\s+)/);
        for (const piece of pieces) {
          if (!piece) continue;
          if (/^\s+$/.test(piece)) out.push({ space: true });
          else out.push({ w: piece, f, link: st.link });
        }
      } else if (p.t === "bold") wordsOf(p.children, { ...st, b: true }, out);
      else if (p.t === "italic") wordsOf(p.children, { ...st, i: true }, out);
      else if (p.t === "strike") wordsOf(p.children, st, out);
      else if (p.t === "link") {
        const before = out.length;
        wordsOf(p.children, { ...st, link: true }, out);
        const shown = out.slice(before).filter((x) => x.w).map((x) => x.w).join(" ");
        const href = clean(font, p.href.replace(/^mailto:|^tel:/i, ""));
        if (href && shown !== href) { out.push({ space: true }); out.push({ w: `(${href})`, f: font, link: true }); }
      }
    }
    return out;
  };

  // Lay out words into lines of { segs: [{ text, f, link }], width }
  const layout = (words, size, width) => {
    const lines = [];
    let segs = [];
    let w = 0;
    let pendingSpace = false;
    const push = () => { lines.push(segs); segs = []; w = 0; pendingSpace = false; };
    for (const t of words) {
      if (t.br) { push(); continue; }
      if (t.space) { if (segs.length) pendingSpace = true; continue; }
      let word = t.w;
      // Very long words (URLs): break them up
      while (t.f.widthOfTextAtSize(word, size) > width) {
        let k = word.length - 1;
        while (k > 1 && t.f.widthOfTextAtSize(word.slice(0, k), size) > width) k--;
        if (segs.length) push();
        segs.push({ text: word.slice(0, k), f: t.f, link: t.link });
        push();
        word = word.slice(k);
      }
      const spaceW = pendingSpace ? t.f.widthOfTextAtSize(" ", size) : 0;
      const ww = t.f.widthOfTextAtSize(word, size);
      if (segs.length && w + spaceW + ww > width) push();
      const gap = segs.length && pendingSpace ? " " : "";
      segs.push({ text: gap + word, f: t.f, link: t.link });
      w += (gap ? spaceW : 0) + ww;
      pendingSpace = false;
    }
    if (segs.length) push();
    return lines;
  };

  const richLines = (parts, { size = 10.5, x = MARGIN, width = CONTENT_W, lead = 1.4, color = BLACK, prefix = null } = {}) => {
    const lines = layout(wordsOf(parts), size, width);
    lines.forEach((segs, n) => {
      ensure(size * lead);
      y -= size * lead;
      if (n === 0 && prefix) draw(prefix, x - 14, y + size * 0.25, font, size, color);
      let xx = x;
      for (const s of segs) {
        draw(s.text, xx, y + size * 0.25, s.f, size, s.link ? BLUE : color);
        xx += s.f.widthOfTextAtSize(s.text, size);
      }
    });
  };

  const blocks = (list, indent = 0) => {
    for (const bl of list) {
      if (bl.type === "h2" || bl.type === "h3") {
        ensure(30);
        y -= 6;
        richLines(bl.inline.map((p) => ({ t: "bold", children: [p] })), { size: bl.type === "h2" ? 13 : 11.5, x: MARGIN + indent, width: CONTENT_W - indent });
        y -= 2;
      } else if (bl.type === "ul" || bl.type === "ol") {
        bl.items.forEach((it, k) => {
          const mark = bl.type === "ul" ? "•" : `${(bl.start || 1) + k}.`;
          richLines(it.inline, { x: MARGIN + indent + 16, width: CONTENT_W - indent - 16, prefix: mark });
          if (it.children.length) blocks(it.children, indent + 16);
        });
        y -= 4;
      } else {
        richLines(bl.inline, { x: MARGIN + indent, width: CONTENT_W - indent });
        y -= 5;
      }
    }
  };

  const imageBlock = async (img) => {
    const ext = String(img.path || img.url || "").split(".").pop().toLowerCase();
    let embedded = null;
    if (["jpg", "jpeg", "png"].includes(ext) && fetchImage) {
      try {
        const bytes = await fetchImage(img.url);
        embedded = ext === "png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      } catch { embedded = null; }
    }
    if (!embedded) {
      richLines([{ t: "italic", children: [{ t: "text", text: `[Image: ${img.name || "picture"} — see the memo in Chalkboard]` }] }], { color: GREY, size: 9.5 });
      return;
    }
    const maxW = Math.min(CONTENT_W, 360);
    const maxH = 260;
    const scale = Math.min(maxW / embedded.width, maxH / embedded.height, 1);
    const w = embedded.width * scale;
    const h = embedded.height * scale;
    ensure(h + 10);
    y -= h + 6;
    page.drawImage(embedded, { x: MARGIN, y, width: w, height: h });
    y -= 4;
  };

  // ── Header ──
  newPage();
  if (pharmacyName) draw(clean(font, pharmacyName), MARGIN, y - 10, font, 9, GREY);
  y -= 26;
  draw("STAFF MEMO", MARGIN, y, bold, 9, BLUE);
  y -= 6;
  richLines([{ t: "bold", children: [{ t: "text", text: memo.title }] }], { size: 20, lead: 1.25 });
  const sentLine = memo.sent_at ? `Sent ${fmtMemoDate(memo.sent_at)}${sentByName ? ` by ${sentByName}` : ""}${memo.imported ? " · Imported from email" : ""}` : "Draft — not sent";
  y -= 4;
  draw(clean(font, sentLine), MARGIN, y - 10, font, 10, GREY);
  y -= 22;
  // Imported from email: type, who it was sent to, attachment names (files stay in the email)
  if (memo.imported) {
    const meta = [memo.import_kind, memo.import_sent_to && `Sent to: ${memo.import_sent_to}`].filter(Boolean).join("  ·  ");
    if (meta) { y += 8; richLines([{ t: "text", text: meta }], { size: 9, color: GREY, lead: 1.3 }); y -= 6; }
    if ((memo.import_attachments || []).length) {
      richLines([{ t: "text", text: `Attachments (in the original email): ${memo.import_attachments.join("; ")}` }], { size: 9, color: GREY, lead: 1.3 });
      y -= 6;
    }
  }
  // Topic tags as small chips
  if ((memo.topics || []).length) {
    let x = MARGIN;
    const size = 8.5;
    for (const t of memo.topics) {
      const label = clean(font, t);
      const w = font.widthOfTextAtSize(label, size) + 12;
      if (x + w > PAGE_W - MARGIN) { x = MARGIN; y -= 18; }
      page.drawRectangle({ x, y: y - 4, width: w, height: 15, color: CHIP, borderColor: CHIP_BORDER, borderWidth: 0.5 });
      draw(label, x + 6, y, font, size, CHIP_TEXT);
      x += w + 5;
    }
    y -= 16;
  }
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.75, color: LIGHT });
  y -= 6;

  // ── Sections ──
  for (const s of sections) {
    if (String(s.heading || "").trim()) {
      ensure(48);
      y -= 14;
      page.drawRectangle({ x: MARGIN, y: y - 18, width: CONTENT_W, height: 22, color: SHADE });
      draw(clean(bold, s.heading.trim()).slice(0, 120), MARGIN + 6, y - 11, bold, 12.5);
      y -= 26;
    } else y -= 10;
    blocks(parseMemoText(s.body));
    for (const img of s.images || []) await imageBlock(img); // eslint-disable-line no-await-in-loop
    for (const f of s.attachments || []) {
      richLines([{ t: "text", text: `Attached PDF: ${f.name || "document"} (open the memo in Chalkboard)` }], { size: 9.5, color: GREY });
    }
    const sig = [s.signature_name, s.signature_role].filter(Boolean).join(", ");
    if (sig) {
      y -= 4;
      richLines([{ t: "italic", children: [{ t: "text", text: `— ${sig}` }] }], { size: 10, color: GREY });
    }
    y -= 6;
  }

  // ── Policies to read / Dates (Stage 4) ──
  const boxHeading = (text) => {
    ensure(48);
    y -= 14;
    page.drawRectangle({ x: MARGIN, y: y - 18, width: CONTENT_W, height: 22, color: SHADE });
    draw(clean(bold, text), MARGIN + 6, y - 11, bold, 12.5);
    y -= 26;
  };
  if (policies.length) {
    boxHeading("Policies to read");
    richLines([{ t: "text", text: "You'll be asked to read each of these in Chalkboard (kiosk or phone)." }], { size: 9.5, color: GREY });
    for (const p of policies) {
      richLines([{ t: "text", text: `${p.title}${p.version ? `  (v${p.version})` : ""}${p.active === false ? "  (retired)" : ""}` }], { x: MARGIN + 16, width: CONTENT_W - 16, prefix: "•" });
    }
    y -= 6;
  }
  if (dates.length) {
    boxHeading("Dates");
    for (const d of dates) {
      richLines([
        { t: "bold", children: [{ t: "text", text: fmtMemoDateRange(d.start_date, d.end_date) }] },
        { t: "text", text: ` — ${d.title}${d.category_name ? `  (${d.category_name})` : ""}` },
      ], { x: MARGIN + 16, width: CONTENT_W - 16, prefix: "•" });
    }
    y -= 6;
  }

  // ── Updates (a manager's updates / corrections after sending) ──
  if (updates.length) {
    boxHeading(updates.length === 1 ? "Update" : "Updates");
    for (const u of updates) {
      const when = new Date(u.created_at).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Australia/Perth" });
      richLines([{ t: "bold", children: [{ t: "text", text: `${when} — ${u.author_name || "Manager"}` }] }], { size: 9.5, color: GREY });
      richLines(String(u.body || "").split("\n").flatMap((line, i) => (i ? [{ t: "br" }, { t: "text", text: line }] : [{ t: "text", text: line }])));
      y -= 6;
    }
  }

  // ── Seen by (manager PDF only) ──
  if (seenBy) {
    newPage();
    const seen = seenBy.filter((r) => r.seen_at).sort((a, b) => String(a.seen_at).localeCompare(String(b.seen_at)));
    const notSeen = seenBy.filter((r) => !r.seen_at).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    draw("SEEN BY", MARGIN, y - 10, bold, 9, BLUE);
    y -= 32;
    draw(clean(bold, `Seen by ${seen.length} of ${seenBy.length}`), MARGIN, y, bold, 16);
    y -= 10;
    draw(clean(font, memo.title), MARGIN, y - 10, font, 10, GREY);
    y -= 28;
    const row = (cells, f = font, color = BLACK) => {
      ensure(18);
      y -= 15;
      draw(clean(f, cells[0]), MARGIN, y, f, 10, color);
      draw(clean(f, cells[1]), MARGIN + 220, y, f, 10, color);
      draw(clean(f, cells[2]), MARGIN + 360, y, f, 10, color);
    };
    const when = (ts) => new Date(ts).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Australia/Perth" });
    row(["Name", "Seen", "Where"], bold, GREY);
    page.drawLine({ start: { x: MARGIN, y: y - 5 }, end: { x: PAGE_W - MARGIN, y: y - 5 }, thickness: 0.5, color: LIGHT });
    y -= 4;
    for (const r of seen) row([r.name, when(r.seen_at), r.seen_via === "kiosk" ? "Shop computer" : "Phone"]);
    for (const r of notSeen) row([r.name, "Not seen yet", ""], font, GREY);
  }

  // ── Footer on every page ──
  const pages = pdf.getPages();
  const left = clean(font, memo.title).slice(0, 80);
  pages.forEach((p, i) => {
    const right = `Page ${i + 1} of ${pages.length}`;
    p.drawLine({ start: { x: MARGIN, y: MARGIN + 12 }, end: { x: PAGE_W - MARGIN, y: MARGIN + 12 }, thickness: 0.5, color: LIGHT });
    p.drawText(left, { x: MARGIN, y: MARGIN, size: 8, font, color: GREY });
    p.drawText(right, { x: PAGE_W - MARGIN - font.widthOfTextAtSize(right, 8), y: MARGIN, size: 8, font, color: GREY });
  });

  return pdf.save({ useObjectStreams: false });
}
