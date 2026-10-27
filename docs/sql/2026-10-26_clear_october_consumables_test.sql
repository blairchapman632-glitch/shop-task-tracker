-- Clear October's Consumables test data so testing can start from a fresh sheet. Items / suppliers are NOT touched.
-- Run in the Supabase SQL editor ONE STEP AT A TIME, in order. Step 1 = backups, step 2 = look, step 3 = delete.

-- ── Step 1: backups ─────────────────────────────────────────────────────────
create table checklist_sheets_backup_20261026 as select * from public.checklist_sheets;
create table checklist_lines_backup_20261026 as select * from public.checklist_lines;
create table shopping_list_items_backup_20261026 as select * from public.shopping_list_items;
create table completions_task116_backup_20261026 as select * from public.completions where task_id = 116;
create table task_month_skips_task116_backup_20261026 as select * from public.task_month_skips where task_id = 116;

-- ── Step 2: what will be deleted (check these before step 3) ────────────────
-- a) October's sheet for task 116 (expect 1) and how many lines it has
select s.id, s.period_month, s.status, s.started_at, s.completed_at, count(l.id) as lines
from public.checklist_sheets s left join public.checklist_lines l on l.sheet_id = s.id
where s.task_id = 116 and s.period_month = '2026-10-01'
group by s.id;
-- b) every shopping list item (all were created while testing — the shopping list card isn't built yet)
select id, name, source, created_at, bought_at, removed_at from public.shopping_list_items
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' order by created_at;
-- c) task 116's completions that count for October (period_start October, or done in October Perth time)
select id, staff_id, completed_at, period_start from public.completions
where task_id = 116 and (
  period_start = '2026-10-01'
  or (period_start is null and (completed_at at time zone 'Australia/Perth') >= '2026-10-01' and (completed_at at time zone 'Australia/Perth') < '2026-11-01')
);
-- d) task 116's "Nothing this month" for October
select id, month, staff_id, created_at from public.task_month_skips where task_id = 116 and month = '2026-10-01';

-- ── Step 3: delete ──────────────────────────────────────────────────────────
-- Sheet first (its lines go with it — on delete cascade), then the shopping items, completions and skip.
delete from public.checklist_sheets where task_id = 116 and period_month = '2026-10-01';
delete from public.shopping_list_items where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671';
delete from public.completions
where task_id = 116 and (
  period_start = '2026-10-01'
  or (period_start is null and (completed_at at time zone 'Australia/Perth') >= '2026-10-01' and (completed_at at time zone 'Australia/Perth') < '2026-11-01')
);
delete from public.task_month_skips where task_id = 116 and month = '2026-10-01';

-- Check (expect 0 / 0 / 0 / 0)
select
  (select count(*) from public.checklist_sheets where task_id = 116 and period_month = '2026-10-01') as sheets,
  (select count(*) from public.shopping_list_items where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671') as shopping,
  (select count(*) from public.completions where task_id = 116 and (period_start = '2026-10-01' or (period_start is null and (completed_at at time zone 'Australia/Perth') >= '2026-10-01'))) as completions,
  (select count(*) from public.task_month_skips where task_id = 116 and month = '2026-10-01') as skips;
