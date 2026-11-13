-- Kiosk "What's on": per-category "Shade the days of a date range" (13 Nov 2026).
-- Additive column (default true = today's behaviour) + turn it off for Promotion at Byford, so back-to-back promotions
-- don't shade every day: they show a dot on the start day and a "Promotion now: …" line instead.
-- New column on an existing table: calendar_categories.shade_ranges.

alter table public.calendar_categories add column if not exists shade_ranges boolean not null default true;

-- Promotion (key 'promotion') at Byford: shading off.  Before: (column didn't exist — every category shaded)
update public.calendar_categories set shade_ranges = false
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' and key = 'promotion';

-- Check — expect Promotion false, every other category true
select key, name, shade_ranges from public.calendar_categories
where pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671' order by sort_order;
