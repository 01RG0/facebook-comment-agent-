-- Health events log for the monitor service
CREATE TABLE IF NOT EXISTS public.health_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service      text NOT NULL,           -- 'redis' | 'worker' | 'web' | 'queue' | 'tokens' | 'dlq'
  status       text NOT NULL,           -- 'ok' | 'warn' | 'error' | 'auto_healed'
  message      text NOT NULL,
  metadata     jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Only keep 7 days of health events
CREATE INDEX idx_health_events_created ON public.health_events(created_at DESC);

-- No RLS — only accessible via service role (monitor process)
ALTER TABLE public.health_events DISABLE ROW LEVEL SECURITY;
