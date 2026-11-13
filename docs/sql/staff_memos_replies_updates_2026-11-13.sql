-- Staff memos: private replies + manager updates; memos no longer make a Wall post. 13 Nov 2026.
-- New tables for the RLS pass: staff_memo_replies, staff_memo_updates.

-- 1. Replies — one private thread per staff member per memo. Staff see only their own thread; QSPP managers (manager
--    mode) see every thread and answer in it. All reads / writes go through /api/memos and /api/memos/read.
create table if not exists public.staff_memo_replies (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  memo_id uuid not null references public.staff_memos(id) on delete cascade,
  staff_id bigint not null references public.staff(id) on delete cascade,      -- whose thread it is
  author_staff_id bigint references public.staff(id) on delete set null,       -- who wrote this message
  from_manager boolean not null default false,                                 -- a manager's answer
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz   -- staff message: when a manager opened the thread; manager answer: when the staff member read it
);
create index if not exists staff_memo_replies_thread_idx on public.staff_memo_replies (memo_id, staff_id, created_at);

-- 2. Updates — a manager's update / correction on a sent memo, shown under it to everyone who can see the memo (and in the PDF)
create table if not exists public.staff_memo_updates (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  memo_id uuid not null references public.staff_memos(id) on delete cascade,
  author_staff_id bigint references public.staff(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists staff_memo_updates_memo_idx on public.staff_memo_updates (memo_id, created_at);

-- 3. Clean-up: the one memo Wall post that exists (kiosk_notes 96 — the hidden reply-holder of "November 2026 Staff
--    Memo", sent only to Blair; no replies on it). Backup first.
create table if not exists public.kiosk_notes_memo_backup_20261113 as
select * from public.kiosk_notes where memo_id is not null;
delete from public.kiosk_notes where memo_id is not null;

-- Check — expect 9 + 6 columns, 0 memo Wall posts
select table_name, count(*) as columns from information_schema.columns
where table_schema = 'public' and table_name in ('staff_memo_replies', 'staff_memo_updates') group by table_name;
select count(*) as memo_wall_posts from public.kiosk_notes where memo_id is not null;
