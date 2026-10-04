-- Pharmacist services + staff Documents rework — run in the Supabase SQL editor, project shop-task-tracker.
-- Additive only: three new tables, three new locum_documents columns, Byford seed rows. No existing rows are changed.
-- RLS: left OFF on the three new tables (matches the rest of the app). Add them to the #11 RLS pass.

-- a) Services a pharmacist can provide (editable in Admin → QSPP → Training). Hide = active false, never delete.
create table if not exists public.pharmacist_services (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  name text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- b) Certificates each service needs. renew_months null = one-off (no expiry).
create table if not exists public.service_certificates (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  service_id uuid not null references public.pharmacist_services(id),
  name text not null,
  renew_months int,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists service_certificates_service_idx on public.service_certificates (service_id, sort_order);

-- c) Which services each pharmacist/intern provides (Profile ticks). Untick = active false (row kept).
create table if not exists public.staff_services (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null,
  staff_id bigint not null references public.staff(id),
  service_id uuid not null references public.pharmacist_services(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (staff_id, service_id)
);

-- d) Staff Documents: link service-certificate files to their certificate, completion date, name for "Other qualifications"
--    Service certificate files use type 'service_cert'; expiry = completion_date + renew_months, worked out live.
alter table public.locum_documents add column if not exists service_certificate_id uuid references public.service_certificates(id);
alter table public.locum_documents add column if not exists completion_date date;
alter table public.locum_documents add column if not exists title text;

-- e) Seed Byford (only if Byford has no services yet, so re-running doesn't duplicate)
do $$
declare
  ph uuid := '81ab394f-d642-4246-b896-e71938b25671';
  svc uuid;
begin
  if exists (select 1 from public.pharmacist_services where pharmacy_id = ph) then
    return;
  end if;

  insert into public.pharmacist_services (pharmacy_id, name, sort_order) values (ph, 'Vaccinating', 10) returning id into svc;
  insert into public.service_certificates (pharmacy_id, service_id, name, renew_months, sort_order) values
    (ph, svc, 'Immunisation course', null, 10),
    (ph, svc, 'CPR', 12, 20),
    (ph, svc, 'First aid', 36, 30),
    (ph, svc, 'ASCIA anaphylaxis', 12, 40),
    (ph, svc, 'Annual Immunisation Update', 12, 50),
    (ph, svc, 'Influenza module', 12, 60),
    (ph, svc, 'Cold chain management', 12, 70);

  insert into public.pharmacist_services (pharmacy_id, name, sort_order) values (ph, 'Medication reviews', 20) returning id into svc;
  insert into public.service_certificates (pharmacy_id, service_id, name, renew_months, sort_order) values
    (ph, svc, 'AACP accreditation', null, 10);

  insert into public.pharmacist_services (pharmacy_id, name, sort_order) values (ph, 'UTI prescribing', 30) returning id into svc;
  insert into public.service_certificates (pharmacy_id, service_id, name, renew_months, sort_order) values
    (ph, svc, 'UTI certificate', null, 10);

  insert into public.pharmacist_services (pharmacy_id, name, sort_order) values (ph, 'Oral contraceptive prescribing', 40) returning id into svc;
  insert into public.service_certificates (pharmacy_id, service_id, name, renew_months, sort_order) values
    (ph, svc, 'Oral contraceptive certificate', null, 10);
end $$;

-- Check: 4 services, 10 certificates
select s.sort_order, s.name as service, c.name as certificate, coalesce(c.renew_months::text, 'one-off') as renews
from public.pharmacist_services s
join public.service_certificates c on c.service_id = s.id
where s.pharmacy_id = '81ab394f-d642-4246-b896-e71938b25671'
order by s.sort_order, c.sort_order;
