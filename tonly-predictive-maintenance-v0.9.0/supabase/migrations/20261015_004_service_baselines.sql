-- v0.8: preserve the verified last-service baseline separately from service events.
-- Forecasts are saved as provisional records; source odometer readings remain review-only.
create table if not exists truck_service_baselines (
  id uuid primary key default gen_random_uuid(),
  truck_id uuid not null references trucks(id) on delete restrict,
  service_rule_id uuid not null references service_rules(id) on delete restrict,
  last_service_date date not null,
  last_service_odometer_km numeric(12,1) not null check (last_service_odometer_km >= 0),
  source_reference text not null,
  verified_by text not null,
  verified_at timestamptz not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (truck_id, service_rule_id)
);

create index if not exists truck_service_baselines_active_idx
  on truck_service_baselines(truck_id, active, last_service_date desc);

alter table truck_service_baselines enable row level security;
comment on table truck_service_baselines is
  'Planner-verified service baseline used as a forecast input. Evidence reference and verification actor are required.';
