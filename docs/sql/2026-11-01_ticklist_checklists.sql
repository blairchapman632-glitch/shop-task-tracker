-- Part 1 — "Tick list" checklists. Run in the Supabase SQL editor. Additive only (no data changed).
-- Reuses checklist_sheets (kind 'ticklist') and checklist_lines (the month's snapshot of each line + the answer).
-- New table: checklist_task_lines — add to the #11 RLS pass.
-- Designed so a later "reading" type (e.g. fridge temps) can add its own columns to the same two tables.

-- a) tasks.checklist_type: allow 'ticklist' as well as 'consumables' (labelled "Stock count" in the app)
alter table public.tasks drop constraint if exists tasks_checklist_type_check;
alter table public.tasks add constraint tasks_checklist_type_check check (checklist_type in ('consumables', 'ticklist'));

-- b) A tick-list checklist's lines (jobs), set up in Tasks → Checklists → [checklist] → Lines
create table if not exists public.checklist_task_lines (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  task_id bigint not null references public.tasks(id) on delete cascade,
  name text not null,
  note text,                               -- optional instructions, shown under the line on the kiosk
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists checklist_task_lines_task_idx on public.checklist_task_lines (task_id, sort_order);

-- c) Month sheet lines for tick lists: link back to the line, snapshot of its note, and the answer.
--    Who + when = the existing entered_by_staff_id / entered_at. item_name holds the line name snapshot.
alter table public.checklist_lines add column if not exists task_line_id uuid references public.checklist_task_lines(id) on delete set null;
alter table public.checklist_lines add column if not exists line_note text;
alter table public.checklist_lines add column if not exists answer text check (answer in ('done', 'not_required'));
create index if not exists checklist_lines_task_line_idx on public.checklist_lines (task_line_id);

-- Check — expect: the constraint lists both values; the table exists with 0 rows; 3 new columns on checklist_lines
select pg_get_constraintdef(oid) from pg_constraint where conname = 'tasks_checklist_type_check';
select count(*) as lines from public.checklist_task_lines;
select column_name from information_schema.columns
where table_name = 'checklist_lines' and column_name in ('task_line_id', 'line_note', 'answer');
