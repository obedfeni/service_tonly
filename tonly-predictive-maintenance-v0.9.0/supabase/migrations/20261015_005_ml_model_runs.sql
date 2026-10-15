-- Persist authenticated Random Forest/XGBoost comparison runs for traceability.
-- Apply after migrations 001-004. No browser-facing RLS policies are created.
create table if not exists ml_model_runs (
  id uuid primary key default gen_random_uuid(),
  truck_id uuid references trucks(id) on delete set null,
  truck_code text not null check (truck_code ~ '^ET[0-9]{3}$'),
  pm_type text not null check (pm_type ~ '^PM([1-9]|10)$'),
  source_name text,
  model_version text not null,
  status text not null,
  training_examples integer not null default 0 check (training_examples >= 0),
  validation_metrics jsonb not null default '{}'::jsonb,
  result jsonb not null,
  input_snapshot jsonb not null,
  created_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists ml_model_runs_truck_created_idx
  on ml_model_runs(truck_code, created_at desc);
create index if not exists ml_model_runs_pm_created_idx
  on ml_model_runs(pm_type, created_at desc);

alter table ml_model_runs enable row level security;
comment on table ml_model_runs is
  'Server-generated model comparison runs; accessed through authenticated server routes only.';
