-- Daily Banking — closing receipt total (9 Nov 2026). Run by Claude against Supabase (project uxpadndskvnlitbubfrw).
-- The right till's closing receipt shows the WHOLE-DAY total; from 9 Nov 2026 the till count records that receipt total
-- here and calculates Closing EFTPOS = receipt total − the previous day's Right till EFTPOS reading. The calculated amount
-- is still saved as the eftpos_t3 tender, so totals, Bendigo, the Month view and Arthur's export are unchanged.
-- Additive only: one new nullable column. No existing day is changed (days before 9 Nov stay NULL).
-- New column on an existing table — noted for the RLS pass: daily_takings.closing_receipt_total.

alter table public.daily_takings add column if not exists closing_receipt_total numeric(12,2);

-- Check
select column_name, data_type, numeric_precision, numeric_scale, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'daily_takings' and column_name = 'closing_receipt_total';
