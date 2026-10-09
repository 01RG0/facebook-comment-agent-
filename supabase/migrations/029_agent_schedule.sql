-- Agent scheduling: run the agent only during configured time windows
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS schedule_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS schedule_timezone text NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS schedule_slots jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN settings.schedule_enabled IS 'When true, agent only processes during schedule_slots windows';
COMMENT ON COLUMN settings.schedule_timezone IS 'IANA timezone name, e.g. Africa/Cairo';
COMMENT ON COLUMN settings.schedule_slots IS 'Array of {days:[0-6], start:"HH:MM", end:"HH:MM"}. days: 0=Sun..6=Sat';
