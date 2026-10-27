import supabase from "./supabaseClient";
import { normalShiftFor } from "./weekSchedule";

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";

// Main engine: returns an array of cover-needed entries between from/to (inclusive).
// Each: { date, start, end, staffId, staffName, status, edited, filled (bool), locumName (string|null),
//         bookingId, bookingStart, bookingEnd, fillerStaffId, fillerType ("locum" | "pharmacist" | null) }
// A slot is filled by any roster_shifts row that date with role "Locum" OR covers_leave = true (a pharmacist
// rostered as cover). Times can be overridden per slot (locum_slot_overrides) — the edited times are used for
// pairing, assigning and the copy list.
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

  // 4. Cover bookings in the range — locums, and pharmacists rostered as cover (covers_leave)
  const { data: coverShifts } = await supabase
    .from("roster_shifts")
    .select("id, shift_date, start_time, end_time, role, covers_leave, staff_id, staff:staff_id(id, name)")
    .or("role.eq.Locum,covers_leave.eq.true")
    .gte("shift_date", fromDate)
    .lte("shift_date", toDate);
  // All cover bookings grouped by date (a day can have several)
  const bookingsByDate = {};
  (coverShifts || []).forEach((s) => {
    if (!bookingsByDate[s.shift_date]) bookingsByDate[s.shift_date] = [];
    const isLocum = s.role === "Locum";
    bookingsByDate[s.shift_date].push({
      name: s.staff?.name || (isLocum ? "Locum" : "Pharmacist"),
      shiftId: s.id,
      staffId: s.staff_id ?? s.staff?.id ?? null,
      type: isLocum ? "locum" : "pharmacist",
      start: String(s.start_time).slice(0, 5),
      end: String(s.end_time).slice(0, 5),
    });
  });

  // 4b. Edited times for leave-based slots (one per staff member per date)
  const { data: overrides } = await supabase
    .from("locum_slot_overrides")
    .select("id, staff_id, slot_date, start_time, end_time")
    .eq("pharmacy_id", PHARMACY_ID)
    .gte("slot_date", fromDate)
    .lte("slot_date", toDate);
  const overrideByKey = Object.fromEntries((overrides || []).map((o) => [`${o.staff_id}|${o.slot_date}`, o]));

  // 4c. Public holidays — every row is a closed day, so no leave-based slot is created on one
  //     (manual slots in locum_gaps are added on purpose and aren't affected)
  const { data: holidays } = await supabase
    .from("public_holidays")
    .select("date")
    .eq("pharmacy_id", PHARMACY_ID)
    .gte("date", fromDate)
    .lte("date", toDate);
  const closedDates = new Set((holidays || []).map((h) => String(h.date).slice(0, 10)));

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
      if (closedDates.has(dateStr)) continue; // public holiday — pharmacy closed
      const shift = normalShiftFor(staff, dateStr, payrollStart);
      if (!shift) continue;
      const key = `${staff.id}|${dateStr}`;
      const existing = slotByKey[key];
      if (existing && !(existing.status !== "approved" && lr.status === "approved")) continue;
      const ov = overrideByKey[key];
      slotByKey[key] = {
        date: dateStr,
        start: ov ? String(ov.start_time).slice(0, 5) : shift.start,
        end: ov ? String(ov.end_time).slice(0, 5) : shift.end,
        staffId: staff.id,
        staffName: staff.name,
        status: lr.status,
        edited: Boolean(ov),
      };
    }
  }
  const rawEntries = Object.values(slotByKey);

  // 6. Pair each date's leave slots to that date's cover bookings, one booking per slot.
  // Rule: for each slot (in start-time order), take the not-yet-used booking whose start
  // time is closest to the slot's start. Leftover slots stay unfilled; leftover bookings
  // are ignored here (locum ones still show in Upcoming Bookings).
  const toMin = (t) => {
    const [h, m] = String(t).split(":").map(Number);
    return h * 60 + (m || 0);
  };
  const entries = [];
  const byDate = {};
  rawEntries.forEach((e) => { (byDate[e.date] ||= []).push(e); });

  for (const dateStr of Object.keys(byDate)) {
    const slots = byDate[dateStr].sort((a, b) => a.start.localeCompare(b.start));
    const bookings = (bookingsByDate[dateStr] || []).slice(); // copy — we splice as we claim
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
        staffId: slot.staffId,
        staffName: slot.staffName,
        status: slot.status,
        edited: slot.edited,
        filled: Boolean(booking),
        locumName: booking?.name || null,
        bookingId: booking?.shiftId || null,
        bookingStart: booking?.start || null,
        bookingEnd: booking?.end || null,
        fillerStaffId: booking?.staffId || null,
        fillerType: booking?.type || null,
      });
    }
  }

  entries.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  return entries;
}
