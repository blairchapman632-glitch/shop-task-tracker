-- Split "Monthly Claims" into the paper Monthly Tasks board rows — 12 new monthly On the List tasks.
-- Run in the Supabase SQL editor. Each copies task 83's settings (monthly, On the List, 3 points, assigned to the
-- same person, active) except the title; info is left empty (83's info lists the claims). Task 83 is untouched.
-- Re-running skips any title that already exists. Set who each one is assigned to in Admin → Tasks afterwards.

insert into public.tasks
  (title, active, recurrence, days_of_week, due_time, due_date, points, frequency, weekly_day, day_of_month,
   specific_date, sort_index, info, pharmacy_id, assigned_staff_id, start_date, end_date, rollover, show_next_shift,
   created_by_staff_id, task_type, assigned_role, assigned_staff_ids)
select v.title, t.active, t.recurrence, t.days_of_week, t.due_time, t.due_date, t.points, t.frequency, t.weekly_day, t.day_of_month,
       t.specific_date, v.sort_index, null, t.pharmacy_id, t.assigned_staff_id, t.start_date, t.end_date, t.rollover, t.show_next_shift,
       t.created_by_staff_id, t.task_type, t.assigned_role, t.assigned_staff_ids
from public.tasks t
cross join (values
  ('DAA Claim', 1),
  ('IDAA Claim', 2),
  ('Staged Supply Claim', 3),
  ('Naloxone', 4),
  ('Pharma Programs Claim', 5),
  ('PBS Claim', 6),
  ('S8 Scripts', 7),
  ('Accounts', 8),
  ('Consumables Checklist', 9),
  ('Monthly backup', 10),
  ('Pay Statements', 11),
  ('Arthur Statements', 12)
) as v(title, sort_index)
where t.id = 83
  and not exists (
    select 1 from public.tasks x
    where x.pharmacy_id = t.pharmacy_id and x.task_type = 'on_the_list' and lower(x.title) = lower(v.title)
  );

-- Check (expect the 12 new tasks plus Monthly Claims)
select id, title, frequency, task_type, points, assigned_staff_id, active
from public.tasks
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and task_type = 'on_the_list' and frequency = 'monthly_anytime'
order by sort_index, id;
