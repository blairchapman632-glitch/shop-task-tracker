-- QSPP library: Retire (archive) documents instead of deleting them.
-- Reuses pharmacy_documents.active (false = retired) — every staff screen and the admin library already hide inactive
-- documents. These columns record when, who and why. Additive only: new nullable columns, no rows change.
-- Run in the Supabase SQL editor.

alter table public.pharmacy_documents add column if not exists retired_at timestamptz;
alter table public.pharmacy_documents add column if not exists retired_by_staff_id bigint references public.staff(id);
alter table public.pharmacy_documents add column if not exists retired_reason text;

-- Check (expect 3 rows; and 0 documents already inactive — so nothing shows up as "retired" without a date)
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'pharmacy_documents' and column_name in ('retired_at', 'retired_by_staff_id', 'retired_reason');
select count(*) as already_inactive from public.pharmacy_documents where active = false;
