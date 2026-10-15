-- TONLY Predictive Maintenance: controlled import foundation
-- Apply after schema.sql. This migration preserves source rows and reviewed ID aliases.
-- No client policies are intentionally granted here; use authenticated server-side routes.

create table if not exists truck_id_aliases (
  id uuid primary key default gen_random_uuid(),
  raw_truck_code text not null,
  normalized_raw_code text generated always as (upper(regexp_replace(trim(raw_truck_code), '\s+', '', 'g'))) stored,
  truck_id uuid not null references trucks(id) on delete restrict,
  approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'rejected')),
  evidence_note text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (normalized_raw_code),
  check (
    (approval_status = 'approved' and reviewed_at is not null and reviewed_by is not null)
    or approval_status <> 'approved'
  )
);

create table if not exists import_rows (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references import_batches(id) on delete cascade,
  source_row_number integer not null check (source_row_number > 0),
  source_fingerprint text not null,
  raw_source_row jsonb not null,
  mapped_truck_code text,
  resolved_truck_id uuid references trucks(id) on delete restrict,
  observed_at timestamptz,
  odometer_km numeric(12,1) check (odometer_km is null or odometer_km >= 0),
  quality_status data_quality_status not null default 'review',
  quality_flags jsonb not null default '[]'::jsonb,
  review_status text not null default 'pending'
    check (review_status in ('pending', 'accepted', 'rejected')),
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (import_batch_id, source_row_number),
  check (
    (review_status = 'accepted' and reviewed_at is not null and reviewed_by is not null)
    or review_status <> 'accepted'
  )
);

create index if not exists import_rows_batch_status_idx
  on import_rows(import_batch_id, review_status, quality_status);
create index if not exists import_rows_resolved_truck_time_idx
  on import_rows(resolved_truck_id, observed_at desc);
create index if not exists truck_id_aliases_truck_idx
  on truck_id_aliases(truck_id, approval_status);

-- Enable RLS on the new tables. No permissive policies are created by this migration.
-- This is a safe default until the single-planner authentication flow is configured.
alter table truck_id_aliases enable row level security;
alter table import_rows enable row level security;

comment on table truck_id_aliases is
  'Human-reviewed mapping from source truck ID variants to authoritative fleet records. Never auto-approve aliases.';
comment on table import_rows is
  'Immutable source-row snapshot plus review decisions; preserve raw_source_row even after mapping.';
