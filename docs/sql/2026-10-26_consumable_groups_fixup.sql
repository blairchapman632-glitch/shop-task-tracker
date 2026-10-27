-- Consumables grouping fix-up (the first grouping SQL only partly applied — names had been edited). Matched by id.
-- Run in the Supabase SQL editor. Adds 8 items, switches off 3 combined items, renames item 140. Nothing deleted.
-- Supplier / delivery time / owner-to-order copied from each original. Sort orders sit where the original was.

-- a) Backup
create table consumable_items_backup_20261026b as select * from public.consumable_items;

-- b) New split items, copied from their original (by id)
insert into public.consumable_items
  (pharmacy_id, name, item_group, supplier_id, check_only, reorder_qty, reorder_unit, delivery_time, owner_to_order, sort_order)
select o.pharmacy_id, v.name, v.grp, o.supplier_id, v.check_only, v.qty, v.unit, o.delivery_time, o.owner_to_order, v.sort_order
from (values
  -- 1. "SN Cards  / CN Cards" (sort 40)
  ('461cdd20-9f11-4a41-9fc8-bd1d63a30242'::uuid, 'SN / CN cards – SN Cards (8544)', 'SN / CN cards', false, 50::numeric, 'cards', 41),
  ('461cdd20-9f11-4a41-9fc8-bd1d63a30242'::uuid, 'SN / CN cards – CN Cards (8547)', 'SN / CN cards', false, 20, 'cards', 42),
  -- 2. "Paper Bags – Medium (PB050), Large (PB060), Handles (PB062)" (sort 90)
  ('7ebbe5a2-050f-4044-a97f-2ff5dd3da1dc'::uuid, 'Paper bags – Medium (PB050)', 'Paper bags', false, 2, 'bundles', 91),
  ('7ebbe5a2-050f-4044-a97f-2ff5dd3da1dc'::uuid, 'Paper bags – Large (PB060)', 'Paper bags', false, 2, 'bundles', 92),
  ('7ebbe5a2-050f-4044-a97f-2ff5dd3da1dc'::uuid, 'Paper bags – Handles (PB062)', 'Paper bags', false, 20, null, 93),
  -- 3. "Bottles (liquid) – …" (sort 130 — stays just ahead of the tablet cartons, 131–134)
  ('de6ded3f-182b-4efb-8ae2-1d22a65ad751'::uuid, 'Liquid bottles – 50ml Amber Poison (BOTP050AM)', 'Liquid bottles', true, null, null, 126),
  ('de6ded3f-182b-4efb-8ae2-1d22a65ad751'::uuid, 'Liquid bottles – 100ml (BOTM100)', 'Liquid bottles', true, null, null, 127),
  ('de6ded3f-182b-4efb-8ae2-1d22a65ad751'::uuid, 'Liquid bottles – 200ml Amber Poison (BOTP200AM)', 'Liquid bottles', true, null, null, 128)
) as v(original_id, name, grp, check_only, qty, unit, sort_order)
join public.consumable_items o on o.id = v.original_id
where not exists (
  select 1 from public.consumable_items x where x.pharmacy_id = o.pharmacy_id and x.name = v.name
);

-- c) Switch off the three combined originals (kept for old sheets / history).
--    The old inactive "Paper Bags with handles (PB062)" (d984d162…) is left as it is.
update public.consumable_items set active = false
where id in (
  '461cdd20-9f11-4a41-9fc8-bd1d63a30242',   -- SN Cards  / CN Cards
  '7ebbe5a2-050f-4044-a97f-2ff5dd3da1dc',   -- Paper Bags – Medium, Large, Handles
  'de6ded3f-182b-4efb-8ae2-1d22a65ad751'    -- Bottles (liquid) – …
);

-- d) Item 140: dispensary toner only (keep active, no group)
update public.consumable_items set name = 'Printer toner – Kyocera TK-3404 (Dispensary)'
where id = 'da005d95-a50e-458c-a6f9-2f8dd8618a89';

-- e) OPTIONAL — the toner items are NOT "owner to order" at the moment (copied from their originals). If toner
--    should be "Blair to order" as in the original plan, remove the leading "--" from the next two lines:
-- update public.consumable_items set owner_to_order = true
-- where id in ('da005d95-a50e-458c-a6f9-2f8dd8618a89') or (pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and item_group = 'Office toner');

-- Check — expect 7 groups (SN / CN cards 2, Paper bags 3, Tablet bottles 2, Cream jars 2, Liquid bottles 3,
-- Tablet cartons 4, Office toner 4) counting ACTIVE items only, and no active combined items left.
select item_group, count(*) as active_items, string_agg(name, ' | ' order by sort_order) as names
from public.consumable_items
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and active and item_group is not null
group by item_group order by min(sort_order);
select id, sort_order, name, active, owner_to_order from public.consumable_items
where id in ('461cdd20-9f11-4a41-9fc8-bd1d63a30242', '7ebbe5a2-050f-4044-a97f-2ff5dd3da1dc',
             'de6ded3f-182b-4efb-8ae2-1d22a65ad751', 'da005d95-a50e-458c-a6f9-2f8dd8618a89');
