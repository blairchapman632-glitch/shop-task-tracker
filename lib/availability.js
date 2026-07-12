// Shared availability resolution — used by roster.js (desktop) and me.js (mobile).
// Keep one source of truth so the two can't drift.

export const toMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const [h, m] = String(timeStr).split(":").map(Number);
  return h * 60 + (m || 0);
};

// Returns { status, leaveType }
// status: "leave" | "unavailable" | "all_day" | "am" | "pm" | "none"
export function getStaffAvailability({ staffId, date, patterns = [], overrides = [], approvedLeave = [] }) {
  if (!staffId || !date) return { status: "none" };

  const leave = approvedLeave.find((lr) =>
    String(lr.staff_id) === String(staffId) &&
    date >= lr.from_date && date <= lr.to_date
  );
  if (leave) return { status: "leave", leaveType: leave.leave_type };

  const ovr = overrides.find((o) => String(o.staff_id) === String(staffId) && o.override_date === date);
  if (ovr) return { status: ovr.status || "none" };

  const dow = new Date(date + "T00:00:00").getDay();
  const covering = patterns
    .filter((p) =>
      String(p.staff_id) === String(staffId) &&
      p.day_of_week === dow &&
      (!p.from_date || p.from_date <= date) &&
      (!p.to_date || p.to_date >= date)
    )
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  return { status: covering[0]?.status || "none" };
}

// Conflict string for a specific shift, or null if no conflict.
export function getShiftConflict({ shift, patterns = [], overrides = [], approvedLeave = [] }) {
  if (!shift?.staff_id) return null;
  const { status, leaveType } = getStaffAvailability({
    staffId: shift.staff_id, date: shift.shift_date, patterns, overrides, approvedLeave,
  });
  if (status === "leave") return `On ${leaveType}`;
  if (status === "unavailable") return "Marked unavailable";
  if (status === "none" || status === "all_day") return null;
  const startMin = toMinutes(shift.start_time);
  const endMin = toMinutes(shift.end_time);
  const NOON = 12 * 60;
  if (status === "am" && endMin > NOON) return "Available mornings only";
  if (status === "pm" && startMin < NOON) return "Available afternoons only";
  return null;
}

// Buckets for a date. Excludes anyone already rostered that day.
export function getDayAvailability({ date, staffOptions = [], shifts = [], patterns = [], overrides = [], approvedLeave = [] }) {
  if (!date) return { available: [], unavailable: [], unsubmitted: [] };
  const rosteredIds = new Set(
    shifts.filter((s) => s.shift_date === date && s.staff_id).map((s) => String(s.staff_id))
  );
  const available = [];
  const unavailable = [];
  const unsubmitted = [];

  for (const st of staffOptions) {
    if (rosteredIds.has(String(st.id))) continue;
    const { status, leaveType } = getStaffAvailability({
      staffId: st.id, date, patterns, overrides, approvedLeave,
    });
    if (status === "leave") unavailable.push({ ...st, note: leaveType });
    else if (status === "unavailable") unavailable.push({ ...st, note: "Unavailable" });
    else if (status === "am") available.push({ ...st, note: "🌅 AM only" });
    else if (status === "pm") available.push({ ...st, note: "🌆 PM only" });
    else if (status === "all_day") available.push({ ...st, note: null });
    else unsubmitted.push({ ...st, note: null });
  }
  return { available, unavailable, unsubmitted };
}