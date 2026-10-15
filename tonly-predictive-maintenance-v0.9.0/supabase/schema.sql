-- TONLY Predictive Maintenance Intelligence Platform
-- Apply only after confirming the production service rules and access requirements.

create extension if not exists pgcrypto;

create type truck_status as enum ('operating', 'available', 'workshop', 'down', 'unknown');
create type data_quality_status as enum ('good', 'review', 'rejected');
create type prediction_status as enum ('provisional', 'approved', 'superseded', 'evaluated');
create type appointment_status as enum ('draft', 'pending_approval', 'approved', 'published', 'completed', 'cancelled');

create table trucks (
  id uuid primary key default gen_random_uuid(),
  truck_code text not null unique,
  make text not null default 'TONLY',
  model text,
  commissioned_on date,
  status truck_status not null default 'unknown',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table odometer_readings (
  id uuid primary key default gen_random_uuid(),
  truck_id uuid not null references trucks(id),
  observed_at timestamptz not null,
  odometer_km numeric(12,1) not null check (odometer_km >= 0),
  source text not null default 'google_sheets',
  source_row_key text,
  import_batch_id uuid,
  quality_status data_quality_status not null default 'review',
  quality_flags jsonb not null default '[]'::jsonb,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (truck_id, observed_at, odometer_km)
);
create index odometer_readings_truck_time_idx on odometer_readings(truck_id, observed_at desc);

create table service_rules (
  id uuid primary key default gen_random_uuid(),
  rule_code text not null,
  service_name text not null,
  pm_sequence integer check (pm_sequence > 0),
  -- Absolute scheduled odometer milestone: PM1=5,000 km, PM2=15,000 km, PM3=25,000 km, etc.
  target_odometer_km numeric(12,1) check (target_odometer_km > 0),
  kilometre_interval numeric(12,1) check (kilometre_interval > 0),
  calendar_interval_days integer check (calendar_interval_days > 0),
  due_logic text not null default 'whichever_first' check (due_logic = 'whichever_first'),
  effective_from date not null,
  effective_to date,
  source_reference text,
  verified_by text,
  verified_at timestamptz,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  check (target_odometer_km is not null or kilometre_interval is not null or calendar_interval_days is not null)
);

create table truck_service_assignments (
  id uuid primary key default gen_random_uuid(),
  truck_id uuid not null references trucks(id),
  service_rule_id uuid not null references service_rules(id),
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now()
);

create table maintenance_events (
  id uuid primary key default gen_random_uuid(),
  truck_id uuid not null references trucks(id),
  service_rule_id uuid references service_rules(id),
  completed_at timestamptz not null,
  odometer_km numeric(12,1) check (odometer_km >= 0),
  work_order_number text,
  work_description text,
  technician_hours numeric(8,2),
  source text not null default 'manual',
  verified boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);
create index maintenance_events_truck_completed_idx on maintenance_events(truck_id, completed_at desc);

create table predictions (
  id uuid primary key default gen_random_uuid(),
  truck_id uuid not null references trucks(id),
  service_rule_id uuid not null references service_rules(id),
  generated_at timestamptz not null default now(),
  forecast_date date,
  earliest_date date,
  latest_date date,
  forecast_odometer_km numeric(12,1),
  remaining_km numeric(12,1),
  days_until_due integer,
  method text not null,
  model_version text not null,
  status prediction_status not null default 'provisional',
  confidence_score numeric(5,4),
  explanation jsonb not null default '{}'::jsonb,
  input_snapshot jsonb not null default '{}'::jsonb,
  created_by text,
  supersedes_prediction_id uuid references predictions(id)
);
create index predictions_truck_generated_idx on predictions(truck_id, generated_at desc);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  truck_id uuid not null references trucks(id),
  prediction_id uuid references predictions(id),
  service_rule_id uuid not null references service_rules(id),
  planned_start timestamptz not null,
  planned_end timestamptz,
  shift_name text,
  bay_code text,
  assigned_team text,
  estimated_technician_hours numeric(8,2),
  status appointment_status not null default 'draft',
  approved_by text,
  approved_at timestamptz,
  published_at timestamptz,
  schedule_version integer not null default 1,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (planned_end is null or planned_end > planned_start)
);
create index appointments_planned_start_idx on appointments(planned_start, status);

create table work_orders (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references appointments(id),
  truck_id uuid not null references trucks(id),
  work_order_number text not null unique,
  job_description text not null,
  action_taken text,
  status text not null default 'planned',
  estimated_hours numeric(8,2),
  actual_hours numeric(8,2),
  opened_at timestamptz,
  completed_at timestamptz,
  completion_odometer_km numeric(12,1),
  completed_by text,
  notes text,
  created_at timestamptz not null default now()
);

create table prediction_evaluations (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid not null references predictions(id),
  actual_service_date date,
  actual_service_odometer_km numeric(12,1),
  date_error_days integer,
  odometer_error_km numeric(12,1),
  evaluated_at timestamptz not null default now(),
  evaluation_notes text
);

create table import_batches (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  source_range text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  row_count integer not null default 0,
  accepted_count integer not null default 0,
  flagged_count integer not null default 0,
  rejected_count integer not null default 0,
  status text not null default 'started',
  error_summary text,
  initiated_by text
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor text not null default 'system',
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

-- PM sequence convention requested for this project:
-- PM1 = 5,000 km; PM2 = 15,000 km; PM3 = 25,000 km; each subsequent PM adds 10,000 km.
-- Calendar-based due rules must still be configured from an approved source; the UI's current 30-day value is demo-only.
--
-- Important:
-- 1) Do not activate a service rule until an OEM/workshop source and effective date are verified.
-- 2) Apply the documented RLS hardening migration before deployment; no permissive browser table policies are used.
-- 3) Keep prediction rows immutable; create a new row when a forecast changes.
-- 4) Source imports remain pending review and must not be promoted into odometer_readings automatically.
