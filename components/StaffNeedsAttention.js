// Admin → Staff main screen (no one selected): "Needs attention" across reviews, training, certificates and new starters.
// Reuses the same rules as QSPP → Reviews / Training (lib/performanceReview.js, lib/trainingPlan.js).
// onOpen(staff, tab, reviewId?) opens that person on the right staff-form tab; onOpenPolicy(docId) opens QSPP → Documents.
import { useEffect, useState } from "react";
import supabase from "../lib/supabaseClient";
import { reviewAttention, perthDateOf, fmtDateShort, todayPerth } from "../lib/performanceReview";
import { loadTrainingData, trainingAttention, fetchAllRows, STATE_STYLE } from "../lib/trainingPlan";
import { REQUEST_COLUMNS, docProgress } from "../lib/policyReads";

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";

// New starters: only people with an electronic contract (issued or accepted). Paper-only/existing staff are never flagged.
//   newest contract still "issued"          -> issued, not accepted
//   an accepted contract, onboarding not done -> accepted, onboarding not finished
function newStarterAttention(staff, contracts) {
  const items = [];
  for (const s of staff) {
    const mine = contracts.filter((c) => Number(c.staff_id) === Number(s.id) && (c.status === "issued" || c.status === "accepted"))
      .sort((a, b) => String(b.issued_at || "").localeCompare(String(a.issued_at || "")));
    if (!mine.length) continue;
    if (mine[0].status === "issued") {
      items.push({ key: `ns-i-${s.id}`, staff: s, item: "Contract issued, not accepted", label: `Issued ${fmtDateShort(perthDateOf(mine[0].issued_at))}`, sort: mine[0].issued_at || "" });
    } else if (!s.onboarding_completed_at) {
      const acc = mine.find((c) => c.status === "accepted");
      items.push({ key: `ns-o-${s.id}`, staff: s, item: "Onboarding not finished", label: `Contract accepted ${fmtDateShort(perthDateOf(acc.accepted_at))}`, sort: acc.accepted_at || "" });
    }
  }
  return items.sort((a, b) => a.sort.localeCompare(b.sort));
}

export default function StaffNeedsAttention({ staffList, onOpen, onOpenPolicy }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const active = (staffList || []).filter((s) => s.active !== false && s.role !== "Locum");
  const activeIds = active.map((s) => s.id).join(",");

  useEffect(() => {
    if (!activeIds) { setData({ reviews: [], training: null, contracts: [], policyRequests: [], policyDocs: [] }); return; }
    let cancelled = false;
    (async () => {
      try {
        const ids = activeIds.split(",").map(Number);
        const [rv, training, ct, policyRequests, pd] = await Promise.all([
          supabase.from("performance_reviews")
            .select("id, staff_id, status, review_type, meeting_date, signed_at, created_at, staff_comments, staff_comments_seen")
            .eq("pharmacy_id", PHARMACY_ID),
          loadTrainingData(supabase, PHARMACY_ID),
          supabase.from("employment_contracts").select("staff_id, status, issued_at, accepted_at").in("staff_id", ids),
          fetchAllRows(() => supabase.from("policy_read_requests").select(REQUEST_COLUMNS).eq("pharmacy_id", PHARMACY_ID).neq("status", "cancelled")),
          supabase.from("pharmacy_documents").select("id, title").eq("pharmacy_id", PHARMACY_ID).eq("active", true),
        ]);
        if (rv.error || ct.error || pd.error) throw rv.error || ct.error || pd.error;
        if (!cancelled) { setData({ reviews: rv.data || [], training, contracts: ct.data || [], policyRequests, policyDocs: pd.data || [] }); setError(""); }
      } catch (err) {
        if (!cancelled) setError(err?.message || String(err));
      }
    })();
    return () => { cancelled = true; };
  }, [activeIds]);

  const full = (s) => active.find((x) => Number(x.id) === Number(s.id)) || s; // training rows carry a slimmer staff object

  let groups = [];
  if (data) {
    const today = todayPerth();
    const t = data.training ? trainingAttention(data.training, today).items : [];
    groups = [
      {
        title: "Reviews", tab: "reviews",
        items: reviewAttention(active, data.reviews, today)
          .map((i) => ({ ...i, state: i.key.startsWith("rd-") ? "not_done" : i.key.startsWith("rp-") ? "due" : "neutral" })),
      },
      { title: "Training", tab: "training", items: t.filter((i) => i.kind === "training") },
      { title: "Certificates", tab: "documents", items: t.filter((i) => i.kind === "certificate") },
      { title: "New starters", tab: "newstarter", items: newStarterAttention(active, data.contracts).map((i) => ({ ...i, state: "due" })) },
      {
        title: "Policies", tab: null,
        items: data.policyDocs
          .map((d) => ({ d, p: docProgress(d.id, data.policyRequests, active) }))
          .filter(({ p }) => p.outstanding > 0)
          .sort((a, b) => String(a.d.title).localeCompare(String(b.d.title)))
          .map(({ d, p }) => ({
            key: `pol-${d.id}`, who: d.title, item: "Policy to read", state: "due",
            label: `${p.outstanding} of ${p.total} still to read`, onClick: () => onOpenPolicy?.(d.id),
          })),
      },
    ].filter((g) => g.items.length);
  }

  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      <div className="max-w-3xl space-y-6">
        <p className="text-sm text-gray-400">Select a staff member to edit, or add a new one.</p>
        <section className="space-y-4">
          <h2 className="font-semibold text-gray-800">Needs attention</h2>
          {error ? (
            <p className="text-xs text-red-500">Couldn't load: {error}</p>
          ) : !data ? (
            <p className="text-xs text-gray-400">Loading…</p>
          ) : groups.length === 0 ? (
            <p className="text-sm text-green-700">✓ All clear</p>
          ) : groups.map((g) => (
            <div key={g.title}>
              <div className="text-[11px] font-semibold text-gray-500 uppercase mb-1">{g.title} <span className="text-gray-400 font-normal">({g.items.length})</span></div>
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                {g.items.map((i) => (
                  <button
                    key={i.key}
                    type="button"
                    onClick={() => (i.onClick ? i.onClick() : onOpen(full(i.staff), g.tab, i.reviewId))}
                    className="w-full grid grid-cols-[1fr_1.3fr_auto] items-center gap-2 px-3 py-2 border-b last:border-b-0 text-left hover:bg-gray-50"
                  >
                    <span className="text-sm font-medium text-gray-800 truncate">{i.who ?? i.staff.name}</span>
                    <span className="text-xs text-gray-700 truncate">{i.item}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border justify-self-end ${STATE_STYLE[i.state] || STATE_STYLE.neutral}`}>{i.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
