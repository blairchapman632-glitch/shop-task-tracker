-- Daily Banking — till names, help text, order, and the "no closing EFTPOS" tick. Run in the Supabase SQL editor
-- BEFORE using the updated till count (it saves the new column). Additive only (two new columns, renames, re-order).
-- New columns on existing tables (for the RLS pass): banking_payment_types.help_text, daily_takings.no_closing_eftpos.
--
-- The right till is the main one: it does "Zero and Print" and the closing printout; the left till is switched off at
-- the Z close. Matched by KEY — Arthur's export keeps EFPTOS 1 / EFPTOS 2 / Extra EFTPOS by key, so names never matter.

-- 1. Help text shown under each field on the till count (editable in Admin → Settings → Daily Banking)
alter table public.banking_payment_types add column if not exists help_text text;

-- 2. Names, help text and order: Closing EFTPOS, Right till, Left till, then the rest as they were
update public.banking_payment_types t
set name = v.name, help_text = v.help_text, sort_order = v.sort_order
from (values
  ('eftpos_t3', 'Closing EFTPOS',    'Last night''s final printout from the right till — the receipt kept in the till', 1),
  ('eftpos_t1', 'Right till EFTPOS', 'Right till — tonight''s reading',                                                 2),
  ('eftpos_t2', 'Left till EFTPOS',  'Left till — tonight''s reading (then switch it off)',                             3)
) as v(key, name, help_text, sort_order)
where t.pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and t.key = v.key;

-- 3. The till count's tick: "No EFTPOS after the Z close last night (no closing printout)"
alter table public.daily_takings add column if not exists no_closing_eftpos boolean not null default false;

-- Check — expect Closing EFTPOS (1), Right till EFTPOS (2), Left till EFTPOS (3), MedAdvisor (4) … Other (10)
select sort_order, key, name, help_text, active from public.banking_payment_types
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' order by sort_order;
select column_name, data_type, column_default from information_schema.columns
where table_name = 'daily_takings' and column_name = 'no_closing_eftpos';
