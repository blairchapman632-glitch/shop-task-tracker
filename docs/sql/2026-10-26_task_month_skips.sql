-- Part A — "Nothing this month" for monthly assigned tasks. Run in the Supabase SQL editor.
-- Additive only: one new table. No existing rows are changed.
-- Kept OUT of completions on purpose: no leaderboard points, no Activity feed entry, shown as "—" not a tick.
-- RLS: left OFF (matches the rest of the app). Add task_month_skips to the #11 RLS pass.

create table if not exists public.task_month_skips (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  task_id bigint not null references public.tasks(id) on delete cascade,
  month date not null,                                -- first of the month, e.g. 2026-10-01
  staff_id bigint references public.staff(id),        -- who chose "Nothing this month"
  created_at timestamptz not null default now(),
  check (extract(day from month) = 1)
);
-- One per task per month (two kiosks tapping at once can't double up)
create unique index if not exists task_month_skips_one_per_month on public.task_month_skips (task_id, month);
create index if not exists task_month_skips_pharmacy_idx on public.task_month_skips (pharmacy_id, month);

-- Check
select count(*) as skips from public.task_month_skips;
