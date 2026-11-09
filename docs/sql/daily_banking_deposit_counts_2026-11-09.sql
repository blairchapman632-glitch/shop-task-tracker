-- Daily Banking — the cash counted for a deposit (9 Nov 2026). Run by Claude against Supabase (project uxpadndskvnlitbubfrw).
-- Banking → "Count the cash" saves the note (and any coin) counts with the deposit, keyed by denomination:
--   {"100": 2, "50": 10, "20": 4, "0.5": 3}   (only denominations with a count; NULL when the counter wasn't used)
-- Additive only: one new nullable column. Existing deposits are unchanged (NULL).
-- New column on an existing table — noted for the RLS pass: bank_deposits.cash_counts.

alter table public.bank_deposits add column if not exists cash_counts jsonb;

-- Check
select column_name, data_type, is_nullable from information_schema.columns
where table_schema = 'public' and table_name = 'bank_deposits' and column_name = 'cash_counts';
