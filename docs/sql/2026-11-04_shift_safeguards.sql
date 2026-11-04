-- Roster / wages shift-time safeguards: the limits used by lib/shiftCheck.js (Admin → Settings → Shift safeguards).
-- Additive only — four new pharmacy_settings columns with defaults. No data changed. No new tables.
--   max_shift_hours     a shift longer than this (raw start → finish, before lunch) is flagged
--   long_shift_mode     'block' = can't be saved; 'warn' = "Save anyway"
--   shift_earliest_time / shift_latest_time   starting before / finishing after this = "Outside normal hours" warning
-- (The existing hours_monday … hours_sunday are free-text display strings like "8am–6:30pm", so they're not reused.)

alter table public.pharmacy_settings add column if not exists max_shift_hours numeric not null default 12;
alter table public.pharmacy_settings add column if not exists long_shift_mode text not null default 'block'
  check (long_shift_mode in ('block', 'warn'));
alter table public.pharmacy_settings add column if not exists shift_earliest_time time not null default '07:00';
alter table public.pharmacy_settings add column if not exists shift_latest_time time not null default '19:00';

-- Check — expect one row: 12, block, 07:00:00, 19:00:00
select max_shift_hours, long_shift_mode, shift_earliest_time, shift_latest_time
from public.pharmacy_settings where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671';
