// GET ?id=<induction id> (Authorization: Bearer <Supabase access token>)
// -> { induction: { Section 1 summary }, items: [...], me: { isPharmacist } }
// Lines for Getting started and Sections 2–5 only (never Office use). Each line says whether the caller can answer it.
import supabaseAdmin from "../../../lib/supabaseAdmin";
import { fail } from "../../../lib/reviewServer";
import { signerFromRequest, loadInductionFor, loadItems, itemForMe, isPharmacist, ME_SECTIONS } from "../../../lib/inductionServer";
import { inductionProgress, inductionReadiness, pickProbationReview } from "../../../lib/induction";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const signer = await signerFromRequest(req);
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: "id required" });
    const ind = await loadInductionFor(signer, id);
    const all = await loadItems([ind.id]); // saved lines only — auto-checks run separately (pages/api/inductions/auto-check)
    const items = all.filter((i) => ME_SECTIONS.includes(i.section));

    const peopleIds = [...new Set([ind.staff_id, ind.supervisor_staff_id, ...items.map((i) => i.signed_by_staff_id)].filter(Boolean).map(Number))];
    const { data: people, error } = await supabaseAdmin().from("staff").select("id, name, role").in("id", peopleIds);
    if (error) throw error;
    const person = (pid) => (people || []).find((p) => Number(p.id) === Number(pid));

    const p = inductionProgress(all); // same count as Admin and the list
    const { data: reviews, error: rErr } = await supabaseAdmin().from("performance_reviews")
      .select("id, review_type, status, signed_at, created_at").eq("staff_id", Number(ind.staff_id));
    if (rErr) throw rErr;
    const readiness = inductionReadiness(ind, all, pickProbationReview(reviews));
    const isSupervisor = Number(ind.supervisor_staff_id) === Number(signer.id);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      me: { name: signer.name, isPharmacist: isPharmacist(signer), isSupervisor },
      signOff: isSupervisor ? {
        ready: readiness.ready,
        missing: readiness.missing,
        employee_confirmed_at: ind.employee_confirmed_at,
      } : null,
      induction: {
        id: ind.id,
        name: person(ind.staff_id)?.name || "",
        role: person(ind.staff_id)?.role || "",
        is_student: ind.is_student,
        start_date: ind.start_date,
        due_date: ind.due_date,
        supervisor: person(ind.supervisor_staff_id)?.name || "",
        done: p.done,
        total: p.total,
      },
      items: items
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        .map((i) => itemForMe(signer, i, (pid) => person(pid)?.name)),
    });
  } catch (err) {
    fail(res, err);
  }
}
