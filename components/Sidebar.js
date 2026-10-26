// Shared left sidebar for the desktop pages (Tasks, Wages, Admin, Insights). The kiosk home page has its own.
// active: key of the current page ("home" | "roster" | "insights" | "tasks" | "wages" | "requests" | "admin")
import Link from "next/link";

const LINKS = [
  { key: "home", href: "/", icon: "🏠", label: "Home" },
  { key: "roster", href: "/roster", icon: "📅", label: "Roster" },
  { key: "insights", href: "/insights", icon: "📊", label: "Insights" },
  { key: "tasks", href: "/tasks", icon: "✅", label: "Tasks" },
  { key: "wages", href: "/wages", icon: "💰", label: "Wages" },
  { key: "requests", href: "/availability", icon: "🗓️", label: "Requests" },
  { key: "admin", href: "/admin", icon: "⚙️", label: "Admin" },
];

export default function Sidebar({ active }) {
  return (
    <aside className="w-[200px] min-w-[200px] h-screen bg-white border-r flex flex-col py-4 px-3 gap-1 shrink-0">
      <div className="text-sm font-bold text-gray-800 px-2 mb-3 leading-tight">
        Byford Pharmacy
      </div>
      {LINKS.map((l) => (
        <Link
          key={l.key}
          href={l.href}
          className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm ${
            l.key === active ? "bg-gray-100 font-semibold text-gray-900" : "text-gray-700 hover:bg-gray-100"
          }`}
        >
          <span>{l.icon}</span> {l.label}
        </Link>
      ))}
    </aside>
  );
}
