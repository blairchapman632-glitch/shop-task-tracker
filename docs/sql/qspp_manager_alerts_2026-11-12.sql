-- QSPP incidents & feedback: manager alerts + manager-only review section (12 Nov 2026)
--
-- 1. Schema (added by Blair from the Claude chat via Supabase — recorded here for the record):
--      alter table public.incidents add column if not exists manager_opened_at timestamptz;          -- first opened in QSPP manager mode
--      alter table public.feedback  add column if not exists manager_opened_at timestamptz;          -- (clears "New … to review")
--      alter table public.pharmacy_settings add column if not exists qspp_stale_days integer default 14; -- empty = off
--
-- 2. Data (run by Claude, as Blair asked): untick the inactive "Test" staff record as a QSPP manager.
--    Before: staff id 23 (inactive) is_qspp_manager = true.  After: false.
update public.staff set is_qspp_manager = false
where id = 23 and pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and active = false;

-- Check — QSPP managers now
select id, name, active, is_qspp_manager from public.staff
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and is_qspp_manager = true;
