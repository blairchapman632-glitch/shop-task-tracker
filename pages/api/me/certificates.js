// /me Training → Certificates and the To do "Training" nudges, for the logged-in staff member only.
// Authorization: Bearer <Supabase access token> (lib/reviewServer.js staffFromRequest).
//
//   GET              -> { sections, docs, attention }   certificate sections only (no contract, induction, resume,
//                                                       other documents); files without storage paths or URLs
//   GET ?view=todo   -> { attention }                   just the nudges (To do badge)
//   POST { action: "upload-url", section_key, ext }                          -> { path, token }
//   POST { action: "save", section_key, path, filename, date?, title? }      -> { doc }   (uploaded_via = "me")
//   POST { action: "url", id }                                               -> { url }   (10-minute signed URL)
//   POST { action: "add-date", id, date }                                    -> { doc }   (only where the date is empty)
// Staff can't edit existing dates, delete or replace files — older files stay as history.
// Nudges = Admin's own Needs attention rules (lib/trainingPlan.js trainingAttention) run for this person only.
import supabaseAdmin from "../../../lib/supabaseAdmin";
import { staffFromRequest, fail } from "../../../lib/reviewServer";
import { DOC_BUCKET, docFile, newDocPath, saveDoc, signedLink, uploadTicket, httpError } from "../../../lib/staffFilesServer";
import { docSections, sectionDocs, loadServiceConfig } from "../../../lib/staffDocuments";
import { trainingAttention, fetchAllRows } from "../../../lib/trainingPlan";
import { todayPerth, fmtDateShort } from "../../../lib/performanceReview";

// Certificate sections shown on /me (everything else stays Admin / onboarding only)
const CERT_TYPES = ["ahpra_cert", "indemnity_cert", "other_qualification", "s2_s3_cert", "first_aid_cert", "cpr_cert"];
const certSections = (staff, config) => docSections(staff, config).filter((s) => s.kind === "service" || CERT_TYPES.includes(s.type));

const DOC_COLUMNS = "id, staff_id, type, filename, url, storage_path, uploaded_at, expiry_date, completion_date, service_certificate_id, title, uploaded_via";
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ""));
// Which date a section's files take
const dateField = (sec) => (sec.kind === "service" ? "completion_date" : sec.kind === "typed" || sec.kind === "other_qual" ? "expiry_date" : null);

const toStaffDoc = (d) => ({
  id: d.id, type: d.type, filename: d.filename, uploaded_at: d.uploaded_at,
  expiry_date: d.expiry_date, completion_date: d.completion_date, service_certificate_id: d.service_certificate_id,
  title: d.title, uploaded_via: d.uploaded_via, has_file: !!docFile(d),
});
const toStaffSection = (s) => ({
  key: s.key, kind: s.kind, type: s.type, title: s.title, group: s.group || null, required: !!s.required,
  certificate: s.certificate ? { id: s.certificate.id, name: s.certificate.name, renew_months: s.certificate.renew_months } : null,
});
const hrs = (n) => String(Math.round(n * 100) / 100);

async function loadContext(req) {
  const me = await staffFromRequest(req);
  const db = supabaseAdmin();
  const { data: staff, error } = await db.from("staff")
    .select("id, name, role, active, start_date, pharmacy_id").eq("id", Number(me.id)).single();
  if (error) throw error;
  const [config, docs] = await Promise.all([
    loadServiceConfig(db, String(staff.pharmacy_id), [staff.id]),
    fetchAllRows(() => db.from("locum_documents").select(DOC_COLUMNS).eq("staff_id", staff.id)),
  ]);
  return { db, staff, config, docs, sections: certSections(staff, config) };
}

// Admin's Needs attention items for this one person, with staff wording and where each one opens
async function myAttention({ db, staff, config, docs, sections }) {
  if (staff.role === "Locum" || staff.active === false) return [];
  const [settings, records, ex] = await Promise.all([
    db.from("pharmacy_settings").select("qspp_cycle_start_date").eq("pharmacy_id", String(staff.pharmacy_id)).maybeSingle(),
    fetchAllRows(() => db.from("training_records").select("id, staff_id, training_date, hours").eq("staff_id", staff.id)),
    db.from("staff_training_exemptions").select("staff_id, training_year_start, reason").eq("staff_id", staff.id),
  ]);
  if (settings.error || ex.error) throw settings.error || ex.error;
  const person = { id: staff.id, name: staff.name, role: staff.role, active: staff.active, start_date: staff.start_date };
  const { planRows, items } = trainingAttention({
    anchor: settings.data?.qspp_cycle_start_date || null,
    staff: [person], docs, records, exemptions: ex.data || [], services: config,
  }, todayPerth());
  const hours = planRows[0]?.hours;
  const sectionOf = (doc) => sections.find((s) => sectionDocs(s, docs).some((d) => d.id === doc.id))?.key || null;

  return items.map((i) => {
    if (i.key.startsWith("s2-")) return { key: i.key, item: "S2/S3 certificate", state: i.state, label: i.label, sub: "plan", section: null };
    if (i.key.startsWith("yr-") && hours) {
      return { key: i.key, item: "Training hours (this year)", state: i.state, sub: "plan", section: null,
        label: `${hrs(hours.yearReq - hours.yearDone)} hrs short — year ends ${fmtDateShort(hours.year.end)}` };
    }
    if (i.key.startsWith("cy-") && hours) {
      return { key: i.key, item: "Training hours (QSPP cycle)", state: i.state, sub: "plan", section: null,
        label: `${hrs(hours.cycleReq - hours.cycleDone)} hrs short — cycle ends ${fmtDateShort(hours.cycle.end)}` };
    }
    const section = i.key.startsWith(`ph-${staff.id}-`) ? i.key.slice(`ph-${staff.id}-`.length) : i.doc ? sectionOf(i.doc) : null;
    return { key: i.key, item: i.item, state: i.state, label: i.label, sub: "certificates", section };
  });
}

function ownCertDoc(ctx, id) {
  const doc = ctx.docs.find((d) => Number(d.id) === Number(id));
  const sec = doc && ctx.sections.find((s) => sectionDocs(s, ctx.docs).some((d) => d.id === doc.id));
  if (!doc || !sec) throw httpError(404, "Certificate not found");
  return { doc, sec };
}

export default async function handler(req, res) {
  try {
    const ctx = await loadContext(req);
    res.setHeader("Cache-Control", "no-store");

    if (req.method === "GET") {
      const attention = await myAttention(ctx);
      if (req.query.view === "todo") return res.status(200).json({ attention });
      const used = new Set(ctx.sections.flatMap((s) => sectionDocs(s, ctx.docs).map((d) => d.id)));
      return res.status(200).json({
        sections: ctx.sections.map(toStaffSection),
        docs: ctx.docs.filter((d) => used.has(d.id)).map(toStaffDoc),
        attention,
      });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const { action } = req.body || {};

    if (action === "upload-url" || action === "save") {
      const sec = ctx.sections.find((s) => s.key === req.body.section_key);
      if (!sec) throw httpError(400, "Unknown certificate");
      if (action === "upload-url") return res.status(200).json(await uploadTicket(DOC_BUCKET, newDocPath(ctx.staff.id, sec.type, req.body.ext)));

      const field = dateField(sec);
      const date = isDate(req.body.date) ? req.body.date : null;
      const title = String(req.body.title || "").trim();
      if (sec.kind === "other_qual" && !title) throw httpError(400, "Enter the qualification name.");
      const doc = await saveDoc(ctx.staff, req.body.path, {
        type: sec.type,
        filename: req.body.filename,
        service_certificate_id: sec.kind === "service" ? sec.certificate.id : null,
        completion_date: field === "completion_date" ? date : null,
        expiry_date: field === "expiry_date" ? date : null,
        title: sec.kind === "other_qual" ? title : null,
      }, { uploaded_via: "me" });
      return res.status(200).json({ doc: toStaffDoc(doc) });
    }

    if (action === "url") {
      const { doc } = ownCertDoc(ctx, req.body.id);
      const file = docFile(doc);
      if (!file) return res.status(404).json({ error: "No file for that certificate" });
      return res.status(200).json({ url: await signedLink(file.bucket, file.path) });
    }

    if (action === "add-date") {
      const { doc, sec } = ownCertDoc(ctx, req.body.id);
      const field = dateField(sec);
      if (!field) throw httpError(400, "This certificate doesn't take a date.");
      if (!isDate(req.body.date)) throw httpError(400, "Choose a date.");
      if (doc[field]) throw httpError(409, "This file already has a date — ask your manager if it needs changing.");
      const { data, error } = await ctx.db.from("locum_documents")
        .update({ [field]: req.body.date }).eq("id", doc.id).is(field, null).select().maybeSingle();
      if (error) throw error;
      if (!data) throw httpError(409, "This file already has a date — ask your manager if it needs changing.");
      return res.status(200).json({ doc: toStaffDoc(data) });
    }

    res.status(400).json({ error: "Unknown action" });
  } catch (err) {
    fail(res, err);
  }
}
