-- Staff memos Stage 2 addition: a note from the manager to each person asked for a section. 13 Nov 2026.
-- Additive only — two new columns on staff_memo_sections, nothing existing changes.
--   request_note           the manager's note to the asked person (plain text). Never part of the memo itself.
--   requested_by_staff_id  the manager who asked ("Blair asked: …")
alter table public.staff_memo_sections add column if not exists request_note text;
alter table public.staff_memo_sections add column if not exists requested_by_staff_id bigint references public.staff(id) on delete set null;

-- Check — expect two rows
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'staff_memo_sections' and column_name in ('request_note', 'requested_by_staff_id')
order by column_name;
