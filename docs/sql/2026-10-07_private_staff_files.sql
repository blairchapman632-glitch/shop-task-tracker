-- Stage 1 A2b — staff files to private storage (locum-documents, training-certificates).
-- Run ONE step at a time in the Supabase SQL editor, in order. Nothing here deletes data or files.

-- ── Step 1: backups ─────────────────────────────────────────────────────────
create table locum_documents_backup_20261007 as select * from locum_documents;
create table training_records_backup_20261007 as select * from training_records;

-- ── Step 2: path column for training certificates ───────────────────────────
alter table training_records add column certificate_path text;

-- ── Step 3: backfill paths from the old public URLs (expect 18 and 39 rows — 19 before one old document was
--    removed while testing on 2026-10-07; it's still in locum_documents_backup_20261007) ──
update locum_documents
set storage_path = regexp_replace(split_part(url, '?', 1), '^.*/locum-documents/', '')
where storage_path is null and url like '%/locum-documents/%';

update training_records
set certificate_path = regexp_replace(split_part(certificate_url, '?', 1), '^.*/training-certificates/', '')
where certificate_path is null and certificate_url like '%/training-certificates/%';

-- Verification: every backfilled row's file exists (expect 18 / 18 and 39 / 39)
select 'locum_documents' as t, count(*) as rows_with_path, count(o.id) as file_found
from locum_documents d
left join storage.objects o on o.bucket_id = 'locum-documents' and o.name = d.storage_path
where d.url like '%/locum-documents/%'
union all
select 'training_records', count(*), count(o.id)
from training_records r
left join storage.objects o on o.bucket_id = 'training-certificates' and o.name = r.certificate_path
where r.certificate_url like '%/training-certificates/%';

-- ── Step 4: make both buckets private and drop their public policies ────────
update storage.buckets set public = false where id in ('locum-documents', 'training-certificates');
drop policy "Public read locum-documents" on storage.objects;
drop policy "Public upload locum-documents" on storage.objects;
drop policy "training certs public read" on storage.objects;
drop policy "training certs insert" on storage.objects;
drop policy "training certs delete" on storage.objects;
