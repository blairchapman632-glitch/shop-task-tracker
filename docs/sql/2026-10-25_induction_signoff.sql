-- Staff induction Stage 5 — Section 6, sign-offs, PDF. Run in the Supabase SQL editor.
-- Additive only: new columns on staff_inductions + one new PRIVATE storage bucket. No existing rows are changed.
-- RLS: staff_inductions already on the RLS pass list; add the 'staff-inductions' bucket to it too.

-- a) Section 6: probation outcome (recorded on the induction once the probation review is signed)
alter table public.staff_inductions add column if not exists probation_outcome text
  check (probation_outcome in ('confirmed', 'extended', 'not_confirmed'));
alter table public.staff_inductions add column if not exists probation_extended_to date;
alter table public.staff_inductions add column if not exists probation_review_id uuid references public.performance_reviews(id) on delete set null;

-- b) Supervisor sign-off: where it was done (Admin or the supervisor's /me)
alter table public.staff_inductions add column if not exists signed_off_via text check (signed_off_via in ('admin', 'me'));

-- c) Reopen (Admin escape hatch) — last reopen kept for the record
alter table public.staff_inductions add column if not exists reopened_at timestamptz;
alter table public.staff_inductions add column if not exists reopened_reason text;

-- d) Private bucket for the signed checklist PDFs (includes immunisation status).
--    No public policies; all access via pages/api/inductions/* using the service role key.
insert into storage.buckets (id, name, public)
values ('staff-inductions', 'staff-inductions', false)
on conflict (id) do nothing;

-- Check (expect 6 columns and the bucket with public = false)
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'staff_inductions'
  and column_name in ('probation_outcome', 'probation_extended_to', 'probation_review_id', 'signed_off_via', 'reopened_at', 'reopened_reason')
order by column_name;
select id, public from storage.buckets where id = 'staff-inductions';
