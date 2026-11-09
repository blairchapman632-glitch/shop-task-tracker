-- Daily Banking — Stages 5 & 7. Run in the Supabase SQL editor BEFORE the import's --commit run.
-- Additive only. No new tables (new columns / rows noted for the RLS pass list in CLAUDE.md).

-- ── Stage 5: payment types the old spreadsheets used (inactive — they only appear on imported days) ──
insert into public.banking_payment_types (pharmacy_id, key, name, kind, counts_to_bendigo, active, sort_order)
select '81ab394f-d642-4246-b896-e71938b25671'::uuid, v.key, v.name, 'other', false, false, v.sort_order
from (values
  ('amex',         'Amex',      7),
  ('cheque',       'Cheque',    8),
  ('life_club',    'Life Club', 9),
  ('other_legacy', 'Other',     10)
) as v(key, name, sort_order)
on conflict (pharmacy_id, key) do nothing;

-- ── Stage 7: who gets the weekly banking summary email (empty = no email) ──
alter table public.pharmacy_settings add column if not exists banking_summary_email text;

-- Check — expect 10 payment types (the 4 new ones inactive, 7–10) and the new settings column
select sort_order, key, name, kind, counts_to_bendigo, active from public.banking_payment_types
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' order by sort_order;
select banking_summary_email from public.pharmacy_settings where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671';
