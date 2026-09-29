import supabase from "./supabaseClient";
import { normalShiftFor } from "./weekSchedule";

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";

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
    .select("id, shift_date, start_time, end_time, staff:staff_id(name)")
    .eq("role", "Locum")
    .gte("shift_date", fromDate)
    .lte("shift_date", toDate);
  // All locum bookings grouped by date (a day can have several)
  const locumsByDate = {};
  (locumShifts || []).forEach((s) => {
    if (!locumsByDate[s.shift_date]) locumsByDate[s.shift_date] = [];
    locumsByDate[s.shift_date].push({
      name: s.staff?.name || "Locum",
      shiftId: s.id,
      start: String(s.start_time).slice(0, 5),
      end: String(s.end_time).slice(0, 5),
    });
  });

  const staffById = Object.fromEntries((pharmacists || []).map((p) => [p.id, p]));
  // One slot per pharmacist per date, even if leave requests overlap or are duplicated.
  // Keyed "staffId|date"; an approved request wins over a pending one.
  const slotByKey = {};

  // 5. Walk each leave period day by day — collect the leave slots (no booking yet)
  for (const lr of leave || []) {
    const staff = staffById[lr.staff_id];
    if (!staff) continue;
    const start = new Date((lr.from_date > fromDate ? lr.from_date : fromDate) + "T00:00:00");
    const end = new Date((lr.to_date < toDate ? lr.to_date : toDate) + "T00:00:00");
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const shift = normalShiftFor(staff, dateStr, payrollStart);
      if (!shift) continue;
      const key = `${staff.id}|${dateStr}`;
      const existing = slotByKey[key];
      if (existing && !(existing.status !== "approved" && lr.status === "approved")) continue;
      slotByKey[key] = {
        date: dateStr,
        start: shift.start,
        end: shift.end,
        staffName: staff.name,
        status: lr.status,
      };
    }
  }
  const rawEntries = Object.values(slotByKey);

  // 6. Pair each date's leave slots to that date's locum bookings, one booking per slot.
  // Rule: for each slot (in start-time order), take the not-yet-used booking whose start
  // time is closest to the slot's start. Leftover slots stay unfilled; leftover bookings
  // are ignored here (they still show in Upcoming Bookings).
  const toMin = (t) => {
    const [h, m] = String(t).split(":").map(Number);
    return h * 60 + (m || 0);
  };
  const entries = [];
  const byDate = {};
  rawEntries.forEach((e) => { (byDate[e.date] ||= []).push(e); });

  for (const dateStr of Object.keys(byDate)) {
    const slots = byDate[dateStr].sort((a, b) => a.start.localeCompare(b.start));
    const bookings = (locumsByDate[dateStr] || []).slice(); // copy — we splice as we claim
    for (const slot of slots) {
      let booking = null;
      if (bookings.length) {
        // closest start time to this slot
        let bestIdx = 0;
        let bestDiff = Math.abs(toMin(bookings[0].start) - toMin(slot.start));
        for (let i = 1; i < bookings.length; i++) {
          const diff = Math.abs(toMin(bookings[i].start) - toMin(slot.start));
          if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
        }
        booking = bookings.splice(bestIdx, 1)[0]; // claim it
      }
      entries.push({
        date: slot.date,
        start: slot.start,
        end: slot.end,
        staffName: slot.staffName,
        status: slot.status,
        filled: Boolean(booking),
        locumName: booking?.name || null,
        bookingId: booking?.shiftId || null,
        bookingStart: booking?.start || null,
        bookingEnd: booking?.end || null,
      });
    }
  }

  entries.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  return entries;
}