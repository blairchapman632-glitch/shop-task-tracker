-- QSPP incidents & feedback: kiosk jobs, Follow-up done, feedback to staff "Given by" (12 Nov 2026)
-- Additive only: new columns + one sequence. No existing values change (the backfill only fills the new
-- feedback_number on any feedback rows that already exist — there are none today).
-- Run from the Claude chat via Supabase. Columns on existing tables — incidents / feedback are already on the RLS-pass list.

-- 1. Feedback numbers ("Feedback #4"), like incident report numbers
create sequence if not exists public.feedback_number_seq;
alter table public.feedback add column if not exists feedback_number integer;
alter table public.feedback alter column feedback_number set default nextval('public.feedback_number_seq');
alter sequence public.feedback_number_seq owned by public.feedback.feedback_number;
-- number any existing feedback in the order it was logged
with ordered as (
  select id, row_number() over (order by created_at, id) as n from public.feedback where feedback_number is null
)
update public.feedback f set feedback_number = (select coalesce(max(feedback_number), 0) from public.feedback) + o.n
from ordered o where f.id = o.id;
select setval('public.feedback_number_seq', greatest((select coalesce(max(feedback_number), 0) from public.feedback), 1),
              (select count(*) > 0 from public.feedback));

-- 2. Feedback: follow-up assigned to someone (incidents already have assigned_to_staff_id)
alter table public.feedback add column if not exists assigned_to_staff_id bigint references public.staff(id) on delete set null;

-- 3. "Follow-up done" — the assigned person's note, who and when (incidents and feedback)
alter table public.incidents add column if not exists follow_up_done_note text;
alter table public.incidents add column if not exists follow_up_done_by_staff_id bigint references public.staff(id) on delete set null;
alter table public.incidents add column if not exists follow_up_done_at timestamptz;
alter table public.feedback  add column if not exists follow_up_done_note text;
alter table public.feedback  add column if not exists follow_up_done_by_staff_id bigint references public.staff(id) on delete set null;
alter table public.feedback  add column if not exists follow_up_done_at timestamptz;

-- 4. Incident "Feedback to staff" — who gave it (filled from the person in QSPP manager mode)
alter table public.incidents add column if not exists staff_feedback_by_staff_id bigint references public.staff(id) on delete set null;

-- Check — expect 9 rows
select table_name, column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'feedback' and column_name in ('feedback_number', 'assigned_to_staff_id', 'follow_up_done_note', 'follow_up_done_by_staff_id', 'follow_up_done_at'))
    or (table_name = 'incidents' and column_name in ('follow_up_done_note', 'follow_up_done_by_staff_id', 'follow_up_done_at', 'staff_feedback_by_staff_id')))
order by table_name, column_name;

-- Data (already done by Claude, nothing to run): Paige (staff id 11) is ticked as a QSPP manager — she already was.
