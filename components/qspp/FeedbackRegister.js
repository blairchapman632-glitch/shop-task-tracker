// /qspp → Incidents & feedback → Feedback: the feedback register (QSPP 2.1 / 2.2 / 3.2 / 3.3). Table: feedback.
// Every save goes through /api/qspp/register (lib/qsppClient.js); field lists in lib/qspp.js.
//   Staff (no PIN): Log feedback; open one to add the follow-up notes (response given + date responded, improvement
//   made) — each locked once filled.
//   Manager mode: edit every field, mark Closed (date), Hide / Unhide, Delete; hidden ones listed with "Show hidden".
//   Opening one stamps manager_opened_at (clears "New feedback to review"); badges NEW / "Open X days".
//   List newest first; filters All / Negative / Positive / Open; search; Export PDF of what's showing (lib/registerPdf).
//   openId: open this feedback once it's loaded (?feedback=<id> — /qspp asks for the manager PIN first).
import { useEffect, useState } from "react";
import supabase from "../../lib/supabaseClient";
import { todayPerth } from "../../lib/performanceReview";
import { buildRegisterPdf, downloadPdf } from "../../lib/registerPdf";
import { qsppCall } from "../../lib/qsppClient";
import { reviewStatus } from "../../lib/qspp";
import FollowUpDone from "./FollowUpDone";

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";

export const FEEDBACK_TYPES = [{ key: "positive", label: "Positive" }, { key: "negative", label: "Negative" }];
export const FEEDBACK_CATEGORIES = [{ key: "clinical", label: "Clinical" }, { key: "non_clinical", label: "Non-clinical" }];
export const RECEIVED_VIA = [
  { key: "in_person", label: "In person" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "online_review", label: "Online review" },
  { key: "social_media", label: "Social media" },
  { key: "other", label: "Other" },
];
const labelOf = (list, k) => list.find((x) => x.key === k)?.label || "";

const fieldCls = (locked = false) => `w-full border border-slate-200 rounded-lg px-3 py-2 text-sm ${locked ? "bg-slate-50 text-slate-500" : ""}`;
const labelCls = "block text-xs font-semibold text-slate-500 mb-1";

function Toggle({ options, value, onChange, disabled = false }) {
  return (
    <div className="flex gap-2">
      {options.map((o) => (
        <button key={o.key} type="button" disabled={disabled} onClick={() => onChange(o.key)}
          className={`flex-1 min-h-[40px] rounded-lg border text-sm ${value === o.key ? "bg-[#EFF6FF] border-[#BFDBFE] text-[#1E3A8A] font-semibold" : "bg-white border-slate-200 text-slate-600"} disabled:opacity-60`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Modal({ title, onClose, children, footer }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-[14px] max-w-lg w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-lg font-bold text-slate-800">{title}</h2>
          <button onClick={onClose} className="w-10 h-10 text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">{children}</div>
        <div className="px-5 py-3 border-t">{footer}</div>
      </div>
    </div>
  );
}

// The "logged" fields, shared by Log feedback (new) and the manager editor
function LoggedFields({ v, set, staffList }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <div><label className={labelCls}>Date received *</label>
          <input type="date" value={v.received_date} onChange={(e) => set({ received_date: e.target.value })} className={fieldCls()} /></div>
        <div><label className={labelCls}>Logged by *</label>
          <select value={v.logged_by_staff_id} onChange={(e) => set({ logged_by_staff_id: e.target.value })} className={fieldCls()}>
            <option value="">Choose…</option>
            {staffList.filter((s) => s.active !== false || String(s.id) === String(v.logged_by_staff_id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select></div>
      </div>
      <div><label className={labelCls}>Type *</label><Toggle options={FEEDBACK_TYPES} value={v.feedback_type} onChange={(k) => set({ feedback_type: k })} /></div>
      <div><label className={labelCls}>Category *</label><Toggle options={FEEDBACK_CATEGORIES} value={v.category} onChange={(k) => set({ category: k })} /></div>
      <div><label className={labelCls}>Received via *</label>
        <select value={v.received_via} onChange={(e) => set({ received_via: e.target.value })} className={fieldCls()}>
          <option value="">Choose…</option>
          {RECEIVED_VIA.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select></div>
      <div><label className={labelCls}>What was said *</label>
        <textarea value={v.details} onChange={(e) => set({ details: e.target.value })} rows={3} className={fieldCls()} /></div>
      <div><label className={labelCls}>Patient name / contact <span className="font-normal text-slate-400">(only if a response is needed)</span></label>
        <input value={v.contact} onChange={(e) => set({ contact: e.target.value })} className={fieldCls()} /></div>
    </>
  );
}

const blankLogged = () => ({ received_date: todayPerth(), logged_by_staff_id: "", feedback_type: "", category: "", received_via: "", details: "", contact: "" });
const loggedOk = (v) => v.received_date && v.logged_by_staff_id && v.feedback_type && v.category && v.received_via && v.details.trim();
const loggedPatch = (v) => ({
  received_date: v.received_date, logged_by_staff_id: Number(v.logged_by_staff_id), feedback_type: v.feedback_type, category: v.category,
  received_via: v.received_via, details: v.details.trim(), contact: v.contact.trim() || null,
});

function LogFeedbackModal({ staffList, onClose, onSaved }) {
  const [v, setV] = useState(blankLogged());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    if (!loggedOk(v)) { setError("Fill in the fields marked *."); return; }
    setSaving(true);
    setError("");
    try {
      await qsppCall({ action: "log", kind: "feedback", fields: loggedPatch(v) }); // alerts the QSPP managers
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title="Log feedback" onClose={onClose} footer={
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 min-h-[44px] rounded-lg text-sm text-slate-600 bg-slate-100">Cancel</button>
        <button onClick={save} disabled={saving} className="flex-1 min-h-[44px] rounded-lg text-sm font-semibold text-white bg-[#1D4ED8] disabled:opacity-40">{saving ? "Saving…" : "Save"}</button>
      </div>
    }>
      <LoggedFields v={v} set={(p) => setV((x) => ({ ...x, ...p }))} staffList={staffList} />
      {error && <p className="text-sm text-red-500">{error}</p>}
    </Modal>
  );
}

// Staff: read the feedback, add the follow-up (locked once filled). Manager: every field + closed, hide, delete.
function FeedbackModal({ item, staffList, manager, onClose, onChanged, onDeleted }) {
  const isManager = !!manager;
  const [v, setV] = useState({
    received_date: item.received_date || "", logged_by_staff_id: item.logged_by_staff_id ? String(item.logged_by_staff_id) : "",
    feedback_type: item.feedback_type, category: item.category, received_via: item.received_via, details: item.details || "", contact: item.contact || "",
  });
  const [response, setResponse] = useState(item.response || "");
  const [respondedDate, setRespondedDate] = useState(item.responded_date || "");
  const [improvement, setImprovement] = useState(item.improvement || "");
  const [closedDate, setClosedDate] = useState(item.closed_date || "");
  const [assignedToId, setAssignedToId] = useState(item.assigned_to_staff_id ? String(item.assigned_to_staff_id) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const responseLocked = !isManager && !!item.response;
  const improvementLocked = !isManager && !!item.improvement;
  const staffName = (id) => staffList.find((s) => Number(s.id) === Number(id))?.name || "";

  // Manager: every field (PIN re-checked on the server). Staff: the follow-up notes still empty.
  const update = async (patch) => {
    setSaving(true);
    setError("");
    try {
      const { row } = await qsppCall(isManager
        ? { action: "manager-update", kind: "feedback", id: item.id, patch, pin: manager.pin }
        : { action: "staff-update", kind: "feedback", id: item.id, patch });
      onChanged(row);
      return row;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setSaving(false);
    }
  };
  const save = async () => {
    if (isManager && !loggedOk(v)) { setError("Fill in the fields marked *."); return; }
    const patch = {
      response: response.trim() || null, responded_date: respondedDate || null, improvement: improvement.trim() || null,
      ...(isManager ? { ...loggedPatch(v), closed_date: closedDate || null, assigned_to_staff_id: assignedToId ? Number(assignedToId) : null } : {}),
    };
    if (await update(patch)) onClose();
  };
  const remove = async () => {
    if (!window.confirm("Delete this feedback permanently? This cannot be undone.")) return;
    try {
      await qsppCall({ action: "delete", kind: "feedback", id: item.id, pin: manager.pin });
      onDeleted(item.id);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Modal title={item.feedback_number ? `Feedback #${item.feedback_number}` : "Feedback"} onClose={onClose} footer={
      <div className="flex items-center gap-3">
        {isManager && <button onClick={remove} className="min-h-[44px] px-1 text-xs font-medium text-red-600 hover:underline">Delete</button>}
        {isManager && <button onClick={() => update({ hidden: !item.hidden })} className="min-h-[44px] px-1 text-xs font-medium text-slate-600 hover:underline">{item.hidden ? "Unhide" : "Hide"}</button>}
        <button onClick={save} disabled={saving} className="flex-1 min-h-[44px] rounded-lg text-sm font-semibold text-white bg-[#1D4ED8] disabled:opacity-40">{saving ? "Saving…" : "Save"}</button>
      </div>
    }>
      {isManager ? (
        <LoggedFields v={v} set={(p) => setV((x) => ({ ...x, ...p }))} staffList={staffList} />
      ) : (
        <div className="bg-slate-50 rounded-lg p-3 space-y-1">
          <p className="text-xs text-slate-400">
            {item.received_date} · {labelOf(RECEIVED_VIA, item.received_via)} · logged by {staffName(item.logged_by_staff_id) || "—"}
          </p>
          <p className="text-xs font-semibold text-slate-600">{labelOf(FEEDBACK_TYPES, item.feedback_type)} · {labelOf(FEEDBACK_CATEGORIES, item.category)}</p>
          <p className="text-sm text-slate-800 whitespace-pre-line">{item.details}</p>
          {item.contact && <p className="text-xs text-slate-600">Contact: {item.contact}</p>}
        </div>
      )}
      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide pt-1">Follow-up</div>
      <div><label className={labelCls}>Response given to the patient</label>
        <textarea value={response} onChange={(e) => setResponse(e.target.value)} rows={2} disabled={responseLocked} className={fieldCls(responseLocked)} /></div>
      <div><label className={labelCls}>Date responded</label>
        <input type="date" value={respondedDate} onChange={(e) => setRespondedDate(e.target.value)} disabled={responseLocked} className={fieldCls(responseLocked)} /></div>
      <div><label className={labelCls}>Improvement made <span className="font-normal text-slate-400">(optional)</span></label>
        <textarea value={improvement} onChange={(e) => setImprovement(e.target.value)} rows={2} disabled={improvementLocked} className={fieldCls(improvementLocked)} /></div>
      {/* The assigned follow-up: staff press "Follow-up done" (their PIN); the manager sees its state */}
      <FollowUpDone kind="feedback" row={item} staffName={staffName} readOnly={isManager} onDone={(row) => onChanged(row)} />
      {isManager ? (
        <div className="grid grid-cols-2 gap-3">
          <div><label className={labelCls}>Follow-up assigned to</label>
            <select value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)} className={fieldCls()}>
              <option value="">No one</option>
              {staffList.filter((s) => s.active !== false || String(s.id) === assignedToId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></div>
          <div><label className={labelCls}>Closed</label>
            <input type="date" value={closedDate} onChange={(e) => setClosedDate(e.target.value)} className={fieldCls()} /></div>
        </div>
      ) : (
        <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
          <span className="text-xs font-semibold text-slate-500">Status: </span>{item.closed_date ? `Closed ${item.closed_date}` : "Open"}
          <p className="text-[11px] text-slate-400 mt-0.5">A manager closes feedback (🔒 Manager).</p>
        </div>
      )}
      {error && <p className="text-sm text-red-500">{error}</p>}
    </Modal>
  );
}

const pill = (cls, text) => <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>{text}</span>;

// viewId: open this feedback without a PIN (the kiosk's "follow-up to do" job: ?view=feedback&id=)
export default function FeedbackRegister({ manager = null, openId = null, onOpenedId, viewId = null, onViewedId, staleDays = null, onChanged }) {
  const isManager = !!manager;
  const [items, setItems] = useState(null);
  const [staffList, setStaffList] = useState([]);
  const [filter, setFilter] = useState("all"); // all | negative | positive | open
  const [search, setSearch] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [logging, setLogging] = useState(false);
  const [openItem, setOpenItem] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  // Staff never see hidden feedback; manager mode loads it too
  const load = async () => {
    let q = supabase.from("feedback").select("*").eq("pharmacy_id", PHARMACY_ID);
    if (!isManager) q = q.eq("hidden", false);
    const { data, error: err } = await q.order("received_date", { ascending: false }).order("created_at", { ascending: false });
    if (err) { setError(err.message); setItems([]); return; }
    setItems(data || []);
  };
  useEffect(() => {
    supabase.from("staff").select("id, name, active").eq("pharmacy_id", PHARMACY_ID).or("role.is.null,role.neq.Locum").order("name")
      .then(({ data }) => setStaffList(data || []));
  }, []);
  useEffect(() => { setOpenItem(null); load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [isManager]);

  const replaceRow = (row) => { setItems((prev) => (prev || []).map((x) => (x.id === row.id ? row : x))); onChanged?.(); };
  // First opened in manager mode -> manager_opened_at (clears "New feedback to review")
  const openOne = async (it) => {
    setOpenItem(it);
    if (!isManager || it.manager_opened_at) return;
    try {
      const { row } = await qsppCall({ action: "manager-open", kind: "feedback", id: it.id, pin: manager.pin });
      replaceRow(row);
    } catch (err) {
      setError(err.message);
    }
  };
  // ?feedback=<id>: open it once loaded (manager mode)
  useEffect(() => {
    if (!openId || items === null || !isManager) return;
    const it = items.find((x) => String(x.id) === String(openId));
    if (it) openOne(it);
    else setError("That feedback wasn't found.");
    onOpenedId?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, items === null, isManager]);
  useEffect(() => {
    if (!viewId || items === null) return;
    const it = items.find((x) => String(x.id) === String(viewId));
    if (it) openOne(it);
    else setError("That feedback wasn't found.");
    onViewedId?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewId, items === null]);

  const term = search.trim().toLowerCase();
  const all = items || [];
  const hiddenCount = all.filter((i) => i.hidden).length;
  const visible = all
    .filter((i) => !i.hidden || (isManager && showHidden))
    .filter((i) => filter === "all" || (filter === "open" ? !i.closed_date : i.feedback_type === filter))
    .filter((i) => !term || [i.details, i.contact, i.response, i.improvement].some((v) => String(v || "").toLowerCase().includes(term)));

  const exportPdf = async () => {
    setExporting(true);
    try {
      const { data: ps } = await supabase.from("pharmacy_settings").select("name").eq("pharmacy_id", PHARMACY_ID).maybeSingle();
      const { bytes, warnings } = await buildRegisterPdf({
        heading: "Feedback Register", pharmacyName: ps?.name || "", generatedOn: todayPerth(), generatedBy: manager?.name || "",
        filterLabel: [{ all: "All feedback", negative: "Negative", positive: "Positive", open: "Open" }[filter], term ? `search "${search.trim()}"` : "", isManager && showHidden ? "incl. hidden" : ""].filter(Boolean).join(", "),
        itemWord: "item",
        columns: [
          { key: "date", label: "Received", w: 62 },
          { key: "type", label: "Type", w: 55 },
          { key: "category", label: "Category", w: 65 },
          { key: "via", label: "Via", w: 65 },
          { key: "details", label: "What was said", w: 210 },
          { key: "response", label: "Response / improvement", w: 220 },
          { key: "status", label: "Status", w: 92 },
        ],
        rows: visible.map((i) => ({
          date: i.received_date || "",
          type: labelOf(FEEDBACK_TYPES, i.feedback_type),
          category: labelOf(FEEDBACK_CATEGORIES, i.category),
          via: labelOf(RECEIVED_VIA, i.received_via),
          details: i.details || "",
          response: [i.response ? `${i.response}${i.responded_date ? ` (${i.responded_date})` : ""}` : "", i.improvement ? `Improvement: ${i.improvement}` : ""].filter(Boolean).join(" — "),
          status: i.closed_date ? `Closed ${i.closed_date}` : "Open",
          _red: i.feedback_type === "negative" && !i.closed_date ? ["status"] : [],
        })),
      });
      downloadPdf(bytes, `feedback_register_${todayPerth()}.pdf`);
      if (warnings.length) alert(warnings.join("\n"));
    } catch (err) {
      alert("Couldn't create the PDF: " + (err?.message || String(err)));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-3">
      <button onClick={() => setLogging(true)} className="w-full min-h-[44px] px-4 rounded-[12px] text-sm font-semibold text-white bg-[#1D4ED8] hover:bg-blue-800">
        + Log feedback
      </button>
      <div className="flex flex-wrap items-center gap-2">
        {[{ k: "all", l: "All" }, { k: "negative", l: "Negative" }, { k: "positive", l: "Positive" }, { k: "open", l: "Open" }].map((o) => (
          <button key={o.k} onClick={() => setFilter(o.k)}
            className={`min-h-[36px] px-3 rounded-full text-sm border ${filter === o.k ? "bg-[#EFF6FF] border-[#BFDBFE] text-[#1E3A8A] font-semibold" : "bg-white border-[#E5E7EB] text-slate-600 hover:bg-slate-50"}`}>
            {o.l}
          </button>
        ))}
        {isManager && hiddenCount > 0 && (
          <button onClick={() => setShowHidden((v) => !v)} className="min-h-[36px] px-3 text-xs text-slate-500 hover:text-slate-700">
            {showHidden ? "Hide hidden feedback" : `Show hidden (${hiddenCount})`}
          </button>
        )}
      </div>
      <div className="flex gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search feedback…"
          className="flex-1 min-h-[44px] border border-[#E5E7EB] rounded-[12px] px-4 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#BFDBFE]" />
        <button onClick={exportPdf} disabled={exporting}
          className="min-h-[44px] px-4 rounded-[12px] text-sm font-medium bg-white border border-[#E5E7EB] text-slate-700 hover:bg-slate-50 disabled:opacity-40 shrink-0">
          {exporting ? "Creating…" : "↓ Export PDF"}
        </button>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}

      {items === null ? <p className="text-sm text-slate-400 py-10">Loading…</p>
        : visible.length === 0 ? <p className="text-sm text-slate-400 px-1 py-12 text-center">{all.length ? "No feedback matches." : "No feedback logged yet."}</p>
        : (
          <div className="space-y-2">
            {visible.map((i) => { const st = isManager ? reviewStatus("feedback", i, staleDays) : null; return (
              <button key={i.id} onClick={() => openOne(i)}
                className={`w-full text-left bg-white rounded-[14px] border border-[#E5E7EB] px-4 py-3 hover:bg-slate-50 ${i.hidden ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-400">{i.feedback_number ? `#${i.feedback_number} · ` : ""}{i.received_date} · {labelOf(RECEIVED_VIA, i.received_via)}</span>
                  <span className="flex flex-wrap items-center gap-1">
                    {st?.isNew && pill("bg-blue-600 text-white border-blue-600", "NEW")}
                    {st?.stale && pill("bg-red-50 text-red-700 border-red-200", `Open ${st.days} days`)}
                    {i.hidden && pill("bg-slate-100 text-slate-500 border-slate-200", "Hidden")}
                    {i.feedback_type === "negative" ? pill("bg-red-50 text-red-700 border-red-200", "Negative") : pill("bg-green-50 text-green-700 border-green-200", "Positive")}
                    {pill("bg-slate-100 text-slate-600 border-slate-200", labelOf(FEEDBACK_CATEGORIES, i.category))}
                    {i.closed_date ? pill("bg-green-50 text-green-700 border-green-200", "CLOSED") : pill("bg-amber-50 text-amber-700 border-amber-200", "OPEN")}
                  </span>
                </div>
                <p className="text-sm text-slate-700 mt-1.5 line-clamp-2">{i.details}</p>
                {i.response && <div className="mt-1.5 text-[11px] text-[#475569]">Responded {i.responded_date || ""}</div>}
              </button>
            ); })}
          </div>
        )}

      {logging && <LogFeedbackModal staffList={staffList} onClose={() => setLogging(false)} onSaved={async () => { setLogging(false); await load(); onChanged?.(); }} />}
      {openItem && (
        <FeedbackModal
          key={openItem.id}
          item={openItem}
          staffList={staffList}
          manager={manager}
          onClose={() => setOpenItem(null)}
          onChanged={(row) => { replaceRow(row); setOpenItem(row); }}
          onDeleted={(id) => { setItems((prev) => prev.filter((x) => x.id !== id)); setOpenItem(null); onChanged?.(); }}
        />
      )}
    </div>
  );
}
