// "🏠 Home" button for standalone kiosk pages (top right of the page header) — the same style as the Deliveries page.
// Used by the Till count and Banking pages.
import Link from "next/link";

export default function HomeButton({ className = "" }) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition-colors shrink-0 ${className}`}
    >
      <span>🏠</span> Home
    </Link>
  );
}
