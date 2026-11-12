// Staff PIN checks for locked areas. Each person uses their own 4-digit staff PIN (no shared PIN).
//   checkAdminPin       — "Can access admin" (staff.can_access_admin): the Admin lock screen and /banking.
//   checkQsppManagerPin — "QSPP manager" (staff.is_qspp_manager, active staff only): /qspp manager mode and the QSPP
//                         save route (pages/api/qspp/register.js). The same switch decides who gets the QSPP kiosk jobs.
// -> { id, name } or null
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

export async function checkQsppManagerPin(supabase, pharmacyId, pin) {
  if (!/^\d{4}$/.test(String(pin || ""))) return null;
  const { data, error } = await supabase
    .from("staff")
    .select("id, name")
    .eq("pharmacy_id", pharmacyId)
    .eq("pin", pin)
    .eq("is_qspp_manager", true)
    .eq("active", true)
    .single();
  return error || !data ? null : data;
}
