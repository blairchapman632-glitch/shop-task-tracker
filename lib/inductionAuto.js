// Staff induction — auto-checks (Stage 4). Lines with an auto_source tick themselves from data Chalkboard already holds.
// syncInductionAuto runs whenever an in-progress induction is loaded (Admin, /me detail API, kiosk card) and after Start.
// Works with the browser client or the service-role client (pages/api).
// Rules: never overwrites a manual answer (admin / me); fills unanswered lines; updates or clears lines that are
// already "auto" (so a tick drops back to unanswered if the source goes, e.g. a document deleted or expired).
// Signed-off inductions are never re-evaluated.
import { todayPerth, perthDateOf, fmtDateShort } from "./performanceReview";
import { PLAN_ROLES } from "./trainingPlan";
import { loadServiceConfig, docSections, sectionStatus, docExpiry, tickedServices, isPharmacistRole } from "./staffDocuments";

// auto_source -> where to fix it on the staff file when it's missing (Admin "Add" link)
export const AUTO_SOURCES = {
  contract_accepted: { tab: "newstarter", add: "Issue contract" },
  emergency_contacts: { tab: "profile", add: "Add emergency contact" },
  doc_ahpra: { tab: "documents", add: "Add AHPRA" },
  doc_indemnity: { tab: "documents", add: "Add indemnity" },
  doc_first_aid: { tab: "documents", add: "Add certificate" },
  doc_s2s3: { tab: "documents", add: "Add certificate" },
  service_vaccinating: { tab: "documents", add: "Add certificates" }, // "profile" when the service isn't ticked (see addTabFor)
  training_plan: { tab: "training", add: null },                       // plan roles only — otherwise a manual line
  issued_items: { tab: "profile", add: "Add uniform / badge" },        // Getting started: uniform + name badge
};
export const isAutoLine = (item) => !!item?.auto_source && !!AUTO_SOURCES[item.auto_source];

const GOOD_DOC_STATES = ["current", "expiring", "on_file", "no_date"]; // no_date = file on file, no expiry entered

// Everything the evaluator needs for one person
export async function loadAutoSources(supabase, staffId, pharmacyId) {
  const [st, ct, dc, config] = await Promise.all([
    supabase.from("staff").select("id, role, emergency_contact_name, emergency_contact_phone, uniforms_supplied, badge_supplied").eq("id", Number(staffId)).maybeSingle(),
    supabase.from("employment_contracts").select("status, accepted_at").eq("staff_id", Number(staffId)).eq("status", "accepted"),
    supabase.from("locum_documents").select("id, staff_id, type, expiry_date, completion_date, service_certificate_id, uploaded_at").eq("staff_id", Number(staffId)),
    loadServiceConfig(supabase, pharmacyId, [Number(staffId)]),
  ]);
  const err = st.error || ct.error || dc.error;
  if (err) throw err;
  return { staff: st.data, contracts: ct.data || [], docs: dc.data || [], config };
}

// Newest file of a typed/plain Documents section that's on file and not expired -> { note } | null
function docOnFile(staff, docs, config, types, today) {
  for (const sec of docSections(staff, config).filter((s) => types.includes(s.type))) {
    const st = sectionStatus(sec, docs, today);
    if (!st?.latest || !GOOD_DOC_STATES.includes(st.state)) continue;
    const exp = docExpiry(st.latest, sec);
    return { note: exp ? `On file · expires ${fmtDateShort(exp)}` : `On file${types.length > 1 ? ` (${sec.title})` : ""}` };
  }
  return null;
}

// Ticked Vaccinating service: the chosen certificates (which(cert)) all on file and not expired — same "complete"
// rule as Staff Documents. -> { note } | null
function vaccinatingCerts(staff, docs, config, today, which, label) {
  const svc = tickedServices(staff, config).find((s) => /vaccinat/i.test(s.name));
  if (!svc) return null;
  const secs = docSections(staff, config).filter((s) => s.kind === "service" && s.group === svc.name && which(s.certificate));
  if (!secs.length) return null;
  const states = secs.map((s) => sectionStatus(s, docs, today));
  if (!states.every((st) => st && ["current", "expiring", "on_file"].includes(st.state))) return null;
  const exps = secs.map((s, i) => docExpiry(states[i].latest, s)).filter(Boolean).sort();
  return { note: `${label || `${svc.name} certificates`} on file${exps.length ? ` · next expiry ${fmtDateShort(exps[0])}` : ""}` };
}

// One line -> { signed_at?, note } when the source is there, else null
export function evaluateAuto(source, src, today = todayPerth()) {
  const { staff, contracts, docs, config } = src || {};
  if (!staff) return null;
  switch (source) {
    case "contract_accepted": {
      const c = [...(contracts || [])].filter((x) => x.accepted_at).sort((a, b) => String(b.accepted_at).localeCompare(String(a.accepted_at)))[0];
      return c ? { signed_at: c.accepted_at, note: `Accepted electronically ${fmtDateShort(perthDateOf(c.accepted_at))}` } : null;
    }
    case "emergency_contacts":
      return String(staff.emergency_contact_name || "").trim() && String(staff.emergency_contact_phone || "").trim()
        ? { note: "Emergency contact on file" } : null;
    case "doc_ahpra": return docOnFile(staff, docs, config, ["ahpra_cert"], today);
    case "doc_indemnity": return docOnFile(staff, docs, config, ["indemnity_cert"], today);
    case "doc_first_aid":
      // Pharmacists/interns have no first aid / CPR section — use the Vaccinating service's first aid + CPR certificates
      return isPharmacistRole(staff.role)
        ? vaccinatingCerts(staff, docs, config, today, (c) => /first aid|cpr/i.test(c.name), "First aid + CPR (Vaccinating)")
        : docOnFile(staff, docs, config, ["first_aid_cert", "cpr_cert"], today);
    case "doc_s2s3": return docOnFile(staff, docs, config, ["s2_s3_cert"], today);
    case "service_vaccinating":
      return vaccinatingCerts(staff, docs, config, today, () => true, null);
    case "training_plan":
      return PLAN_ROLES.includes(staff.role) ? { note: `Training plan for ${staff.role}` } : null;
    case "issued_items": {
      const n = Number(staff.uniforms_supplied) || 0;
      return n >= 1 && staff.badge_supplied === true ? { note: `${n} uniform${n === 1 ? "" : "s"} and badge issued` } : null;
    }
    default:
      return null;
  }
}

// Where Admin's "Add" link goes for a missing source
export function addTabFor(source, src) {
  if ((source === "service_vaccinating" || (source === "doc_first_aid" && isPharmacistRole(src?.staff?.role))) && src?.staff && !tickedServices(src.staff, src.config).some((s) => /vaccinat/i.test(s.name))) return "profile";
  return AUTO_SOURCES[source]?.tab || null;
}

// Re-evaluate the auto lines of one induction and save any changes.
// -> { items (all, updated), changed (just the rows that changed), src }
// Screens show saved lines first and call this in the background, merging `changed` by id.
export async function syncInductionAuto(supabase, induction, items) {
  if (!induction || induction.status !== "in_progress") return { items, changed: [], src: null };
  const autoLines = (items || []).filter(isAutoLine);
  if (!autoLines.length) return { items, changed: [], src: null };
  const src = await loadAutoSources(supabase, induction.staff_id, induction.pharmacy_id);
  const today = todayPerth();
  const changed = new Map();

  for (const item of autoLines) {
    if (item.result && item.signed_via !== "auto") continue; // manual answer wins
    const want = evaluateAuto(item.auto_source, src, today);
    let patch = null;
    if (want) {
      if (item.result !== "done" || item.signed_via !== "auto" || item.note !== want.note) {
        patch = { result: "done", signed_via: "auto", signed_by_staff_id: null, note: want.note,
          signed_at: want.signed_at || (item.signed_via === "auto" && item.signed_at) || new Date().toISOString() };
      }
    } else if (item.signed_via === "auto") {
      patch = { result: null, signed_via: null, signed_by_staff_id: null, signed_at: null, note: null };
    }
    if (!patch) continue;
    // Only if it's still unanswered or auto (someone may have answered it manually a moment ago)
    const { data, error } = await supabase.from("staff_induction_items").update(patch)
      .eq("id", item.id).or("result.is.null,signed_via.eq.auto").select("*");
    if (error) { console.error("[induction auto]", error); continue; }
    if (data?.[0]) changed.set(item.id, data[0]);
  }
  return { items: (items || []).map((i) => changed.get(i.id) || i), changed: [...changed.values()], src };
}
