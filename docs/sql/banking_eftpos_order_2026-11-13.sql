-- Till count EFTPOS order + Closing EFTPOS help text. 13 Nov 2026 (run by Claude at Blair's request).
-- New order on the till count (and Enter / Tab): Left till (eftpos_t2), Right till (eftpos_t1), then the Previous
-- settlement report — Right till (eftpos_t3, Closing EFTPOS). Arthur's export is fixed by key — not affected.
-- Clears Closing EFTPOS help text ("Last night's final printout from the right till — the receipt kept in the till").

-- Backup first
create table if not exists banking_payment_types_backup_20261113 as select * from public.banking_payment_types;

-- Before: eftpos_t3 = 1, eftpos_t1 = 2, eftpos_t2 = 3
update public.banking_payment_types set sort_order = 1 where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and key = 'eftpos_t2';
update public.banking_payment_types set sort_order = 2 where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and key = 'eftpos_t1';
update public.banking_payment_types set sort_order = 3, help_text = null where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and key = 'eftpos_t3';

-- Check — expect eftpos_t2 = 1, eftpos_t1 = 2, eftpos_t3 = 3 (help_text null)
select key, name, sort_order, help_text from public.banking_payment_types
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and kind = 'eftpos' order by sort_order;
