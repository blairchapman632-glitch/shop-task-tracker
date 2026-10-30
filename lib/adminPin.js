// Admin / QSPP manager PIN: a 4-digit staff PIN with can_access_admin. Used by the Admin lock screen and /qspp
// manager mode. -> { id, name } or null
export async function checkAdminPin(supabase, pharmacyId, pin) {
  if (!/^\d{4}$/.test(String(pin || ""))) return null;
  const { data, error } = await supabase
    .from("staff")
    .select("id, name")
    .eq("pharmacy_id", pharmacyId)
    .eq("pin", pin)
    .eq("can_access_admin", true)
    .single();
  return error || !data ? null : data;
}
