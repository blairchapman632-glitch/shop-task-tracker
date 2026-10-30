-- QSPP library: every document gets a STAFF PDF alongside its MASTER (the original Word / Excel / PDF).
-- file_url / file_name stay as the master (admin only). Staff see pdf_url only.
-- Additive only: new nullable columns, no rows change. (The one-off conversion script fills them in later.)
-- Run in the Supabase SQL editor.

-- a) The staff PDF on each document
alter table public.pharmacy_documents add column if not exists pdf_url text;
alter table public.pharmacy_documents add column if not exists pdf_file_name text;      -- storage path in pharmacy-documents
alter table public.pharmacy_documents add column if not exists pdf_updated_at timestamptz;  -- to spot a PDF older than its master
alter table public.pharmacy_documents add column if not exists pdf_updated_by_staff_id bigint references public.staff(id);

-- b) Version history keeps the PDF that went with each version (admin history only)
alter table public.document_versions add column if not exists pdf_url text;
alter table public.document_versions add column if not exists pdf_file_name text;

-- Check (expect 6 rows)
select table_name, column_name from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'pharmacy_documents' and column_name in ('pdf_url', 'pdf_file_name', 'pdf_updated_at', 'pdf_updated_by_staff_id'))
    or (table_name = 'document_versions' and column_name in ('pdf_url', 'pdf_file_name')))
order by table_name, column_name;
