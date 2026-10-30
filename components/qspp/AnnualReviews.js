// /qspp → Incidents (manager mode): the annual incident & feedback review (QSPP 1.2 / 3.3).
// Records date, reviewed by, period covered, findings, improvements made (table incident_feedback_reviews), lists past
// reviews, and shows a reminder when the last review is more than 12 months ago (or there's none yet).
// Export PDF: one review, or the whole list (lib/registerPdf — same layout as the other register exports).
import { useEffect, useState } from "react";
import supabase from "../../lib/supabaseClient";
import { todayPerth, addMonthsStr, fmtDateShort } from "../../lib/performanceReview";
import { buildRegisterPdf, downloadPdf } from "../../lib/registerPdf";

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";

export default function AnnualReviews({ manager, staffList }) {
  const [reviews, setReviews] = useState(null);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const today = todayPerth();

  const load = async () => {
    const { data, error: err } = await supabase.from("incident_feedback_reviews").select("*")
      .eq("pharmacy_id", PHARMACY_ID).order("review_date", { ascending: false });
    if (err) { setError(err.message); setReviews([]); return; }
    setReviews(data || []);
  };
  useEffect(() => { load(); }, []);

  const staffName = (id) => staffList.find((s) => Number(s.id) === Number(id))?.name || "";
  const last = reviews?.[0];
  const [exporting, setExporting] = useState(null); // review id | "all"

  // list: the reviews to export; single: one review (named in the file and filter label)
  const exportPdf = async (list, single = null) => {
    setExporting(single ? single.id : "all");
    try {
      const { data: ps } = await supabase.from("pharmacy_settings").select("name").eq("pharmacy_id", PHARMACY_ID).maybeSingle();
      const { bytes, warnings } = await buildRegisterPdf({
        heading: "Annual Incident & Feedback Review", pharmacyName: ps?.name || "", generatedOn: today, generatedBy: manager?.name || "",
        filterLabel: single ? `Review of ${fmtDateShort(single.review_date)}` : "All reviews",
        itemWord: "review",
        columns: [
          { key: "date", label: "Review date", w: 70 },
          { key: "by", label: "Reviewed by", w: 100 },
          { key: "period", label: "Period covered", w: 130 },
          { key: "findings", label: "Findings", w: 235 },
          { key: "improvements", label: "Improvements made", w: 234 },
        ],
        rows: list.map((r) => ({
          date: fmtDateShort(r.review_date),
          by: staffName(r.reviewed_by_staff_id) || "—",
          period: `${fmtDateShort(r.period_start)} – ${fmtDateShort(r.period_end)}`,
          findings: r.findings || "",
          improvements: r.improvements || "",
        })),
      });
      downloadPdf(bytes, single ? `annual_review_${single.review_date}.pdf` : `annual_reviews_${today}.pdf`);
      if (warnings.length) alert(warnings.join("\n"));
    } catch (err) {
      alert("Couldn't create the PDF: " + (err?.message || String(err)));
    } finally {
      setExporting(null);
    }
  };
  const due = reviews !== null && (!last || String(last.review_date) < addMonthsStr(today, -12));

  return (
    <div className="mb-4">
      <div className={`flex flex-wrap items-center gap-2 rounded-[14px] border px-4 py-3 ${due ? "bg-[#FEF3C7] border-amber-200" : "bg-white border-[#E5E7EB]"}`}>
        <div className="flex-1 min-w-0 text-sm">
          {reviews === null ? <span className="text-slate-400">Loading…</span>
            : due ? (
              <span className="text-[#78350F]">
                <span className="font-semibold">Annual incident &amp; feedback review due</span>
                {last ? ` — last done ${fmtDateShort(last.review_date)}` : " — none recorded yet"}
              </span>
            ) : (
              <span className="text-slate-600">Annual review last done <span className="font-semibold">{fmtDateShort(last.review_date)}</span>{staffName(last.reviewed_by_staff_id) && ` by ${staffName(last.reviewed_by_staff_id)}`}</span>
            )}
        </div>
        <button onClick={() => setOpen((v) => !v)} className="min-h-[40px] px-3 rounded-[10px] text-sm font-medium bg-white border border-[#E5E7EB] text-slate-700 hover:bg-slate-50">
          {open ? "Close" : "Annual review"}
        </button>
      </div>

      {open && (
        <div className="mt-2 bg-white rounded-[14px] border border-[#E5E7EB] p-4 space-y-3">
          {error && <p className="text-sm text-red-500">{error}</p>}
          {adding ? (
            <ReviewForm manager={manager} staffList={staffList} last={last}
              onCancel={() => setAdding(false)}
              onSaved={async () => { setAdding(false); await load(); }} />
          ) : (
            <button onClick={() => setAdding(true)} className="w-full min-h-[44px] rounded-[12px] text-sm font-semibold text-white bg-[#1D4ED8] hover:bg-blue-800">
              + Record annual review
            </button>
          )}
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Past reviews</div>
            {!!reviews?.length && (
              <button onClick={() => exportPdf(reviews)} disabled={!!exporting}
                className="min-h-[36px] px-3 rounded-[10px] text-sm font-medium bg-white border border-[#E5E7EB] text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                {exporting === "all" ? "Creating…" : "↓ Export PDF"}
              </button>
            )}
          </div>
          {!reviews?.length ? <p className="text-sm text-slate-400">No reviews recorded yet.</p> : (
            <div className="divide-y divide-[#F1F5F9]">
              {reviews.map((r) => (
                <div key={r.id} className="py-2.5 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-slate-800 font-medium">
                      {fmtDateShort(r.review_date)}{staffName(r.reviewed_by_staff_id) && ` · ${staffName(r.reviewed_by_staff_id)}`}
                      <span className="font-normal text-xs text-[#475569]"> · covers {fmtDateShort(r.period_start)} – {fmtDateShort(r.period_end)}</span>
                    </div>
                    <button onClick={() => exportPdf([r], r)} disabled={!!exporting}
                      className="shrink-0 min-h-[32px] px-2 text-xs font-medium text-[#1D4ED8] hover:underline disabled:opacity-40">
                      {exporting === r.id ? "Creating…" : "↓ Export PDF"}
                    </button>
                  </div>
                  {r.findings && <p className="text-slate-600 mt-1 whitespace-pre-line"><span className="text-xs font-semibold text-slate-500">Findings: </span>{r.findings}</p>}
                  {r.improvements && <p className="text-slate-600 mt-1 whitespace-pre-line"><span className="text-xs font-semibold text-slate-500">Improvements: </span>{r.improvements}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReviewForm({ manager, staffList, last, onCancel, onSaved }) {
  const today = todayPerth();
  const [reviewDate, setReviewDate] = useState(today);
  const [by, setBy] = useState(manager?.id ? String(manager.id) : "");
  // Period: from where the last review's period ended (or 12 months ago) to today — editable
  const [from, setFrom] = useState(last?.period_end && last.period_end < today ? last.period_end : addMonthsStr(today, -12));
  const [to, setTo] = useState(today);
  const [findings, setFindings] = useState("");
  const [improvements, setImprovements] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const field = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm";
  const label = "block text-xs font-semibold text-slate-500 mb-1";

  const save = async () => {
    if (!reviewDate || !from || !to || from > to) { setError("Check the dates (the period's From must be on or before To)."); return; }
    setSaving(true);
    setError("");
    const { error: err } = await supabase.from("incident_feedback_reviews").insert([{
      pharmacy_id: PHARMACY_ID, review_date: reviewDate, reviewed_by_staff_id: by ? Number(by) : null,
      period_start: from, period_end: to, findings: findings.trim() || null, improvements: improvements.trim() || null,
    }]);
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSaved();
  };

  return (
    <div className="space-y-3 rounded-[12px] bg-slate-50 p-3">
      <div className="grid grid-cols-2 gap-2">
        <div><label className={label}>Review date</label><input type="date" value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} className={field} /></div>
        <div><label className={label}>Reviewed by</label>
          <select value={by} onChange={(e) => setBy(e.target.value)} className={field}>
            <option value="">Choose…</option>
            {staffList.filter((s) => s.active !== false).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select></div>
        <div><label className={label}>Period from</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={field} /></div>
        <div><label className={label}>Period to</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={field} /></div>
      </div>
      <div><label className={label}>Findings</label>
        <textarea value={findings} onChange={(e) => setFindings(e.target.value)} rows={3} placeholder="Trends in incidents and feedback, anything recurring…" className={field} /></div>
      <div><label className={label}>Improvements made</label>
        <textarea value={improvements} onChange={(e) => setImprovements(e.target.value)} rows={3} placeholder="Changes made as a result" className={field} /></div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 min-h-[44px] rounded-[10px] border border-slate-200 text-sm text-slate-600 bg-white">Cancel</button>
        <button onClick={save} disabled={saving} className="flex-1 min-h-[44px] rounded-[10px] text-sm font-semibold text-white bg-[#1D4ED8] disabled:opacity-40">
          {saving ? "Saving…" : "Save review"}
        </button>
      </div>
    </div>
  );
}
