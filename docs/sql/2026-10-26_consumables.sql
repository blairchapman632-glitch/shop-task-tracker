-- Part B — Consumables checklist (+ the shopping list table Part C will use). Run in the Supabase SQL editor.
-- Additive only: two new pharmacy_settings columns (filled in for Byford), five new tables, seeded suppliers + items.
-- RLS: left OFF (matches the rest of the app). Add to the #11 RLS pass:
--   consumable_suppliers, consumable_items, checklist_sheets, checklist_lines, shopping_list_items
-- Table names are generic on purpose (checklist_sheets / checklist_lines, kind = 'consumables') so another task's
-- checklist could reuse them later.

-- a) Settings (config, not code): who the "owner to order" person is, and which task the checklist is attached to
alter table public.pharmacy_settings add column if not exists consumables_owner_staff_id bigint references public.staff(id);
alter table public.pharmacy_settings add column if not exists consumables_task_id bigint references public.tasks(id) on delete set null;
update public.pharmacy_settings
set consumables_owner_staff_id = coalesce(consumables_owner_staff_id, 10),   -- Blair Chapman
    consumables_task_id = coalesce(consumables_task_id, 116)                -- "Consumables Checklist" (monthly, On the List)
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671';

-- b) Suppliers
create table if not exists public.consumable_suppliers (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  name text not null,
  phone text,
  website text,                    -- website or email
  notes text,                      -- free text, multi-line
  supplier_type text not null default 'order' check (supplier_type in ('order', 'in_person')),  -- Order / Buy in person
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists consumable_suppliers_pharmacy_idx on public.consumable_suppliers (pharmacy_id, sort_order);

-- c) Items
create table if not exists public.consumable_items (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  name text not null,                                    -- incl. product codes
  supplier_id uuid references public.consumable_suppliers(id) on delete set null,
  check_only boolean not null default false,             -- "Check only": Low? yes/no, no number
  reorder_qty numeric,                                   -- reorder point (at or below = order); null when check only
  reorder_unit text,                                     -- e.g. "rolls", "boxes", "%"
  delivery_time text,                                    -- e.g. "2–3 weeks"
  owner_to_order boolean not null default false,         -- "Blair to order" (the owner set in pharmacy_settings)
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (check_only or reorder_qty is not null)
);
create index if not exists consumable_items_pharmacy_idx on public.consumable_items (pharmacy_id, sort_order);

-- d) One sheet per checklist task per month (the month it counts for — a carried-over month keeps its own month)
create table if not exists public.checklist_sheets (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  kind text not null default 'consumables',
  task_id bigint not null references public.tasks(id) on delete cascade,
  period_month date not null check (extract(day from period_month) = 1),   -- "YYYY-MM-01"
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  started_by_staff_id bigint references public.staff(id),
  started_at timestamptz not null default now(),
  completed_by_staff_id bigint references public.staff(id),
  completed_at timestamptz,
  owner_notified_at timestamptz
);
create unique index if not exists checklist_sheets_one_per_month on public.checklist_sheets (task_id, period_month);
create index if not exists checklist_sheets_pharmacy_idx on public.checklist_sheets (pharmacy_id, period_month);

-- e) Shopping list (kiosk card + modal in Part C). Items from the consumables check link back to their line.
create table if not exists public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  name text not null,
  supplier_id uuid references public.consumable_suppliers(id) on delete set null,   -- the shop (null = Other)
  consumable_item_id uuid references public.consumable_items(id) on delete set null,
  source text not null default 'manual' check (source in ('manual', 'consumables')),
  added_by_staff_id bigint references public.staff(id),   -- null for "Consumables check"
  created_at timestamptz not null default now(),
  bought_at timestamptz,
  bought_by_staff_id bigint references public.staff(id),
  removed_at timestamptz,                                 -- removed by mistake: kept, not deleted
  removed_by_staff_id bigint references public.staff(id)
);
-- An item from the consumables list can only be open once (no duplicates while it's still to buy)
create unique index if not exists shopping_list_items_one_open_item on public.shopping_list_items (consumable_item_id)
  where consumable_item_id is not null and bought_at is null and removed_at is null;
create index if not exists shopping_list_items_pharmacy_idx on public.shopping_list_items (pharmacy_id, bought_at, removed_at);

-- f) Sheet lines: a SNAPSHOT of the item + supplier as they were that month, plus what was entered
create table if not exists public.checklist_lines (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  sheet_id uuid not null references public.checklist_sheets(id) on delete cascade,
  item_id uuid references public.consumable_items(id) on delete set null,
  sort_order int not null default 0,
  -- snapshot
  item_name text not null,
  supplier_id uuid,
  supplier_name text,
  supplier_type text,
  supplier_phone text,
  supplier_website text,
  supplier_notes text,
  delivery_time text,
  check_only boolean not null default false,
  reorder_qty numeric,
  reorder_unit text,
  owner_to_order boolean not null default false,
  -- entry
  qty_on_hand numeric,
  is_low boolean,
  result text check (result in ('ok', 'order', 'owner', 'shopping')),
  entered_by_staff_id bigint references public.staff(id),
  entered_at timestamptz,
  -- ordering (Order and Owner lines)
  ordered boolean not null default false,
  ordered_by_staff_id bigint references public.staff(id),
  ordered_at timestamptz,
  -- shopping (Buy-in-person lines): filled when the linked shopping list item is ticked Bought (even after the sheet is done)
  shopping_item_id uuid references public.shopping_list_items(id) on delete set null,
  bought_by_staff_id bigint references public.staff(id),
  bought_at timestamptz
);
create index if not exists checklist_lines_sheet_idx on public.checklist_lines (sheet_id, sort_order);
create index if not exists checklist_lines_item_idx on public.checklist_lines (item_id);

-- g) Seed suppliers (skipped if any exist)
insert into public.consumable_suppliers (pharmacy_id, name, phone, website, notes, supplier_type, sort_order)
select '81ab394f-d642-4246-b896-e71938b25671'::uuid, v.*
from (values
  ('Paramount Print', '9328 7699', null::text, 'Ask for same as last time', 'order', 10),
  ('Medicare', '13 22 90', null, 'Approval Number 51731Q. Online: www.humanservices.gov.au, search PB185, print the form, fill it in and email to pbs.general.orders@humanservices.gov.au', 'order', 20),
  ('Stirling Fildes', null, null, 'Order by telephone', 'order', 30),
  ('API', null, 'myAPI website', null, 'order', 40),
  ('Ink Station', '1300 655 943', 'inkstation.com.au', null, 'order', 50),
  ('Bank', null, null, null, 'order', 60),
  ('Blair', null, null, 'Internal', 'order', 70),
  ('Supermarket', null, null, null, 'in_person', 80),
  ('Newsagent', null, null, null, 'in_person', 90),
  ('Post Office', null, null, null, 'in_person', 100)
) as v(name, phone, website, notes, supplier_type, sort_order)
where not exists (select 1 from public.consumable_suppliers where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671');

-- h) Seed items in display order (skipped if any exist)
insert into public.consumable_items
  (pharmacy_id, name, supplier_id, check_only, reorder_qty, reorder_unit, delivery_time, owner_to_order, sort_order)
select '81ab394f-d642-4246-b896-e71938b25671'::uuid, v.name, s.id, v.check_only, v.qty, v.unit, v.delivery, v.owner, v.sort_order
from (values
  ('Prescription labels', 'Paramount Print', false, 30::numeric, 'rolls', '2–3 weeks', false, 10),
  ('Repeat forms (3571)', 'Medicare', false, 1.5, 'boxes', '1–2 weeks', true, 20),
  ('SN Cards (8544) / CN Cards (8547)', 'Medicare', false, 50, 'SN cards (CN 20)', '1–2 weeks', true, 30),
  ('PBS Envelopes (8214)', 'Medicare', false, 10, null, '1–2 weeks', true, 40),
  ('Repeat folders', 'Blair', false, 3, 'bundles', '1–2 weeks', true, 50),
  ('Till Rolls (TR085)', 'Stirling Fildes', false, 20, 'rolls', '2 weeks', false, 60),
  ('Shelf Labels – Board 44 per sheet (PO074)', 'Stirling Fildes', false, 0, 'sheets', '1 week', false, 70),
  ('Ancillary labels', 'Stirling Fildes', true, null, null, '1 week', false, 80),
  ('Paper Bags with handles (PB062)', 'Stirling Fildes', false, 20, null, '1–2 days', false, 90),
  ('Paper Bags – Medium (PB050) & Large (PB060)', 'Stirling Fildes', false, 2, 'bundles', '1–2 days', false, 100),
  ('Tablet bottles – 4 Dram (VIAL004AM) / 16 Dram (VIAL016AM)', 'Stirling Fildes', true, null, null, '1–2 days', false, 110),
  ('Cream Jars – 30g Amber / 120g Amber', 'Stirling Fildes', true, null, null, '1–2 days', false, 120),
  ('Tablet Cartons – 4 sizes (TC003, TC004, TC006, TC007)', 'Stirling Fildes', true, null, null, '1–2 days', false, 130),
  ('Bottles (liquid) – 50ml Amber Poison (BOTP050AM) / 100ml Amber Round (BOT100AMR) / 200ml Amber Poison (BOTP200AM)', 'Stirling Fildes', true, null, null, '1–2 days', false, 140),
  ('Printer toner – Kyocera TK-3164 (Dispensary)', 'Ink Station', false, 50, '%', null, true, 150),
  ('Printer toner – Kyocera TK-5244 C/Y/K/M (Office)', 'Ink Station', false, 50, '%', null, true, 160),
  ('Vaccine bags (PDE 426733)', 'API', false, 20, null, 'next day', false, 170),
  ('Paper Towel (PDE 395188)', 'API', false, 3, null, 'next day', false, 180),
  ('EFTPOS rolls', 'Bank', false, 6, 'rolls', null, false, 190),
  ('Stamps', 'Post Office', true, null, null, null, false, 200),
  ('A4 paper, sticky tape, staples, envelopes (window & plain)', 'Newsagent', true, null, null, null, false, 210),
  ('Coffee, tea, Milo, biscuits', 'Supermarket', true, null, null, null, false, 220),
  ('Cleaning products', 'Supermarket', true, null, null, '1 week', false, 230)
) as v(name, supplier, check_only, qty, unit, delivery, owner, sort_order)
left join public.consumable_suppliers s
  on s.pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and s.name = v.supplier
where not exists (select 1 from public.consumable_items where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671');

-- Check — expect: suppliers order 7 / in_person 3; items 23, with_supplier 23, owner_items 6, check_only 9;
--   settings 10 / 116
select supplier_type, count(*) from public.consumable_suppliers
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' group by supplier_type;
select count(*) as items, count(supplier_id) as with_supplier, count(*) filter (where owner_to_order) as owner_items,
       count(*) filter (where check_only) as check_only
from public.consumable_items where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671';
select consumables_owner_staff_id, consumables_task_id from public.pharmacy_settings
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671';
