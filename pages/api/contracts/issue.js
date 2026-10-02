// POST { staff_id, template_id, values, draft_id? } -> fills + stores the issued PDF, marks earlier
// unaccepted (draft/issued) contracts for this staff member as superseded. Accepted contracts never change.
// TODO(#11 auth pass): Admin routes have no server-side auth yet (same as the rest of Admin).
import crypto from "crypto";
import supabaseAdmin from "../../../lib/supabaseAdmin";
import { loadTemplate, loadStaff, renderContract, uploadPdf, sha256, fail } from "../../../lib/contractServer";
import { perthNow } from "../../../lib/contractPdf";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { staff_id, template_id, values, draft_id } = req.body || {};
    if (!staff_id || !template_id || !values) return res.status(400).json({ error: "staff_id, template_id and values required" });
    const staff = await loadStaff(staff_id);
    const template = await loadTemplate(template_id);
    const db = supabaseAdmin();

    // Reuse the draft row if we're issuing a saved draft for this staff member
    let id = null;
    if (draft_id) {
      const { data: draft } = await db.from("employment_contracts").select("id, staff_id, status").eq("id", String(draft_id)).maybeSingle();
      if (draft && Number(draft.staff_id) === Number(staff.id) && draft.status === "draft") id = draft.id;
    }
    const isNewRow = !id;
    if (!id) id = crypto.randomUUID();

    const finalValues = { ...values, employer_sign_date: perthNow().date }; // employer signs on the issue date
    const { bytes, warnings } = await renderContract(template, finalValues);
    const path = `issued/${staff.id}/${id}.pdf`;
    await uploadPdf(path, bytes); // upload first so a failed upload changes nothing in the table

    const nowIso = new Date().toISOString();
    const row = {
      pharmacy_id: staff.pharmacy_id,
      staff_id: staff.id,
      template_id: template.id,
      template_version: template.version,
      field_values: finalValues,
      status: "issued",
      issued_file_path: path,
      issued_sha256: sha256(bytes),
      issued_at: nowIso,
      updated_at: nowIso,
    };
    const { error: saveErr } = isNewRow
      ? await db.from("employment_contracts").insert([{ id, ...row }])
      : await db.from("employment_contracts").update(row).eq("id", id);
    if (saveErr) throw saveErr;

    const { error: supErr } = await db.from("employment_contracts")
      .update({ status: "superseded", updated_at: nowIso })
      .eq("staff_id", staff.id)
      .in("status", ["draft", "issued"])
      .neq("id", id);
    if (supErr) throw supErr;

    // Remember the classification on the staff record (prefills the next contract)
    if (finalValues.classification) {
      const { error: clsErr } = await db.from("staff").update({ classification: String(finalValues.classification) }).eq("id", staff.id);
      if (clsErr) warnings.push("Contract issued, but couldn't save the classification to the staff record: " + clsErr.message);
    }

    res.status(200).json({ id, warnings });
  } catch (err) {
    fail(res, err);
  }
}
