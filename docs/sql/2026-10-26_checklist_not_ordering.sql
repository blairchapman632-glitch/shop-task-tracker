-- Consumables follow-up orders: "Not ordering" on an Order / Owner line (closes it without ordering).
-- Run in the Supabase SQL editor BEFORE testing the follow-up order cards. Additive only — no rows change.
-- A line is still "to order" while result is 'order' or 'owner' and it's neither ordered nor marked not ordering.

alter table public.checklist_lines add column if not exists not_ordering boolean not null default false;
alter table public.checklist_lines add column if not exists not_ordering_by_staff_id bigint references public.staff(id);
alter table public.checklist_lines add column if not exists not_ordering_at timestamptz;
alter table public.checklist_lines add column if not exists not_ordering_note text;

-- Check (expect 4 rows)
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'checklist_lines' and column_name like 'not_ordering%';
