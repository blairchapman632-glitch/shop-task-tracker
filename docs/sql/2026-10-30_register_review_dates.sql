-- Document Register: record the blanket QSPP review from the Word Document Review Register
-- (all documents migrated to QSPP and reviewed Sep 2026 by Blair Chapman, next review Sep 2027).
-- Sets review_date = 30 Sep 2027 on every ACTIVE document with no review date, EXCEPT the Reference Library folder
-- (external documents — their currency is tracked separately). Version and everything else are left alone.
-- Expected: 159 rows (192 active − 33 Reference Library; none have a review date yet). Retired documents untouched.
-- Run in the Supabase SQL editor, one step at a time.

-- Step 1: backup
create table pharmacy_documents_backup_20261030 as select * from public.pharmacy_documents;

-- Step 2: look (expect 159)
select count(*) as will_change
from public.pharmacy_documents d
where d.pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671'
  and d.active = true
  and d.review_date is null
  and d.folder_id <> '4a35fabd-4cd9-4cd1-b7c8-0610ff58053b';   -- Reference Library

-- Step 3: update
update public.pharmacy_documents d
set review_date = '2027-09-30'
where d.pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671'
  and d.active = true
  and d.review_date is null
  and d.folder_id <> '4a35fabd-4cd9-4cd1-b7c8-0610ff58053b';   -- Reference Library

-- Check: 159 with 2027-09-30; Reference Library still 0 with a review date
select
  (select count(*) from public.pharmacy_documents where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and active and review_date = '2027-09-30') as set_to_sep_2027,
  (select count(*) from public.pharmacy_documents where folder_id = '4a35fabd-4cd9-4cd1-b7c8-0610ff58053b' and review_date is not null) as reference_library_with_date;
