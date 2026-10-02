-- Employment contracts (offer of employment) — run in the Supabase SQL editor, project shop-task-tracker.
-- Additive only: new bucket, two new tables, one new pharmacy_settings column. No existing rows are changed
-- except setting contract_signatory_name on Byford's pharmacy_settings row.
-- RLS: left OFF on both new tables (matches the rest of the app). Add both tables + the bucket to the #11 RLS pass.

-- a) Private storage bucket (no public policies; all access via API routes using the service role key)
insert into storage.buckets (id, name, public)
values ('employment-contracts', 'employment-contracts', false)
on conflict (id) do nothing;

-- b) Templates
create table if not exists public.contract_templates (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid,
  key text not null,
  label text not null,
  employment_category text check (employment_category in ('permanent', 'casual')),
  default_roles text[] default '{}',
  file_path text not null,
  fields jsonb not null default '[]'::jsonb,
  info_links jsonb not null default '[]'::jsonb,
  version int not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (pharmacy_id, key)
);

-- c) Issued / accepted contracts
create table if not exists public.employment_contracts (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid,
  staff_id bigint references public.staff(id),
  template_id uuid references public.contract_templates(id),
  template_version int,
  field_values jsonb,  -- named field_values because "values" is a reserved word in Postgres
  status text not null default 'draft' check (status in ('draft', 'issued', 'accepted', 'superseded')),
  issued_file_path text,
  issued_sha256 text,
  issued_at timestamptz,
  accepted_at timestamptz,
  accepted_name text,
  accepted_ip text,
  accepted_user_agent text,
  accepted_file_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists employment_contracts_staff_idx on public.employment_contracts (staff_id, created_at desc);

-- d) Signatory name (config, not code)
alter table public.pharmacy_settings add column if not exists contract_signatory_name text;
update public.pharmacy_settings
set contract_signatory_name = 'Blair Chapman'
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671';

-- e) Seed the four Byford templates
-- Fields drive the Admin form. employee_signature / employee_sign_date are filled at acceptance, so not listed.
-- The "hours" hours_table field fills {mon..sun}_{start,finish,hours} + total_hours.
with
common_head as (select '[
  {"key":"letter_date","label":"Letter date","type":"date","required":true},
  {"key":"employee_full_name","label":"Employee full name","type":"text","required":true},
  {"key":"first_name","label":"First name","type":"text","required":true},
  {"key":"street_address","label":"Street address","type":"text","required":true},
  {"key":"suburb_state_postcode","label":"Suburb, state, postcode","type":"text","required":true},
  {"key":"start_date","label":"Start date","type":"date","required":true}
]'::jsonb as j),
common_tail as (select '[
  {"key":"hourly_rate","label":"Hourly rate","type":"money","required":true},
  {"key":"return_by_date","label":"Return by","type":"date","required":true},
  {"key":"schedule_date","label":"Schedule date","type":"date","required":true},
  {"key":"employer_signature","label":"Employer signatory","type":"text","required":true},
  {"key":"employer_sign_date","label":"Employer sign date","type":"date","required":true}
]'::jsonb as j),
perm_extra as (select '[
  {"key":"employment_type","label":"Employment type","type":"select","options":["Full-time","Part-time"],"required":true},
  {"key":"hours","label":"Ordinary hours","type":"hours_table"},
  {"key":"additional_terms","label":"Additional terms","type":"multiline","default":"Nil."}
]'::jsonb as j),
asst_class as (select '[
  {"key":"classification","label":"Classification","type":"select","required":true,
   "options":["Pharmacy Assistant Level 1","Pharmacy Assistant Level 2","Pharmacy Assistant Level 3"]},
  {"key":"reports_to","label":"Reports to","type":"select","required":true,
   "options":["Retail Manager","Pharmacist in charge"]}
]'::jsonb as j),
fwis as (select '[{"label":"Fair Work Information Statement","url":"https://www.fairwork.gov.au/employment-conditions/information-statements/fair-work-information-statement"}]'::jsonb as j),
ceis as (select '[{"label":"Casual Employment Information Statement","url":"https://www.fairwork.gov.au/employment-conditions/information-statements/casual-employment-information-statement"}]'::jsonb as j)
insert into public.contract_templates
  (pharmacy_id, key, label, employment_category, default_roles, file_path, fields, info_links)
select '81ab394f-d642-4246-b896-e71938b25671'::uuid, t.key, t.label, t.cat, t.roles, 'templates/' || t.key || '.pdf', t.fields, t.links
from (
  select 'perm_pharmacist' as key, 'Permanent Pharmacist' as label, 'permanent' as cat,
         array['Pharmacist','Intern Pharmacist'] as roles,
         (select j from common_head)
         || '[{"key":"classification","label":"Classification","type":"select","required":true,
               "options":["Pharmacist","Experienced pharmacist","Pharmacist in charge","Pharmacist manager"]}]'::jsonb
         || (select j from perm_extra) || (select j from common_tail) as fields,
         (select j from fwis) as links
  union all
  select 'perm_assistant', 'Permanent Pharmacy Assistant', 'permanent',
         array['Pharmacy Assistant','DAA Coordinator'],
         (select j from common_head) || (select j from asst_class) || (select j from perm_extra) || (select j from common_tail),
         (select j from fwis)
  union all
  select 'casual_assistant', 'Casual Pharmacy Assistant', 'casual',
         array['Pharmacy Assistant','DAA Coordinator'],
         (select j from common_head) || (select j from asst_class) || (select j from common_tail),
         (select j from fwis) || (select j from ceis)
  union all
  select 'casual_student', 'Casual Pharmacy Student', 'casual',
         array[]::text[],
         (select j from common_head)
         || '[{"key":"classification","label":"Classification","type":"select","required":true,
               "options":["Pharmacy student — 1st year","Pharmacy student — 2nd year","Pharmacy student — 3rd year","Pharmacy student — 4th year"]},
              {"key":"course","label":"Course","type":"text","required":true}]'::jsonb
         || (select j from common_tail),
         (select j from fwis) || (select j from ceis)
) t
on conflict (pharmacy_id, key) do nothing;

-- Check: should return 4 rows
select key, label, employment_category, default_roles, jsonb_array_length(fields) as n_fields from public.contract_templates order by key;
