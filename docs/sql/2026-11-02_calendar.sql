-- Kiosk calendar "What's on". Run in the Supabase SQL editor. Additive only — no existing data changed.
-- New tables: calendar_categories, calendar_events — add both to the #11 multi-pharmacy RLS pass.
-- Birthdays, work anniversaries and public holidays are read live (not stored as events).

-- a) Categories (names + colours editable in Admin → Settings). key = what the app relies on:
--    'closure' (manager-only; public holidays show under it) and 'staff' (birthdays / anniversaries show under it).
create table if not exists public.calendar_categories (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  key text,                                   -- event / promotion / staff / supplier / closure (null for ones added later)
  name text not null,
  colour text not null default '#2563eb',     -- hex
  manager_only boolean not null default false,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists calendar_categories_key on public.calendar_categories (pharmacy_id, key) where key is not null;

insert into public.calendar_categories (pharmacy_id, key, name, colour, manager_only, sort_order)
select '81ab394f-d642-4246-b896-e71938b25671'::uuid, v.key, v.name, v.colour, v.manager_only, v.sort_order
from (values
  ('event', 'Pharmacy event', '#2563eb', false, 10),
  ('promotion', 'Promotion', '#c2410c', false, 20),
  ('staff', 'Staff', '#be185d', false, 30),
  ('supplier', 'Supplier / rep', '#0f766e', false, 40),
  ('closure', 'Closure', '#475569', true, 50)
) as v(key, name, colour, manager_only, sort_order)
where not exists (select 1 from public.calendar_categories where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671');

-- b) Events (dates in Perth, as plain dates). end_date null = one day.
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  title text not null,
  category_id uuid references public.calendar_categories(id) on delete set null,
  start_date date not null,
  end_date date,
  start_time time,                            -- optional
  note text,
  repeats_yearly boolean not null default false,
  created_by_staff_id bigint references public.staff(id),
  updated_by_staff_id bigint references public.staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create index if not exists calendar_events_dates on public.calendar_events (pharmacy_id, start_date, end_date);

-- c) Jobs from an event = normal one-off assigned jobs (tasks, frequency 'specific_date') plus the link:
--    event_job_key        the same job across a yearly event's occurrences (each year gets its own task row)
--    event_occurrence     start date of the occurrence the row belongs to
--    event_due_rule       'before_start' (event_due_days days before) | 'on_start' | 'on_end' | 'after_end'
--    The due date itself is tasks.specific_date, worked out by the app (moved off public holidays).
alter table public.tasks add column if not exists event_id uuid references public.calendar_events(id) on delete set null;
alter table public.tasks add column if not exists event_job_key uuid;
alter table public.tasks add column if not exists event_occurrence date;
alter table public.tasks add column if not exists event_due_rule text check (event_due_rule in ('before_start', 'on_start', 'on_end', 'after_end'));
alter table public.tasks add column if not exists event_due_days int;
create index if not exists tasks_event_idx on public.tasks (event_id) where event_id is not null;

-- d) Birthday opt-out (none existed): ticked = their birthday isn't shown on the calendar
alter table public.staff add column if not exists hide_birthday boolean not null default false;

-- Check — expect 5 categories; 0 events; 5 new tasks columns; staff.hide_birthday
select key, name, colour, manager_only from public.calendar_categories
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' order by sort_order;
select count(*) as events from public.calendar_events;
select column_name from information_schema.columns
where (table_name = 'tasks' and column_name like 'event_%') or (table_name = 'staff' and column_name = 'hide_birthday');
