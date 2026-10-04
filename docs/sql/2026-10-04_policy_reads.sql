-- Policy acknowledgment (QSPP library) — run in the Supabase SQL editor, project shop-task-tracker.
-- Additive only: one new table + indexes. No existing rows are changed.
-- RLS: left OFF (matches the rest of the app). Add policy_read_requests to the #11 RLS pass.

create table if not exists public.policy_read_requests (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  document_id uuid not null references public.pharmacy_documents(id),  -- no cascade: a document with read records can't be deleted
  staff_id bigint not null references public.staff(id),
  requested_by bigint references public.staff(id),
  requested_at timestamptz not null default now(),
  status text not null default 'outstanding' check (status in ('outstanding', 'read', 'cancelled')),
  read_at timestamptz,
  read_via text check (read_via in ('phone', 'kiosk')),
  read_file_name text,   -- snapshot of the file they read
  read_file_url text,
  cancelled_by bigint references public.staff(id),
  cancelled_at timestamptz
);

-- Only one OUTSTANDING request per document + person (a new one after a completed one is allowed: re-read)
create unique index if not exists policy_read_requests_one_outstanding
  on public.policy_read_requests (document_id, staff_id) where status = 'outstanding';
create index if not exists policy_read_requests_staff_idx on public.policy_read_requests (staff_id, status);
create index if not exists policy_read_requests_doc_idx on public.policy_read_requests (document_id, status);

-- Check
select count(*) as requests from public.policy_read_requests;
