// Kiosk calendar "What's on" — things that happen (no completion). Shared by components/WhatsOn.js,
// components/CalendarEventSheet.js and Admin → Settings (categories). Browser client (RLS off, like the rest).
// Tables: calendar_categories (key 'closure' = manager-only, public holidays show under it; key 'staff' =
// birthdays / anniversaries), calendar_events (one day or a date range, optional time, repeats yearly).
// Read live, never stored: public holidays (public_holidays), birthdays (staff.date_of_birth, unless
// staff.hide_birthday — day only, never the age) and work anniversaries (staff.start_date, whole years ≥ 1).
// Active staff only, locums left out. Approved leave and roster notes are NOT shown.
// Each category's "Shade the day" switch (calendar_categories.shade_ranges) decides tint vs dot for all its items —
// see dayMarks below.
//
// Jobs from an event are normal one-off assigned jobs (tasks: on_the_list, frequency 'specific_date') with
// event_id + event_job_key (same job across a yearly event's occurrences) + event_occurrence (that occurrence's
// start) + event_due_rule / event_due_days. Their due date (specific_date) is worked out here and moved off public
// holidays. Event moved → not-done jobs move with it; event deleted → not-done jobs removed; done jobs never change.
// Yearly events: each year's jobs are created once that occurrence is within 2 months (ensureYearlyJobs).
// Dates are Perth calendar dates as "YYYY-MM-DD" strings — stepped as strings, never via toISOString.
import { addDaysStr, addMonthsStr } from "./performanceReview";

const pad = (n) => String(n).padStart(2, "0");
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WD_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MON_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const parts = (s) => String(s).slice(0, 10).split("-").map(Number);
const weekday = (s) => { const [y, m, d] = parts(s); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
export const daysBetween = (a, b) => { const [y1, m1, d1] = parts(a); const [y2, m2, d2] = parts(b); return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000); };
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

// "Thu 5 Nov" / "Thursday 5 November" / "November 2026"
export const shortDate = (s) => { const [, m, d] = parts(s); return `${WD[weekday(s)]} ${d} ${MON[m - 1]}`; };
export const longDate = (s) => { const [, m, d] = parts(s); return `${WD_LONG[weekday(s)]} ${d} ${MON_LONG[m - 1]}`; };
export const monthLabel = (ym) => { const [y, m] = parts(`${ym}-01`); return `${MON_LONG[m - 1]} ${y}`; };
// "18:30:00" -> "6:30pm"
export const fmtTime = (t) => {
  if (!t) return "";
  const [h, mi] = String(t).split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return mi ? `${h12}:${pad(mi)}${suffix}` : `${h12}${suffix}`;
};

// Monday-first 6-week grid for a month ("YYYY-MM") -> 42 date strings
export function monthGrid(ym) {
  const first = `${ym}-01`;
  const back = (weekday(first) + 6) % 7; // days since Monday
  const start = addDaysStr(first, -back);
  return Array.from({ length: 42 }, (_, i) => addDaysStr(start, i));
}

// A month/day in a given year (29 Feb -> 28 Feb in other years)
const inYear = (s, y) => { const [, m, d] = parts(s); return `${y}-${pad(m)}-${pad(m === 2 && d === 29 && !isLeap(y) ? 28 : d)}`; };

// The occurrence of an event in a year: { start, end } (end = start for one-day events)
export const occurrenceIn = (ev, year) => {
  const len = ev.end_date ? daysBetween(ev.start_date, ev.end_date) : 0;
  const start = ev.repeats_yearly ? inYear(ev.start_date, year) : ev.start_date;
  return { start, end: addDaysStr(start, len) };
};
// Occurrences of an event that overlap [from, to] (yearly events: one per year, never before the first year)
export function occurrencesBetween(ev, from, to) {
  if (!ev.repeats_yearly) {
    const end = ev.end_date || ev.start_date;
    return end >= from && ev.start_date <= to ? [{ start: ev.start_date, end }] : [];
  }
  const out = [];
  const firstYear = parts(ev.start_date)[0];
  for (let y = Math.max(firstYear, parts(from)[0] - 1); y <= parts(to)[0]; y++) {
    const o = occurrenceIn(ev, y);
    if (o.end >= from && o.start <= to) out.push(o);
  }
  return out;
}
// The occurrence a yearly event's jobs are for right now: the first one that hasn't ended yet
export const currentOccurrence = (ev, today) => {
  if (!ev.repeats_yearly) return occurrenceIn(ev, parts(ev.start_date)[0]);
  const firstYear = parts(ev.start_date)[0];
  for (let y = Math.max(firstYear, parts(today)[0] - 1); ; y++) {
    const o = occurrenceIn(ev, y);
    if (o.end >= today) return o;
  }
};

// ── Loading ──
export async function loadCategories(supabase, pharmacyId) {
  const { data, error } = await supabase.from("calendar_categories").select("*").eq("pharmacy_id", pharmacyId).order("sort_order");
  if (error) throw error;
  return data || [];
}
export async function loadHolidays(supabase, pharmacyId) {
  const { data, error } = await supabase.from("public_holidays").select("id, date, name").eq("pharmacy_id", pharmacyId).order("date");
  if (error) throw error;
  return data || [];
}

// Events overlapping [from, to], plus every yearly event (few rows) and the next items for "Next up"
export async function loadEvents(supabase, pharmacyId, from, to, today) {
  const [ranged, yearly, upcoming] = await Promise.all([
    supabase.from("calendar_events").select("*").eq("pharmacy_id", pharmacyId).eq("repeats_yearly", false)
      .lte("start_date", to).or(`end_date.gte.${from},and(end_date.is.null,start_date.gte.${from})`),
    supabase.from("calendar_events").select("*").eq("pharmacy_id", pharmacyId).eq("repeats_yearly", true),
    supabase.from("calendar_events").select("*").eq("pharmacy_id", pharmacyId).eq("repeats_yearly", false)
      .gte("start_date", today).order("start_date").limit(5),
  ]);
  const err = ranged.error || yearly.error || upcoming.error;
  if (err) throw err;
  const byId = new Map();
  for (const e of [...(ranged.data || []), ...(yearly.data || []), ...(upcoming.data || [])]) byId.set(e.id, e);
  return [...byId.values()];
}

// Jobs linked to these events (title, who, due, done)
export async function loadEventJobs(supabase, eventIds) {
  if (!eventIds.length) return [];
  const { data, error } = await supabase.from("tasks")
    .select("id, title, event_id, event_job_key, event_occurrence, event_due_rule, event_due_days, specific_date, assigned_staff_id, assigned_role, assigned_staff_ids, completed_at, completed_by_staff_id, points, active")
    .in("event_id", eventIds).order("specific_date");
  if (error) throw error;
  return data || [];
}

// ── Day shading (one switch per category: calendar_categories.shade_ranges — Admin "Shade the day"; missing = on) ──
// Applies to every item in the category, one day or a range; automatic items follow their category (public holidays →
// Closure, birthdays / anniversaries → Staff). Items with no (or an inactive) category are never shaded.
//   ON:  every day of the item is tinted (a one-day item is rounded both sides).
//   OFF: a dot on the day (one-day item) or on the first day only (range) — plus the "[Category] now" line while a
//        range runs.
// One tint per day: the shaded item whose category is highest in Admin order (sort_order), then the earlier start.
// Every other item on the day in a DIFFERENT category shows as a dot (even if its category shades), so nothing is
// hidden; items in the tinted item's category add no dot. One dot per colour, at most 4.
export const shadesDay = (item) => !!item.category && item.category.shade_ranges !== false;

// A day cell's marks -> { shade: item | null, dots: [colour] }
export function dayMarks(items, d, colourOf) {
  const shaded = items.filter(shadesDay).sort((a, b) =>
    Number(a.category.sort_order ?? 0) - Number(b.category.sort_order ?? 0) || a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
  const shade = shaded[0] || null;
  const tintCat = shade ? shade.category.id : null;
  const dotted = items.filter((i) => {
    if (i === shade) return false;
    if (tintCat && i.category?.id === tintCat) return false; // same category as the tint: no extra dot
    if (shadesDay(i)) return true;                          // lost the tint to a higher category: a dot
    return !i.range || i.start === d;                       // unshaded: the day itself, or a range's first day
  });
  const dots = [...new Map(dotted.map((i) => [colourOf(i), i])).keys()].slice(0, 4);
  return { shade, dots };
}

// "On now": ranges in a category with shading off, running on a date (today) — "[Category] now: [title] · ends [date]"
export const onNowItems = (items, date) => items.filter((i) => i.range && !!i.category && i.category.shade_ranges === false && i.start <= date && i.end >= date);

// ── Items for a range (events + automatic) ──
// -> [{ key, kind: 'event'|'holiday'|'birthday'|'anniversary', title, start, end, time, note, category, event, auto }]
export function itemsBetween({ events, categories, holidays, staff, from, to, pharmacyName }) {
  const catById = Object.fromEntries(categories.map((c) => [c.id, c]));
  const catByKey = Object.fromEntries(categories.filter((c) => c.key).map((c) => [c.key, c]));
  const items = [];
  for (const ev of events) {
    for (const o of occurrencesBetween(ev, from, to)) {
      items.push({
        key: `ev-${ev.id}-${o.start}`, kind: "event", title: ev.title, start: o.start, end: o.end,
        range: !!ev.end_date && ev.end_date !== ev.start_date, time: ev.start_time, note: ev.note,
        category: catById[ev.category_id]?.active === false ? null : catById[ev.category_id] || null, event: ev, auto: false,
      });
    }
  }
  for (const h of holidays) {
    if (h.date >= from && h.date <= to) {
      items.push({ key: `ph-${h.id}`, kind: "holiday", title: h.name, start: h.date, end: h.date, category: catByKey.closure || null, auto: "Public holiday" });
    }
  }
  const people = staff.filter((s) => s.active !== false && s.role !== "Locum");
  const fromY = parts(from)[0];
  const toY = parts(to)[0];
  for (const s of people) {
    const first = String(s.name || "").split(" ")[0];
    for (let y = fromY; y <= toY; y++) {
      if (s.date_of_birth && !s.hide_birthday) {
        const d = inYear(s.date_of_birth, y);
        if (d >= from && d <= to) items.push({ key: `bd-${s.id}-${y}`, kind: "birthday", title: `${first}'s birthday`, start: d, end: d, category: catByKey.staff || null, auto: "From staff records" });
      }
      if (s.start_date) {
        const years = y - parts(s.start_date)[0];
        const d = inYear(s.start_date, y);
        if (years >= 1 && d >= from && d <= to) {
          items.push({ key: `an-${s.id}-${y}`, kind: "anniversary", title: `${first} — ${years} year${years === 1 ? "" : "s"} at ${pharmacyName || "the pharmacy"}`, start: d, end: d, category: catByKey.staff || null, auto: "Work anniversary · from staff records" });
        }
      }
    }
  }
  return items.sort((a, b) => a.start.localeCompare(b.start) || String(a.time || "").localeCompare(String(b.time || "")) || a.title.localeCompare(b.title));
}

// ── Jobs from events ──
export const DUE_RULES = [
  { key: "before_start", label: "days before start" },
  { key: "on_start", label: "On the start day" },
  { key: "on_end", label: "On the end day" },
  { key: "after_end", label: "Day after end" },
];
export const dueRuleLabel = (rule, days) => (rule === "before_start"
  ? `${Number(days) || 0} day${Number(days) === 1 ? "" : "s"} before start` : DUE_RULES.find((r) => r.key === rule)?.label || "");

// Due date for an occurrence, moved forward off public holidays
export function dueDateFor(rule, days, occ, holidaySet) {
  let d = rule === "before_start" ? addDaysStr(occ.start, -(Number(days) || 0))
    : rule === "on_end" ? occ.end
    : rule === "after_end" ? addDaysStr(occ.end, 1)
    : occ.start;
  while (holidaySet.has(d)) d = addDaysStr(d, 1);
  return d;
}

const assignFields = (j) => ({
  assigned_staff_id: j.assign_type === "person" && j.assigned_staff_id ? Number(j.assigned_staff_id) : null,
  assigned_role: j.assign_type === "role" ? j.assigned_role || null : null,
  assigned_staff_ids: j.assign_type === "multiple" ? (j.assigned_staff_ids || []).map(Number) : [],
});
export const assignTypeOf = (t) => (t.assigned_role ? "role" : t.assigned_staff_ids?.length ? "multiple" : t.assigned_staff_id ? "person" : "anyone");

// Job definitions for the sheet, from an event's linked task rows (one per event_job_key, newest occurrence wins)
export function jobDefsFrom(rows) {
  const byKey = new Map();
  for (const r of [...rows].filter((x) => x.event_job_key).sort((a, b) => String(a.event_occurrence).localeCompare(String(b.event_occurrence)))) {
    byKey.set(r.event_job_key, {
      key: r.event_job_key, title: r.title, assign_type: assignTypeOf(r),
      assigned_staff_id: r.assigned_staff_id ? String(r.assigned_staff_id) : "", assigned_role: r.assigned_role || "",
      assigned_staff_ids: r.assigned_staff_ids || [], rule: r.event_due_rule || "on_start", days: r.event_due_days ?? 1,
      points: r.points ?? 1,
    });
  }
  return [...byKey.values()];
}

// After an event is saved: create / update / remove its linked jobs.
//   defs     the job list from the sheet (null = the jobs weren't unlocked — only move not-done jobs to the new dates)
//   existing the event's linked task rows before the save
// Not-done rows follow the event (their occurrence recalculated for its year); done rows are never touched.
export async function syncEventJobs(supabase, { pharmacyId, event, defs, existing, holidays, managerStaffId, today }) {
  const holidaySet = new Set(holidays.map((h) => h.date));
  const notDone = existing.filter((r) => !r.completed_at);
  const occFor = (r) => occurrenceIn(event, r.event_occurrence ? parts(r.event_occurrence)[0] : parts(event.start_date)[0]);

  if (defs) {
    const keep = new Set(defs.filter((d) => d.key).map((d) => d.key));
    const drop = notDone.filter((r) => !keep.has(r.event_job_key)).map((r) => r.id);
    if (drop.length) {
      const { error } = await supabase.from("tasks").delete().in("id", drop);
      if (error) throw error;
    }
    // A removed job's done rows keep their history but lose the job key, so a yearly event doesn't recreate it
    const unlink = existing.filter((r) => r.completed_at && r.event_job_key && !keep.has(r.event_job_key)).map((r) => r.id);
    if (unlink.length) {
      const { error } = await supabase.from("tasks").update({ event_job_key: null }).in("id", unlink);
      if (error) throw error;
    }
  }
  // Existing not-done rows: new dates (and the job's new details, if edited)
  for (const r of notDone) {
    const def = defs ? defs.find((d) => d.key && d.key === r.event_job_key) : null;
    if (defs && !def) continue; // removed above
    const rule = def ? def.rule : r.event_due_rule;
    const days = def ? Number(def.days) || 0 : r.event_due_days;
    const occ = occFor(r);
    const patch = {
      event_occurrence: occ.start, specific_date: dueDateFor(rule, days, occ, holidaySet), event_due_rule: rule, event_due_days: rule === "before_start" ? days : null,
      ...(def ? { title: def.title.trim(), points: Number(def.points) || 1, ...assignFields(def) } : {}),
    };
    const { error } = await supabase.from("tasks").update(patch).eq("id", r.id);
    if (error) throw error;
  }
  // New jobs: one row for the event's current occurrence
  if (defs) {
    const occ = currentOccurrence(event, today);
    const rows = defs.filter((d) => !d.key).map((d) => ({
      pharmacy_id: pharmacyId, title: d.title.trim(), task_type: "on_the_list", frequency: "specific_date",
      specific_date: dueDateFor(d.rule, d.days, occ, holidaySet), days_of_week: [], points: Number(d.points) || 1, active: true,
      rollover: false, show_next_shift: false, created_by_staff_id: managerStaffId ? Number(managerStaffId) : null, ...assignFields(d),
      event_id: event.id, event_job_key: crypto.randomUUID(), event_occurrence: occ.start, event_due_rule: d.rule,
      event_due_days: d.rule === "before_start" ? Number(d.days) || 0 : null,
    }));
    if (rows.length) {
      const { error } = await supabase.from("tasks").insert(rows);
      if (error) throw error;
    }
  }
}

// Delete an event: its not-done linked jobs go; done ones stay (their event link is cleared by the database)
export async function deleteEvent(supabase, event) {
  const { error: tErr } = await supabase.from("tasks").delete().eq("event_id", event.id).is("completed_at", null);
  if (tErr) throw tErr;
  const { error } = await supabase.from("calendar_events").delete().eq("id", event.id);
  if (error) throw error;
}

// Yearly events: create each job for the next occurrence once it's within 2 months (copied from the newest row of
// the same job). Runs when the kiosk loads; cheap — only yearly events with linked jobs. -> number of jobs created
export async function ensureYearlyJobs(supabase, { pharmacyId, today, holidays }) {
  const { data: yearly, error } = await supabase.from("calendar_events").select("*").eq("pharmacy_id", pharmacyId).eq("repeats_yearly", true);
  if (error || !yearly?.length) return 0;
  const rows = await loadEventJobs(supabase, yearly.map((e) => e.id));
  if (!rows.length) return 0;
  const holidaySet = new Set(holidays.map((h) => h.date));
  const horizon = addMonthsStr(today, 2);
  const inserts = [];
  for (const ev of yearly) {
    const occ = currentOccurrence(ev, today);
    if (occ.start > horizon) continue;
    const mine = rows.filter((r) => r.event_id === ev.id && r.event_job_key);
    for (const key of [...new Set(mine.map((r) => r.event_job_key))]) {
      const ofKey = mine.filter((r) => r.event_job_key === key);
      if (ofKey.some((r) => String(r.event_occurrence).slice(0, 10) === occ.start)) continue;
      const src = ofKey.sort((a, b) => String(b.event_occurrence).localeCompare(String(a.event_occurrence)))[0];
      inserts.push({
        pharmacy_id: pharmacyId, title: src.title, task_type: "on_the_list", frequency: "specific_date",
        specific_date: dueDateFor(src.event_due_rule, src.event_due_days, occ, holidaySet), days_of_week: [], points: src.points ?? 1,
        active: true, rollover: false, show_next_shift: false, assigned_staff_id: src.assigned_staff_id, assigned_role: src.assigned_role,
        assigned_staff_ids: src.assigned_staff_ids || [], event_id: ev.id, event_job_key: key, event_occurrence: occ.start,
        event_due_rule: src.event_due_rule, event_due_days: src.event_due_days,
      });
    }
  }
  // One at a time: if another kiosk made the same job at the same moment, the unique index
  // (tasks_event_job_occurrence_unique) refuses ours — 23505 — and it's skipped quietly
  let made = 0;
  for (const row of inserts) {
    const { error: iErr } = await supabase.from("tasks").insert([row]);
    if (!iErr) made += 1;
    else if (iErr.code !== "23505") console.error("[calendar yearly jobs]", iErr);
  }
  return made;
}
