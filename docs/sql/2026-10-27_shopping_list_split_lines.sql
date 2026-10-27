-- Shopping list: one line per thing to buy. A consumables check line with details "coffee, biscuits" becomes two
-- shopping list lines ("Coffee", "Biscuits"), each linked back to its checklist line.
-- Run in the Supabase SQL editor, in order. Additive except swapping one unique index (no rows deleted).

-- Backup
create table shopping_list_items_backup_20261027c as select * from public.shopping_list_items;

-- a) Each shopping line links to the checklist line it came from (several lines per checklist line now)
alter table public.shopping_list_items add column if not exists checklist_line_id uuid references public.checklist_lines(id) on delete set null;
create index if not exists shopping_list_items_checklist_line_idx on public.shopping_list_items (checklist_line_id);

-- b) Fill it in for items already on the list (from the old one-to-one link checklist_lines.shopping_item_id,
--    which stays in place but is no longer used)
update public.shopping_list_items s set checklist_line_id = l.id
from public.checklist_lines l
where l.shopping_item_id = s.id and s.checklist_line_id is null;

-- c) Old rule "one open copy per consumables item" -> new rule "no duplicate open part on the same checklist line"
--    (stops a double tap / two kiosks adding "Coffee" twice for the same line)
drop index if exists public.shopping_list_items_one_open_item;
create unique index if not exists shopping_list_items_one_open_part
  on public.shopping_list_items (checklist_line_id, lower(name))
  where checklist_line_id is not null and bought_at is null and removed_at is null;

-- Check: the new column, the new index (and the old one gone), and how many existing items got linked
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'shopping_list_items' and column_name = 'checklist_line_id';
select indexname from pg_indexes
where schemaname = 'public' and tablename = 'shopping_list_items' and indexname in ('shopping_list_items_one_open_item', 'shopping_list_items_one_open_part');
select source, count(*) as items, count(checklist_line_id) as linked from public.shopping_list_items group by source;
