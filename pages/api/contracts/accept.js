// POST { token, contract_id, typed_name, agreed: true, address?: { street, suburb, state, postcode } }
// -> records electronic acceptance, regenerates the PDF with the acceptance in the employee signature boxes,
//    stores it at accepted/<staff_id>/<id>.pdf.
// If the issued contract had no address, the new starter supplies it here: it's merged into the contract's
// field_values (accepted copy only — the issued PDF and its sha256 are untouched) and saved to staff.address.
import supabaseAdmin from "../../../lib/supabaseAdmin";
import { loadTemplate, renderContract, uploadPdf, signedUrl, fail } from "../../../lib/contractServer";
import { perthNow } from "../../../lib/contractPdf";

const clean = (s) => String(s || "").trim().replace(/\s+/g, " ");

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { token, contract_id, typed_name, agreed, address } = req.body || {};
    const name = clean(typed_name);
    if (!token || !contract_id) return res.status(400).json({ error: "token and contract_id required" });
    if (agreed !== true) return res.status(400).json({ error: "Please tick the box to agree." });
    if (!name) return res.status(400).json({ error: "Please type your full name." });

    const db = supabaseAdmin();
    const { data: staff } = await db.from("staff").select("id, role").eq("onboarding_token", String(token)).maybeSingle();
    if (!staff || staff.role === "Locum") return res.status(404).json({ error: "Link not found" });

    const { data: contract, error } = await db.from("employment_contracts").select("*").eq("id", String(contract_id)).maybeSingle();
    if (error) throw error;
    if (!contract || Number(contract.staff_id) !== Number(staff.id)) return res.status(404).json({ error: "Contract not found" });
    if (contract.status !== "issued") return res.status(409).json({ error: "This offer is no longer open for acceptance." });

    // Address supplied at acceptance (required when the issued contract has none)
    const fieldValues = { ...(contract.field_values || {}) };
    let staffAddress = null;
    if (!clean(fieldValues.street_address)) {
      const a = {
        street: clean(address?.street),
        suburb: clean(address?.suburb),
        state: clean(address?.state).toUpperCase(),
        postcode: clean(address?.postcode),
      };
      if (!a.street || !a.suburb || !a.state || !a.postcode) {
        return res.status(400).json({ error: "Please fill in your full address." });
      }
      fieldValues.street_address = a.street;
      fieldValues.suburb_state_postcode = `${a.suburb} ${a.state} ${a.postcode}`;
      staffAddress = `${a.street}, ${a.suburb}, ${a.state}, ${a.postcode}`; // staff.address single-text format
    }

    const template = await loadTemplate(contract.template_id);
    const { bytes } = await renderContract(template, fieldValues, {
      employee_signature: `Accepted electronically – ${name}`,
      employee_sign_date: perthNow().stamp,
    });
    const path = `accepted/${staff.id}/${contract.id}.pdf`;
    await uploadPdf(path, bytes);

    const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    const acceptedAt = new Date().toISOString();
    // Only flips if still 'issued' — guards against a double submit or a re-issue at the same moment
    const { data: updated, error: upErr } = await db.from("employment_contracts").update({
      status: "accepted",
      field_values: fieldValues,
      accepted_at: acceptedAt,
      accepted_name: name,
      accepted_ip: fwd || req.socket?.remoteAddress || null,
      accepted_user_agent: String(req.headers["user-agent"] || "").slice(0, 500) || null,
      accepted_file_path: path,
      updated_at: acceptedAt,
    }).eq("id", contract.id).eq("status", "issued").select("id");
    if (upErr) throw upErr;
    if (!updated?.length) return res.status(409).json({ error: "This offer is no longer open for acceptance." });

    if (staffAddress) {
      const { error: addrErr } = await db.from("staff").update({ address: staffAddress }).eq("id", staff.id);
      if (addrErr) console.error("[contracts] accepted, but couldn't save staff.address", addrErr);
    }

    res.status(200).json({
      accepted_at: acceptedAt,
      accepted_name: name,
      accepted_url: await signedUrl(path),
      address: staffAddress,
    });
  } catch (err) {
    fail(res, err);
  }
}
