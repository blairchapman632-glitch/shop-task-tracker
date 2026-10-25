-- Staff induction (QSPP-4.9-induction-checklist v2.1) — run in the Supabase SQL editor, project shop-task-tracker.
-- Covers all 5 stages of the induction module. Additive only: three new tables, three new columns, and the
-- seeded v2.1 template. No existing rows are changed.
-- RLS: left OFF on the new tables (matches the rest of the app). Add these to the #11 RLS pass:
--   induction_template_items, staff_inductions, staff_induction_items

-- a) Staff flags
alter table public.staff add column if not exists can_sign_inductions boolean not null default false;      -- UI in Stage 2
alter table public.staff add column if not exists paper_induction_on_file boolean not null default false;  -- existing staff

-- b) Template (pharmacy-level). section: '2' | '3' | '4' | '5' | 'office'. positions: any of PH, INT, PA, DT.
create table if not exists public.induction_template_items (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  template_version text not null,                       -- e.g. 'v2.1'
  section text not null check (section in ('2', '3', '4', '5', 'office')),
  group_heading text,                                   -- e.g. 'Dispensary' (null = no sub-heading)
  wording text not null,
  sort_order int not null default 0,
  positions text[] not null default '{PH,INT,PA,DT}',
  pharmacist_only boolean not null default false,       -- only a pharmacist can sign this line off
  allowed_answers text[] not null default '{done,na}',  -- subset of done | na | declined
  kind text not null default 'manual' check (kind in ('manual', 'policy', 'auto')),
  auto_source text,                                     -- Stage 4 key, e.g. 'contract_accepted'
  document_id uuid references public.pharmacy_documents(id) on delete set null,  -- Stage 3 policy link
  note_hint text,                                       -- what to write in the note, e.g. 'Method'
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists induction_template_items_pharmacy_idx
  on public.induction_template_items (pharmacy_id, template_version, active);

-- c) One induction per staff member
create table if not exists public.staff_inductions (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  staff_id bigint not null references public.staff(id),
  supervisor_staff_id bigint references public.staff(id),
  start_date date not null,
  due_date date not null,
  template_version text not null,
  status text not null default 'in_progress' check (status in ('in_progress', 'signed_off')),
  signed_off_by_staff_id bigint references public.staff(id),
  signed_off_at timestamptz,
  employee_confirmed_at timestamptz,
  employee_confirmed_via text check (employee_confirmed_via in ('admin', 'me', 'kiosk')),
  late_reason text,
  pdf_path text,
  created_by bigint references public.staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists staff_inductions_one_per_staff on public.staff_inductions (staff_id);
create index if not exists staff_inductions_pharmacy_idx on public.staff_inductions (pharmacy_id, status);

-- d) Checklist lines: a SNAPSHOT of the template when the induction starts, plus custom "Other" lines
create table if not exists public.staff_induction_items (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  induction_id uuid not null references public.staff_inductions(id) on delete cascade,
  template_item_id uuid references public.induction_template_items(id) on delete set null,  -- null = custom line
  is_custom boolean not null default false,
  section text not null check (section in ('2', '3', '4', '5', 'office')),
  group_heading text,
  wording text not null,
  sort_order int not null default 0,
  pharmacist_only boolean not null default false,
  allowed_answers text[] not null default '{done,na}',
  kind text not null default 'manual' check (kind in ('manual', 'policy', 'auto')),
  auto_source text,
  document_id uuid references public.pharmacy_documents(id) on delete set null,
  note_hint text,
  result text check (result in ('done', 'na', 'declined')),   -- null = not yet
  signed_by_staff_id bigint references public.staff(id),      -- null when ticked from Admin
  signed_via text check (signed_via in ('admin', 'me', 'kiosk', 'auto')),
  signed_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists staff_induction_items_induction_idx on public.staff_induction_items (induction_id, section, sort_order);

-- e) Policy read requests raised by an induction (Stage 3)
alter table public.policy_read_requests add column if not exists induction_id uuid references public.staff_inductions(id) on delete set null;

-- f) Seed the v2.1 template for Byford (skipped if v2.1 is already there)
insert into public.induction_template_items
  (pharmacy_id, template_version, section, group_heading, wording, sort_order, positions, pharmacist_only, allowed_answers, kind, auto_source, note_hint)
select '81ab394f-d642-4246-b896-e71938b25671'::uuid, 'v2.1', v.*
from (values
  -- Section 2 — First week
  ('2', null::text, 'Your safety & quality responsibilities (in your position description)', 10, '{PH,INT,PA,DT}'::text[], false, '{done,na}'::text[], 'manual', null::text, null::text),
  ('2', null, 'Who the pharmacist in charge is, and who to go to with a safety concern', 20, '{PH,INT,PA,DT}', false, '{done,na}', 'manual', null, null),
  ('2', null, 'How to report an incident, near miss or hazard in the Chalkboard incident register', 30, '{PH,INT,PA,DT}', false, '{done,na}', 'manual', null, null),
  ('2', null, 'Emergency exits, assembly point, alarm, fire extinguishers, first aid kit and anaphylaxis kit', 40, '{PH,INT,PA,DT}', false, '{done,na}', 'manual', null, null),
  ('2', null, 'Your immunisation status discussed, and any recommended vaccines (Staff Immunisation Policy)', 50, '{PH,INT,PA,DT}', false, '{done,na,declined}', 'manual', null, null),

  -- Section 3 — First month: policies to read
  ('3', 'All staff', 'Clinical Governance Framework (1.1)', 10, '{PH,INT,PA,DT}', false, '{done,na}', 'policy', null, null),
  ('3', 'All staff', 'Safety & Quality Roles & Responsibilities (1.1)', 20, '{PH,INT,PA,DT}', false, '{done,na}', 'policy', null, null),
  ('3', 'All staff', 'Incident Reporting (Procedure) (1.2)', 30, '{PH,INT,PA,DT}', false, '{done,na}', 'policy', null, null),
  ('3', 'All staff', 'Open Disclosure Policy (1.2)', 40, '{PH,INT,PA,DT}', false, '{done,na}', 'policy', null, null),
  ('3', 'All staff', 'Consumer Feedback & Complaints Policy (1.2)', 50, '{PH,INT,PA,DT}', false, '{done,na}', 'policy', null, null),
  ('3', 'All staff', 'Privacy & Confidentiality Policy (1.2)', 60, '{PH,INT,PA,DT}', false, '{done,na}', 'policy', null, null),
  ('3', 'All staff', 'Cultural Safety & Awareness Policy (1.3)', 70, '{PH,INT,PA,DT}', false, '{done,na}', 'policy', null, null),
  ('3', 'All staff', 'Infection Control Guideline (2.6)', 80, '{PH,INT,PA,DT}', false, '{done,na}', 'policy', null, null),
  ('3', 'All staff', 'Hand Hygiene (Procedure) (2.6)', 90, '{PH,INT,PA,DT}', false, '{done,na}', 'policy', null, null),
  ('3', 'All staff', 'Staff Immunisation Policy (2.6)', 100, '{PH,INT,PA,DT}', false, '{done,na}', 'policy', null, null),
  ('3', 'All staff', 'Staff Infection Prevention & Exclusion Procedure (2.6)', 110, '{PH,INT,PA,DT}', false, '{done,na}', 'policy', null, null),
  ('3', 'All staff', 'Patient Identification Procedure (2.7)', 120, '{PH,INT,PA,DT}', false, '{done,na}', 'policy', null, null),
  ('3', 'All staff', 'Recognising & Responding to Deterioration Procedure (2.8)', 130, '{PH,INT,PA,DT}', false, '{done,na}', 'policy', null, null),
  ('3', 'All staff', 'Emergency Procedures (4.5)', 140, '{PH,INT,PA,DT}', false, '{done,na}', 'policy', null, null),
  ('3', 'All staff', 'Grievance & Complaints Policy (4.9)', 150, '{PH,INT,PA,DT}', false, '{done,na}', 'policy', null, null),
  ('3', 'All staff', 'Anti-Bullying, Discrimination & Harassment Policy (4.9)', 160, '{PH,INT,PA,DT}', false, '{done,na}', 'policy', null, null),
  ('3', 'All staff', 'Staff Disciplinary Policy (4.9)', 170, '{PH,INT,PA,DT}', false, '{done,na}', 'policy', null, null),
  ('3', 'All staff', 'Dress & Behaviour Policy (4.9)', 180, '{PH,INT,PA,DT}', false, '{done,na}', 'policy', null, null),
  ('3', 'All staff', 'Social Media Policy (4.7)', 190, '{PH,INT,PA,DT}', false, '{done,na}', 'policy', null, null),
  ('3', 'All staff', 'Psychosocial Hazards Procedure (4.5)', 200, '{PH,INT,PA,DT}', false, '{done,na}', 'policy', null, null),
  ('3', 'Pharmacists and interns', 'Scope of Practice Policy (1.3)', 210, '{PH,INT}', false, '{done,na}', 'policy', null, null),
  ('3', 'Pharmacists and interns', 'Evidence-Based Practice & Clinical Resources Register (1.3)', 220, '{PH,INT}', false, '{done,na}', 'policy', null, null),
  ('3', 'Pharmacists and interns', 'Referral & Clinical Handover Procedure (2.7)', 230, '{PH,INT}', false, '{done,na}', 'policy', null, null),
  ('3', 'Pharmacists and interns', 'Informed Consent Procedure (3.1)', 240, '{PH,INT}', false, '{done,na}', 'policy', null, null),
  ('3', 'Pharmacists, interns and dispensary technicians', 'Healthcare Records Management Policy (1.2)', 250, '{PH,INT,DT}', false, '{done,na}', 'policy', null, null),
  ('3', 'Pharmacists, interns and dispensary technicians', 'Data Breach Response Plan (4.6)', 260, '{PH,INT,DT}', false, '{done,na}', 'policy', null, null),

  -- Section 4 — Within 3 months: procedures for your role
  ('4', 'All staff', 'Fridge temperature monitoring and what to do in a cold chain breach (4.8)', 10, '{PH,INT,PA,DT}', false, '{done,na}', 'manual', null, null),
  ('4', 'All staff', 'Home deliveries and the deliveries register (2.5)', 20, '{PH,INT,PA,DT}', false, '{done,na}', 'manual', null, null),
  ('4', 'All staff', 'Needle & Syringe Program (2.1)', 30, '{PH,INT,PA,DT}', false, '{done,na}', 'manual', null, null),
  ('4', 'Front of shop', 'Supplying Pharmacy and Pharmacist Only medicines, including recordable S3s (2.3)', 40, '{PA,DT,INT}', true, '{done,na}', 'manual', null, null),
  ('4', 'Front of shop', 'Supplying pseudoephedrine — Project STOP (2.3)', 50, '{PA,DT,INT}', true, '{done,na}', 'manual', null, null),
  ('4', 'Front of shop', 'Ear piercing — trained staff only (2.1)', 60, '{PA,DT,INT}', false, '{done,na}', 'manual', null, null),
  ('4', 'Dispensary', 'Dispensing procedure, including checking and labelling (2.3)', 70, '{PH,INT,DT}', true, '{done,na}', 'manual', null, null),
  ('4', 'Dispensary', 'Controlled drugs (S8) — safe, register and ScriptCheckWA (TBC)', 80, '{PH,INT}', true, '{done,na}', 'manual', null, null),
  ('4', 'Dispensary', 'Dose administration aids, including medicines not suitable for packing (2.3)', 90, '{PH,INT,DT}', true, '{done,na}', 'manual', null, null),
  ('4', 'Dispensary', 'Staged supply — agreements and records (2.1)', 100, '{PH,INT,DT}', true, '{done,na}', 'manual', null, null),
  ('4', 'Dispensary', 'Simple compounding and worksheet (2.3)', 110, '{PH,INT,DT}', true, '{done,na}', 'manual', null, null),
  ('4', 'Pharmacist services', 'Vaccination service, including cold chain and anaphylaxis / adverse event response (2.1)', 120, '{PH}', true, '{done,na}', 'manual', null, null),
  ('4', 'Pharmacist services', 'MedsCheck and Diabetes MedsCheck (2.1)', 130, '{PH,INT}', true, '{done,na}', 'manual', null, null),
  ('4', 'Pharmacist services', 'Home Medicines Review (2.1)', 140, '{PH}', true, '{done,na}', 'manual', null, null),
  ('4', 'Pharmacist services', 'Health checks — blood pressure, diabetes and cardiovascular screening; equipment calibration (2.1)', 150, '{PH,INT}', true, '{done,na}', 'manual', null, null),

  -- Section 5 — Your training
  ('5', null, 'Training & Development Plan created with you', 10, '{PH,INT,PA,DT}', false, '{done,na}', 'auto', 'training_plan', null),
  ('5', null, 'Shown where your training record is kept', 20, '{PH,INT,PA,DT}', false, '{done,na}', 'manual', null, null),
  ('5', null, 'Shown how to access ongoing training on products, services and procedures', 30, '{PH,INT,PA,DT}', false, '{done,na}', 'manual', null, null),

  -- Office use
  ('office', null, 'Recruitment interview notes filed (QSPP 2.4.1.1c)', 10, '{PH,INT,PA,DT}', false, '{done,na}', 'manual', null, null),
  ('office', null, 'Contract signed before the first shift (includes position description incl. safety & quality responsibilities), including acknowledgement of the Fair Work information statement(s) — plus CEIS if casual, FTCIS if fixed-term', 20, '{PH,INT,PA,DT}', false, '{done,na}', 'auto', 'contract_accepted', null),
  ('office', null, 'Employment type and award classification recorded (part-time: agreed hours in writing)', 30, '{PH,INT,PA,DT}', false, '{done,na}', 'auto', 'payroll', null),
  ('office', null, 'Right to work checked, including any work-hour limits', 40, '{PH,INT,PA,DT}', false, '{done,na}', 'manual', null, 'Method'),
  ('office', null, 'Personal details and emergency contacts on file', 50, '{PH,INT,PA,DT}', false, '{done,na}', 'auto', 'emergency_contacts', null),
  ('office', null, 'AHPRA registration checked', 60, '{PH,INT,PA}', false, '{done,na}', 'auto', 'doc_ahpra', null),
  ('office', null, 'Professional indemnity insurance sighted', 70, '{PH}', false, '{done,na}', 'auto', 'doc_indemnity', null),
  ('office', null, 'Immuniser qualification sighted (if giving vaccines)', 80, '{PH}', false, '{done,na}', 'auto', 'service_vaccinating', null),
  ('office', null, 'S2/S3 training (assistants, technicians) or dispensary qualification (technicians) on file', 90, '{PA,DT}', false, '{done,na}', 'auto', 'doc_s2s3', null),
  ('office', null, 'First aid / CPR certificate sighted (if a first-aider)', 100, '{PH,INT,PA,DT}', false, '{done,na}', 'auto', 'doc_first_aid', null),
  ('office', null, 'Student placement agreement on file (if applicable)', 110, '{PH,INT,PA,DT}', false, '{done,na}', 'manual', null, null),
  ('office', null, 'Students: university, course and current year of course recorded', 120, '{PH,INT,PA,DT}', false, '{done,na}', 'manual', null, 'University, course, year'),
  ('office', null, 'Training record started', 130, '{PH,INT,PA,DT}', false, '{done,na}', 'auto', 'training_record', null),
  ('office', null, 'Checklist filed in personnel file', 140, '{PH,INT,PA,DT}', false, '{done,na}', 'auto', 'pdf_filed', null)
) as v(section, group_heading, wording, sort_order, positions, pharmacist_only, allowed_answers, kind, auto_source, note_hint)
where not exists (
  select 1 from public.induction_template_items
  where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and template_version = 'v2.1'
);

-- Check (expect: 2 staff columns, 1 policy_read_requests column, and template counts
--   section 2 = 5, 3 = 26, 4 = 15, 5 = 3, office = 14 → 63 in total)
select table_name, column_name, data_type, column_default from information_schema.columns
where table_schema = 'public' and (
  (table_name = 'staff' and column_name in ('can_sign_inductions', 'paper_induction_on_file'))
  or (table_name = 'policy_read_requests' and column_name = 'induction_id')
);
select section, count(*) from public.induction_template_items
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and template_version = 'v2.1'
group by section order by section;
