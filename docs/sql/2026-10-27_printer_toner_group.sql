-- Consumables: all printer toners in one group "Printer toner" (matched by id). Run in the Supabase SQL editor.
-- Renames 5 items and regroups them; nothing added or deleted. Sheets already started keep their old names (snapshots).

-- Backup
create table consumable_items_backup_20261027 as select * from public.consumable_items;

-- Office toners: group "Office toner" -> "Printer toner", names "Printer toner – Office <colour> (TK-5244)"
update public.consumable_items set item_group = 'Printer toner', name = 'Printer toner – Office Cyan (TK-5244)'
where id = '08868693-12a8-493e-85a3-9e824d8a9e02';
update public.consumable_items set item_group = 'Printer toner', name = 'Printer toner – Office Yellow (TK-5244)'
where id = '46b14224-27aa-4461-a87e-e034cf27c4bd';
update public.consumable_items set item_group = 'Printer toner', name = 'Printer toner – Office Black (TK-5244)'
where id = '8d4c4d36-6ea0-4ff7-8437-311f403b28c7';
update public.consumable_items set item_group = 'Printer toner', name = 'Printer toner – Office Magenta (TK-5244)'
where id = 'ecf15a74-e63c-4888-8eed-ac74418d221f';

-- Dispensary toner joins the group, first (sort 160 — just ahead of the office colours at 161–164)
update public.consumable_items
set item_group = 'Printer toner', name = 'Printer toner – Dispensary (TK-3404)', sort_order = 160
where id = 'da005d95-a50e-458c-a6f9-2f8dd8618a89';

-- Check (expect 5 rows, all "Printer toner", Dispensary first; and no "Office toner" group left)
select id, sort_order, item_group, name, active from public.consumable_items
where id in ('da005d95-a50e-458c-a6f9-2f8dd8618a89', '08868693-12a8-493e-85a3-9e824d8a9e02', '46b14224-27aa-4461-a87e-e034cf27c4bd',
             '8d4c4d36-6ea0-4ff7-8437-311f403b28c7', 'ecf15a74-e63c-4888-8eed-ac74418d221f')
order by sort_order;
select count(*) as office_toner_left from public.consumable_items
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and item_group = 'Office toner';
