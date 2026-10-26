// Section cleans — shared helpers (Tasks → Section Cleans and the kiosk).
// section_clean_schedule: one row per section per month ("YYYY-MM-01"); unique (section_id, month).

// Perth calendar year / month, never via toISOString (UTC+8 off-by-one)
const perthParts = () => {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Perth" }).format(new Date()); // YYYY-MM-DD
  return { year: Number(s.slice(0, 4)), month: `${s.slice(0, 7)}-01` };
};
export const perthYear = () => perthParts().year;
export const perthMonthStart = () => perthParts().month; // "YYYY-MM-01"

// Jan–Dec of a year: [{ label: "Jan", value: "2027-01-01" }, ...]
const LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthsOf = (year) => LABELS.map((label, i) => ({ label, value: `${year}-${String(i + 1).padStart(2, "0")}-01` }));

// Rows that WOULD be copied into `year` (previous year's months, sections that still exist, not completed).
// [] when `year` already has rows. Read-only.
export async function planSectionYear(supabase, pharmacyId, year) {
  const { count, error } = await supabase.from("section_clean_schedule").select("id", { count: "exact", head: true })
    .eq("pharmacy_id", pharmacyId).gte("month", `${year}-01-01`).lte("month", `${year}-12-01`);
  if (error) throw error;
  if (count > 0) return [];
  const prev = year - 1;
  const [{ data: rows, error: rErr }, { data: secs, error: sErr }] = await Promise.all([
    supabase.from("section_clean_schedule").select("section_id, month")
      .eq("pharmacy_id", pharmacyId).gte("month", `${prev}-01-01`).lte("month", `${prev}-12-01`),
    supabase.from("sections").select("id").eq("pharmacy_id", pharmacyId),
  ]);
  if (rErr || sErr) throw rErr || sErr;
  const exists = new Set((secs || []).map((s) => String(s.id)));
  return (rows || [])
    .filter((r) => exists.has(String(r.section_id)))
    .map((r) => ({
      pharmacy_id: pharmacyId,
      section_id: r.section_id,
      month: `${year}${String(r.month).slice(4, 10)}`, // same month, new year
      completed_at: null,
      completed_by_staff_id: null,
    }));
}

// New year with no schedule yet -> copy last year's schedule into the same months. Safe to run from two devices at
// once: the upsert ignores rows that already exist (unique section_id + month). -> { copied }
export async function ensureSectionYear(supabase, pharmacyId, year) {
  if (!pharmacyId || !year) return { copied: 0 };
  const rows = await planSectionYear(supabase, pharmacyId, year);
  if (!rows.length) return { copied: 0 };
  const { error } = await supabase.from("section_clean_schedule")
    .upsert(rows, { onConflict: "section_id,month", ignoreDuplicates: true });
  if (error) throw error;
  return { copied: rows.length };
}
