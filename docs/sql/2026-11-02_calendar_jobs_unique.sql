-- Kiosk calendar: one task row per event job per occurrence, so two kiosks loading at the same moment can't both
-- create next year's copy of a yearly event's job. The app skips the clash quietly (lib/calendar.js ensureYearlyJobs).
-- Only rows linked to an event are covered; rows whose job key was cleared (job removed, done copies kept) aren't
-- affected (a null key never clashes). Additive only — no data changed. No new tables.

-- Check first — expect 0 rows (no duplicates already there; the index can't be created if there are)
select event_id, event_job_key, event_occurrence, count(*)
from public.tasks
where event_id is not null
group by event_id, event_job_key, event_occurrence
having count(*) > 1;

create unique index if not exists tasks_event_job_occurrence_unique
  on public.tasks (event_id, event_job_key, event_occurrence)
  where event_id is not null;

-- Check — expect 1 row
select indexname from pg_indexes where indexname = 'tasks_event_job_occurrence_unique';
