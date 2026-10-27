-- Checklists on tasks: a task can have a checklist (only type for now: 'consumables' = stock count).
-- Run in the Supabase SQL editor. Adds one column and sets task 116 (Consumables Checklist). Nothing else changes.
-- pharmacy_settings.consumables_task_id is left in place but no longer used (the app finds checklist tasks by
-- tasks.checklist_type instead).

alter table public.tasks add column if not exists checklist_type text check (checklist_type in ('consumables'));

-- Consumables Checklist (expect 1 row)
update public.tasks set checklist_type = 'consumables'
where id = 116 and pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671';

-- Check (expect one row: 116 · Consumables Checklist · consumables)
select id, title, frequency, task_type, checklist_type from public.tasks
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and checklist_type is not null;
