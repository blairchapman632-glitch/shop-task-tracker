-- Staff memos Stage 4: dates on a memo. 13 Nov 2026. Additive only — one new table, nothing existing changes.
-- A draft's "Add a date" rows wait here; the What's on calendar events are created only when the memo is sent
-- (calendar_events.memo_id links them, event_id here records which one). Deleting a draft cascades these away, so
-- nothing is left behind. New table for the RLS pass: staff_memo_dates.
create table if not exists public.staff_memo_dates (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  memo_id uuid not null references public.staff_memos(id) on delete cascade,
  title text not null,
  start_date date not null,
  end_date date,                                       -- null = one day
  category_id uuid references public.calendar_categories(id) on delete set null,
  sort_order integer not null default 0,
  event_id uuid references public.calendar_events(id) on delete set null, -- set on Send
  created_at timestamptz not null default now()
);
create index if not exists staff_memo_dates_memo_idx on public.staff_memo_dates (memo_id, sort_order);

-- Check — expect 10 columns
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'staff_memo_dates' order by ordinal_position;
