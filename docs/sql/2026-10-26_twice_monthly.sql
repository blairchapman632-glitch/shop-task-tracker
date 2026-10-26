-- RUN 26/10/2026. "Twice a month" was then dropped before it went live — kept as the record of these changes:
--   * completions.period_start is now used for monthly "Show from day" tasks: a missed month carried into the next
--     month counts for the month it belonged to (period_start = "YYYY-MM-01").
--   * the 16th allowed on task_month_skips is unused (harmless).
-- Original header: "Twice a month" recurring tasks (1st–15th and 16th–end, Perth).
-- Additive only: no existing rows are changed.

-- a) Checked 26/10/2026: tasks has no check on frequency (only tasks_recurrence_check on recurrence), so
--    "twice_monthly" needs no change there; completions has no one-per-day index, so both halves can be
--    completed on the same day.

-- b) "Nothing this half": a skip's month may now be the 16th (= 2nd half). The 1st still means the whole month for
--    monthly tasks, or the 1st half for twice-a-month tasks. One per task per period (existing unique index).
alter table public.task_month_skips drop constraint if exists task_month_skips_month_check;
alter table public.task_month_skips add constraint task_month_skips_month_check
  check (extract(day from month) in (1, 16));

-- c) Which half a completion counts for (set only for twice-a-month tasks: "YYYY-MM-01" or "YYYY-MM-16").
--    Lets a missed 1st half completed after the 16th still count for the 1st half. Null for every other task.
alter table public.completions add column if not exists period_start date;

-- Check
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'completions' and column_name = 'period_start';
