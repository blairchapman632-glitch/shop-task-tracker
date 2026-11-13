-- Staff memos: who a sent memo went to — 'all' (all active staff), 'roles' (send_to_roles), 'people' (chosen people;
-- the people are the staff_memo_recipients rows). Memos sent to roles / people are private to their recipients and to
-- managers in manager mode: not in the shared archive, no pinned Wall post, no What's on dates. 13 Nov 2026.
-- Additive only — existing memos (the 14 imported) become 'all' and stay visible to everyone.
alter table public.staff_memos
  add column if not exists send_to text not null default 'all'
  check (send_to in ('all', 'roles', 'people'));

-- Check — expect send_to | text | 'all'::text
select column_name, data_type, column_default from information_schema.columns
where table_schema = 'public' and table_name = 'staff_memos' and column_name = 'send_to';
