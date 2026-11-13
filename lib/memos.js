// Staff memos — shared rules (browser + server). Tables: staff_memos, staff_memo_sections (docs/sql/staff_memos_2026-11-13.sql).
//   Writing (create / edit / delete drafts, Send) is QSPP managers only — every save goes through /api/memos, which
//   re-checks the person's PIN (lib/adminPin.js checkQsppManagerPin). Anyone can read sent memos (Messages → Staff memos).
// Section text: Markdown written by the what-you-see editor — see "Formatted text" below.
import { Lexer } from "marked";

export { MEMO_BUCKET, IMAGE_EXTS, ATTACHMENT_EXTS, MAX_IMAGE_MB, MAX_PDF_MB } from "./memoFiles";


// Topic tags (stored on staff_memos.topics — later feeds the QSPP Governance log)
export const MEMO_TOPICS = [
  "Procedure change",
  "Accreditation & training",
  "WHS",
  "Incident learning",
  "Health promotion",
  "Services",
  "Systems & IT",
  "Rostering & leave",
  "General / social",
];


// Fields a manager may change
export const MEMO_FIELDS = ["title", "topics"];
export const SECTION_FIELDS = ["heading", "body", "images", "attachments", "author_staff_id", "signature_name", "signature_role"];

// "December 2026 Staff Memo" for a Perth date "YYYY-MM-DD"
export function defaultMemoTitle(today) {
  const [y, m] = String(today).split("-").map(Number);
  const month = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-AU", { month: "long", timeZone: "UTC" });
  return `${month} ${y} Staff Memo`;
}

// "1 Dec 2026" from a timestamp, Perth time
export const fmtMemoDate = (ts) => (ts ? new Date(ts).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Perth" }) : "");

// Plain text of a memo for search (title + headings + text)
export function memoSearchText(memo, sections = []) {
  return [memo.title, ...sections.flatMap((s) => [s.heading, memoPlainText(s.body), s.signature_name])].filter(Boolean).join("\n").toLowerCase();
}

// A section with nothing in it (dropped on Send)
export const sectionIsEmpty = (s) => !String(s.heading || "").trim() && !memoPlainText(s.body) && !(s.images || []).length && !(s.attachments || []).length;

// ── Sections asked of a staff member (Stage 2: "Ask for a section from…") ──
// Written = it has text, images or PDFs (the default heading alone doesn't count). The person's job ("Add your section
// to the …") is open while their slot isn't written and they haven't said "Nothing this month" (declined_at).
export const sectionHasContent = (s) => !!memoPlainText(s.body) || !!(s.images || []).length || !!(s.attachments || []).length;
export const isAsked = (s) => !!s.requested_staff_id;
export const askOpen = (s) => isAsked(s) && !s.declined_at && !sectionHasContent(s);
// "Waiting" / "Written" / "Nothing this month" (manager's view of an asked slot)
export const askStatus = (s) => (s.declined_at ? "Nothing this month" : sectionHasContent(s) ? "Written" : "Waiting");
// Shown to staff (and in Preview): not declined, not an asked slot still waiting, not empty
export const sectionShown = (s) => !s.declined_at && !(isAsked(s) && !sectionHasContent(s)) && !sectionIsEmpty(s);
// Default heading for someone asked for the first time
export const defaultAskHeading = (name) => `Message from ${String(name || "").split(" ")[0] || "the team"}`;

// Fields the asked person may change in their own section
export const CONTRIBUTOR_FIELDS = ["heading", "body", "images"];

// ── Formatted text ──
// Section text is Markdown saved by the editor (components/memos/RichTextEditor.js — TipTap + @tiptap/markdown):
// "## Heading", "### Small heading", "- bullet", "1. numbered", **bold**, *italic*, [text](https://link), emoji as typed.
// It's read with marked's lexer (the parser TipTap itself uses) and turned into plain blocks that the memo display (and
// later the PDF) draw themselves — never inserted as HTML, so nothing typed can inject markup.
//   -> blocks: { type: "h2" | "h3" | "p", inline } | { type: "ul" | "ol", start?, items: [{ inline, children: blocks }] }
//      inline: [{ t: "text", text } | { t: "br" } | { t: "bold" | "italic" | "strike", children } | { t: "link", href, children }]

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s) => String(s ?? "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === "#") {
    const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
  }
  return ENTITIES[e.toLowerCase()] ?? m;
});

const SAFE_HREF = /^(https?:\/\/|mailto:|tel:)/i;
export const safeHref = (href) => {
  const h = decode(href).trim();
  if (SAFE_HREF.test(h)) return h;
  if (/^www\./i.test(h)) return `https://${h}`;
  return null;
};

function inlineOf(tokens) {
  const out = [];
  for (const t of tokens || []) {
    switch (t.type) {
      case "strong": out.push({ t: "bold", children: inlineOf(t.tokens) }); break;
      case "em": out.push({ t: "italic", children: inlineOf(t.tokens) }); break;
      case "del": out.push({ t: "strike", children: inlineOf(t.tokens) }); break;
      case "link": {
        const href = safeHref(t.href);
        const children = inlineOf(t.tokens);
        if (href) out.push({ t: "link", href, children });
        else out.push(...children);
        break;
      }
      case "br": out.push({ t: "br" }); break;
      case "image": if (t.text) out.push({ t: "text", text: decode(t.text) }); break;
      case "text":
        if (t.tokens?.length) out.push(...inlineOf(t.tokens));
        else out.push({ t: "text", text: decode(t.text) });
        break;
      default: out.push({ t: "text", text: decode(t.text ?? t.raw ?? "") }); // escape, codespan, html, …
    }
  }
  return out;
}

const hasText = (inline) => inlineText(inline).replace(/ /g, " ").trim() !== "";

function blocksOf(tokens) {
  const out = [];
  for (const t of tokens || []) {
    if (t.type === "heading") out.push({ type: t.depth <= 2 ? "h2" : "h3", inline: inlineOf(t.tokens) });
    else if (t.type === "paragraph") {
      const inline = inlineOf(t.tokens);
      if (hasText(inline)) out.push({ type: "p", inline }); // the editor saves a blank line as "&nbsp;"
    } else if (t.type === "list") {
      out.push({
        type: t.ordered ? "ol" : "ul",
        start: t.ordered && Number(t.start) > 1 ? Number(t.start) : undefined,
        items: t.items.map((it) => {
          const inline = [];
          const children = [];
          for (const c of it.tokens || []) {
            if (c.type === "text" || c.type === "paragraph") {
              if (inline.length) inline.push({ t: "br" });
              inline.push(...(c.tokens ? inlineOf(c.tokens) : [{ t: "text", text: decode(c.text) }]));
            } else if (c.type !== "space") children.push(...blocksOf([c]));
          }
          return { inline, children };
        }),
      });
    } else if (t.type === "blockquote") out.push(...blocksOf(t.tokens));
    else if (t.type === "code") out.push({ type: "p", inline: [{ t: "text", text: t.text }] });
    else if (t.type === "space" || t.type === "hr" || t.type === "def") continue;
    else if (t.tokens) out.push({ type: "p", inline: inlineOf(t.tokens) });
    else if (t.text || t.raw) out.push({ type: "p", inline: [{ t: "text", text: decode(t.text ?? t.raw) }] });
  }
  return out;
}

export function parseMemoText(src) {
  const text = String(src || "").replace(/\r\n?/g, "\n");
  if (!text.trim()) return [];
  try {
    return blocksOf(Lexer.lex(text, { gfm: true, breaks: true }));
  } catch {
    return [{ type: "p", inline: [{ t: "text", text }] }];
  }
}

// Plain text of inline parts / of a section's text (search, archive snippets, "is it empty?")
export function inlineText(parts) {
  return (parts || []).map((p) => (p.t === "text" ? p.text : p.t === "br" ? " " : inlineText(p.children))).join("");
}
function blocksText(blocks) {
  return blocks.flatMap((b) => (b.items ? b.items.flatMap((it) => [inlineText(it.inline), blocksText(it.children)]) : [inlineText(b.inline)]));
}
export const memoPlainText = (src) => blocksText(parseMemoText(src)).join(" ").replace(/[\s ]+/g, " ").trim();
