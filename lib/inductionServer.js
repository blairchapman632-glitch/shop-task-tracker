// Staff induction — /me sign-off for senior staff (Stage 2). SERVER-SIDE ONLY (pages/api/inductions/*).
// Callers must be logged in (staffFromRequest) AND have staff.can_sign_inductions = true.
// /me never sees Office use lines, never their own induction, and can't tick Section 3 (policies).
import supabaseAdmin from "./supabaseAdmin";
import { staffFromRequest } from "./reviewServer";
import { fetchAllRows } from "./trainingPlan";

export const ME_SECTIONS = ["start", "2", "3", "4", "5"]; // shown on /me (not "office")
export const ME_READ_ONLY_SECTIONS = ["3"];              // policies are read by the new starter

const forbidden = (msg) => Object.assign(new Error(msg), { status: 403 });
const notFound = (msg) => Object.assign(new Error(msg), { status: 404 });
const conflict = (msg) => Object.assign(new Error(msg), { status: 409 });

// Logged-in staff member who can sign off inductions -> { id, name, role, pharmacy_id }. 401 / 403 otherwise.
export async function signerFromRequest(req) {
  const me = await staffFromRequest(req);
  const { data, error } = await supabaseAdmin().from("staff")
    .select("id, name, role, active, pharmacy_id, can_sign_inductions").eq("id", Number(me.id)).maybeSingle();
  if (error) throw error;
  if (!data || data.active === false || data.can_sign_inductions !== true) throw forbidden("You can't sign off inductions.");
  return data;
}

export const isPharmacist = (signer) => signer?.role === "Pharmacist"; // not Intern Pharmacist

// An in-progress induction in the caller's pharmacy that isn't their own (anything else looks like "not found")
export async function loadInductionFor(signer, id) {
  const { data, error } = await supabaseAdmin().from("staff_inductions").select("*").eq("id", String(id)).maybeSingle();
  if (error) throw error;
  if (!data || String(data.pharmacy_id) !== String(signer.pharmacy_id) || Number(data.staff_id) === Number(signer.id)) {
    throw notFound("Induction not found");
  }
  if (data.status !== "in_progress") throw conflict("This induction has been signed off.");
  return data;
}

export const loadItems = (inductionIds) =>
  inductionIds.length
    ? fetchAllRows(() => supabaseAdmin().from("staff_induction_items").select("*").in("induction_id", inductionIds).order("id"))
    : Promise.resolve([]);

// Why this signer can't answer / change this line (null = they can)
export function answerBlock(signer, item) {
  if (!ME_SECTIONS.includes(item.section)) return "This line is Admin only.";
  if (ME_READ_ONLY_SECTIONS.includes(item.section)) return "Policies are read by the new starter.";
  if (item.pharmacist_only && !isPharmacist(signer)) return "Needs a pharmacist.";
  if (item.result && !(item.signed_via === "me" && Number(item.signed_by_staff_id) === Number(signer.id))) {
    return "Someone else answered this line — only they or Admin can change it.";
  }
  return null;
}

export { forbidden, notFound, conflict };
