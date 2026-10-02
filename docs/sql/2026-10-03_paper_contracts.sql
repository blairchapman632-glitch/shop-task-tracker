  -- Employment contracts list (Admin → Staff → Documents) — run in the Supabase SQL editor, project shop-task-tracker.
  -- Additive: no existing rows are changed.

  -- Date the paper contract was signed (existing rows stay null -> "Date not set")
  alter table public.locum_documents add column if not exists signed_date date;

  -- New paper contracts go to the PRIVATE employment-contracts bucket. Their row stores the private path here
  -- instead of a public URL (paper/<staff_id>/<timestamp>.<ext>), so url must be allowed to be empty.
  alter table public.locum_documents add column if not exists storage_path text;
  alter table public.locum_documents alter column url drop not null;

  -- Every row must still point at a file one way or the other
  alter table public.locum_documents drop constraint if exists locum_documents_file_check;
  alter table public.locum_documents add constraint locum_documents_file_check
    check (url is not null or storage_path is not null);

  -- Check: should list signed_date (date), storage_path (text), url nullable = YES
  select column_name, data_type, is_nullable from information_schema.columns
  where table_schema = 'public' and table_name = 'locum_documents'
    and column_name in ('signed_date', 'storage_path', 'url');
