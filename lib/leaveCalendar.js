import React from "react";

const PHARMACIST_ROLES = ["Pharmacist", "Intern Pharmacist"];

export const roleGroupOf = (role) =>
  PHARMACIST_ROLES.includes(role) ? "pharmacist" : (role || "other");

// Step a "YYYY-MM-DD" string forward one day without touching UTC (avoids UTC+8 off-by-one)
export const nextDayStr = (dateStr) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};

// Manager blackout covering this date (or null)
export const blackoutOn = (blackouts, dateStr) =>
  (blackouts || []).find((b) => dateStr >= b.from_date && dateStr <= b.to_date) || null;

// Everyone else's leave covering this date (excludes the given staff member)
export const leaveOn = (allLeave, selfId, dateStr) =>
  (allLeave || []).filter(
    (lr) => lr.staff_id !== selfId && dateStr >= lr.from_date && dateStr <= lr.to_date
  );

// Classify a date: "blackout" | "clash" (same role) | "leave" (other role) | null
export const dayState = ({ dateStr, blackouts, allLeave, selfId, selfRole }) => {
  if (blackoutOn(blackouts, dateStr)) return "blackout";
  const others = leaveOn(allLeave, selfId, dateStr);
  if (others.length === 0) return null;
  const myGroup = roleGroupOf(selfRole);
  const sameRole = others.some((lr) => roleGroupOf(lr.staff?.role) === myGroup);
  return sameRole ? "clash" : "leave";
};

const fmtLong = (d) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

/**
 * Shared leave calendar.
 * Props:
 *   monthOffset, setMonthOffset
 *   leaveFrom, leaveTo, setLeaveFrom, setLeaveTo
 *   allLeave, blackouts, selfId, selfRole
 */
export function LeaveCalendar({
  monthOffset, setMonthOffset,
  leaveFrom, leaveTo, setLeaveFrom, setLeaveTo,
  allLeave, blackouts, selfId, selfRole,
}) {
  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + monthOffset);
  const year = base.getFullYear();
  const month = base.getMonth();
  const monthLabel = base.toLocaleDateString("en-AU", { month: "long", year: "numeric" });

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = (new Date(year, month, 1).getDay() + 6) % 7; // Mon-first
  const todayStr = new Date().toISOString().slice(0, 10);

  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const stateOf = (dateStr) => dayState({ dateStr, blackouts, allLeave, selfId, selfRole });

  const handleDayTap = (dateStr) => {
    const state = stateOf(dateStr);
    if (state === "blackout") {
      const b = blackoutOn(blackouts, dateStr);
      alert(`Leave can't be requested for this date.${b?.reason ? `\n\n${b.reason}` : ""}`);
      return;
    }
    if (state === "clash") {
      const who = [...new Set(leaveOn(allLeave, selfId, dateStr).map((lr) => lr.staff?.name).filter(Boolean))].join(", ");
      alert(`Someone in your role (${who}) has already requested leave on this date, so it can't be selected.`);
      return;
    }
    if (!leaveFrom || leaveTo) {
      setLeaveFrom(dateStr);
      setLeaveTo("");
    } else if (dateStr < leaveFrom) {
      setLeaveFrom(dateStr);
    } else if (dateStr === leaveFrom) {
      setLeaveTo(dateStr);
    } else {
      let cs = leaveFrom;
      while (cs <= dateStr) {
        const st = stateOf(cs);
        if (st === "blackout" || st === "clash") {
          alert("Your selected range includes a blocked date. Pick a range that doesn't cross blocked days.");
          return;
        }
        cs = nextDayStr(cs);
      }
      setLeaveTo(dateStr);
    }
  };

  const inSelected = (dateStr) => {
    if (!leaveFrom) return false;
    if (!leaveTo) return dateStr === leaveFrom;
    return dateStr >= leaveFrom && dateStr <= leaveTo;
  };

  // Month summary — who else has requested leave this month
  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  const byStaff = {};
  (allLeave || []).forEach((lr) => {
    if (lr.staff_id === selfId) return;
    if (lr.to_date < `${monthPrefix}-01` || lr.from_date > `${monthPrefix}-31`) return;
    const name = lr.staff?.name;
    if (!name) return;
    if (!byStaff[name]) byStaff[name] = [];
    byStaff[name].push(lr);
  });
  const summaryNames = Object.keys(byStaff).sort();
  const fmtShort = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" });

  return (
    <div className="border rounded-lg p-2">
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={() => setMonthOffset((m) => m - 1)} className="px-3 py-2 text-sm border rounded-lg hover:bg-gray-50">←</button>
        <span className="text-sm font-medium text-gray-700">{monthLabel}</span>
        <button type="button" onClick={() => setMonthOffset((m) => m + 1)} className="px-3 py-2 text-sm border rounded-lg hover:bg-gray-50">→</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div key={i} className="text-[10px] font-semibold text-gray-400 py-1">{d}</div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isPast = dateStr < todayStr;
          const state = stateOf(dateStr);
          const selected = inSelected(dateStr);
          const blocked = state === "blackout" || state === "clash";

          let cls = "bg-white text-gray-700 active:bg-gray-100";
          if (isPast) cls = "bg-white text-gray-300 cursor-not-allowed";
          else if (selected) cls = "bg-blue-600 text-white font-semibold";
          else if (state === "blackout") cls = "bg-gray-300 text-gray-500 cursor-not-allowed line-through";
          else if (state === "clash") cls = "bg-red-200 text-red-700 cursor-not-allowed";
          else if (state === "leave") cls = "bg-amber-200 text-amber-800 active:bg-amber-300";

          return (
            <button
              key={i}
              type="button"
              disabled={isPast || blocked}
              onClick={() => handleDayTap(dateStr)}
              style={{ touchAction: "manipulation" }}
              className={`aspect-square rounded-lg text-sm flex items-center justify-center ${cls}`}
            >
              {day}
            </button>
          );
        })}
      </div>

      {summaryNames.length > 0 && (
        <div className="mt-2 pt-2 border-t text-[11px] text-gray-600">
          <div className="font-medium text-gray-500 mb-1">Leave requested this month:</div>
          <div className="space-y-0.5">
            {summaryNames.map((name) => (
              <div key={name}>
                <span className="font-medium text-gray-700">{name}</span>{" "}
                {byStaff[name]
                  .sort((a, b) => a.from_date.localeCompare(b.from_date))
                  .map((lr) => (lr.from_date === lr.to_date ? fmtShort(lr.from_date) : `${fmtShort(lr.from_date)}–${fmtShort(lr.to_date)}`))
                  .join(", ")}
              </div>
            ))}
          </div>
        </div>
      )}

      {leaveFrom && (
        <div className="mt-2 text-xs text-gray-700">
          {leaveFrom === leaveTo || !leaveTo
            ? <>Selected: <span className="font-medium">{fmtLong(leaveFrom)}</span></>
            : <>Selected: <span className="font-medium">{fmtLong(leaveFrom)} → {fmtLong(leaveTo)}</span></>}
          <button type="button" onClick={() => { setLeaveFrom(""); setLeaveTo(""); }} className="ml-2 text-blue-600 hover:underline">Clear</button>
        </div>
      )}
    </div>
  );
}