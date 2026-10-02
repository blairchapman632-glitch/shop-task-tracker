-- Contract signatory title — run in the Supabase SQL editor, project shop-task-tracker.
alter table public.pharmacy_settings add column if not exists contract_signatory_title text;

update public.pharmacy_settings
set contract_signatory_title = 'Director'
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671';

-- Check: should show Blair Chapman / Director
select contract_signatory_name, contract_signatory_title
from public.pharmacy_settings
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671';
