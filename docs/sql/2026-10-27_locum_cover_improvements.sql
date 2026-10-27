-- Locums tab — "Shifts needing a locum" improvements. RUN by Blair 27/10/2026 (kept here for the record).
-- NOTE: reconstructed from the approved plan's description — the exact text Blair ran wasn't pasted in.
-- RLS: left OFF. Add locum_slot_overrides to the #11 RLS pass.

-- a) A pharmacist shift rostered as cover for someone's leave (counts as filling a "needs a locum" slot;
--    kept by the roster's copy month, never copied forward). Locum bookings stay role = 'Locum'.
alter table public.roster_shifts add column if not exists covers_leave boolean not null default false;

-- b) Edited times for a leave-based "needs a locum" slot — one per staff member (on leave) per date
create table if not exists public.locum_slot_overrides (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  staff_id bigint not null references public.staff(id),
  slot_date date not null,
  start_time time not null,
  end_time time not null,
  unique (staff_id, slot_date)
);
