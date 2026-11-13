-- Remove the test staff memo "Test Memo" (id bcabb301-e98b-4a4b-befd-550fdb39d949, sent 13 Nov 2026 22:56 Perth by
-- Blair to the Pharmacist role: Amanda Fox, Jasmine Chen, Blair Chapman, Paige Chapman). 13 Nov 2026.
-- Found: 1 section, 4 recipients, 1 seen, 1 memo policy, 0 dates, 1 Wall post (0 replies, 0 reactions),
-- 0 calendar events, 4 policy read requests made by its Send (all outstanding, 14:56:13 UTC), 2 files.
-- The 2 files (img-….png, pdf-….pdf in staff-memos/bcabb301-…/) are removed with the Storage API, not SQL
-- (Supabase doesn't allow deleting storage files with SQL).

-- 1. Backup of every row being removed (one table, each row as JSON)
create table if not exists public.staff_memo_test_backup_20261113 as
select 'staff_memos' as source, to_jsonb(x) as row from public.staff_memos x where x.id = 'bcabb301-e98b-4a4b-befd-550fdb39d949'
union all select 'staff_memo_sections', to_jsonb(x) from public.staff_memo_sections x where x.memo_id = 'bcabb301-e98b-4a4b-befd-550fdb39d949'
union all select 'staff_memo_recipients', to_jsonb(x) from public.staff_memo_recipients x where x.memo_id = 'bcabb301-e98b-4a4b-befd-550fdb39d949'
union all select 'staff_memo_seen', to_jsonb(x) from public.staff_memo_seen x where x.memo_id = 'bcabb301-e98b-4a4b-befd-550fdb39d949'
union all select 'staff_memo_policies', to_jsonb(x) from public.staff_memo_policies x where x.memo_id = 'bcabb301-e98b-4a4b-befd-550fdb39d949'
union all select 'staff_memo_dates', to_jsonb(x) from public.staff_memo_dates x where x.memo_id = 'bcabb301-e98b-4a4b-befd-550fdb39d949'
union all select 'kiosk_notes', to_jsonb(x) from public.kiosk_notes x where x.memo_id = 'bcabb301-e98b-4a4b-befd-550fdb39d949'
union all select 'policy_read_requests', to_jsonb(x) from public.policy_read_requests x where x.id in (
  'acbe8b9f-f669-4c1e-b4d7-db8a0bacd8c6', '0c1d337f-f63a-4d6b-a2da-20f97c0d25ff', 'de79dfae-9e59-490e-8a69-8c48eb02b2b9', '2bde6175-44fa-412e-88e4-fa4caafbcda6');

-- 2. The 4 policy read requests its Send created (Amanda, Jasmine, Blair, Paige — "Absence from Work Certificate (Procedure)")
delete from public.policy_read_requests where id in (
  'acbe8b9f-f669-4c1e-b4d7-db8a0bacd8c6', '0c1d337f-f63a-4d6b-a2da-20f97c0d25ff', 'de79dfae-9e59-490e-8a69-8c48eb02b2b9', '2bde6175-44fa-412e-88e4-fa4caafbcda6')
  and status = 'outstanding';

-- 3. Any calendar events it created (none found — kept for completeness)
delete from public.calendar_events where memo_id = 'bcabb301-e98b-4a4b-befd-550fdb39d949';

-- 4. Its Wall post (replies / reactions go with it — cascade)
delete from public.kiosk_notes where memo_id = 'bcabb301-e98b-4a4b-befd-550fdb39d949';

-- 5. The memo (sections, recipients, seen, policies, dates go with it — cascade)
delete from public.staff_memos where id = 'bcabb301-e98b-4a4b-befd-550fdb39d949' and imported = false;

-- Check — expect all zeros
select
 (select count(*) from public.staff_memos where id = 'bcabb301-e98b-4a4b-befd-550fdb39d949') memo,
 (select count(*) from public.staff_memo_sections where memo_id = 'bcabb301-e98b-4a4b-befd-550fdb39d949') sections,
 (select count(*) from public.staff_memo_recipients where memo_id = 'bcabb301-e98b-4a4b-befd-550fdb39d949') recipients,
 (select count(*) from public.staff_memo_seen where memo_id = 'bcabb301-e98b-4a4b-befd-550fdb39d949') seen,
 (select count(*) from public.kiosk_notes where memo_id = 'bcabb301-e98b-4a4b-befd-550fdb39d949') wall_posts,
 (select count(*) from public.policy_read_requests where id in ('acbe8b9f-f669-4c1e-b4d7-db8a0bacd8c6', '0c1d337f-f63a-4d6b-a2da-20f97c0d25ff', 'de79dfae-9e59-490e-8a69-8c48eb02b2b9', '2bde6175-44fa-412e-88e4-fa4caafbcda6')) policy_requests,
 (select count(*) from storage.objects where bucket_id = 'staff-memos' and name like 'bcabb301-e98b-4a4b-befd-550fdb39d949/%') files;
