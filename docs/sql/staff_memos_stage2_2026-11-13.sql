-- Staff memos Stage 2 (asking staff for a section). 13 Nov 2026. Additive only — one new column, nothing existing changes.
-- "Nothing this month": the asked person's slot is kept (so the manager sees that status) but marked declined —
-- it's left out of the memo and their job clears. Removing the ask (manager) still deletes the row.
alter table public.staff_memo_sections add column if not exists declined_at timestamptz;

-- Check — expect one row: declined_at | timestamp with time zone
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'staff_memo_sections' and column_name = 'declined_at';
