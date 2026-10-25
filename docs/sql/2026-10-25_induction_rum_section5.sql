-- Staff induction template v2.2 — RUM wording + disposal policy, and Section 5 lines moved out (template stays v2.2).
-- Template only; inductions already started (e.g. test ones) keep their own copy of the lines.

-- a) Backup
create table induction_template_items_backup_20261025d as select * from public.induction_template_items;

-- b) RUM: reword the Getting started line (expect 1 row)
update public.induction_template_items
set wording = 'Shown the RUM bin and what goes in it (not sharps or S8s — those go to the pharmacist)'
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and template_version = 'v2.2' and section = 'start'
  and wording = 'Shown the RUM bin (returned and unwanted medicines) and what goes in it';

-- c) RUM: new Section 3 policy line, All staff, linked to the library document (skipped if already there)
insert into public.induction_template_items
  (pharmacy_id, template_version, section, group_heading, wording, sort_order, positions, pharmacist_only, allowed_answers, kind, document_id)
select '81ab394f-d642-4246-b896-e71938b25671'::uuid, 'v2.2', '3', 'All staff', 'Disposal of Expired & Unwanted Products (Procedure)', 205,
       '{PH,INT,PA,DT}', false, '{done,na}', 'policy', 'a515e7f8-35ae-411e-b9c3-e6ab910a9bdb'::uuid  -- → Disposal of Expired & Unwanted Products (Procedure)
where not exists (
  select 1 from public.induction_template_items
  where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and template_version = 'v2.2' and section = '3'
    and wording = 'Disposal of Expired & Unwanted Products (Procedure)'
);

-- d) Section 5 lines move out (expect 1 row each). Section 5 is then left with only its inactive line.
--    Training page -> Getting started, Chalkboard group, after "The kiosk" (sort 80)
update public.induction_template_items
set section = 'start', group_heading = 'Chalkboard', sort_order = 85, positions = '{PH,INT,PA,DT}'
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and template_version = 'v2.2' and section = '5'
  and wording = 'Shown the Training page in Chalkboard: your training record and how to log training';

--    Training & Development Plan -> Office use, after the student lines (keeps auto_source training_plan)
update public.induction_template_items
set section = 'office', group_heading = null, sort_order = 125
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and template_version = 'v2.2' and section = '5'
  and wording = 'Training & Development Plan created with you';

-- Check — expected (active / inactive):
--   start 17 / 0 · 2 = 4 / 1 · 3 = 27 / 0 · 4 = 13 / 2 · 5 = 0 / 1 · office = 13 / 3  →  74 active
select section,
       count(*) filter (where active) as active,
       count(*) filter (where not active) as inactive
from public.induction_template_items
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and template_version = 'v2.2'
group by section
order by array_position(array['start', '2', '3', '4', '5', 'office'], section);
