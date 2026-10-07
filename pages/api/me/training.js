// /me Training tab (Records + Plan) for the logged-in staff member only.
// Authorization: Bearer <Supabase access token> (lib/reviewServer.js staffFromRequest — same as reviews/policies).
//
//   GET  -> { staff, records, anchor, exemptions, s2s3, review, goals }
//           staff-facing fields only: no certificate URLs/paths, no exemption reasons, and from reviews only the
//           Section 4 goals of the latest SIGNED review (never ratings, summary, reviewer or pdf_path).
//   POST { action: "add", topic, training_date, hours, provider? }     -> { record }
//   POST { action: "upload-url", record_id, ext }                      -> { path, token }  (browser uploadToSignedUrl)
//   POST { action: "attach", record_id, path, filename }               -> { record }  (replaces + removes any older file)
//   POST { action: "url", record_id }                                  -> { url }     (10-minute signed URL)
// Add only: staff can't edit or delete records (same as the kiosk).
import supabaseAdmin from "../../../lib/supabaseAdmin";
import { staffFromRequest, fail } from "../../../lib/reviewServer";
import { CERT_BUCKET, certPath, loadRecord, newCertPath, attachCert, signedLink, uploadTicket, httpError } from "../../../lib/staffFilesServer";
import { S2S3_DOC_TYPE, fetchAllRows } from "../../../lib/trainingPlan";

const toStaffRecord = (r) => ({
  id: r.id,
  topic: r.topic,
  training_date: r.training_date,
  hours: r.hours,
  provider: r.provider,
  certificate_filename: r.certificate_filename,
  has_certificate: !!certPath(r),
});

const reviewGoals = (goals) => (Array.isArray(goals) ? goals : [])
  .filter((g) => g && (g.goal || g.actions || g.target_date))
  .map((g) => ({ goal: g.goal || "", actions: g.actions || "", target_date: g.target_date || null }));

async function loadMe(req) {
  const me = await staffFromRequest(req);
  const { data, error } = await supabaseAdmin().from("staff")
    .select("id, role, start_date, active, pharmacy_id").eq("id", Number(me.id)).single();
  if (error) throw error;
  return data;
}

async function ownRecord(staff, id) {
  const rec = await loadRecord(id);
  if (Number(rec.staff_id) !== Number(staff.id)) throw httpError(404, "Training record not found");
  return rec;
}

export default async function handler(req, res) {
  try {
    const staff = await loadMe(req);
    const db = supabaseAdmin();
    res.setHeader("Cache-Control", "no-store");

    if (req.method === "GET") {
      const [records, settings, ex, docs, rv, gl] = await Promise.all([
        fetchAllRows(() => db.from("training_records").select("*").eq("staff_id", staff.id).order("training_date", { ascending: false })),
        db.from("pharmacy_settings").select("qspp_cycle_start_date").eq("pharmacy_id", String(staff.pharmacy_id)).maybeSingle(),
        db.from("staff_training_exemptions").select("training_year_start").eq("staff_id", staff.id),
        db.from("locum_documents").select("id, staff_id, type, uploaded_at").eq("staff_id", staff.id).eq("type", S2S3_DOC_TYPE),
        db.from("performance_reviews").select("review_type, meeting_date, signed_at, goals")
          .eq("staff_id", staff.id).eq("status", "signed").order("signed_at", { ascending: false }).limit(1),
        db.from("staff_training_goals").select("id, goal, notes, done, done_at, created_at").eq("staff_id", staff.id).order("created_at"),
      ]);
      const err = settings.error || ex.error || docs.error || rv.error || gl.error;
      if (err) throw err;
      const last = rv.data?.[0];
      return res.status(200).json({
        staff: { id: staff.id, role: staff.role, start_date: staff.start_date, active: staff.active },
        records: records.map(toStaffRecord),
        anchor: settings.data?.qspp_cycle_start_date || null,
        exemptions: (ex.data || []).map((e) => ({ training_year_start: e.training_year_start })),
        s2s3: docs.data || [],
        review: last ? { review_type: last.review_type, meeting_date: last.meeting_date, signed_at: last.signed_at, goals: reviewGoals(last.goals) } : null,
        goals: gl.data || [],
      });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const { action } = req.body || {};

    if (action === "add") {
      const topic = String(req.body.topic || "").trim().slice(0, 500);
      const date = String(req.body.training_date || "");
      const hours = Number(req.body.hours);
      if (!topic) throw httpError(400, "Topic is required.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw httpError(400, "Date is required.");
      if (req.body.hours === "" || req.body.hours == null || !Number.isFinite(hours) || hours < 0 || hours > 1000) throw httpError(400, "Hours is required.");
      const { data, error } = await db.from("training_records").insert([{
        pharmacy_id: staff.pharmacy_id,
        staff_id: staff.id,
        topic,
        training_date: date,
        hours,
        provider: String(req.body.provider || "").trim().slice(0, 255) || null,
      }]).select().single();
      if (error) throw error;
      return res.status(200).json({ record: toStaffRecord(data) });
    }

    const rec = await ownRecord(staff, req.body?.record_id);
    if (action === "upload-url") return res.status(200).json(await uploadTicket(CERT_BUCKET, newCertPath(staff.id, req.body.ext)));
    if (action === "attach") return res.status(200).json({ record: toStaffRecord(await attachCert(rec, req.body.path, req.body.filename)) });
    if (action === "url") {
      const path = certPath(rec);
      if (!path) return res.status(404).json({ error: "No certificate for that record" });
      return res.status(200).json({ url: await signedLink(CERT_BUCKET, path) });
    }
    res.status(400).json({ error: "Unknown action" });
  } catch (err) {
    fail(res, err);
  }
}
