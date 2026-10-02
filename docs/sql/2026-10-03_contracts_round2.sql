-- Employment contracts round 2 — run in the Supabase SQL editor, project shop-task-tracker.

-- 0) Backup of the 4 template rows before the fields JSON is edited
create table if not exists contract_templates_backup_20261003 as select * from public.contract_templates;

-- 1) Address no longer required in the contract form (new starter enters it on acceptance)
update public.contract_templates t
set fields = (
  select jsonb_agg(
           case when e->>'key' in ('street_address', 'suburb_state_postcode')
                then e || '{"required": false}'::jsonb else e end
           order by ord)
  from jsonb_array_elements(t.fields) with ordinality as x(e, ord)
)
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671';

-- 2) Handwritten employer signature (path inside the private employment-contracts bucket)
alter table public.pharmacy_settings add column if not exists contract_signature_path text;

-- 3) Staff classification (prefills the contract; saved back on issue)
alter table public.staff add column if not exists classification text;

-- 4) OPTIONAL — only if you OK it: records when the new starter submits the onboarding payroll form,
--    so the New starter tab can show "Onboarding complete". Nothing records this today.
alter table public.staff add column if not exists onboarding_completed_at timestamptz;

-- Check: every template should show false / false
select key,
  (select e->'required' from jsonb_array_elements(fields) e where e->>'key' = 'street_address') as street_required,
  (select e->'required' from jsonb_array_elements(fields) e where e->>'key' = 'suburb_state_postcode') as suburb_required
from public.contract_templates order by key;
