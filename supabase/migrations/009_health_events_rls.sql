-- Re-enable RLS on health_events so anon/authenticated roles cannot read
-- internal infra metadata (Railway IDs, queue depths, error details).
-- The monitor process uses the service role key which bypasses RLS.
ALTER TABLE public.health_events ENABLE ROW LEVEL SECURITY;

-- Deny all access for non-service-role (no policies = implicit deny)
-- Service role bypasses RLS entirely, so the monitor keeps full access.
