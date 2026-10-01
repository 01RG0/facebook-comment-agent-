-- Track admin-created ("managed") team member accounts
ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS is_managed boolean NOT NULL DEFAULT false;
