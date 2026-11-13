-- Staff memos Stage 5 fix: the imported "Update from Retail Excellence Conference" (15 Feb 2026) was written by
-- Ashleigh Devlin (Retail Manager at the time; staff id 1), not Blair. Changes its one section's author + signature.
-- The memo's "Sent by" stays Blair. 13 Nov 2026.

-- Backup of the one row first
create table if not exists public.staff_memo_sections_backup_20261113 as
select * from public.staff_memo_sections where id = '942688df-502d-4009-98b5-51508b638d14';

update public.staff_memo_sections
set author_staff_id = 1, signature_name = 'Ashleigh Devlin', signature_role = 'Retail Manager', updated_at = now()
where id = '942688df-502d-4009-98b5-51508b638d14';

-- Check — expect: 1 | Ashleigh Devlin | Retail Manager
select author_staff_id, signature_name, signature_role from public.staff_memo_sections where id = '942688df-502d-4009-98b5-51508b638d14';
