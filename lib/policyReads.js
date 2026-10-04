// Policy acknowledgment (QSPP library): staff asked to read a policy record "I have read and understood".
// Shared by Admin (QSPP → Documents, Training tab, Needs attention), the kiosk (pages/documents.js) and the
// /me API routes. Table: policy_read_requests (status outstanding | read | cancelled).

export const REQUEST_COLUMNS = "id, document_id, staff_id, status, requested_at, read_at, read_via, read_file_name, read_file_url, cancelled_at";

// Who can be asked: active staff, never Locums
export const canBeAsked = (s) => !!s && s.active !== false && s.role !== "Locum";

// Target list for "Ask staff to read". mode: "everyone" | "roles" | "people"
export function targetStaff(staffList, mode, roles = [], ids = []) {
  const pool = (staffList || []).filter(canBeAsked);
  if (mode === "everyone") return pool;
  if (mode === "roles") return pool.filter((s) => roles.includes(s.role));
  const want = new Set(ids.map(Number));
  return pool.filter((s) => want.has(Number(s.id)));
}

const newestFirst = (a, b) => String(b.requested_at || "").localeCompare(String(a.requested_at || ""));

// Each person's latest non-cancelled request for one document (a re-read request replaces an older read)
export function latestPerStaff(requests) {
  const out = new Map();
  for (const r of [...(requests || [])].filter((x) => x.status !== "cancelled").sort(newestFirst)) {
    if (!out.has(Number(r.staff_id))) out.set(Number(r.staff_id), r);
  }
  return out;
}

// Progress for one document, counting active staff only.
// -> { total, read, outstanding, rows: [{ staff, request }] } (rows: outstanding first, then read newest first)
export function docProgress(docId, requests, staffList) {
  const active = new Map((staffList || []).filter(canBeAsked).map((s) => [Number(s.id), s]));
  const latest = latestPerStaff((requests || []).filter((r) => String(r.document_id) === String(docId)));
  const rows = [];
  for (const [sid, request] of latest) {
    const staff = active.get(sid);
    if (staff) rows.push({ staff, request });
  }
  rows.sort((a, b) => (a.request.status === "outstanding" ? 0 : 1) - (b.request.status === "outstanding" ? 0 : 1)
    || String(b.request.read_at || "").localeCompare(String(a.request.read_at || "")) || a.staff.name.localeCompare(b.staff.name));
  const read = rows.filter((r) => r.request.status === "read").length;
  return { total: rows.length, read, outstanding: rows.length - read, rows };
}

// Record an acknowledgment (kiosk and Admin use the browser client; /me goes through /api/policies/acknowledge).
// Guarded on status = outstanding so a request is only ever completed once. -> true if recorded
export async function acknowledgeRequest(supabase, request, doc, via) {
  const { data, error } = await supabase.from("policy_read_requests").update({
    status: "read",
    read_at: new Date().toISOString(),
    read_via: via,
    read_file_name: doc?.title || doc?.file_name || null,
    read_file_url: doc?.file_url || null,
  }).eq("id", request.id).eq("status", "outstanding").select("id");
  if (error) throw error;
  return !!data?.length;
}

export const viaLabel = (v) => (v === "kiosk" ? "kiosk" : v === "phone" ? "phone" : "");
