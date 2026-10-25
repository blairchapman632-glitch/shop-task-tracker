-- Staff induction — template v2.2 (streamlined + new "Getting started" section). Run in the Supabase SQL editor.
-- Updates the template in place (only test inductions exist). Nothing is deleted: removed lines are set inactive.
-- Existing test inductions keep their own copy of the lines (and say v2.1) — delete them from Admin and restart.

-- a) Backup
create table induction_template_items_backup_20261025b as select * from public.induction_template_items;

-- b) Allow the new section key 'start' on both tables
alter table public.induction_template_items drop constraint if exists induction_template_items_section_check;
alter table public.induction_template_items add constraint induction_template_items_section_check
  check (section in ('start', '2', '3', '4', '5', 'office'));
alter table public.staff_induction_items drop constraint if exists staff_induction_items_section_check;
alter table public.staff_induction_items add constraint staff_induction_items_section_check
  check (section in ('start', '2', '3', '4', '5', 'office'));

-- c) Rename v2.1 → v2.2
update public.induction_template_items set template_version = 'v2.2'
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and template_version = 'v2.1';

-- d) Deactivate (expect 6 rows)
update public.induction_template_items set active = false
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and template_version = 'v2.2' and (
  (section = '2' and wording = 'Your safety & quality responsibilities (in your position description)')
  or (section = '4' and wording like 'Ear piercing — trained staff only%')
  or (section = '5' and wording = 'Shown how to access ongoing training on products, services and procedures')
  or (section = 'office' and wording like 'Employment type and award classification recorded%')
  or (section = 'office' and wording = 'Training record started')
  or (section = 'office' and wording = 'Checklist filed in personnel file')
);

-- e) Reword (expect 1 row each)
update public.induction_template_items
set wording = 'Who to go to with a safety or quality concern: the pharmacist on duty, or Blair (pharmacist-in-charge)'
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and template_version = 'v2.2' and section = '2'
  and wording = 'Who the pharmacist in charge is, and who to go to with a safety concern';

update public.induction_template_items
set wording = 'Shown the Training page in Chalkboard: your training record and how to log training'
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and template_version = 'v2.2' and section = '5'
  and wording = 'Shown where your training record is kept';

update public.induction_template_items
set wording = 'Contract signed before the first shift (includes position description, employment type and award classification; part-time: agreed hours), including acknowledgement of the Fair Work information statement(s) — plus CEIS if casual, FTCIS if fixed-term'
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and template_version = 'v2.2' and section = 'office'
  and auto_source = 'contract_accepted';

-- f) New "Getting started" section (skipped if already added)
insert into public.induction_template_items
  (pharmacy_id, template_version, section, group_heading, wording, sort_order, positions, pharmacist_only, allowed_answers, kind, auto_source)
select '81ab394f-d642-4246-b896-e71938b25671'::uuid, 'v2.2', 'start', v.*
from (values
  ('Around the shop', 'Introduced to the team', 10, '{PH,INT,PA,DT}'::text[], false, '{done,na}'::text[], 'manual', null::text),
  ('Around the shop', 'Shop tour: back room, kitchen and staff fridge, toilets, where bags and personal items go', 20, '{PH,INT,PA,DT}', false, '{done,na}', 'manual', null),
  ('Around the shop', 'Staff parking', 30, '{PH,INT,PA,DT}', false, '{done,na}', 'manual', null),
  ('Around the shop', 'Uniform and name badge', 40, '{PH,INT,PA,DT}', false, '{done,na}', 'auto', 'issued_items'),
  ('Around the shop', 'Staff purchases and discount', 50, '{PH,INT,PA,DT}', false, '{done,na}', 'manual', null),
  ('Around the shop', 'Shown the RUM bin (returned and unwanted medicines) and what goes in it', 60, '{PH,INT,PA,DT}', false, '{done,na}', 'manual', null),
  ('Chalkboard', 'Chalkboard on your phone: roster, requesting time off, confirming your wages, messages', 70, '{PH,INT,PA,DT}', false, '{done,na}', 'manual', null),
  ('Chalkboard', 'The kiosk: Today''s Jobs, tasks and Wall notes', 80, '{PH,INT,PA,DT}', false, '{done,na}', 'manual', null),
  ('Systems and equipment', 'POS and loyalty program', 90, '{PH,INT,PA,DT}', false, '{done,na}', 'manual', null),
  ('Systems and equipment', 'Quada', 100, '{PH,INT,PA,DT}', false, '{done,na}', 'manual', null),
  ('Systems and equipment', 'MedAdvisor', 110, '{PH,INT,DT}', false, '{done,na}', 'manual', null),
  ('Systems and equipment', 'Dispensing software', 120, '{PH,INT,DT}', false, '{done,na}', 'manual', null),
  ('Systems and equipment', 'DAA software', 130, '{PH,DT}', false, '{done,na}', 'manual', null),
  ('Systems and equipment', 'Hire equipment and the Hire Book', 140, '{PH,INT,PA,DT}', false, '{done,na}', 'manual', null),
  ('Systems and equipment', 'Phones, printers and classified waste (shredder)', 150, '{PH,INT,PA,DT}', false, '{done,na}', 'manual', null),
  ('Systems and equipment', 'Opening and closing, including the alarm and keys — openers and closers only', 160, '{PH,INT,PA,DT}', false, '{done,na}', 'manual', null)
) as v(group_heading, wording, sort_order, positions, pharmacist_only, allowed_answers, kind, auto_source)
where not exists (
  select 1 from public.induction_template_items
  where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and template_version = 'v2.2' and section = 'start'
);

-- Check — expected (active / inactive):
--   start 16 / 0 · 2 = 4 / 1 · 3 = 26 / 0 · 4 = 14 / 1 · 5 = 2 / 1 · office = 12 / 3  →  74 active, 80 rows, none left at v2.1
select section,
       count(*) filter (where active) as active,
       count(*) filter (where not active) as inactive
from public.induction_template_items
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and template_version = 'v2.2'
group by section
order by array_position(array['start', '2', '3', '4', '5', 'office'], section);
select count(*) as still_v2_1 from public.induction_template_items
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and template_version = 'v2.1';
