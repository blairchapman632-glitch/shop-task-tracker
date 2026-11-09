-- Daily Banking — when banking is tracked from. "Cash not yet banked" (Banking tab + weekly email) lists confirmed
-- days on or after this date with no deposit, whatever their source (app or import). Earlier days were banked under
-- the old spreadsheet and never show. Additive only. New column on an existing table — noted for the RLS pass.

alter table public.pharmacy_settings add column if not exists banking_start_date date;

update public.pharmacy_settings
set banking_start_date = '2026-11-02'
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671';

-- Check — expect 2026-11-02
select banking_start_date from public.pharmacy_settings where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671';

-- What will show as waiting (expect 2–8 Nov 2026 trading days with cash)
select takings_date, source, cash_takings
from public.daily_takings
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671'
  and status = 'confirmed' and bank_deposit_id is null and cash_takings > 0
  and takings_date >= '2026-11-02'
order by takings_date;
