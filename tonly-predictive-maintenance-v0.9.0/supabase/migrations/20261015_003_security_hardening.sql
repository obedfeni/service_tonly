-- v0.8 security hardening.
-- The application accesses these tables only through authenticated server routes using
-- the server-only service-role key. Browser clients must not access application tables directly.
-- With RLS enabled and no client policies, anon/authenticated direct table access is denied.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'trucks', 'odometer_readings', 'service_rules', 'truck_service_assignments',
    'maintenance_events', 'predictions', 'appointments', 'work_orders',
    'prediction_evaluations', 'import_batches', 'audit_log', 'import_rows', 'truck_id_aliases'
  ] LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    END IF;
  END LOOP;
END $$;

COMMENT ON SCHEMA public IS 'TONLY maintenance tables use RLS; access must go through authorized server routes.';
