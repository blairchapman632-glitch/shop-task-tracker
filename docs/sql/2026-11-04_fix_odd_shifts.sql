-- Fix the 7 shifts the odd-shifts report found (PM typed instead of AM) + Suzie Percy's regular schedule (Thursday).
-- Matched on row ids (from the report), and each update also checks the current wrong value, so running it twice
-- changes nothing. None of these shifts have a shift_edits correction.
--   282   Bridget Ellement  22 May 2026  PA     22:00 → 10:00   (finish 18:30)
--   2486  Suzie Percy        3 Dec 2026  PA     22:00 → 10:00   (finish 18:30)
--   2490  Chelsea Carnaby   10 Dec 2026  PA     22:00 → 10:00   (finish 18:30)
--   2494  Suzie Percy       17 Dec 2026  PA     22:00 → 10:00   (finish 18:30)
--   2498  Suzie Percy       24 Dec 2026  PA     22:00 → 10:00   (finish 17:00)
--   2500  Suzie Percy       31 Dec 2026  PA     22:00 → 10:00   (finish 18:30)
--   485   Lip-Yi Yeo        14 Oct 2026  Locum  01:30 → 13:30   (finish 18:30)
--   staff 7 Suzie Percy — weekly_schedule Thursday start 22:00 → 10:00 (the December Thursdays were generated from it)

-- ── STEP 1 — backups ──
create table roster_shifts_backup_20261104 as
  select * from public.roster_shifts where id in (282, 485, 2486, 2490, 2494, 2498, 2500);
create table staff_schedule_backup_20261104 as
  select id, name, weekly_schedule, week_ab_schedule from public.staff where id = 7;

-- ── STEP 2 — before / after (read-only) ──
select rs.id, rs.shift_date, coalesce(s.name, rs.staff_name) as staff, rs.role,
       rs.start_time as start_now, rs.end_time as finish,
       case rs.id when 485 then time '13:30' else time '10:00' end as start_after
from public.roster_shifts rs
left join public.staff s on s.id = rs.staff_id
where rs.id in (282, 485, 2486, 2490, 2494, 2498, 2500)
order by rs.shift_date;

select id, name, weekly_schedule -> 'thu' as thursday_now,
       jsonb_set(weekly_schedule, '{thu,start}', '"10:00"') -> 'thu' as thursday_after
from public.staff where id = 7;

-- ── STEP 3 — the fix ──
update public.roster_shifts set start_time = '10:00'
where id in (282, 2486, 2490, 2494, 2498, 2500) and start_time = '22:00';      -- expect 6 rows

update public.roster_shifts set start_time = '13:30'
where id = 485 and start_time = '01:30';                                       -- expect 1 row

update public.staff set weekly_schedule = jsonb_set(weekly_schedule, '{thu,start}', '"10:00"')
where id = 7 and weekly_schedule -> 'thu' ->> 'start' = '22:00';               -- expect 1 row

-- ── Check — expect all 7 shifts with a 10:00 / 13:30 start, and Suzie's Thursday 10:00–18:30 ──
select id, shift_date, start_time, end_time from public.roster_shifts
where id in (282, 485, 2486, 2490, 2494, 2498, 2500) order by shift_date;
select weekly_schedule -> 'thu' as thursday from public.staff where id = 7;
