-- READ-ONLY report: shifts whose times look wrong — finish at or before start, or longer than 12 hrs.
-- Uses the effective times the wages use: rostered start → rostered finish + shift_edits.adjust_minutes
-- (Adjust on the Wages pages). Newest first. Changes nothing.

with eff as (
  select
    rs.id,
    rs.shift_date,
    coalesce(s.name, rs.staff_name, '(no name)') as staff,
    rs.role,
    rs.start_time as rostered_start,
    rs.end_time   as rostered_end,
    coalesce(se.adjust_minutes, 0) as adjust_minutes,
    rs.start_time as eff_start,
    rs.end_time + make_interval(mins => coalesce(se.adjust_minutes, 0)) as eff_end
  from public.roster_shifts rs
  left join public.staff s on s.id = rs.staff_id
  left join public.shift_edits se on se.roster_shift_id = rs.id
  -- many older shifts have no pharmacy_id, so those are included too
  where rs.pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' or rs.pharmacy_id is null
)
select
  shift_date, staff, role,
  rostered_start, rostered_end, adjust_minutes,
  round((extract(epoch from (eff_end - eff_start)) / 3600)::numeric, 2) as hours,
  case
    when eff_end <= eff_start then 'Finish at or before start'
    else 'Longer than 12 hrs'
  end as problem
from eff
where eff_start is not null and eff_end is not null
  and (eff_end <= eff_start or extract(epoch from (eff_end - eff_start)) / 3600 > 12)
order by shift_date desc, staff;
