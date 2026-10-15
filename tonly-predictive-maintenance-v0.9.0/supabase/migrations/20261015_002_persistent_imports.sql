-- v0.4: persistent import batches are written only by the authenticated, allowlisted server route.
-- The service-role key bypasses RLS and must remain server-only. No browser table policies are added.

alter table import_batches enable row level security;
alter table audit_log enable row level security;

create index if not exists import_batches_started_at_idx on import_batches(started_at desc);
create index if not exists import_rows_batch_row_idx on import_rows(import_batch_id, source_row_number);

comment on table import_batches is
  'Import session metadata. v0.4 records are saved for review; accepted_count remains zero until a controlled review workflow is implemented.';
comment on column import_rows.raw_source_row is
  'Immutable source payload captured at import time. Do not rewrite this field during normalization or ID mapping.';
