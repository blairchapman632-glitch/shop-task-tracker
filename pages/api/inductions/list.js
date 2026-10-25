// GET (Authorization: Bearer <Supabase access token>) -> { inductions: [...] }
// In-progress inductions in the caller's pharmacy, except their own. Caller needs can_sign_inductions (else 403).
import supabaseAdmin from "../../../lib/supabaseAdmin";
import { fail } from "../../../lib/reviewServer";
import { signerFromRequest, loadItems } from "../../../lib/inductionServer";
import { inductionProgress } from "../../../lib/induction";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const signer = await signerFromRequest(req);
    const db = supabaseAdmin();
    const { data: inds, error } = await db.from("staff_inductions")
      .select("id, staff_id, supervisor_staff_id, start_date, due_date")
      .eq("pharmacy_id", String(signer.pharmacy_id)).eq("status", "in_progress")
      .neq("staff_id", Number(signer.id))
      .order("due_date");
    if (error) throw error;
    const rows = inds || [];

    const peopleIds = [...new Set(rows.flatMap((r) => [r.staff_id, r.supervisor_staff_id]).filter(Boolean).map(Number))];
    const [{ data: people, error: pErr }, items] = await Promise.all([
      peopleIds.length ? db.from("staff").select("id, name, role, active").in("id", peopleIds) : Promise.resolve({ data: [] }),
      loadItems(rows.map((r) => r.id)),
    ]);
    if (pErr) throw pErr;
    const person = (id) => (people || []).find((p) => Number(p.id) === Number(id));

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      inductions: rows
        .filter((r) => person(r.staff_id)?.active !== false)
        .map((r) => {
          const p = inductionProgress(items.filter((i) => String(i.induction_id) === String(r.id))); // same rule as Admin (all lines)
          return {
            id: r.id,
            name: person(r.staff_id)?.name || "",
            role: person(r.staff_id)?.role || "",
            start_date: r.start_date,
            due_date: r.due_date,
            supervisor: person(r.supervisor_staff_id)?.name || "",
            done: p.done,
            total: p.total,
          };
        }),
    });
  } catch (err) {
    fail(res, err);
  }
}
