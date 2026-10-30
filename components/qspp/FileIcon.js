// /qspp — one plain outline file icon in a soft tinted square (document rows and the side panel header).
// dim: greyed (staff row with no PDF yet)
export default function FileIcon({ dim = false }) {
  return (
    <span className={`shrink-0 w-9 h-9 rounded-[10px] flex items-center justify-center ${dim ? "bg-slate-100 text-slate-400" : "bg-[#EFF6FF] text-[#1D4ED8]"}`}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5" />
      </svg>
    </span>
  );
}
