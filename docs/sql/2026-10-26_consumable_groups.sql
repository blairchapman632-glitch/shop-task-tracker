-- Consumables: optional item Group, and the combined items split into separate grouped items.
-- Run in the Supabase SQL editor. Adds two columns, adds 19 items, groups 1 existing item, makes 7 combined items
-- inactive (not deleted). Sheets already started keep their old combined lines (lines are snapshots).

-- a) Backup
create table consumable_items_backup_20261026 as select * from public.consumable_items;

-- b) Group (free text) on items, and on sheet lines (snapshot — the group as it was that month)
alter table public.consumable_items add column if not exists item_group text;
alter table public.checklist_lines add column if not exists item_group text;

-- c) New grouped items — supplier, delivery time and owner-to-order copied from the original combined item.
--    Sort orders sit where the original was, so each group stays in the same place on the sheet.
insert into public.consumable_items
  (pharmacy_id, name, item_group, supplier_id, check_only, reorder_qty, reorder_unit, delivery_time, owner_to_order, sort_order)
select o.pharmacy_id, v.name, v.grp, o.supplier_id, v.check_only, v.qty, v.unit, o.delivery_time, o.owner_to_order, v.sort_order
from (values
  ('SN Cards (8544) / CN Cards (8547)', 'SN / CN cards – SN Cards (8544)', 'SN / CN cards', false, 50::numeric, 'cards', 31),
  ('SN Cards (8544) / CN Cards (8547)', 'SN / CN cards – CN Cards (8547)', 'SN / CN cards', false, 20, 'cards', 32),
  ('Paper Bags – Medium (PB050) & Large (PB060)', 'Paper bags – Medium (PB050)', 'Paper bags', false, 2, 'bundles', 91),
  ('Paper Bags – Medium (PB050) & Large (PB060)', 'Paper bags – Large (PB060)', 'Paper bags', false, 2, 'bundles', 92),
  ('Tablet bottles – 4 Dram (VIAL004AM) / 16 Dram (VIAL016AM)', 'Tablet bottles – 4 Dram (VIAL004AM)', 'Tablet bottles', true, null, null, 111),
  ('Tablet bottles – 4 Dram (VIAL004AM) / 16 Dram (VIAL016AM)', 'Tablet bottles – 16 Dram (VIAL016AM)', 'Tablet bottles', true, null, null, 112),
  ('Cream Jars – 30g Amber / 120g Amber', 'Cream jars – 30g Amber', 'Cream jars', true, null, null, 121),
  ('Cream Jars – 30g Amber / 120g Amber', 'Cream jars – 120g Amber', 'Cream jars', true, null, null, 122),
  ('Tablet Cartons – 4 sizes (TC003, TC004, TC006, TC007)', 'Tablet cartons – TC003', 'Tablet cartons', true, null, null, 131),
  ('Tablet Cartons – 4 sizes (TC003, TC004, TC006, TC007)', 'Tablet cartons – TC004', 'Tablet cartons', true, null, null, 132),
  ('Tablet Cartons – 4 sizes (TC003, TC004, TC006, TC007)', 'Tablet cartons – TC006', 'Tablet cartons', true, null, null, 133),
  ('Tablet Cartons – 4 sizes (TC003, TC004, TC006, TC007)', 'Tablet cartons – TC007', 'Tablet cartons', true, null, null, 134),
  ('Bottles (liquid) – 50ml Amber Poison (BOTP050AM) / 100ml Amber Round (BOT100AMR) / 200ml Amber Poison (BOTP200AM)', 'Liquid bottles – 50ml Amber Poison (BOTP050AM)', 'Liquid bottles', true, null, null, 141),
  ('Bottles (liquid) – 50ml Amber Poison (BOTP050AM) / 100ml Amber Round (BOT100AMR) / 200ml Amber Poison (BOTP200AM)', 'Liquid bottles – 100ml Amber Round (BOT100AMR)', 'Liquid bottles', true, null, null, 142),
  ('Bottles (liquid) – 50ml Amber Poison (BOTP050AM) / 100ml Amber Round (BOT100AMR) / 200ml Amber Poison (BOTP200AM)', 'Liquid bottles – 200ml Amber Poison (BOTP200AM)', 'Liquid bottles', true, null, null, 143),
  ('Printer toner – Kyocera TK-5244 C/Y/K/M (Office)', 'Office toner – Cyan (TK-5244)', 'Office toner', false, 50, '%', 161),
  ('Printer toner – Kyocera TK-5244 C/Y/K/M (Office)', 'Office toner – Yellow (TK-5244)', 'Office toner', false, 50, '%', 162),
  ('Printer toner – Kyocera TK-5244 C/Y/K/M (Office)', 'Office toner – Black (TK-5244)', 'Office toner', false, 50, '%', 163),
  ('Printer toner – Kyocera TK-5244 C/Y/K/M (Office)', 'Office toner – Magenta (TK-5244)', 'Office toner', false, 50, '%', 164)
) as v(original, name, grp, check_only, qty, unit, sort_order)
join public.consumable_items o
  on o.pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and o.name = v.original
where not exists (
  select 1 from public.consumable_items x
  where x.pharmacy_id = o.pharmacy_id and x.name = v.name
);

-- d) Paper Bags with handles (PB062) is already its own item — keep it (and its history), just group it
update public.consumable_items set item_group = 'Paper bags', sort_order = 93
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and name = 'Paper Bags with handles (PB062)';

-- e) The combined items go inactive (kept for old sheets / history)
update public.consumable_items set active = false
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and name in (
  'SN Cards (8544) / CN Cards (8547)',
  'Paper Bags – Medium (PB050) & Large (PB060)',
  'Tablet bottles – 4 Dram (VIAL004AM) / 16 Dram (VIAL016AM)',
  'Cream Jars – 30g Amber / 120g Amber',
  'Tablet Cartons – 4 sizes (TC003, TC004, TC006, TC007)',
  'Bottles (liquid) – 50ml Amber Poison (BOTP050AM) / 100ml Amber Round (BOT100AMR) / 200ml Amber Poison (BOTP200AM)',
  'Printer toner – Kyocera TK-5244 C/Y/K/M (Office)'
);

-- Check — expect: 19 new + 1 regrouped = 20 grouped items in 7 groups; 7 inactive; 35 active items in all
select item_group, count(*) as items, string_agg(name, ' | ' order by sort_order) as names
from public.consumable_items
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and item_group is not null
group by item_group order by min(sort_order);
select count(*) filter (where active) as active, count(*) filter (where not active) as inactive
from public.consumable_items where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671';
