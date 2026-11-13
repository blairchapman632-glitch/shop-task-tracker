// Kiosk "What's on" — the pharmacy calendar (above the Wall). Things that happen, not things to do: no completion.
// Month grid (Monday first, ‹ ›, today = solid blue circle). Each category's "Shade the day" switch (Admin):
//   on  — every day of its items is tinted very pale in the category colour (one-day items rounded both sides; ranges
//         rounded at their start / end and at week edges);
//   off — a dot on the day, or on a range's first day only, plus an "[Category] now: [title] · ends [date]" line under
//         the legend while a range runs (always today).
// One tint per day (the category highest in Admin order); other categories on that day show as dots. Rules in
// lib/calendar.js dayMarks. Legend, "Next up" (next 2), tap a day to expand its items inline (tap again to close).
// Events: any staff member adds (their photo selected), edits / deletes their own; a manager (admin PIN) edits any,
// uses manager-only categories (Closure) and attaches jobs. Public holidays, birthdays and anniversaries are read
// live and are read-only. The tapped day is a compact list (3 rows, "+N more") that closes itself after 30 seconds
// without a tap, so the Wall comes back. Jobs from an event show in its Edit sheet and Tasks → Assigned jobs.
// Loads only the shown month (plus Next up). Logic in lib/calendar.js.
import { useEffect, useMemo, useState } from "react";
import supabase from "../lib/supabaseClient";
import ManagerPinModal from "./qspp/ManagerPinModal";
import CalendarEventSheet from "./CalendarEventSheet";
import { todayPerth, addMonthsStr } from "../lib/performanceReview";
import {
  monthGrid, monthLabel, shortDate, longDate, fmtTime, daysBetween, itemsBetween, loadCategories, loadHolidays,
  loadEvents, loadEventJobs, ensureYearlyJobs, dayMarks, onNowItems,
} from "../lib/calendar";
import { CARD, CARD_HEAD, CARD_TITLE } from "../lib/kioskStyle";
import { memoCall } from "../lib/memosClient";

const WK = ["M", "T", "W", "T", "F", "S", "S"];
const GREY = "#94a3b8";
const colourOf = (item) => item.category?.colour || GREY;
// Range shading: a very pale tint (~6%) of the event's legend colour (Promotion = pale orange, like its dot)
const tintOf = (item) => `${colourOf(item)}0F`;

// Events added by a sent staff memo (calendar_events.memo_id) show "From the [memo title]" — tapping opens the memo
// (onOpenMemo, the kiosk's full-screen reader).
export default function WhatsOn({ pharmacyId, staff, staffById, selectedStaffId, onJobsChanged, onOpenMemo }) {
  const today = todayPerth();
  const [ym, setYm] = useState(today.slice(0, 7));
  const [selDay, setSelDay] = useState(null);     // the tapped day (closed on load)
  const [dayMore, setDayMore] = useState(false);  // "+N more" opened
  const [tapAt, setTapAt] = useState(0);          // last tap on the card — the day panel closes 30s after it
  const [categories, setCategories] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [events, setEvents] = useState([]);
  const [todayEvents, setTodayEvents] = useState([]); // events running today (the "on now" line, whatever month is shown)
  const [jobs, setJobs] = useState([]);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState("");
  const [pharmacyName, setPharmacyName] = useState(""); // for "3 years at Byford Pharmacy" (pharmacy_settings.name)
  const [sheet, setSheet] = useState(null);       // { event, date } — the Add / edit sheet open
  const [manager, setManager] = useState(null);   // admin PIN unlocked for this sheet { id, name }
  const [pinFor, setPinFor] = useState(null);     // event waiting for the manager PIN before editing

  // Titles of the memos the shown events came from (sent memos only)
  const [memoTitles, setMemoTitles] = useState({});
  useEffect(() => {
    const ids = [...new Set(events.map((e) => e.memo_id).filter(Boolean))].filter((id) => !(id in memoTitles));
    if (!ids.length) return;
    memoCall({ action: "titles", ids }).then((r) => setMemoTitles((t) => ({ ...t, ...(r.titles || {}) }))).catch(() => {});
  }, [events]); // eslint-disable-line react-hooks/exhaustive-deps

  const grid = useMemo(() => monthGrid(ym), [ym]);
  const from = grid[0];
  const to = grid[41];

  // Categories + public holidays once; yearly events' jobs for the next occurrence (within 2 months)
  useEffect(() => {
    if (!pharmacyId) return;
    let cancelled = false;
    supabase.from("pharmacy_settings").select("name").eq("pharmacy_id", pharmacyId).maybeSingle()
      .then(({ data }) => { if (!cancelled) setPharmacyName(data?.name || ""); });
    Promise.all([loadCategories(supabase, pharmacyId), loadHolidays(supabase, pharmacyId)])
      .then(async ([c, h]) => {
        if (cancelled) return;
        setCategories(c);
        setHolidays(h);
        const made = await ensureYearlyJobs(supabase, { pharmacyId, today, holidays: h });
        if (made && !cancelled) onJobsChanged?.();
      })
      .catch((err) => setError(err?.message || String(err)));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pharmacyId]);

  // The shown month's events (+ yearly ones and the next few for Next up) and their jobs
  useEffect(() => {
    if (!pharmacyId) return;
    let cancelled = false;
    (async () => {
      try {
        const evs = await loadEvents(supabase, pharmacyId, from, to, today);
        const js = await loadEventJobs(supabase, evs.map((e) => e.id));
        if (cancelled) return;
        setEvents(evs);
        setJobs(js);
        setError("");
      } catch (err) {
        if (!cancelled) setError(err?.message || String(err));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pharmacyId, from, to, reload]);

  // Today's events for the "on now" line (independent of the month on screen)
  useEffect(() => {
    if (!pharmacyId) return;
    let cancelled = false;
    loadEvents(supabase, pharmacyId, today, today, today)
      .then((evs) => { if (!cancelled) setTodayEvents(evs); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [pharmacyId, today, reload]);

  const staffList = staff || [];
  const monthItems = useMemo(() => itemsBetween({ events, categories, holidays, staff: staffList, from, to, pharmacyName }),
    [events, categories, holidays, staffList, from, to, pharmacyName]);
  const nextUp = useMemo(() => itemsBetween({ events, categories, holidays, staff: staffList, from: today, to: addMonthsStr(today, 12), pharmacyName })
    .filter((i) => i.start >= today).slice(0, 2), [events, categories, holidays, staffList, today, pharmacyName]);
  const onDay = (d) => monthItems.filter((i) => i.start <= d && i.end >= d);
  const onNow = useMemo(() => onNowItems(itemsBetween({ events: todayEvents, categories, holidays: [], staff: [], from: today, to: today, pharmacyName }), today),
    [todayEvents, categories, today, pharmacyName]);

  // The day panel closes itself after 30 seconds without a tap on the card (not while the sheet / PIN is open)
  useEffect(() => {
    if (!selDay || sheet || pinFor) return;
    const t = setTimeout(() => { setSelDay(null); setDayMore(false); }, 30000);
    return () => clearTimeout(t);
  }, [selDay, tapAt, sheet, pinFor]);

  const nameOf = (id) => staffById[id]?.name || "";
  const first = (id) => nameOf(id).split(" ")[0];
  const adder = selectedStaffId ? staffById[selectedStaffId] : null;

  const openAdd = (date) => {
    if (!adder) { alert("Tap your photo first, then add to the calendar."); return; }
    setManager(null);
    setSheet({ event: null, date });
  };
  const openEdit = (ev) => {
    if (!adder) { alert("Tap your photo first, then edit."); return; }
    const cat = categories.find((c) => c.id === ev.category_id);
    const own = Number(ev.created_by_staff_id) === Number(selectedStaffId);
    setManager(null);
    if (!own || cat?.manager_only) { setPinFor(ev); return; } // someone else's event, or a Closure: manager only
    setSheet({ event: ev, date: ev.start_date });
  };
  const closeSheet = () => { setSheet(null); setManager(null); };
  const onSaved = () => {
    closeSheet();
    setReload((n) => n + 1);
    onJobsChanged?.();
  };

  const legend = categories.filter((c) => c.active !== false);
  const [y, m] = ym.split("-").map(Number);

  return (
    <div className={`${CARD} shrink-0`} onPointerDown={() => setTapAt(Date.now())}>
      {/* Card header: title, then ‹ month › */}
      <div className={CARD_HEAD}>
        <h2 className={CARD_TITLE}>What's on</h2>
        <div className="flex items-center gap-0.5">
          <button aria-label="Previous month" onClick={() => { setYm(addMonthsStr(`${ym}-01`, -1).slice(0, 7)); setSelDay(null); }} className="w-7 h-7 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-600 leading-none">‹</button>
          <button onClick={() => { setYm(today.slice(0, 7)); setSelDay(null); }} className="min-w-[108px] text-[13px] font-semibold text-gray-800 text-center" title="Back to this month">{monthLabel(ym)}</button>
          <button aria-label="Next month" onClick={() => { setYm(addMonthsStr(`${ym}-01`, 1).slice(0, 7)); setSelDay(null); }} className="w-7 h-7 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-600 leading-none">›</button>
        </div>
      </div>
      {/* Natural height (no inner scroll) — the right-hand column scrolls as one */}
      <div className="px-[18px] pt-2.5 pb-[14px]">
        {error && <p className="text-xs text-red-500 mb-1">{error}</p>}
        <div className="grid grid-cols-7">
          {WK.map((w, i) => <div key={i} className="text-center text-[11px] leading-4 font-semibold text-gray-400">{w}</div>)}
        </div>
        {/* Mini calendar: 30px rows, no gaps (range shading runs on unbroken). Number in a 20px circle — solid blue for
            today, dark for the selected day; weekends slightly muted; a dot per category just under the number. */}
        <div className="grid grid-cols-7 auto-rows-[30px]">
          {grid.map((d, idx) => {
            const inMonth = d.slice(0, 7) === ym;
            const isSel = d === selDay;
            const isToday = d === today;
            const items = onDay(d);
            const { shade, dots } = dayMarks(items, d, colourOf); // unshaded ranges: a start-day dot, never a tint
            const weekend = idx % 7 >= 5;
            const [, , dn] = d.split("-").map(Number);
            return (
              <button
                key={d}
                onClick={() => { setSelDay(isSel ? null : d); setDayMore(false); }}
                aria-label={longDate(d)}
                className="relative h-[30px] flex justify-center pt-px rounded-md hover:bg-gray-50"
              >
                {shade && (() => {
                  // Rounded at the range's start / end and at the week's edges (Monday / Sunday)
                  const roundL = shade.start === d || idx % 7 === 0;
                  const roundR = shade.end === d || idx % 7 === 6;
                  return (
                    <span
                      className="absolute top-[3px] bottom-[3px]"
                      style={{ background: tintOf(shade), left: roundL ? 2 : 0, right: roundR ? 2 : 0, borderRadius: `${roundL ? 12 : 0}px ${roundR ? 12 : 0}px ${roundR ? 12 : 0}px ${roundL ? 12 : 0}px` }}
                    />
                  );
                })()}
                <span className={`relative w-5 h-5 rounded-full inline-flex items-center justify-center text-[13px] leading-none ${isToday ? "bg-blue-600 text-white font-bold" : isSel ? "bg-gray-900 text-white font-bold" : !inMonth ? "text-gray-400" : weekend ? "text-gray-500" : "text-gray-900"} ${isToday && isSel ? "ring-2 ring-gray-900 ring-offset-1" : ""}`}>
                  {dn}
                </span>
                {dots.length > 0 && (
                  <span className="absolute top-[22px] left-0 right-0 flex justify-center gap-[2px]">
                    {dots.map((c) => <span key={c} className="w-[5px] h-[5px] rounded-full" style={{ background: c }} />)}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Legend — one line, wraps only if it must */}
        <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 mt-1.5 text-[11px] leading-4 text-gray-500">
          {legend.map((c) => (
            <span key={c.id} className="flex items-center gap-1 whitespace-nowrap"><span className="w-1.5 h-1.5 rounded-full" style={{ background: c.colour }} />{c.name}</span>
          ))}
        </div>

        {/* On now — unshaded ranges running today, e.g. "Promotion now: …" (nothing shown when there's none) */}
        {onNow.length > 0 && (
          <div className="mt-1.5 space-y-0.5">
            {onNow.map((i) => (
              <div key={i.key} className="flex items-start gap-2 text-[13px] leading-5">
                <span className="w-2 h-2 mt-1.5 rounded-full shrink-0" style={{ background: colourOf(i) }} />
                <span className="text-gray-700 min-w-0">{/* wraps on a narrow screen so the end date always shows */}
                  <span className="font-semibold text-gray-800">{i.category?.name || "Event"} now:</span> {i.title} · ends {shortDate(i.end)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Next up — light grey box */}
        <div className="mt-2 rounded-lg bg-[#F8FAFC] px-3 py-2">
          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Next up</div>
          {nextUp.length === 0 && <div className="text-xs text-gray-400">Nothing coming up.</div>}
          {nextUp.map((i) => (
            <div key={i.key} className="flex items-center gap-2 text-[13px] leading-5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: colourOf(i) }} />
              <span className="font-semibold text-gray-800 shrink-0">{i.start === today ? "Today" : shortDate(i.start)}</span>
              <span className="text-gray-700 truncate">{i.title}{i.time ? ` · ${fmtTime(i.time)}` : ""}</span>
            </div>
          ))}
        </div>

        {/* The tapped day — one compact row per item, 3 shown ("+N more" for the rest) */}
        {selDay && (() => {
          const items = onDay(selDay);
          const shown = dayMore ? items : items.slice(0, 3);
          return (
            <div className="mt-2 bg-gray-50 border rounded-lg px-2.5 py-2">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="text-[13px] font-bold text-gray-800">{longDate(selDay)}{selDay.slice(0, 4) !== String(y) || Number(selDay.slice(5, 7)) !== m ? ` ${selDay.slice(0, 4)}` : ""}</div>
                <button onClick={() => openAdd(selDay)} className="h-7 px-2.5 rounded-md bg-gray-900 text-white text-xs font-semibold">+ Add</button>
              </div>
              {items.length === 0 && <div className="text-xs text-gray-500">Nothing on this day.</div>}
              {shown.map((i) => {
                const ev = i.event;
                const line = [
                  i.range && `${shortDate(i.start)} – ${shortDate(i.end)} · day ${daysBetween(i.start, selDay) + 1} of ${daysBetween(i.start, i.end) + 1}`,
                  i.time && fmtTime(i.time),
                  !i.range && !i.time && i.auto,
                ].filter(Boolean).join(" · ");
                const own = ev && Number(ev.created_by_staff_id) === Number(selectedStaffId) && !i.category?.manager_only;
                return (
                  <div key={i.key} className="flex items-start gap-2 py-1 border-t first:border-t-0 border-gray-200">
                    <span className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ background: colourOf(i) }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold text-gray-800 truncate">{i.title}</div>
                      {line && <div className="text-[11px] text-gray-500 truncate">{line}</div>}
                      {i.note && <div className="text-[11px] text-gray-600 truncate">{i.note}</div>}
                      {ev?.memo_id && memoTitles[ev.memo_id] && (
                        <button onClick={() => onOpenMemo?.(ev.memo_id)} className="block text-left text-[11px] text-sky-700 hover:underline truncate max-w-full">
                          📰 From the {memoTitles[ev.memo_id]}
                        </button>
                      )}
                    </div>
                    {/* Own events: Edit. Anyone else's (or a manager-only category): manager PIN first */}
                    {ev && (
                      <button onClick={() => openEdit(ev)} className="shrink-0 text-[11px] text-blue-600 hover:underline pt-0.5" title={own ? "Edit" : "Edit (manager PIN)"}>
                        {own ? "Edit" : "🔒 Edit"}
                      </button>
                    )}
                  </div>
                );
              })}
              {items.length > 3 && (
                <button onClick={() => setDayMore((x) => !x)} className="mt-0.5 text-[11px] font-semibold text-blue-600">
                  {dayMore ? "Show less" : `+${items.length - 3} more`}
                </button>
              )}
            </div>
          );
        })()}
      </div>

      {pinFor && (
        <ManagerPinModal
          onUnlock={(u) => { setManager(u); setSheet({ event: pinFor, date: pinFor.start_date }); setPinFor(null); }}
          onClose={() => setPinFor(null)}
        />
      )}
      {sheet && adder && (
        <CalendarEventSheet
          event={sheet.event}
          defaultDate={sheet.date}
          categories={categories}
          staff={staffList.filter((s) => s.role !== "Locum")}
          adder={adder}
          pharmacyId={pharmacyId}
          holidays={holidays}
          existingJobs={sheet.event ? jobs.filter((t) => t.event_id === sheet.event.id) : []}
          addedBy={sheet.event?.created_by_staff_id ? nameOf(sheet.event.created_by_staff_id) : ""}
          manager={manager}
          onManager={setManager}
          onClose={closeSheet}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
