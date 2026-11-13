// What-you-see-is-what-you-get text box for memo sections (TipTap). Bold shows bold, bullets show as bullets, headings
// as headings while typing. Toolbar: Heading, Bold, Italic, Bullets, Numbered, Link, Emoji.
// Saves as Markdown (@tiptap/markdown) so the memo display and PDF read it with lib/memos.js parseMemoText.
// Uncontrolled: `value` is only read when the editor starts (key the component by section id); every change calls
// onChange(markdown). onBlur fires when the text box loses focus.
import { useState } from "react";
import { useEditor, useEditorState, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";

const EMOJI = ["😀", "😊", "🎉", "👏", "🙌", "👍", "❤️", "⭐", "✅", "⚠️", "❗", "📌", "📅", "⏰", "💊", "🩺", "💉", "🧴", "📦", "🚚", "🎄", "☀️", "☕", "🍰"];

// Same look as the memo display (components/memos/MemoView.js)
const CONTENT_CLASS = [
  "min-h-[180px] px-3 py-2 text-[15px] leading-relaxed text-slate-700 focus:outline-none",
  "[&_p]:my-2 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-slate-800 [&_h2]:mt-3 [&_h2]:mb-1",
  "[&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-slate-800 [&_h3]:mt-3 [&_h3]:mb-1",
  "[&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-0.5 [&_li_p]:my-0",
  "[&_strong]:font-semibold [&_strong]:text-slate-800 [&_a]:text-[#1D4ED8] [&_a]:underline",
].join(" ");

export default function RichTextEditor({ value, onChange, onBlur }) {
  const [showEmoji, setShowEmoji] = useState(false);
  const editor = useEditor({
    immediatelyRender: false, // Next.js renders pages on the server first
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false, codeBlock: false, blockquote: false, horizontalRule: false, strike: false, underline: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: "https", protocols: ["mailto", "tel"] },
      }),
      Markdown,
    ],
    content: value || "",
    contentType: "markdown",
    editorProps: { attributes: { class: CONTENT_CLASS } },
    onUpdate: ({ editor: ed }) => onChange(ed.getMarkdown()),
    onBlur: () => onBlur?.(),
  });

  const active = useEditorState({
    editor,
    selector: ({ editor: ed }) => (ed ? {
      heading: ed.isActive("heading"),
      bold: ed.isActive("bold"),
      italic: ed.isActive("italic"),
      bullet: ed.isActive("bulletList"),
      ordered: ed.isActive("orderedList"),
      link: ed.isActive("link"),
    } : {}),
  }) || {};

  const setLink = () => {
    if (!editor) return;
    const current = editor.getAttributes("link").href || "";
    const input = window.prompt(current ? "Link address (leave empty to remove the link)" : "Link address (https://…)", current);
    if (input === null) return;
    const url = input.trim();
    const chain = editor.chain().focus().extendMarkRange("link");
    if (!url) { chain.unsetLink().run(); return; }
    const href = /^(https?:\/\/|mailto:|tel:)/i.test(url) ? url : `https://${url}`;
    if (editor.state.selection.empty && !current) {
      editor.chain().focus().insertContent({ type: "text", text: url, marks: [{ type: "link", attrs: { href } }] }).insertContent(" ").run();
    } else {
      chain.setLink({ href }).run();
    }
  };

  const tb = (on) => `min-w-[40px] h-9 px-2 rounded-lg text-sm border ${on ? "bg-[#EFF6FF] border-[#93C5FD] text-[#1E3A8A]" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"}`;
  const keep = (e) => e.preventDefault(); // toolbar taps don't take focus from the text

  return (
    <div className="rounded-[10px] border border-slate-200 focus-within:border-[#93C5FD]">
      <div className="flex flex-wrap items-center gap-1 px-1.5 py-1.5 border-b border-slate-100 bg-slate-50 rounded-t-[10px] relative">
        <button type="button" onMouseDown={keep} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading" className={`${tb(active.heading)} font-bold`}>H</button>
        <button type="button" onMouseDown={keep} onClick={() => editor?.chain().focus().toggleBold().run()} title="Bold" className={`${tb(active.bold)} font-bold`}>B</button>
        <button type="button" onMouseDown={keep} onClick={() => editor?.chain().focus().toggleItalic().run()} title="Italic" className={`${tb(active.italic)} italic`}>I</button>
        <button type="button" onMouseDown={keep} onClick={() => editor?.chain().focus().toggleBulletList().run()} title="Bullet list" className={tb(active.bullet)}>• List</button>
        <button type="button" onMouseDown={keep} onClick={() => editor?.chain().focus().toggleOrderedList().run()} title="Numbered list" className={tb(active.ordered)}>1. List</button>
        <button type="button" onMouseDown={keep} onClick={setLink} title="Link" className={tb(active.link)}>🔗 Link</button>
        <button type="button" onMouseDown={keep} onClick={() => setShowEmoji((v) => !v)} title="Emoji" className={tb(showEmoji)}>😀</button>
        {showEmoji && (
          <div className="absolute z-20 top-11 right-1 bg-white rounded-xl border border-slate-200 shadow-lg p-2 grid grid-cols-8 gap-1">
            {EMOJI.map((e) => (
              <button key={e} type="button" onMouseDown={keep}
                onClick={() => { editor?.chain().focus().insertContent(e).run(); setShowEmoji(false); }}
                className="w-9 h-9 text-xl rounded hover:bg-slate-100">{e}</button>
            ))}
          </div>
        )}
      </div>
      {editor ? <EditorContent editor={editor} /> : <div className="min-h-[180px] px-3 py-2 text-sm text-slate-400">Loading…</div>}
    </div>
  );
}
