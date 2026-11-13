// Shared helpers for the performance review API routes. SERVER-SIDE ONLY.
import supabaseAdmin from "./supabaseAdmin";
import { buildReviewPdf } from "./reviewPdf";
import { requireDashboard } from "./adminAuth";
import { nextDueAfter, todayPerth, PREP_QUESTIONS } from "./performanceReview";

export const REVIEW_BUCKET = "performance-reviews";
export const SIGNED_URL_SECONDS = 600; // 10 minutes

export const reviewPdfPath = (review) => `${review.staff_id}/${review.id}.pdf`;

export async function loadReview(id) {
  const { data, error } = await supabaseAdmin().from("performance_reviews").select("*").eq("id", String(id)).maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error("Review not found"), { status: 404 });
  return data;
}

// Render the PDF for a review row (as given — may include not-yet-saved signed fields) and upload it.
// Used at sign-off; Part 2 calls it again (with the saved row) after staff add comments.
// Returns { path, warnings }
export async function renderAndStoreReviewPdf(review) {
  const db = supabaseAdmin();
  const ids = [review.staff_id, review.reviewer_staff_id].filter(Boolean).map(Number);
  const [{ data: people, error: pErr }, { data: settings }] = await Promise.all([
    db.from("staff").select("id, name").in("id", ids),
    db.from("pharmacy_settings").select("name, address, phone").eq("pharmacy_id", String(review.pharmacy_id)).maybeSingle(),
  ]);
  if (pErr) throw pErr;
  const nameOf = (id) => (people || []).find((p) => Number(p.id) === Number(id))?.name || "";

  const { bytes, warnings } = await buildReviewPdf({
    review,
    staffName: nameOf(review.staff_id),
    reviewerName: nameOf(review.reviewer_staff_id),
    pharmacy: { name: settings?.name || "", address: settings?.address || "", phone: settings?.phone || "" },
    nextDue: nextDueAfter(review),
  });

  const path = reviewPdfPath(review);
  const { error } = await db.storage.from(REVIEW_BUCKET)
    .upload(path, Buffer.from(bytes), { contentType: "application/pdf", upsert: true });
  if (error) throw error;
  return { path, warnings };
}

export async function signedUrl(path) {
  if (!path) return null;
  const { data, error } = await supabaseAdmin().storage.from(REVIEW_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error) throw error;
  return data.signedUrl;
}

// ── Staff (/me) access ──────────────────────────────────────────────────────
// Staff only ever get these fields — never ratings, summary, goals, reviewer or pdf_path.
// staff_prep_draft / _at: their own unsent answers (saved when the kiosk page closes) — never shown to the reviewer.
const STAFF_COLUMNS = "id, review_type, meeting_date, status, staff_prep, staff_prep_updated_at, staff_prep_draft, staff_prep_draft_at, staff_comments, comment_window_ends";

// Bearer token from /me -> the logged-in staff member's row (Supabase Auth email = staff.email).
// Throws 401 if the token is missing/invalid or doesn't match exactly one active staff member.
export async function staffFromRequest(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const unauth = (msg) => Object.assign(new Error(msg), { status: 401 });
  if (!token) throw unauth("Not logged in");
  const db = supabaseAdmin();
  const { data: userData, error } = await db.auth.getUser(token);
  const email = String(userData?.user?.email || "").trim().toLowerCase();
  if (error || !email) throw unauth("Not logged in");
  // ilike so case doesn't matter; escape its wildcards, then insist on an exact (case-insensitive) match
  const pattern = email.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data: rows, error: sErr } = await db.from("staff").select("id, name, active, pharmacy_id, email").ilike("email", pattern);
  if (sErr) throw sErr;
  const matches = (rows || []).filter((s) => String(s.email || "").trim().toLowerCase() === email);
  if (matches.length !== 1 || matches[0].active === false) throw unauth("No active staff member for this login");
  return matches[0];
}

// The review this staff member can act on right now:
//   in progress                         -> { mode: "prep", review }
//   signed and today <= comment window  -> { mode: "comment", review }
//   otherwise                           -> { mode: null, review: null }   (finished reviews stay hidden)
export async function myCurrentReview(staffId) {
  const db = supabaseAdmin();
  const { data: open, error } = await db.from("performance_reviews").select(STAFF_COLUMNS)
    .eq("staff_id", Number(staffId)).eq("status", "in_progress")
    .order("created_at", { ascending: false }).limit(1);
  if (error) throw error;
  if (open?.length) return { mode: "prep", review: open[0] };

  const { data: signed, error: sErr } = await db.from("performance_reviews").select(STAFF_COLUMNS)
    .eq("staff_id", Number(staffId)).eq("status", "signed")
    .order("signed_at", { ascending: false }).limit(1);
  if (sErr) throw sErr;
  const last = signed?.[0];
  if (last?.comment_window_ends && todayPerth() <= String(last.comment_window_ends).slice(0, 10)) return { mode: "comment", review: last };
  return { mode: null, review: null };
}

// Kiosk "Answer your review questions" job: staff whose newest in-progress review has no Section 2 answers yet —
// the same rule as the /me To do badge (myCurrentReview mode "prep" + components/MyReview.js prepWaiting).
// Returns staff ids ONLY — no review content ever leaves the server for the kiosk.
export async function reviewWaitingStaffIds(pharmacyId) {
  const db = supabaseAdmin();
  const { data, error } = await db.from("performance_reviews").select("staff_id, staff_prep_updated_at, created_at")
    .eq("pharmacy_id", String(pharmacyId)).eq("status", "in_progress").order("created_at", { ascending: false });
  if (error) throw error;
  const newest = new Map(); // staff id -> their newest in-progress review (as myCurrentReview picks it)
  for (const r of data || []) if (!newest.has(Number(r.staff_id))) newest.set(Number(r.staff_id), r);
  return [...newest.entries()].filter(([, r]) => !r.staff_prep_updated_at).map(([id]) => id);
}

// ── Section 2 answers (shared by /me save-prep and the kiosk route) ─────────────────────────────────────────
const PREP_MAX_LEN = 4000;
const cleanPrep = (answers) => {
  const out = {};
  for (const q of PREP_QUESTIONS) out[q.key] = String(answers?.[q.key] ?? "").trim().slice(0, PREP_MAX_LEN);
  return out;
};
const notChangeable = () => Object.assign(new Error("This review can no longer be changed."), { status: 409 });

// Write to the staff member's own current in-progress review only (status re-checked in the update itself).
async function updateOwnPrepReview(staffId, id, patch) {
  const current = await myCurrentReview(staffId);
  if (current.mode !== "prep" || String(current.review.id) !== String(id)) throw notChangeable();
  const { data, error } = await supabaseAdmin().from("performance_reviews")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", String(id)).eq("staff_id", Number(staffId)).eq("status", "in_progress")
    .select("id");
  if (error) throw error;
  if (!data?.length) throw notChangeable();
  return myCurrentReview(staffId);
}

// Send: the answers become the real Section 2 (the reviewer sees them) and any unsent draft is cleared.
export async function sendPrep(staffId, id, answers) {
  const nowIso = new Date().toISOString();
  return updateOwnPrepReview(staffId, id, {
    staff_prep: cleanPrep(answers), staff_prep_updated_at: nowIso, staff_prep_draft: null, staff_prep_draft_at: null,
  });
}

// Unsent answers: kept apart from staff_prep so the reviewer never sees them. answers = null clears the draft.
export async function saveDraftPrep(staffId, id, answers) {
  return updateOwnPrepReview(staffId, id, answers
    ? { staff_prep_draft: cleanPrep(answers), staff_prep_draft_at: new Date().toISOString() }
    : { staff_prep_draft: null, staff_prep_draft_at: null });
}

// ── Kiosk (shop computer) access ────────────────────────────────────────────
// The kiosk's dashboard login (lib/adminAuth.js) AND the staff member's own 4-digit PIN, checked on EVERY request
// (same rule as the staff memo kiosk job). The kiosk's own login is never swapped for the staff member's.
export async function kioskStaffFromRequest(req, staffId, pin) {
  const auth = await requireDashboard(req);
  const { data: s, error } = await supabaseAdmin().from("staff")
    .select("id, name, active, role, pharmacy_id, pin").eq("id", Number(staffId)).maybeSingle();
  if (error) throw error;
  if (!s || s.active === false || s.role === "Locum" || String(s.pharmacy_id) !== auth.pharmacyId || !s.pin
    || !/^\d{4}$/.test(String(pin || "")) || String(pin) !== String(s.pin)) {
    throw Object.assign(new Error("Incorrect PIN."), { status: 401 });
  }
  delete s.pin;
  return s;
}

// Uniform error response
export const fail = (res, err) => {
  console.error("[reviews]", err);
  res.status(err?.status || 500).json({ error: err?.message || String(err) });
};
