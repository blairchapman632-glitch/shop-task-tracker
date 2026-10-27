-- Consumables: "Ask what's needed when low" on items (e.g. "Which label numbers?").
-- Run in the Supabase SQL editor. Additive: new columns only, plus switching the option on for 4 items (matched by id).
-- The sheet line snapshots the question and stores the answer; the shopping list item keeps a copy of the answer.

-- Backup (the 4 item rows change)
create table consumable_items_backup_20261027b as select * from public.consumable_items;

-- a) Items: the option + its question
alter table public.consumable_items add column if not exists ask_details boolean not null default false;
alter table public.consumable_items add column if not exists ask_question text;

-- b) Sheet lines: snapshot of the question + the answer given
alter table public.checklist_lines add column if not exists ask_question text;   -- null = item doesn't ask
alter table public.checklist_lines add column if not exists details text;

-- c) Shopping list: the answer, shown next to the item
alter table public.shopping_list_items add column if not exists details text;

-- d) Turn it on
update public.consumable_items set ask_details = true, ask_question = 'Which label numbers?'
where id = '4f4b4903-ed67-450f-961d-9bdad37fd518';   -- Ancillary labels
update public.consumable_items set ask_details = true, ask_question = 'What''s needed?'
where id in (
  '9df5dbf3-e9e8-4e49-b931-906a813cd450',   -- Coffee, tea, Milo, biscuits
  '1ea08a57-643d-48c3-9f6f-c14e0d32eaff',   -- Cleaning products
  'af703411-d61b-4ed6-ab82-1892896d2e03'    -- A4 paper, sticky tape, staples, envelopes (window & plain)
);

-- Check (expect 4 rows with their questions; and 5 new columns)
select name, ask_details, ask_question from public.consumable_items where ask_details order by sort_order;
select table_name, column_name from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'consumable_items' and column_name in ('ask_details', 'ask_question'))
    or (table_name = 'checklist_lines' and column_name in ('ask_question', 'details'))
    or (table_name = 'shopping_list_items' and column_name = 'details'));
