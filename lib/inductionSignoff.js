// Staff induction Stage 5 — readiness, employee confirmation, supervisor sign-off, PDF. SERVER-SIDE ONLY.
// Order (all checked here): ready (every line answered + probation review signed + outcome + late reason)
//   -> employee confirms on the kiosk (rostered on today) -> supervisor signs off (Admin, or their /me) -> PDF.
// PDFs live in the PRIVATE 'staff-inductions' bucket; opened only through signed URLs from pages/api/inductions/pdf-url.
import supabaseAdmin from "./supabaseAdmin";
import { fetchAllRows } from "./trainingPlan";
import { todayPerth } from "./performanceReview";
import { inductionReadiness, pickProbationReview } from "./induction";
import { buildInductionPdf } from "./inductionPdf";

export const INDUCTION_BUCKET = "staff-inductions";
export const SIGNED_URL_SECONDS = 600;
export const inductionPdfPath = (ind) => `${ind.staff_id}/${ind.id}.pdf`;

const httpError = (status, message) => Object.assign(new Error(message), { status });

// Induction + lines + person + probation review, everything readiness and the PDF need
export async function loadBundle(id) {
  const db = supabaseAdmin();
  const { data: induction, error } = await db.from("staff_inductions").select("*").eq("id", String(id)).maybeSingle();
  if (error) throw error;
  if (!induction) throw httpError(404, "Induction not found");
  const [items, { data: staff, error: sErr }, { data: reviews, error: rErr }] = await Promise.all([
    fetchAllRows(() => db.from("staff_induction_items").select("*").eq("induction_id", induction.id).order("id")),
    db.from("staff").select("id, name, role, pharmacy_id").eq("id", Number(induction.staff_id)).maybeSingle(),
    db.from("performance_reviews").select("id, staff_id, review_type, status, reviewer_staff_id, meeting_date, signed_at, created_at")
      .eq("staff_id", Number(induction.staff_id)),
  ]);
  if (sErr || rErr) throw sErr || rErr;
  const review = pickProbationReview(reviews);
  return { induction, items, staff, review, readiness: inductionReadiness(induction, items, review) };
}

// Rostered on today (Perth) and not marked sick on that shift — same rule as the kiosk cards
export async function rosteredToday(staffId) {
  const db = supabaseAdmin();
  const { data: shifts, error } = await db.from("roster_shifts").select("id").eq("staff_id", Number(staffId)).eq("shift_date", todayPerth());
  if (error) throw error;
  if (!shifts?.length) return false;
  const { data: sick, error: sErr } = await db.from("sick_days").select("roster_shift_id").in("roster_shift_id", shifts.map((s) => s.id));
  if (sErr) throw sErr;
  const sickIds = new Set((sick || []).map((s) => String(s.roster_shift_id)));
  return shifts.some((s) => !sickIds.has(String(s.id)));
}

// Supervisor sign-off checks (shared by the Admin and /me paths). Throws 409 with what's missing.
export function assertCanSignOff(bundle) {
  const { induction, readiness } = bundle;
  if (induction.status !== "in_progress") throw httpError(409, "This induction is already signed off.");
  if (!readiness.ready) throw httpError(409, `Not ready to sign off: ${readiness.missing.join("; ")}.`);
  if (!induction.employee_confirmed_at) throw httpError(409, "The employee hasn't confirmed their induction on the kiosk yet.");
  if (!induction.supervisor_staff_id) throw httpError(409, "No supervisor set.");
}

// Close the induction, then build + store the PDF. -> { induction, pdfError }
export async function signOff(bundle, via) {
  const db = supabaseAdmin();
  const { induction, review } = bundle;
  const { data: rows, error } = await db.from("staff_inductions").update({
    status: "signed_off",
    signed_off_by_staff_id: Number(induction.supervisor_staff_id),
    signed_off_at: new Date().toISOString(),
    signed_off_via: via,
    probation_review_id: review?.id || null,
    updated_at: new Date().toISOString(),
  }).eq("id", induction.id).eq("status", "in_progress").select("*");
  if (error) throw error;
  if (!rows?.length) throw httpError(409, "This induction was just changed — refresh and try again.");
  let pdfError = null;
  try {
    await renderAndStorePdf({ ...bundle, induction: rows[0] });
  } catch (err) {
    console.error("[induction pdf]", err);
    pdfError = err?.message || String(err);
  }
  return { induction: rows[0], pdfError };
}

// Build the PDF for a signed-off induction and upload it (overwrites). -> { path, warnings }
export async function renderAndStorePdf(bundle) {
  const db = supabaseAdmin();
  const { induction, items, staff, review } = bundle;
  const ids = [...new Set([induction.supervisor_staff_id, induction.signed_off_by_staff_id, review?.reviewer_staff_id,
    ...items.map((i) => i.signed_by_staff_id)].filter(Boolean).map(Number))];
  const [{ data: people, error: pErr }, { data: settings }] = await Promise.all([
    ids.length ? db.from("staff").select("id, name").in("id", ids) : Promise.resolve({ data: [] }),
    db.from("pharmacy_settings").select("name, address, phone").eq("pharmacy_id", String(induction.pharmacy_id)).maybeSingle(),
  ]);
  if (pErr) throw pErr;
  const names = (id) => (people || []).find((p) => Number(p.id) === Number(id))?.name || "";
  const { bytes, warnings } = await buildInductionPdf({
    induction, items, staff, names, review,
    pharmacy: { name: settings?.name || "", address: settings?.address || "", phone: settings?.phone || "" },
  });
  const path = inductionPdfPath(induction);
  const { error } = await db.storage.from(INDUCTION_BUCKET).upload(path, Buffer.from(bytes), { contentType: "application/pdf", upsert: true });
  if (error) throw error;
  const { error: uErr } = await db.from("staff_inductions").update({ pdf_path: path }).eq("id", induction.id);
  if (uErr) throw uErr;
  return { path, warnings };
}

export async function signedPdfUrl(path) {
  const { data, error } = await supabaseAdmin().storage.from(INDUCTION_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error) throw error;
  return data.signedUrl;
}
