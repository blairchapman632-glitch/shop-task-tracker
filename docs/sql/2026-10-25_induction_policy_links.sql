-- Staff induction Stage 3 — link the v2.2 Section 3 template lines to QSPP Library documents.
-- Run in the Supabase SQL editor. Changes 26 template rows only (document_id); no staff data touched.
-- Matched by exact title (line wording without the "(1.1)" reference), each title unique among active documents.
-- UNMATCHED lines: none — all 26 matched.
-- Inductions already started keep their old copy (no links) — delete test inductions and restart them.

-- Backup
create table induction_template_items_backup_20261025c as select * from public.induction_template_items;

update public.induction_template_items t
set document_id = m.doc_id
from (values
  ('Clinical Governance Framework (1.1)', 'dd35654e-663f-48bd-97a5-6f8db447247e'::uuid),  -- → Clinical Governance Framework
  ('Safety & Quality Roles & Responsibilities (1.1)', 'a233d958-300c-4358-ba81-f7de4dcbd430'::uuid),  -- → Safety & Quality Roles & Responsibilities
  ('Incident Reporting (Procedure) (1.2)', '328f5a3d-da0c-4102-a927-de2e187b8dbf'::uuid),  -- → Incident Reporting (Procedure)
  ('Open Disclosure Policy (1.2)', 'a7aa0ba8-0811-4478-8dc5-f8d97d5e76d6'::uuid),  -- → Open Disclosure Policy
  ('Consumer Feedback & Complaints Policy (1.2)', 'a208e747-552a-4372-93fe-b909d53cd934'::uuid),  -- → Consumer Feedback & Complaints Policy
  ('Privacy & Confidentiality Policy (1.2)', '94304fe7-041e-424a-8358-63285fbcc357'::uuid),  -- → Privacy & Confidentiality Policy (not the "Guide")
  ('Cultural Safety & Awareness Policy (1.3)', 'b4298648-ff31-4574-abb5-7c01dde0bb0e'::uuid),  -- → Cultural Safety & Awareness Policy
  ('Infection Control Guideline (2.6)', '1f3d76f0-a3cd-495b-9e91-8ea20afa3286'::uuid),  -- → Infection Control Guideline (not "Control of Infection Guidelines")
  ('Hand Hygiene (Procedure) (2.6)', '23b69344-f90c-425e-9bf9-567ef612a62f'::uuid),  -- → Hand Hygiene (Procedure)
  ('Staff Immunisation Policy (2.6)', '4d6cf90e-7274-4afd-aa99-8593942d9c56'::uuid),  -- → Staff Immunisation Policy
  ('Staff Infection Prevention & Exclusion Procedure (2.6)', '0b2e897c-e2d8-4c40-a466-d04ef235bc99'::uuid),  -- → Staff Infection Prevention & Exclusion Procedure
  ('Patient Identification Procedure (2.7)', '4d5cd830-14f6-4380-b6e2-2127dab4a528'::uuid),  -- → Patient Identification Procedure
  ('Recognising & Responding to Deterioration Procedure (2.8)', 'b012a98e-bde0-4b10-8807-a06001255731'::uuid),  -- → Recognising & Responding to Deterioration Procedure
  ('Emergency Procedures (4.5)', 'cae7dd3d-b909-430f-9d73-18f58edb2fa2'::uuid),  -- → Emergency Procedures
  ('Grievance & Complaints Policy (4.9)', '01018384-7514-4db2-83b5-fa450a69ca5d'::uuid),  -- → Grievance & Complaints Policy (not the "Form")
  ('Anti-Bullying, Discrimination & Harassment Policy (4.9)', '586744e5-0c51-48ca-b7d7-7ce151879fe6'::uuid),  -- → Anti-Bullying, Discrimination & Harassment Policy
  ('Staff Disciplinary Policy (4.9)', 'ebff79fd-9334-4eeb-b8d0-8b0d8c1a0bd9'::uuid),  -- → Staff Disciplinary Policy
  ('Dress & Behaviour Policy (4.9)', 'fdcc7841-3253-4915-90ce-c4f8ce2b02f7'::uuid),  -- → Dress & Behaviour Policy
  ('Social Media Policy (4.7)', '7d52c86d-20b6-43a2-a4a6-2451fc553859'::uuid),  -- → Social Media Policy
  ('Psychosocial Hazards Procedure (4.5)', '29df6fc4-73ee-45a0-9e7e-53319595ddb4'::uuid),  -- → Psychosocial Hazards Procedure
  ('Scope of Practice Policy (1.3)', '01fed4a8-d005-44e3-b2ca-c39a8f4b14db'::uuid),  -- → Scope of Practice Policy
  ('Evidence-Based Practice & Clinical Resources Register (1.3)', '79ced5ad-cc55-4539-be9c-b3b17d89a284'::uuid),  -- → Evidence-Based Practice & Clinical Resources Register
  ('Referral & Clinical Handover Procedure (2.7)', 'a2328d6c-c4cc-48f1-8755-ecd654b3bac5'::uuid),  -- → Referral & Clinical Handover Procedure
  ('Informed Consent Procedure (3.1)', 'e6c1f733-0271-4051-836c-d3b5c02e5996'::uuid),  -- → Informed Consent Procedure
  ('Healthcare Records Management Policy (1.2)', '22d7c9b9-1b83-418e-ae80-4f0a32355776'::uuid),  -- → Healthcare Records Management Policy
  ('Data Breach Response Plan (4.6)', '89399fc8-510b-449d-9947-ef6514fbb890'::uuid)   -- → Data Breach Response Plan
) as m(wording, doc_id)
where t.pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and t.template_version = 'v2.2'
  and t.section = '3' and t.wording = m.wording;

-- Check (expect 26 linked, 0 unlinked; every title should match its line)
select t.sort_order, t.wording, d.title, d.active
from public.induction_template_items t
left join public.pharmacy_documents d on d.id = t.document_id
where t.pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and t.template_version = 'v2.2' and t.section = '3' and t.active
order by t.sort_order;
select count(*) filter (where document_id is not null) as linked, count(*) filter (where document_id is null) as unlinked
from public.induction_template_items
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and template_version = 'v2.2' and section = '3' and active;
