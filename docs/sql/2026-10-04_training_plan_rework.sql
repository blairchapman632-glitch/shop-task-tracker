-- Training & Development Plan — rework (simplify). Run in the Supabase SQL editor, project shop-task-tracker.
-- Additive, plus one small data change: deactivates 7 training_requirements rows (nothing is deleted or dropped).
-- RLS: left OFF on the two new tables (matches the rest of the app). Add them to the #11 RLS pass.

-- a) Backup of the rows being changed in (f)
create table if not exists public.training_requirements_backup_20261004 as
select * from public.training_requirements;

-- b) Plan settings (config, not code)
alter table public.pharmacy_settings add column if not exists training_hours_per_year numeric not null default 3;
alter table public.pharmacy_settings add column if not exists training_s2s3_doc_type text not null default 's2_s3_cert';
alter table public.pharmacy_settings add column if not exists training_plan_roles text[] not null default array['Pharmacy Assistant', 'DAA Coordinator'];

-- c) Certificate expiry on staff Documents
alter table public.locum_documents add column if not exists expiry_date date;

-- d) Manual training goals (all staff except locums)
create table if not exists public.staff_training_goals (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  staff_id bigint not null references public.staff(id),
  goal text not null,
  notes text,
  done boolean not null default false,
  done_at timestamptz,
  created_by bigint references public.staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists staff_training_goals_staff_idx on public.staff_training_goals (staff_id, created_at);

-- e) "Not required this training year" (per person, per training year)
create table if not exists public.staff_training_exemptions (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  staff_id bigint not null references public.staff(id),
  training_year_start date not null,
  reason text,
  created_by bigint references public.staff(id),
  created_at timestamptz not null default now(),
  unique (staff_id, training_year_start)
);

-- f) Deactivate the plan items that are no longer used (rows kept)
update public.training_requirements
set active = false
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671'
  and name in ('Induction', 'First aid', 'CPR', 'Immuniser qualification', 'Immuniser refresher', 'Anaphylaxis', 'Intern program');

-- Check
select name, active from public.training_requirements
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' order by sort_order;
select training_hours_per_year, training_s2s3_doc_type, training_plan_roles from public.pharmacy_settings
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671';
