// Kiosk home — "My jobs" / "Team today" / "Everyone" (pages/index.js). One list of job cards built from what the
// kiosk already loads (On the List tasks + month cards, checklists, section cleans, policy reads, inductions,
// consumables follow-ups, QSPP incident / feedback jobs, performance review answers waiting, staff memo sections to write,
// sent staff memos to read). Nothing here reads or writes the database — it only decides who each card belongs to,
// so the photo badges, each person's list and Everyone all use the same rules:
//   personal  — assigned to a person (or several people): in each of their lists
//   role      — assigned to a role: in "For anyone" (Team today) and in the list of everyone with that role
//   anyone    — no one assigned: in "For anyone" only
// offRoster = belongs only to people not rostered today (shown under Everyone, marked "off today").
// Daily routines (non On the List tasks) stay in the Team today grid and aren't jobs here.
import { hasShowFrom, showFromDate, monthShort } from "./taskPeriods";
import { addMonthsStr, addDaysStr, perthDateOf } from "./performanceReview";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// "2026-11-05" -> "5 Nov"
export const dayMonth = (s) => {
  const [, m, d] = String(s || "").slice(0, 10).split("-").map(Number);
  return m && d ? `${d} ${MONTHS[m - 1]}` : "";
};

export const TAG_STYLE = {
  monthly: "bg-orange-50 text-orange-700",
  weekly: "bg-blue-50 text-blue-700",
  job: "bg-amber-50 text-amber-700",
  checklist: "bg-teal-50 text-teal-700",
  clean: "bg-slate-100 text-slate-600",
  policy: "bg-purple-50 text-purple-700",
  induction: "bg-purple-50 text-purple-700",
  qspp: "bg-rose-50 text-rose-700",
  review: "bg-purple-50 text-purple-700",
  memo: "bg-sky-50 text-sky-700",
  order: "bg-amber-50 text-amber-700",
  role: "bg-white text-gray-700 border border-gray-300",
};
export const CARD_BORDER = {
  monthly: "border-l-orange-400", weekly: "border-l-blue-400", job: "border-l-amber-500", checklist: "border-l-teal-500",
  clean: "border-l-green-500", policy: "border-l-purple-500", induction: "border-l-purple-500", order: "border-l-amber-500", qspp: "border-l-rose-500", review: "border-l-purple-500", memo: "border-l-sky-500",
  role: "border-l-gray-500 border-dashed",
};

const isOneOff = (t) => t.show_next_shift || t.frequency === "specific_date";

// Who a task belongs to
const ownersOf = (t) => {
  if (t.assigned_role) return { staffIds: [], role: t.assigned_role, anyone: false };
  if (t.assigned_staff_ids?.length) return { staffIds: t.assigned_staff_ids.map(Number), role: null, anyone: false };
  if (t.assigned_staff_id) return { staffIds: [Number(t.assigned_staff_id)], role: null, anyone: false };
  return { staffIds: [], role: null, anyone: true };
};

export function buildKioskJobs({
  tasks, offRosterTasks, monthCards, completedTaskIds, monthlyCompletions, staffById, rosteredIds, sectionCleans,
  policyJobs, inductionCards, orderFollowUps, ownerStaffId, checklistProgress, todayStr, monthStart, qsppJobs = [],
  reviewWaitingIds = [], memoAskJobs = [], memoReadJobs = [], offPick = null,
}) {
  const jobs = [];
  const nameOf = (id) => staffById[id]?.name || "";
  const firstName = (id) => nameOf(id).split(" ")[0];
  const rostered = (id) => rosteredIds.has(Number(id));
  // Personal cards (policy reads, inductions, review answers, staff memo cards): for staff rostered on today, and for the
  // person picked under "not working today" (offPick). The picked person's cards are pickOnly: in their own list,
  // never under Everyone. Rostered staff are unchanged.
  const personalFor = (id) => rostered(id) || (offPick != null && Number(id) === Number(offPick));
  const personal = (id) => (rostered(id) ? { offRoster: false } : { offRoster: true, pickOnly: true });

  // ── On the List tasks (monthly / weekly / one-off jobs / checklists), incl. month cards ──
  const listTasks = [
    ...tasks.filter((t) => t.task_type === "on_the_list").map((t) => ({ t, off: false })),
    ...offRosterTasks.map((t) => ({ t, off: true })),
  ];
  for (const { t, off } of listTasks) {
    const periods = hasShowFrom(t) ? (monthCards[t.id] || []) : [null];
    for (const period of periods) {
      const own = ownersOf(t);
      const checklist = !!t.checklist_type;
      const weekly = t.frequency === "weekly";
      const done = period ? false : weekly ? completedTaskIds.has(t.id) : Boolean(monthlyCompletions[t.id]) || completedTaskIds.has(t.id);
      const due = t.end_date?.slice(0, 10) || t.specific_date?.slice(0, 10) || null;
      const overdue = !done && ((due && due < todayStr) || !!period?.overdue);
      const kind = checklist ? "checklist" : isOneOff(t) ? "job" : weekly ? "weekly" : "monthly";
      const tag = own.role || (checklist ? "Checklist" : isOneOff(t) ? "Job" : weekly ? "Weekly" : "Monthly");
      const prog = checklist ? checklistProgress[`${t.id}|${period ? period.start : monthStart}`] : null;
      const detail = [
        own.role && (checklist ? "Checklist" : isOneOff(t) ? "Job" : weekly ? "Weekly" : "Monthly"),
        checklist && (t.checklist_type === "ticklist" ? "Tick list" : "Stock count"),
        own.staffIds.length > 1 && own.staffIds.map(firstName).filter(Boolean).join(", "),
        own.role && rosteredIds.size && Object.values(staffById).filter((s) => s.role === own.role && rostered(s.id)).map((s) => s.name.split(" ")[0]).join(" or "),
        period?.carry && `${monthShort(period.ym)} — carried over`,
        t.created_by_staff_id && isOneOff(t) && nameOf(t.created_by_staff_id) && `Added by ${nameOf(t.created_by_staff_id)}`,
      ].filter(Boolean).join(" · ");
      const status = done ? `✓ ${monthlyCompletions[t.id]?.staffName || "Done"}`
        : period?.carry ? `${monthShort(period.ym)}, overdue`
        : overdue ? "Overdue"
        : checklist ? (prog?.of ? `${prog.n} of ${prog.of}` : "Not started")
        : due ? `Due ${dayMonth(due)}`
        : weekly ? "This week" : isOneOff(t) ? "Today" : "This month";
      jobs.push({
        key: period ? `t-${t.id}-${period.start}` : `t-${t.id}`,
        kind: own.role ? "role" : kind, tagKind: own.role ? "role" : kind, tag,
        title: t.title, detail, status, overdue, done,
        progress: prog?.of ? { n: prog.n, of: prog.of } : null,
        ...own, offRoster: off,
        action: { type: period ? "monthCard" : "task", task: t, period },
        info: t.info ? t.id : null,
        nothing: !done && (t.frequency === "monthly_anytime" || t.frequency === "monthly") ? { task: t, period } : null,
        checklist,
      });
    }
  }

  // ── Section cleans: due this month or carried over, not yet done ──
  for (const sc of sectionCleans) {
    if (sc.completed_at || !(sc.isCurrentMonth || sc.isOverdue)) continue;
    const assigned = sc.section?.assigned_staff_id ? Number(sc.section.assigned_staff_id) : null;
    const ym = String(sc.month).slice(0, 7);
    jobs.push({
      key: `sc-${sc.id}`, kind: "clean", tagKind: "clean", tag: "Section clean",
      title: `Section clean: ${sc.section?.name || "Section"}`,
      detail: sc.isOverdue ? `${monthShort(ym)} — carried over` : "Due this month",
      status: sc.isOverdue ? `${monthShort(ym)}, overdue` : "This month",
      overdue: !!sc.isOverdue, done: false,
      staffIds: assigned ? [assigned] : [], role: null, anyone: !assigned,
      offRoster: !!assigned && !rostered(assigned),
      action: { type: "clean", sc },
      info: sc.section?.notes ? `section-${sc.id}` : null,
    });
  }

  // ── Policy reads and inductions (rostered staff + the person picked under "not working today" — read by the person themselves) ──
  for (const r of policyJobs) {
    if (!personalFor(r.staff_id)) continue;
    jobs.push({
      key: `pol-${r.id}`, kind: "policy", tagKind: "policy", tag: "Policy",
      title: `Read: ${r.document.title}`,
      detail: r.requested_at ? `Requested ${dayMonth(perthDateOf(r.requested_at))}` : "",
      status: "To read", overdue: false, done: false,
      staffIds: [Number(r.staff_id)], role: null, anyone: false, ...personal(r.staff_id),
      action: { type: "policy", request: r },
    });
  }
  for (const j of inductionCards) {
    if (!personalFor(j.staffId)) continue;
    const read = j.requests.filter((r) => r.status === "read").length;
    jobs.push({
      key: `ind-${j.id}`, kind: "induction", tagKind: "induction", tag: "Induction",
      title: j.confirm ? "Confirm your induction" : "Induction policies to read",
      detail: j.confirm ? "Tap to check and confirm" : `${read} of ${j.requests.length} policies read`,
      status: j.confirm ? "To confirm" : `${read} of ${j.requests.length}`,
      overdue: false, done: false,
      progress: j.confirm ? null : { n: read, of: j.requests.length },
      staffIds: [Number(j.staffId)], role: null, anyone: false, ...personal(j.staffId),
      action: { type: "induction", id: j.id },
    });
  }

  // ── Performance review: Section 2 answers waiting (the /me To do badge rule — /api/kiosk/reviews-waiting returns
  //    staff ids only). Like policy reads: the person themselves, rostered on today. Answered here after their own
  //    PIN (components/KioskReview.js) or on their phone.
  for (const id of reviewWaitingIds.map(Number)) {
    if (!personalFor(id)) continue;
    jobs.push({
      key: `rev-${id}`, kind: "review", tagKind: "review", tag: "Review",
      title: "Answer your review questions", detail: "", status: "To do", overdue: false, done: false,
      staffIds: [id], role: null, anyone: false, ...personal(id),
      action: { type: "review", staffId: id },
    });
  }

  // ── Staff memo sections asked of someone (/api/memos/contribute "kiosk-jobs": section id + staff id + memo title only).
  //    Like policy reads: the person themselves, rostered on today; gone once they've written something or said
  //    "Nothing this month". Tapping asks for their own PIN, then opens only their own section.
  for (const m of memoAskJobs) {
    const id = Number(m.staff_id);
    if (!personalFor(id)) continue;
    jobs.push({
      key: `memo-${m.section_id}`, kind: "memo", tagKind: "memo", tag: "Memo",
      title: `Add your section to the ${m.memo_title}`, detail: "", status: "To write", overdue: false, done: false,
      staffIds: [id], role: null, anyone: false, ...personal(id),
      action: { type: "memoSection", sectionId: m.section_id, staffId: id },
    });
  }

  // ── Sent staff memos not opened yet (/api/memos/read "kiosk-jobs": memo id + staff id + title only). Built like policy
  //    reads: the person themselves, rostered on today, no PIN (tap their own photo). Opening it full screen and closing
  //    it marks it seen and the card goes. Projected live — no task rows, not in Activity / the leaderboard.
  for (const m of memoReadJobs) {
    const id = Number(m.staff_id);
    if (!personalFor(id)) continue;
    jobs.push({
      key: `memoread-${m.memo_id}-${id}`, kind: "memo", tagKind: "memo", tag: "Memo",
      title: `Read the ${m.memo_title}`, detail: "", status: "To read", overdue: false, done: false,
      staffIds: [id], role: null, anyone: false, ...personal(id),
      action: { type: "memoRead", memoId: m.memo_id, staffId: id },
    });
  }

  // ── QSPP incidents & feedback (lib/qspp.js qsppKioskJobs): numbers only, never patient details. Like policy reads,
  //    shown to the people rostered on today; tapping goes to /qspp (which asks for the PIN where it's manager-only).
  for (const q of qsppJobs) {
    const ids = q.staffIds.map(Number).filter((id) => rostered(id));
    if (!ids.length) continue;
    jobs.push({
      key: q.key, kind: "qspp", tagKind: "qspp", tag: "QSPP",
      title: q.title, detail: "", status: q.status, overdue: false, done: false,
      staffIds: ids, role: null, anyone: false, offRoster: false,
      action: { type: "qspp", url: q.url },
    });
  }

  // ── Consumables follow-ups: "still to order" (the checklist task's assignee) and "for <owner> to order" ──
  const lateLines = (lines) => {
    const cutoff = addDaysStr(todayStr, -2); // red 2 days after the count was completed (as before)
    return lines.some((l) => l.completed_at && String(perthDateOf(l.completed_at)) <= cutoff);
  };
  const suppliers = (lines) => [...new Set(lines.map((l) => l.supplier_name).filter(Boolean))].join(" · ") || "Order";
  if (orderFollowUps.staff.length) {
    const taskIds = [...new Set(orderFollowUps.staff.map((l) => Number(l.task_id)))];
    const owners = taskIds.map((id) => (orderFollowUps.tasks || []).find((t) => Number(t.id) === id)).filter(Boolean).map(ownersOf);
    const staffIds = [...new Set(owners.flatMap((o) => o.staffIds))];
    const role = owners.find((o) => o.role)?.role || null;
    const late = lateLines(orderFollowUps.staff);
    jobs.push({
      key: "order-staff", kind: role ? "role" : "order", tagKind: role ? "role" : "order", tag: role || "Order",
      title: `Consumables — ${orderFollowUps.staff.length} still to order`, detail: suppliers(orderFollowUps.staff),
      status: late ? "Overdue" : "To order", overdue: late, done: false,
      staffIds, role, anyone: !owners.length || owners.some((o) => o.anyone),
      offRoster: !orderFollowUps.staffVisible,
      action: { type: "followUp", which: "staff" },
    });
  }
  if (orderFollowUps.owner.length && ownerStaffId) {
    const late = lateLines(orderFollowUps.owner);
    jobs.push({
      key: "order-owner", kind: "order", tagKind: "order", tag: "Order",
      title: `Consumables — ${orderFollowUps.owner.length} for ${firstName(ownerStaffId) || "owner"} to order`, detail: suppliers(orderFollowUps.owner),
      status: late ? "Overdue" : "To order", overdue: late, done: false,
      staffIds: [Number(ownerStaffId)], role: null, anyone: false, offRoster: !rostered(ownerStaffId),
      action: { type: "followUp", which: "owner" },
    });
  }

  return jobs;
}

// A person's list: their own jobs + jobs for their role. Overdue first, then the rest, then done (greyed, tap to undo).
export const sortJobs = (list) => [...list.filter((j) => !j.done && j.overdue), ...list.filter((j) => !j.done && !j.overdue), ...list.filter((j) => j.done)];
export const isMine = (j, id, role) => j.staffIds.includes(Number(id)) || (!!j.role && !!role && j.role === role);
export const jobsFor = (jobs, id, role) => sortJobs(jobs.filter((j) => isMine(j, id, role)));
export const waitingCount = (list) => list.filter((j) => !j.done).length;

// "For anyone" in Team today: role jobs (someone with the role is on today) and unassigned jobs
export const anyoneJobs = (jobs) => sortJobs(jobs.filter((j) => (j.role || j.anyone) && !j.offRoster));

// Everyone: each rostered person's own jobs, then people off today with jobs, then "For anyone" (role + unassigned,
// incl. role jobs where no one with the role is on). Role jobs sit only under "For anyone" here, so nothing shows
// twice. Total = distinct jobs still waiting.
export function everyoneGroups(jobs, onShiftStaff, staff) {
  const groups = [];
  const onIds = new Set(onShiftStaff.map((s) => Number(s.id)));
  const shown = jobs.filter((j) => !j.pickOnly); // a "not working today" pick's personal cards stay in their own list
  for (const s of onShiftStaff) {
    const list = sortJobs(shown.filter((j) => !j.done && j.staffIds.includes(Number(s.id))));
    if (list.length) groups.push({ key: `p-${s.id}`, person: s, offToday: false, list });
  }
  for (const s of staff) {
    if (onIds.has(Number(s.id))) continue;
    const list = sortJobs(shown.filter((j) => !j.done && j.staffIds.includes(Number(s.id))));
    if (list.length) groups.push({ key: `p-${s.id}`, person: s, offToday: true, list });
  }
  const shared = sortJobs(shown.filter((j) => !j.done && (j.role || j.anyone)));
  if (shared.length) groups.push({ key: "anyone", person: null, offToday: false, list: shared });
  const total = new Set(groups.flatMap((g) => g.list.map((j) => j.key))).size;
  return { groups, total };
}

// Coming up for a person: their (or their role's) On the List tasks due later this month or next month, and their
// section cleans next month. -> [{ key, title, when, sort }]
export function comingUpFor({ id, role, allListTasks, sectionCleans, todayStr, monthStart }) {
  const nextStart = addMonthsStr(monthStart, 1);
  const curYm = monthStart.slice(0, 7);
  const nextYm = nextStart.slice(0, 7);
  const afterNext = addMonthsStr(monthStart, 2);
  const out = [];
  for (const t of allListTasks) {
    const own = ownersOf(t);
    if (!(own.staffIds.includes(Number(id)) || (own.role && own.role === role))) continue;
    if (t.frequency === "specific_date" && !t.show_next_shift) {
      const d = t.specific_date?.slice(0, 10);
      if (d && d > todayStr && d < afterNext) out.push({ key: `c-${t.id}`, title: t.title, when: dayMonth(d), sort: d });
      continue;
    }
    if (t.frequency !== "monthly_anytime" && t.frequency !== "monthly") continue;
    if (hasShowFrom(t)) {
      const cur = showFromDate(t, curYm);
      if (cur > todayStr) out.push({ key: `c-${t.id}-cur`, title: t.title, when: `from ${dayMonth(cur)}`, sort: cur });
      const next = showFromDate(t, nextYm);
      out.push({ key: `c-${t.id}-next`, title: `${t.title} (${monthShort(nextYm)})`, when: `from ${dayMonth(next)}`, sort: next });
    } else {
      out.push({ key: `c-${t.id}-next`, title: `${t.title} (${monthShort(nextYm)})`, when: dayMonth(nextStart), sort: nextStart });
    }
  }
  for (const sc of sectionCleans) {
    if (String(sc.month).slice(0, 10) !== nextStart || Number(sc.section?.assigned_staff_id) !== Number(id)) continue;
    out.push({ key: `c-sc-${sc.id}`, title: `Section clean: ${sc.section?.name} (${monthShort(nextYm)})`, when: dayMonth(nextStart), sort: nextStart });
  }
  return out.sort((a, b) => a.sort.localeCompare(b.sort) || a.title.localeCompare(b.title));
}
