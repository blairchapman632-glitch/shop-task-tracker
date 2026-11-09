-- Daily Banking — Stage 2b: till coins and the dispensary-bag coins counted separately. Run in the Supabase SQL editor.
-- Additive (no rows changed; existing cash_counts rows become location 'till'). No new tables.
--   cash_counts.location   'till' (coins in the till + all notes) | 'bag' (spare coins from the dispensary bag)
--   daily_takings.till_coins_total / bag_coins_total / notes_total — stored in every mode ("Count by coin" or
--   "Total only"); the saved total is the source of truth (per-coin rows kept but ignored in "Total only").

-- ── cash_counts: where the coins were ──
alter table public.cash_counts add column if not exists location text not null default 'till';
alter table public.cash_counts drop constraint if exists cash_counts_location_check;
alter table public.cash_counts add constraint cash_counts_location_check check (location in ('till', 'bag'));

-- One row per day + place + denomination (replaces one per day + denomination)
alter table public.cash_counts drop constraint if exists cash_counts_daily_takings_id_denomination_key;
alter table public.cash_counts drop constraint if exists cash_counts_daily_takings_id_location_denomination_key;
alter table public.cash_counts add constraint cash_counts_daily_takings_id_location_denomination_key
  unique (daily_takings_id, location, denomination);

-- ── daily_takings: the three totals ──
alter table public.daily_takings add column if not exists till_coins_total numeric(12,2);
alter table public.daily_takings add column if not exists bag_coins_total numeric(12,2);
alter table public.daily_takings add column if not exists notes_total numeric(12,2);

-- Check — expect: location column with its check; the new unique constraint (and NOT the old one); 3 new columns
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'public.cash_counts'::regclass and contype in ('u', 'c') order by conname;
select column_name from information_schema.columns
where table_name = 'daily_takings' and column_name in ('till_coins_total', 'bag_coins_total', 'notes_total');
