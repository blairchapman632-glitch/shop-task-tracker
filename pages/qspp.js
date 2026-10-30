// /qspp — the one QSPP area. No login (shop computers, like the kiosk).
//   Staff tabs: Library, Incidents & feedback (sub-tabs Incidents | Feedback).
//   "🔒 Manager" → admin PIN (lib/adminPin) → manager mode: extra tabs (Reviews, Training overview) and manager tools.
//   Manager mode lives in memory only: it auto-locks after 10 minutes with no activity, and when leaving or reloading
//   the page (nothing is stored in the browser).
// ?tab=incidents opens Incidents & feedback (?tab=feedback opens its Feedback sub-tab). ?doc=<id> (Admin → Needs attention) asks for the manager PIN, then opens
// that document's side panel. Reviews opens a person in Admin (/admin?staff=…&staffTab=reviews — Admin asks for its PIN).
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Sidebar from "../components/Sidebar";
import Library from "../components/qspp/Library";
import StaffIncidents from "../components/qspp/StaffIncidents";
import FeedbackRegister from "../components/qspp/FeedbackRegister";
import ManagerPinModal from "../components/qspp/ManagerPinModal";
import supabase from "../lib/supabaseClient";
import { ReviewsOverview } from "../components/PerformanceReviews";
import TrainingAdminTab from "../components/TrainingAdmin";

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";

const IDLE_LOCK_MS = 10 * 60 * 1000;

const STAFF_TABS = [
  { key: "library", label: "Library" },
  { key: "incidents", label: "Incidents & feedback" },
];
const MANAGER_TABS = [
  { key: "reviews", label: "Reviews" },
  { key: "training", label: "Training overview" },
];

export default function QsppPage() {
  const router = useRouter();
  const [tab, setTab] = useState("library");
  const [manager, setManager] = useState(null); // { id, name } while unlocked
  const [askPin, setAskPin] = useState(false);
  const lastActivity = useRef(Date.now());
  const [docToOpen, setDocToOpen] = useState(null); // ?doc=<id>
  const [incSub, setIncSub] = useState("incidents"); // incidents | feedback

  useEffect(() => {
    if (router.query.tab === "incidents") setTab("incidents");
    if (router.query.tab === "feedback") { setTab("incidents"); setIncSub("feedback"); }
  }, [router.query.tab]);
  useEffect(() => {
    if (!router.query.doc) return;
    setDocToOpen(String(router.query.doc));
    setTab("library");
    setAskPin(true); // the side panel is manager-only
  }, [router.query.doc]);

  const lock = () => {
    setManager(null);
    setTab((t) => (MANAGER_TABS.some((m) => m.key === t) ? "library" : t));
  };

  // Auto-lock after 10 minutes with no taps / keys / scrolling
  useEffect(() => {
    if (!manager) return;
    lastActivity.current = Date.now();
    const bump = () => { lastActivity.current = Date.now(); };
    const events = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true, capture: true }));
    const timer = setInterval(() => { if (Date.now() - lastActivity.current > IDLE_LOCK_MS) lock(); }, 15000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump, { capture: true }));
      clearInterval(timer);
    };
  }, [manager]);

  const tabBtn = (t) => (
    <button
      key={t.key}
      onClick={() => setTab(t.key)}
      className={`min-h-[44px] px-1 -mb-px text-sm border-b-2 transition-colors ${
        tab === t.key ? "border-[#1D4ED8] text-[#1D4ED8] font-semibold" : "border-transparent text-slate-500 hover:text-slate-700"
      }`}
    >
      {t.label}
    </button>
  );

  return (
    <div className="flex min-h-screen bg-[#F8FAFC]">
      <div className="hidden md:block sticky top-0 h-screen shrink-0">
        <Sidebar active="qspp" />
      </div>

      <main className="flex-1 min-w-0">
        {/* Header */}
        <div className="max-w-6xl mx-auto px-4 pt-5 pb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-800 leading-tight">QSPP</h1>
            <p className="text-xs text-[#475569] mt-0.5">Policies, procedures &amp; incidents</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link href="/" className="md:hidden inline-flex items-center min-h-[44px] px-3 rounded-[12px] text-sm font-medium text-slate-700 bg-white border border-[#E5E7EB]">🏠</Link>
            {manager ? (
              <>
                <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#FEF3C7] text-[#78350F]">
                  Manager mode · {manager.name.split(" ")[0]}
                </span>
                <button onClick={lock} className="min-h-[44px] px-4 rounded-[12px] text-sm font-medium text-slate-700 bg-white border border-[#E5E7EB] hover:bg-slate-50">🔒 Lock</button>
              </>
            ) : (
              <button onClick={() => setAskPin(true)} className="min-h-[44px] px-4 rounded-[12px] text-sm font-medium text-slate-700 bg-white border border-[#E5E7EB] hover:bg-slate-50">🔒 Manager</button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-6xl mx-auto px-4 pb-4">
          <div className="flex flex-wrap items-center gap-x-6 border-b border-[#E5E7EB]">
            {STAFF_TABS.map(tabBtn)}
            {manager && (
              <>
                <span className="w-px h-5 bg-[#E5E7EB]" aria-hidden="true" />
                {MANAGER_TABS.map(tabBtn)}
              </>
            )}
          </div>
          {manager && <p className="sm:hidden mt-2 inline-block px-3 py-1 rounded-full text-xs font-semibold bg-[#FEF3C7] text-[#78350F]">Manager mode · {manager.name}</p>}
        </div>

        {/* Content */}
        {tab === "library" && <Library manager={manager} openDocId={docToOpen} onOpenedDoc={() => setDocToOpen(null)} />}
        {tab === "incidents" && (
          <>
            <div className="max-w-3xl mx-auto px-4">
              <div className="inline-flex p-1 rounded-[12px] bg-white border border-[#E5E7EB]">
                {[{ k: "incidents", l: "Incidents" }, { k: "feedback", l: "Feedback" }].map((o) => (
                  <button key={o.k} onClick={() => setIncSub(o.k)}
                    className={`min-h-[36px] px-4 rounded-[9px] text-sm ${incSub === o.k ? "bg-[#EFF6FF] text-[#1E3A8A] font-semibold" : "text-slate-600 hover:bg-slate-50"}`}>
                    {o.l}
                  </button>
                ))}
              </div>
            </div>
            {incSub === "incidents"
              ? <StaffIncidents manager={manager} />
              : <div className="max-w-3xl mx-auto px-4 py-5"><FeedbackRegister manager={manager} /></div>}
          </>
        )}
        {manager && tab === "reviews" && <ManagerReviews onOpen={(st, reviewId) => router.push(`/admin?staff=${st.id}&staffTab=reviews${reviewId ? `&review=${reviewId}` : ""}`)} />}
        {manager && tab === "training" && (
          <div className="max-w-6xl mx-auto px-4 pb-10">
            <div className="bg-white rounded-[14px] border border-[#E5E7EB] overflow-hidden"><TrainingAdminTab /></div>
          </div>
        )}
      </main>

      {askPin && (
        <ManagerPinModal
          onClose={() => setAskPin(false)}
          onUnlock={(user) => { setManager(user); setAskPin(false); }}
        />
      )}
    </div>
  );
}

// Reviews (moved from Admin → QSPP): due / in progress / new comments / signed. Needs the full staff records.
function ManagerReviews({ onOpen }) {
  const [staffList, setStaffList] = useState(null);
  useEffect(() => {
    supabase.from("staff").select("*").eq("pharmacy_id", PHARMACY_ID).or("role.is.null,role.neq.Locum").order("name")
      .then(({ data }) => setStaffList(data || []));
  }, []);
  return (
    <div className="max-w-6xl mx-auto px-4 pb-10">
      <div className="bg-white rounded-[14px] border border-[#E5E7EB] overflow-hidden">
        {staffList === null ? <p className="p-6 text-sm text-slate-400">Loading…</p> : <ReviewsOverview staffList={staffList} onOpen={onOpen} />}
      </div>
    </div>
  );
}
