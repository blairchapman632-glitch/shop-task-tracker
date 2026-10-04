-- Training & Development Plan (QSPP 2.4.1.5) — run in the Supabase SQL editor, project shop-task-tracker.
-- Additive only: three new tables + Byford seed rows. No existing rows are changed.
-- RLS: left OFF on all three tables (matches the rest of the app). Add them to the #11 RLS pass.

-- a) Pharmacy-level list of required training
--    kind: one_off | renews (renew_months) | hours (hours_required per training year)
--    roles = exact staff.role values; applies_to_all_staff = everyone with a plan.
--    No roles and not all staff = a person-specific item (only appears via an 'include' override).
create table if not exists public.training_requirements (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  name text not null,
  kind text not null check (kind in ('one_off', 'renews', 'hours')),
  renew_months int,
  hours_required numeric,
  roles text[] not null default '{}',
  applies_to_all_staff boolean not null default false,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists training_requirements_pharmacy_idx on public.training_requirements (pharmacy_id, sort_order);

-- b) Per-person changes to the role list
create table if not exists public.staff_training_overrides (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  staff_id bigint not null references public.staff(id),
  requirement_id uuid not null references public.training_requirements(id),
  action text not null check (action in ('exclude', 'include')),
  created_at timestamptz not null default now(),
  unique (staff_id, requirement_id)
);

-- c) Completions — a new row each time (history kept, never overwritten)
--    document_id points at the staff Documents tab row (locum_documents); cleared if that file is removed.
create table if not exists public.staff_training_completions (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  staff_id bigint not null references public.staff(id),
  requirement_id uuid not null references public.training_requirements(id),
  completed_date date not null,
  expiry_date date,
  document_id bigint references public.locum_documents(id) on delete set null,
  note text,
  recorded_by bigint references public.staff(id),
  created_at timestamptz not null default now()
);
create index if not exists staff_training_completions_staff_idx on public.staff_training_completions (staff_id, requirement_id, completed_date desc);

-- d) Seed Byford's requirements (only if Byford has none yet, so re-running doesn't duplicate)
insert into public.training_requirements (pharmacy_id, name, kind, renew_months, hours_required, roles, applies_to_all_staff, sort_order)
select '81ab394f-d642-4246-b896-e71938b25671'::uuid, v.name, v.kind, v.renew_months, v.hours_required, v.roles, v.all_staff, v.sort_order
from (values
  ('Induction',                'one_off', null::int, null::numeric, '{}'::text[],                                        true,  10),
  ('First aid',                'renews',  36,        null,          '{}'::text[],                                        true,  20),
  ('CPR',                      'renews',  12,        null,          '{}'::text[],                                        true,  30),
  ('S2/S3 or Cert III',        'one_off', null,      null,          array['Pharmacy Assistant','DAA Coordinator'],       false, 40),
  ('Training hours',           'hours',   null,      3,             array['Pharmacy Assistant','DAA Coordinator'],       false, 50),
  ('Immuniser qualification',  'one_off', null,      null,          array['Pharmacist','Intern Pharmacist'],             false, 60),
  ('Immuniser refresher',      'renews',  36,        null,          array['Pharmacist','Intern Pharmacist'],             false, 70),
  ('Anaphylaxis',              'renews',  36,        null,          array['Pharmacist','Intern Pharmacist'],             false, 80),
  ('Intern program',           'one_off', null,      null,          array['Intern Pharmacist'],                          false, 90)
) as v(name, kind, renew_months, hours_required, roles, all_staff, sort_order)
where not exists (
  select 1 from public.training_requirements where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671'
);

-- Check: should list 9 rows
select sort_order, name, kind, renew_months, hours_required, roles, applies_to_all_staff
from public.training_requirements
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671'
order by sort_order;
