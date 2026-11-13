// A staff memo as staff see it: title, sent date, topics, then each section (heading, formatted text, images, PDFs,
// signature). Used for reading on /memos and for the manager's Preview of a draft, so the preview is exactly what staff
// will see. Empty sections, asked sections not written yet and "Nothing this month" slots are left out.
import { parseMemoText, fmtMemoDate, fmtMemoDateRange, sectionShown } from "../../lib/memos";
import { MemoUpdates } from "./MemoExtras";

export function MemoText({ text }) {
  const blocks = parseMemoText(text);
  if (!blocks.length) return null;
  return <div className="space-y-3 text-[15px] leading-relaxed text-slate-700"><Blocks blocks={blocks} /></div>;
}

function Blocks({ blocks }) {
  return blocks.map((b, i) => {
    if (b.type === "h2") return <h3 key={i} className="text-lg font-bold text-slate-800 pt-1"><Inline parts={b.inline} /></h3>;
    if (b.type === "h3") return <h4 key={i} className="text-base font-semibold text-slate-800"><Inline parts={b.inline} /></h4>;
    if (b.type === "ul" || b.type === "ol") {
      const List = b.type;
      return (
        <List key={i} start={b.start} className={`${b.type === "ul" ? "list-disc" : "list-decimal"} pl-6 space-y-1`}>
          {b.items.map((it, k) => (
            <li key={k}>
              <Inline parts={it.inline} />
              {it.children.length > 0 && <div className="mt-1 space-y-1"><Blocks blocks={it.children} /></div>}
            </li>
          ))}
        </List>
      );
    }
    return <p key={i} className="break-words"><Inline parts={b.inline} /></p>;
  });
}

function Inline({ parts }) {
  return parts.map((p, i) => {
    if (p.t === "br") return <br key={i} />;
    if (p.t === "bold") return <strong key={i} className="font-semibold text-slate-800"><Inline parts={p.children} /></strong>;
    if (p.t === "italic") return <em key={i}><Inline parts={p.children} /></em>;
    if (p.t === "strike") return <s key={i}><Inline parts={p.children} /></s>;
    if (p.t === "link") return <a key={i} href={p.href} target="_blank" rel="noopener noreferrer" className="text-[#1D4ED8] underline break-words"><Inline parts={p.children} /></a>;
    return <span key={i}>{p.text}</span>;
  });
}

export function MemoSection({ section }) {
  const images = section.images || [];
  const files = section.attachments || [];
  const sig = [section.signature_name, section.signature_role].filter(Boolean).join(", ");
  return (
    <section className="py-5 border-t border-slate-100 first:border-t-0 first:pt-0">
      {section.heading?.trim() && <h2 className="text-xl font-bold text-slate-800 mb-3">{section.heading}</h2>}
      <MemoText text={section.body} />
      {images.length > 0 && (
        <div className={`mt-4 grid gap-2 ${images.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
          {images.map((img) => (
            <a key={img.path} href={img.url} target="_blank" rel="noopener noreferrer" className="block">
              <img src={img.url} alt={img.name || ""} className="w-full max-h-[420px] object-contain rounded-lg bg-slate-50 border border-slate-100" />
            </a>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          {files.map((f) => (
            <a key={f.path} href={f.url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 self-start min-h-[44px] px-3 rounded-[10px] border border-[#E5E7EB] bg-white text-sm text-slate-700 hover:bg-slate-50">
              <span>📄</span><span className="underline break-all">{f.name}</span>
            </a>
          ))}
        </div>
      )}
      {sig && <p className="mt-4 text-sm italic text-slate-500">— {sig}</p>}
    </section>
  );
}

// Stage 4: "Policies to read" (QSPP library documents — read requests are made on Send) and "Dates" (What's on events
// made on Send). Shown after the sections, in Preview, the sent memo and the PDF.
export function MemoPolicies({ policies }) {
  if (!policies?.length) return null;
  return (
    <section className="py-5 border-t border-slate-100">
      <h2 className="text-xl font-bold text-slate-800 mb-1">📄 Policies to read</h2>
      <p className="text-sm text-slate-500 mb-3">You&apos;ll be asked to read each of these — they show in your policies to read on the kiosk and your phone.</p>
      <ul className="space-y-2">
        {policies.map((p) => (
          <li key={p.id} className="flex items-center gap-2 text-[15px] text-slate-700">
            <span>•</span>
            {p.pdf_url ? <a href={p.pdf_url} target="_blank" rel="noopener noreferrer" className="text-[#1D4ED8] underline break-words">{p.title}</a>
              : <span className="break-words">{p.title}</span>}
            {p.version && <span className="text-xs text-slate-400">v{p.version}</span>}
            {!p.active && <span className="text-xs text-red-600">(retired)</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MemoDates({ dates }) {
  if (!dates?.length) return null;
  return (
    <section className="py-5 border-t border-slate-100">
      <h2 className="text-xl font-bold text-slate-800 mb-3">📅 Dates</h2>
      <ul className="space-y-2">
        {dates.map((d) => (
          <li key={d.id} className="flex flex-wrap items-baseline gap-x-2 text-[15px] text-slate-700">
            <span className="font-semibold text-slate-800">{fmtMemoDateRange(d.start_date, d.end_date)}</span>
            <span>— {d.title}</span>
            {d.category_name && (
              <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: d.category_colour || "#94A3B8" }} />{d.category_name}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// updates: a manager's updates after sending (shown under the memo — components/memos/MemoExtras MemoUpdates)
export default function MemoView({ memo, sections, policies = [], dates = [], updates = [] }) {
  const shown = (sections || []).filter(sectionShown);
  const extras = (policies?.length || 0) + (dates?.length || 0) > 0;
  return (
    <article className="bg-white rounded-[14px] border border-[#E5E7EB] px-5 sm:px-8 py-6">
      <header className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#1D4ED8]">Staff memo</p>
        <h1 className="text-2xl font-bold text-slate-800 leading-tight mt-1">{memo.title}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {memo.status === "sent"
            ? <>Sent {fmtMemoDate(memo.sent_at)}{memo.sent_by_name ? ` by ${memo.sent_by_name}` : ""}{memo.imported ? " · Imported from email" : ""}</>
            : "Draft — not sent yet"}
        </p>
        {memo.imported && (memo.import_kind || memo.import_sent_to) && (
          <p className="text-xs text-slate-500 mt-1">
            {[memo.import_kind, memo.import_sent_to && `Sent to: ${memo.import_sent_to}`].filter(Boolean).join(" · ")}
          </p>
        )}
        {memo.imported && (memo.import_attachments || []).length > 0 && (
          <p className="text-xs text-slate-500 mt-1">📎 Attachments (in the original email): {memo.import_attachments.join("; ")}</p>
        )}
        {(memo.topics || []).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {memo.topics.map((t) => <span key={t} className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#EFF6FF] text-[#1E3A8A]">{t}</span>)}
          </div>
        )}
      </header>
      {shown.length ? shown.map((s) => <MemoSection key={s.id} section={s} />) : !extras && <p className="text-sm text-slate-400">Nothing written yet.</p>}
      <MemoPolicies policies={policies} />
      <MemoDates dates={dates} />
      {updates?.length > 0 && <div className="pt-1"><MemoUpdates updates={updates} /></div>}
    </article>
  );
}
