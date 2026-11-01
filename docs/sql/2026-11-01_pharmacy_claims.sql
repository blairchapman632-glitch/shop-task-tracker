-- Part 4 — "Pharmacy Claims" tick list replaces the 5 separate monthly claim tasks. Run in the Supabase SQL editor.
-- Run STEP 1 (preview) first and check it, then STEP 2. The 5 old tasks are switched off, not deleted — their
-- completions history stays. PBS Claim 1 / PBS Claim 2 are not touched. No new tables.

-- ── STEP 1 — preview (read-only) ──
-- a) The 5 tasks that will be switched off (expect 5 rows, all active = true now)
select id, title, active, frequency, day_of_month, points, assigned_staff_id, assigned_role, sort_index
from public.tasks
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and id in (113, 105, 115, 106, 109)
order by sort_index;
-- b) The new task copies DAA Claim's schedule, assignment and points (expect 1 row: DAA Claim, staff 5, 3 points)
select id, title, frequency, day_of_month, points, assigned_staff_id, assigned_role, assigned_staff_ids, sort_index
from public.tasks where id = 113;
-- c) Not touched (expect PBS Claim 1, PBS Claim 2) and no "Pharmacy Claims" task yet (expect 0)
select id, title, active from public.tasks
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and title ilike 'PBS Claim%';
select count(*) as pharmacy_claims_already from public.tasks
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and title = 'Pharmacy Claims';


-- ── STEP 2 — make the changes ──
-- Backup of the 5 tasks
create table tasks_claims_backup_20261101 as select * from public.tasks where id in (113, 105, 115, 106, 109);

-- One snapshot per line per month's sheet (stops two kiosks opening a new month at once doubling the lines)
create unique index if not exists checklist_lines_one_per_task_line on public.checklist_lines (sheet_id, task_line_id)
  where task_line_id is not null;

-- a) The new task: monthly On the List, Tick list, same assignment / points / show-from as DAA Claim
insert into public.tasks
  (pharmacy_id, title, task_type, frequency, day_of_month, days_of_week, points, active, rollover, show_next_shift,
   assigned_staff_id, assigned_role, assigned_staff_ids, sort_index, checklist_type, created_by_staff_id)
select pharmacy_id, 'Pharmacy Claims', task_type, frequency, day_of_month, days_of_week, points, true, rollover, false,
       assigned_staff_id, assigned_role, assigned_staff_ids, sort_index, 'ticklist', 10
from public.tasks
where id = 113
  and not exists (select 1 from public.tasks where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and title = 'Pharmacy Claims');

-- b) Its lines, in order
insert into public.checklist_task_lines (pharmacy_id, task_id, name, sort_order)
select t.pharmacy_id, t.id, v.name, v.sort_order
from public.tasks t
cross join (values
  ('DAA Claim', 10),
  ('IDAA Claim', 20),
  ('Staged Supply Claim', 30),
  ('Naloxone', 40),
  ('Pharma Programs Claim', 50)
) as v(name, sort_order)
where t.pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and t.title = 'Pharmacy Claims' and t.checklist_type = 'ticklist'
  and not exists (select 1 from public.checklist_task_lines l where l.task_id = t.id);

-- c) Switch off the 5 separate tasks (inactive, not deleted)
update public.tasks set active = false
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and id in (113, 105, 115, 106, 109);

-- Check — expect: Pharmacy Claims (ticklist, active, staff 5, 3 points); its 5 lines in order; the 5 old tasks inactive
select id, title, active, checklist_type, frequency, day_of_month, points, assigned_staff_id
from public.tasks where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and title = 'Pharmacy Claims';
select l.sort_order, l.name, l.active from public.checklist_task_lines l
join public.tasks t on t.id = l.task_id where t.title = 'Pharmacy Claims' order by l.sort_order;
select id, title, active from public.tasks where id in (113, 105, 115, 106, 109) order by sort_index;
