// GET ?token= -> the latest issued or accepted contract for the staff member owning this onboarding token,
// with 10-minute signed URLs, the template label and info links. { contract: null } if there isn't one.
import supabaseAdmin from "../../../lib/supabaseAdmin";
import { signedUrl, fail } from "../../../lib/contractServer";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: "token required" });
    const db = supabaseAdmin();

    const { data: staff, error } = await db.from("staff").select("id, role").eq("onboarding_token", String(token)).maybeSingle();
    if (error) throw error;
    if (!staff || staff.role === "Locum") return res.status(404).json({ error: "Link not found" });

    const { data: contract, error: cErr } = await db.from("employment_contracts")
      .select("id, status, issued_at, accepted_at, accepted_name, issued_file_path, accepted_file_path, template_id, field_values")
      .eq("staff_id", staff.id)
      .in("status", ["issued", "accepted"])
      .order("issued_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (cErr) throw cErr;
    if (!contract) return res.status(200).json({ contract: null });

    const { data: tpl } = await db.from("contract_templates")
      .select("label, employment_category, info_links").eq("id", contract.template_id).maybeSingle();

    res.status(200).json({
      contract: {
        id: contract.id,
        status: contract.status,
        issued_at: contract.issued_at,
        accepted_at: contract.accepted_at,
        accepted_name: contract.accepted_name,
        label: tpl?.label || "Offer of employment",
        employment_category: tpl?.employment_category || null,
        info_links: tpl?.info_links || [],
        // Issued without an address -> the new starter enters it at acceptance
        needs_address: contract.status === "issued" && !String(contract.field_values?.street_address || "").trim(),
        issued_url: await signedUrl(contract.issued_file_path),
        accepted_url: contract.status === "accepted" ? await signedUrl(contract.accepted_file_path) : null,
      },
    });
  } catch (err) {
    fail(res, err);
  }
}
