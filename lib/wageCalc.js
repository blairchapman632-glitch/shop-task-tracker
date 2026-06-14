// Shared wage calculation — used by both the desktop wages page and the /me staff portal.
// Extracted verbatim from wages.js so both pages always agree. Do not change the maths here
// without checking it against Arthur's payroll expectations.

export const FORTNIGHT_THRESHOLD = 76;

export const toISO = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};

export const shiftHours = (start, end) => {
  if (!start || !end) return 0;
  const [sh, sm] = String(start).split(":").map(Number);
  const [eh, em] = String(end).split(":").map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60; // overnight safety
  return mins / 60;
};

export const dayCategory = (dateStr, holidaySet) => {
  if (holidaySet.has(dateStr)) return "ph";
  const dow = new Date(dateStr + "T00:00:00").getDay(); // 0 = Sun, 6 = Sat
  if (dow === 6) return "sat";
  if (dow === 0) return "sun";
  return "weekday";
};

const DOW_KEY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
export const dayKey = (dateStr) => DOW_KEY[new Date(dateStr + "T00:00:00").getDay()];

export const abForDate = (dateStr, periodStart) => {
  const d = new Date(dateStr + "T00:00:00");
  const ps = new Date(periodStart);
  ps.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((d.getTime() - ps.getTime()) / 86400000);
  return diffDays < 7 ? "a" : "b";
};

export const scheduledHoursForDate = (staffMember, dateStr, periodStart) => {
  if (!staffMember || staffMember.employment_type !== "Permanent") return 0;
  const key = dayKey(dateStr);
  let day = null;
  if (staffMember.schedule_type === "alternating") {
    const ab = abForDate(dateStr, periodStart);
    day = staffMember.week_ab_schedule?.[ab]?.[key];
  } else {
    day = staffMember.weekly_schedule?.[key];
  }
  if (!day || !day.active || !day.start || !day.end) return 0;
  return shiftHours(day.start, day.end);
};

export const fmt = (n) => (n === 0 ? "—" : n.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1"));

// ─────────────────────────────────────────────────────────────────────────────
// Main calculation — builds the per-staff wage rows for a pay period.
// Extracted verbatim from the wages.js load() effect.
//
// Inputs (all already fetched by the caller):
//   period      = { start: Date, end: Date }
//   staffData   = rows from `staff`
//   shifts      = rows from `roster_shifts` for the period
//   holidays    = rows from `public_holidays` for the period
//   editsByShift= { [roster_shift_id]: shift_edits row }
//   sickByShift = { [roster_shift_id]: sick_days row }
//   leaveData   = approved leave_requests overlapping the period
//
// Returns: sorted array of computed rows (same shape wages.js used in setRows).
// ─────────────────────────────────────────────────────────────────────────────
export function buildWageRows({ period, staffData, shifts, holidays, editsByShift, sickByShift, leaveData }) {
  const startISO = toISO(period.start);
  const endISO = toISO(period.end);

  const holidaySet = new Set((holidays || []).map((h) => h.date));
  const staffById = Object.fromEntries((staffData || []).map((s) => [s.id, s]));

  // Group shifts by staff (or casual name)
  const grouped = {};
  for (const sh of shifts || []) {
    const key = sh.staff_id ? `s_${sh.staff_id}` : `c_${sh.staff_name || "Unknown"}`;
    const role = sh.staff_id ? (staffById[sh.staff_id]?.role || sh.role) : sh.role;
    const name = sh.staff_id ? (staffById[sh.staff_id]?.name || sh.staff_name || "?") : (sh.staff_name || "Casual");
    if (!grouped[key]) {
      grouped[key] = { key, staffId: sh.staff_id || null, name, role, weekday: 0, sat: 0, sun: 0, ph: 0, shifts: [] };
    }
    const edit = editsByShift[sh.id] || null;
    const isSick = !!sickByShift[sh.id];
    const isPermanent = sh.staff_id ? (staffById[sh.staff_id]?.employment_type === "Permanent") : false;
    const staffNoLunch = sh.staff_id ? (staffById[sh.staff_id]?.no_lunch_deduction === true) : false;
    const rosteredHrs = shiftHours(sh.start_time, sh.end_time);
    const adjustMins = edit?.adjust_minutes || 0;
    let hrs = rosteredHrs + adjustMins / 60;
    // Lunch deducted for any shift over 5 hrs, unless "no lunch" ticked OR staff never deducts lunch
    const breakApplies = hrs > 5 && !(edit?.no_lunch) && !staffNoLunch;
    if (breakApplies) hrs -= 0.5;
    const cat = dayCategory(sh.shift_date, holidaySet);

    if (isSick) {
      const sickRecord = sickByShift[sh.id];
      const isCompassionate = sickRecord?.leave_type === "compassionate";
      const isSalaryStaff = sh.staff_id ? (staffById[sh.staff_id]?.employment_type === "Salary") : false;
      // Permanent and Salary → hours go to Sick or Compassionate column. Casual → unpaid (zero).
      if (isPermanent || isSalaryStaff) {
        if (isCompassionate) {
          grouped[key].compassionate = (grouped[key].compassionate || 0) + hrs;
        } else {
          grouped[key].sick = (grouped[key].sick || 0) + hrs;
        }
      }
      grouped[key].shifts.push({
        id: sh.id, date: sh.shift_date, start: sh.start_time, end: sh.end_time,
        cat: "sick", rosteredHrs, adjustMins,
        paidHrs: isPermanent ? hrs : 0,
        breakDeducted: breakApplies, edit, isSick,
        isCompassionate,
        paidSick: isPermanent,
      });
    } else {
      grouped[key][cat] += hrs;
      grouped[key].shifts.push({
        id: sh.id, date: sh.shift_date, start: sh.start_time, end: sh.end_time,
        cat, rosteredHrs, adjustMins, paidHrs: hrs,
        breakDeducted: breakApplies, edit,
      });
    }
  }

  // Public holiday pay for permanent staff (closed days have no shifts, so pull from schedule)
  const holidayDates = (holidays || []).map((h) => h.date);
  for (const st of staffData || []) {
    if (st.employment_type !== "Permanent" || st.active === false) continue;
    for (const hDate of holidayDates) {
      const hasShift = (shifts || []).some((sh) => sh.staff_id === st.id && sh.shift_date === hDate);
      if (hasShift) continue;
      let phHrs = scheduledHoursForDate(st, hDate, period.start);
      if (phHrs <= 0) continue;
      if (phHrs > 5 && st.no_lunch_deduction !== true) phHrs -= 0.5;
      const key = `s_${st.id}`;
      if (!grouped[key]) {
        grouped[key] = { key, staffId: st.id, name: st.name, role: st.role, weekday: 0, sat: 0, sun: 0, ph: 0, shifts: [] };
      }
      grouped[key].ph += phHrs;
      grouped[key].shifts.push({
        id: `ph_${st.id}_${hDate}`,
        date: hDate,
        start: null,
        end: null,
        cat: "ph",
        rosteredHrs: phHrs,
        adjustMins: 0,
        paidHrs: phHrs,
        breakDeducted: false,
        edit: null,
        isPublicHoliday: true,
      });
    }
  }

  // ── Approved leave → paid leave hours ──
  // Annual Leave → annual column; Personal/Carer's → sick column; Unpaid → skip
  const startD = new Date(startISO + "T00:00:00");
  const endD = new Date(endISO + "T00:00:00");
  for (const lr of leaveData || []) {
    if (lr.leave_type === "Unpaid Leave") continue;
    const st = staffById[lr.staff_id];
    if (!st || st.active === false) continue;
    if (st.employment_type === "Casual") continue; // casuals don't accrue paid leave

    const key = `s_${lr.staff_id}`;
    if (!grouped[key]) {
      grouped[key] = { key, staffId: lr.staff_id, name: st.name, role: st.role, weekday: 0, sat: 0, sun: 0, ph: 0, shifts: [] };
    }

    const lrStart = new Date(lr.from_date + "T00:00:00");
    const lrEnd = new Date(lr.to_date + "T00:00:00");
    const cur = new Date(Math.max(lrStart, startD));
    const last = new Date(Math.min(lrEnd, endD));
    while (cur <= last) {
      const dateStr = toISO(cur);
      const hasShift = (shifts || []).some((sh) => sh.staff_id === lr.staff_id && sh.shift_date === dateStr);
      if (!hasShift) {
        let hrs;
        if (!lr.all_day && lr.start_time && lr.end_time && lr.from_date === lr.to_date) {
          hrs = shiftHours(lr.start_time, lr.end_time);
        } else {
          hrs = scheduledHoursForDate(st, dateStr, period.start);
        }
        if (hrs > 0) {
          const col = lr.leave_type === "Annual Leave" ? "annual" : "sick";
          grouped[key][col] = (grouped[key][col] || 0) + hrs;
          grouped[key].shifts.push({
            id: `leave_${lr.id}_${dateStr}`,
            date: dateStr,
            start: null,
            end: null,
            cat: "leave",
            leaveType: lr.leave_type,
            rosteredHrs: hrs,
            adjustMins: 0,
            paidHrs: hrs,
            breakDeducted: false,
            edit: null,
            isLeave: true,
          });
        }
      }
      cur.setDate(cur.getDate() + 1);
    }
  }

  // Compute OT (over threshold), pulled from weekday → sat → sun
  const built = Object.values(grouped).map((g) => {
    const st = g.staffId ? staffById[g.staffId] : null;
    const isSalary = st?.employment_type === "Salary";
    if (isSalary) {
      const salaryHrs = Number(st?.contracted_hours) || 0;
      const sSick = g.sick || 0;
      const sComp = g.compassionate || 0;
      const sAnnual = g.annual || 0;
      const contracted = Math.max(0, salaryHrs - (sSick + sComp + sAnnual));
      return { ...g, weekday: 0, sat: 0, sun: 0, ph: 0, ot: 0, sick: sSick, compassionate: sComp, annual: sAnnual, contracted, total: salaryHrs, isSalary: true };
    }
    const sick = g.sick || 0;
    const annual = g.annual || 0;
    const compassionate = g.compassionate || 0;
    const worked = g.weekday + g.sat + g.sun + g.ph;
    let ot = Math.max(0, worked - FORTNIGHT_THRESHOLD);
    let weekday = g.weekday, sat = g.sat, sun = g.sun;
    let remaining = ot;
    const pull = (val) => { const take = Math.min(val, remaining); remaining -= take; return val - take; };
    weekday = pull(weekday);
    sat = pull(sat);
    sun = pull(sun);
    const total = worked + sick + annual + compassionate;
    return { ...g, weekday, sat, sun, ph: g.ph, ot, total, sick, annual, compassionate, isSalary: false };
  });

  // Ensure all active salary staff appear, even with no shifts this period
  const presentStaffIds = new Set(built.filter((r) => r.staffId).map((r) => r.staffId));
  for (const st of staffData || []) {
    if (st.employment_type === "Salary" && st.active !== false && !presentStaffIds.has(st.id)) {
      built.push({
        key: `s_${st.id}`,
        staffId: st.id,
        name: st.name,
        role: st.role,
        weekday: 0, sat: 0, sun: 0, ph: 0, ot: 0, sick: 0, compassionate: 0, annual: 0,
        contracted: Number(st.contracted_hours) || 0,
        total: Number(st.contracted_hours) || 0,
        shifts: [],
        isSalary: true,
      });
    }
  }

  built.sort((a, b) => a.name.localeCompare(b.name));
  return built;
}