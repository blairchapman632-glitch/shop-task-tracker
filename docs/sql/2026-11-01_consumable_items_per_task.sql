-- Part 2 — each stock-count checklist has its own items (consumable_items.task_id). Run in the Supabase SQL editor.
-- Suppliers and "owner to order" stay shared. All existing items go to task 116 (Consumables Checklist).
-- No new tables.

-- a) Backup
create table consumable_items_backup_20261101 as select * from public.consumable_items;

-- b) Which checklist task the item belongs to
alter table public.consumable_items add column if not exists task_id bigint references public.tasks(id) on delete set null;
create index if not exists consumable_items_task_idx on public.consumable_items (task_id, sort_order);

-- c) Every existing item -> Consumables Checklist (task 116)
update public.consumable_items set task_id = 116
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and task_id is null;

-- Check — expect one row: task_id 116, items 43, no_task 0
select task_id, count(*) as items from public.consumable_items
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' group by task_id;
select count(*) as no_task from public.consumable_items
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and task_id is null;
