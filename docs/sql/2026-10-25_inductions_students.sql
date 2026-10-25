-- Staff induction — student lines (follow-up to 2026-10-25_inductions.sql). Run in the Supabase SQL editor.
-- Students are set up as Pharmacy Assistants; student-only lines are included only when the induction is ticked
-- "Pharmacy student". Additive except step c, which changes 3 template rows (no staff data touched).

-- a) Flags
alter table public.induction_template_items add column if not exists student_only boolean not null default false;
alter table public.staff_induction_items add column if not exists student_only boolean not null default false;  -- snapshot copy
alter table public.staff_inductions add column if not exists is_student boolean not null default false;

-- b) Backup of the template before changing it
create table induction_template_items_backup_20261025 as select * from public.induction_template_items;

-- c) Student-only lines; AHPRA back to pharmacists and interns
update public.induction_template_items set student_only = true
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and template_version = 'v2.1' and section = 'office'
  and wording in ('Student placement agreement on file (if applicable)', 'Students: university, course and current year of course recorded');

update public.induction_template_items set positions = '{PH,INT}'
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and template_version = 'v2.1' and section = 'office'
  and wording = 'AHPRA registration checked';

-- d) Second AHPRA line for students (manual — students' registration isn't in Staff Documents)
insert into public.induction_template_items
  (pharmacy_id, template_version, section, group_heading, wording, sort_order, positions, pharmacist_only, allowed_answers, kind, auto_source, note_hint, student_only)
select '81ab394f-d642-4246-b896-e71938b25671'::uuid, 'v2.1', 'office', null, 'AHPRA student registration checked', 65, '{PA}', false, '{done,na}', 'manual', null, null, true
where not exists (
  select 1 from public.induction_template_items
  where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and template_version = 'v2.1' and wording = 'AHPRA student registration checked'
);

-- Check (expect 3 student_only rows; AHPRA registration checked = {PH,INT}; 64 rows in total)
select wording, positions, student_only from public.induction_template_items
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and template_version = 'v2.1'
  and (student_only or wording like 'AHPRA%')
order by sort_order;
select count(*) from public.induction_template_items
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and template_version = 'v2.1';
