-- Daily Banking — shorter till count help text (9 Nov 2026). Run by Claude against Supabase (project uxpadndskvnlitbubfrw),
-- as Blair asked. Changes two existing help_text values only (matched by key). The Closing EFTPOS help text is unchanged
-- (the till count shows its own closing-receipt help text from 9 Nov 2026).
--
-- Before (backup of the two values):
--   eftpos_t1 Right till EFTPOS: 'Right till — tonight''s reading'
--   eftpos_t2 Left till EFTPOS:  'Left till — tonight''s reading (then switch it off)'
-- To undo:
--   update public.banking_payment_types set help_text = 'Right till — tonight''s reading' where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and key = 'eftpos_t1';
--   update public.banking_payment_types set help_text = 'Left till — tonight''s reading (then switch it off)' where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and key = 'eftpos_t2';

update public.banking_payment_types set help_text = 'Tonight''s reading'
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and key = 'eftpos_t1';

update public.banking_payment_types set help_text = 'Tonight''s reading, then switch it off'
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and key = 'eftpos_t2';

-- Check
select key, name, help_text from public.banking_payment_types
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and key in ('eftpos_t1', 'eftpos_t2', 'eftpos_t3') order by sort_order;
