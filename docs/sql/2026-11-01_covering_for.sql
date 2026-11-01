-- Kiosk "covering for": when someone completes a job that belongs to another person (after the "Did you do it for
-- them?" confirm), record who it was for. Additive only — two nullable columns, no data changed. No new tables.
-- Points still go to the person who did it (staff_id / completed_by_staff_id), as now.

alter table public.completions add column if not exists covering_for_staff_id bigint references public.staff(id);
alter table public.section_clean_schedule add column if not exists covering_for_staff_id bigint references public.staff(id);

-- Check — expect 2 rows
select table_name, column_name from information_schema.columns
where column_name = 'covering_for_staff_id' and table_name in ('completions', 'section_clean_schedule');
