// Staff Documents — which sections apply to a person, their status, pharmacist services, and the upload helper.
// Shared by Admin (Documents/Training tabs, QSPP → Training, Needs attention) and the onboarding page (later /me).
// Dates are "YYYY-MM-DD" strings; maths via lib/performanceReview helpers (UTC, no toISOString).
import { addMonthsStr, addDaysStr, todayPerth, fmtDateShort } from "./performanceReview";
import { PLAN_ROLES } from "./trainingPlan";

export const EXPIRY_WARN_DAYS = 60;
export const PHARMACIST_ROLES = ["Pharmacist", "Intern Pharmacist"];
export const isPharmacistRole = (role) => PHARMACIST_ROLES.includes(role);

export const DOC_BUCKET = "locum-documents"; // public bucket (see session notes — staff documents still public)

// ── Pharmacist services config ──────────────────────────────────────────────

// -> { services, certificates, staffServices } (all rows, including hidden ones — callers filter)
export async function loadServiceConfig(supabase, pharmacyId, staffIds = null) {
  let ss = supabase.from("staff_services").select("staff_id, service_id, active").eq("pharmacy_id", pharmacyId);
  if (staffIds) ss = ss.in("staff_id", staffIds.length ? staffIds : [-1]);
  const [sv, ct, st] = await Promise.all([
    supabase.from("pharmacist_services").select("*").eq("pharmacy_id", pharmacyId).order("sort_order"),
    supabase.from("service_certificates").select("*").eq("pharmacy_id", pharmacyId).order("sort_order"),
    ss,
  ]);
  const err = sv.error || ct.error || st.error;
  if (err) throw err;
  return { services: sv.data || [], certificates: ct.data || [], staffServices: st.data || [] };
}

const bySort = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.name).localeCompare(String(b.name));

// Active services ticked for this person (pharmacists/interns only)
export function tickedServices(staff, config) {
  if (!isPharmacistRole(staff?.role)) return [];
  const on = new Set((config?.staffServices || [])
    .filter((x) => Number(x.staff_id) === Number(staff.id) && x.active !== false).map((x) => String(x.service_id)));
  return (config?.services || []).filter((s) => s.active !== false && on.has(String(s.id))).sort(bySort);
}
export const certificatesFor = (service, config) =>
  (config?.certificates || []).filter((c) => String(c.service_id) === String(service.id) && c.active !== false).sort(bySort);

// ── Sections ────────────────────────────────────────────────────────────────
// kind: "contract" (existing contracts list) | "plain" (file only) | "typed" (file + typed expiry)
//       | "service" (file + completion date; expiry from renew_months) | "multi" (any number, no status)
//       | "other_qual" (any number; name + file + optional expiry)

export function docSections(staff, config) {
  if (!staff || staff.role === "Locum") return [];
  const s = [{ key: "contract", kind: "contract", title: "Employment contract", required: false }];
  const assistant = PLAN_ROLES.includes(staff.role);
  const pharmacist = isPharmacistRole(staff.role);

  if (pharmacist) {
    s.push({ key: "ahpra_cert", kind: "typed", type: "ahpra_cert", title: "AHPRA registration", required: true });
    s.push({ key: "indemnity_cert", kind: "typed", type: "indemnity_cert", title: "Professional indemnity", required: true });
    for (const svc of tickedServices(staff, config)) {
      for (const cert of certificatesFor(svc, config)) {
        s.push({ key: `svc-${cert.id}`, kind: "service", type: "service_cert", title: cert.name, group: svc.name, required: true, certificate: cert });
      }
    }
    s.push({ key: "other_qualification", kind: "other_qual", type: "other_qualification", title: "Other qualifications", required: false });
  }
  if (assistant) {
    s.push({ key: "s2_s3_cert", kind: "plain", type: "s2_s3_cert", title: "S2/S3 certificate", required: true });
    s.push({ key: "first_aid_cert", kind: "typed", type: "first_aid_cert", title: "First aid", required: false });
    s.push({ key: "cpr_cert", kind: "typed", type: "cpr_cert", title: "CPR", required: false });
  }
  s.push({ key: "induction_checklist", kind: "plain", type: "induction_checklist", title: "Induction checklist", required: true });
  s.push({ key: "resume", kind: "plain", type: "resume", title: "Resume", required: false });
  s.push({ key: "other", kind: "multi", type: "other", title: "Other documents", required: false });
  return s;
}

// Files belonging to a section, newest first ("newest counts": completion date for service certificates, else upload)
export function sectionDocs(section, docs) {
  const mine = (docs || []).filter((d) => section.kind === "service"
    ? d.type === "service_cert" && String(d.service_certificate_id) === String(section.certificate.id)
    : d.type === section.type);
  return mine.sort((a, b) => (section.kind === "service" ? String(b.completion_date || "").localeCompare(String(a.completion_date || "")) : 0)
    || String(b.uploaded_at || "").localeCompare(String(a.uploaded_at || "")) || Number(b.id) - Number(a.id));
}

// Files that don't fit any of this person's sections (role changed, retired types, hidden certificates) — never hidden
export function unmatchedDocs(sections, docs) {
  const used = new Set();
  for (const sec of sections) if (sec.kind !== "contract") for (const d of sectionDocs(sec, docs)) used.add(d.id);
  return (docs || []).filter((d) => d.type !== "signed_contract" && d.type !== "locum_agreement" && !used.has(d.id));
}

// Expiry of one file: service certificate = completion + renew_months (live); typed = the expiry entered
export function docExpiry(doc, section) {
  if (section?.kind === "service") {
    const m = section.certificate?.renew_months;
    if (m == null || m === "") return null;
    return doc?.completion_date ? addMonthsStr(String(doc.completion_date).slice(0, 10), Number(m)) : null;
  }
  return doc?.expiry_date ? String(doc.expiry_date).slice(0, 10) : null;
}

// Status of an expiry date -> { state, label }
export function expiryStatus(exp, today = todayPerth()) {
  if (!exp) return null;
  if (exp < today) return { state: "expired", label: `❌ Expired ${fmtDateShort(exp)}` };
  if (exp <= addDaysStr(today, EXPIRY_WARN_DAYS)) return { state: "expiring", label: `⚠️ Expiring ${fmtDateShort(exp)}` };
  return { state: "current", label: `✅ Current until ${fmtDateShort(exp)}` };
}

// Section status from its newest file -> { state, label, latest } | null (multi sections have no status)
//   state: current | expiring | expired | on_file | no_date | missing | none
export function sectionStatus(section, docs, today = todayPerth()) {
  if (section.kind === "multi" || section.kind === "other_qual" || section.kind === "contract") return null;
  const latest = sectionDocs(section, docs)[0] || null;
  if (!latest) return section.required ? { state: "missing", label: "Missing", latest } : { state: "none", label: "None on file", latest };
  if (section.kind === "service") {
    if (!latest.completion_date) return { state: "no_date", label: "⚠️ Add completion date", latest };
    if (section.certificate?.renew_months == null) return { state: "on_file", label: `✅ Completed ${fmtDateShort(latest.completion_date)}`, latest };
  }
  const exp = docExpiry(latest, section);
  if (exp) return { ...expiryStatus(exp, today), latest };
  if (section.kind === "typed") return { state: "no_date", label: "⚠️ Add expiry date", latest };
  return { state: "on_file", label: "✅ On file", latest };
}

export const DOC_STATE_STYLE = {
  current: "bg-green-50 text-green-700 border-green-200",
  on_file: "bg-green-50 text-green-700 border-green-200",
  expiring: "bg-amber-50 text-amber-700 border-amber-200",
  no_date: "bg-amber-50 text-amber-700 border-amber-200",
  expired: "bg-red-50 text-red-600 border-red-200",
  missing: "bg-red-50 text-red-600 border-red-200",
  none: "bg-gray-50 text-gray-500 border-gray-200",
};

// Pharmacist/intern items for Needs attention: AHPRA, indemnity and ticked-service certificates that are
// Missing, Expired, Expiring (within 60 days) or have no completion/expiry date. -> [{ key, staff, item, state, label, sort }]
export function pharmacistAttention(staff, docs, config, today = todayPerth()) {
  if (!isPharmacistRole(staff?.role) || staff.active === false) return [];
  const mine = (docs || []).filter((d) => Number(d.staff_id) === Number(staff.id));
  const out = [];
  for (const sec of docSections(staff, config)) {
    if (!(sec.kind === "service" || sec.type === "ahpra_cert" || sec.type === "indemnity_cert")) continue;
    const st = sectionStatus(sec, mine, today);
    if (!st || !["missing", "expired", "expiring", "no_date"].includes(st.state)) continue;
    const exp = st.latest ? docExpiry(st.latest, sec) : null;
    out.push({
      key: `ph-${staff.id}-${sec.key}`, staff,
      item: sec.group ? `${sec.title} (${sec.group})` : sec.title,
      state: st.state === "missing" ? "not_done" : st.state === "no_date" ? "expiring" : st.state,
      label: st.label.replace(/^[✅⚠️❌]️?\s*/u, ""),
      sort: exp || "0",
      url: st.latest?.url,
    });
  }
  return out;
}

// ── Upload helper (Admin + onboarding; /me can pass its own) ─────────────────
// fields: { type, service_certificate_id?, completion_date?, expiry_date?, title? }
export async function uploadStaffDocument(supabase, { staffId, pharmacyId, file, fields }) {
  const ext = (file.name.split(".").pop() || "pdf").toLowerCase();
  const filename = `${staffId}_${fields.type}_${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage.from(DOC_BUCKET).upload(filename, file, { upsert: true });
  if (upErr) throw upErr;
  const { data: urlData } = supabase.storage.from(DOC_BUCKET).getPublicUrl(filename);
  const { data, error } = await supabase.from("locum_documents").insert([{
    staff_id: staffId,
    pharmacy_id: pharmacyId,
    url: urlData.publicUrl,
    filename: file.name,
    type: fields.type,
    service_certificate_id: fields.service_certificate_id || null,
    completion_date: fields.completion_date || null,
    expiry_date: fields.expiry_date || null,
    title: fields.title || null,
  }]).select().single();
  if (error) throw error;
  return data;
}

const pathFromUrl = (url) => {
  const marker = `/${DOC_BUCKET}/`;
  const i = String(url || "").indexOf(marker);
  return i === -1 ? null : url.slice(i + marker.length).split("?")[0];
};

export async function deleteStaffDocument(supabase, doc) {
  const path = pathFromUrl(doc.url);
  if (path) await supabase.storage.from(DOC_BUCKET).remove([path]);
  const { error } = await supabase.from("locum_documents").delete().eq("id", doc.id);
  if (error) throw error;
}

// patch: any of { expiry_date, completion_date, title }
export async function updateStaffDocument(supabase, doc, patch) {
  const { data, error } = await supabase.from("locum_documents").update(patch).eq("id", doc.id).select().single();
  if (error) throw error;
  return data;
}
