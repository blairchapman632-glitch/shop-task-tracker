import supabase from "./supabaseClient";

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";

// Day-of-week key used by the Admin schedule objects
const DOW_KEY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// Determine Week A or Week B for a date, anchored to the payroll start date.
// Week A = even week-index from the payroll anchor; Week B = odd.
// (Verified: payroll_start 2026-05-27, Sat 2026-08-29 = Week B.)
const weekAB = (dateStr, payrollStart) => {
  if (!payrollStart) return "a";
  const d = new Date(dateStr + "T00:00:00");
  const anchor = new Date(payrollStart + "T00:00:00");
  const days = Math.floor((d - anchor) / 86400000);
  const weekIndex = Math.floor(days / 7);
  return weekIndex % 2 === 0 ? "a" : "b";
};

// Given a staff member and a date, return their normal shift that day
// ({ start, end }) or null if they don't normally work it.
const normalShiftFor = (staff, dateStr, payrollStart) => {
  const dow = new Date(dateStr + "T00:00:00").getDay();
  const key = DOW_KEY[dow];

  if (staff.schedule_type === "alternating" && staff.week_ab_schedule) {
    const wk = weekAB(dateStr, payrollStart);
    const grid = staff.week_ab_schedule[wk];
    const day = grid?.[key];
    if (day?.active && day.start && day.end) return { start: day.start, end: day.end };
    return null;
  }

  if (staff.schedule_type === "weekly" && staff.weekly_schedule) {
    const day = staff.weekly_schedule[key];
    if (day?.active && day.start && day.end) return { start: day.start, end: day.end };
    return null;
  }

  return null;
};

// Main engine: returns an array of cover-needed entries between from/to (inclusive).
// Each: { date, start, end, staffName, filled (bool), locumName (string|null) }
export async function getLeaveCover({ fromDate, toDate }) {
  // 1. Pharmacists with schedules
  const { data: pharmacists } = await supabase
    .from("staff")
    .select("id, name, role, schedule_type, weekly_schedule, week_ab_schedule")
    .eq("pharmacy_id", PHARMACY_ID)
    .in("role", ["Pharmacist", "Intern Pharmacist"]);

  // 2. Payroll anchor for A/B math
  const { data: settings } = await supabase
    .from("pharmacy_settings")
    .select("payroll_start_date")
    .eq("pharmacy_id", PHARMACY_ID)
    .maybeSingle();
  const payrollStart = settings?.payroll_start_date || null;

  // 3. Their leave (pending + approved) overlapping the range
  const pharmacistIds = (pharmacists || []).map((p) => p.id);
  if (!pharmacistIds.length) return [];
  const { data: leave } = await supabase
    .from("leave_requests")
    .select("staff_id, from_date, to_date, status")
    .in("staff_id", pharmacistIds)
    .in("status", ["pending", "approved"])
    .lte("from_date", toDate)
    .gte("to_date", fromDate);

  // 4. Existing locum bookings in the range (to tag filled dates)
  const { data: locumShifts } = await supabase
    .from("roster_shifts")
    .select("shift_date, staff:staff_id(name)")
    .eq("role", "Locum")
    .gte("shift_date", fromDate)
    .lte("shift_date", toDate);
  const locumByDate = {};
  (locumShifts || []).forEach((s) => {
    if (!locumByDate[s.shift_date]) locumByDate[s.shift_date] = s.staff?.name || "Locum";
  });

  const staffById = Object.fromEntries((pharmacists || []).map((p) => [p.id, p]));
  const entries = [];

  // 5. Walk each leave period day by day
  for (const lr of leave || []) {
    const staff = staffById[lr.staff_id];
    if (!staff) continue;
    const start = new Date((lr.from_date > fromDate ? lr.from_date : fromDate) + "T00:00:00");
    const end = new Date((lr.to_date < toDate ? lr.to_date : toDate) + "T00:00:00");
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const shift = normalShiftFor(staff, dateStr, payrollStart);
      if (!shift) continue;
      const locumName = locumByDate[dateStr] || null;
      entries.push({
        date: dateStr,
        start: shift.start,
        end: shift.end,
        staffName: staff.name,
        status: lr.status,
        filled: Boolean(locumName),
        locumName,
      });
    }
  }

  entries.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  return entries;
}