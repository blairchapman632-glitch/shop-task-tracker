-- Daily Banking — correct the 8 Nov 2026 till count for the new rounding (notes to leave = NEAREST $5, not up).
-- Coins $294.35 -> float short $5.65 -> leave $5 in notes (was $10) -> cash takings $335 (was $330).
-- Owner edit, logged in daily_takings_edits like the Month tab's day editor (edited by Blair, staff id 10).
-- Changes ONLY cash_takings (+ updated_at). The cash variance (-$0.65) already uses the exact count, so it stays.
-- Guarded: only applies if the day still shows $330 and hasn't been banked; the log row is only written if it applied.

-- 1. Before (expect: cash_takings 330, counted_cash 634.35, notes_total 340, cash_variance -0.65, bank_deposit_id null)
select takings_date, status, cash_takings, counted_cash, till_coins_total, notes_total, cash_variance, bank_deposit_id
from public.daily_takings
where id = 'edbef9cf-f7fd-40e0-aafa-709983fe94be' and pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671';

-- 2. The edit + its log row
with upd as (
  update public.daily_takings
  set cash_takings = 335, updated_at = now()
  where id = 'edbef9cf-f7fd-40e0-aafa-709983fe94be'
    and pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671'
    and cash_takings = 330
    and bank_deposit_id is null
  returning id, pharmacy_id
)
insert into public.daily_takings_edits (pharmacy_id, daily_takings_id, edited_by_staff_id, before, after, reason)
select pharmacy_id, id, 10, '{"cash_takings": 330}'::jsonb, '{"cash_takings": 335}'::jsonb, 'Rounding changed to nearest $5'
from upd;

-- 3. After (expect: cash_takings 335, everything else unchanged; one edit row with the reason)
select d.takings_date, d.cash_takings, d.cash_variance, e.edited_by_staff_id, e.before, e.after, e.reason, e.edited_at
from public.daily_takings d
left join public.daily_takings_edits e on e.daily_takings_id = d.id
where d.id = 'edbef9cf-f7fd-40e0-aafa-709983fe94be';
