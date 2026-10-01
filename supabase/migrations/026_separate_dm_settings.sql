-- Separate AI settings for comment replies vs DM replies
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS comment_agent_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS dm_agent_enabled       boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS dm_reply_instructions  text,
  ADD COLUMN IF NOT EXISTS dm_reply_language      text NOT NULL DEFAULT 'Egyptian Arabic',
  ADD COLUMN IF NOT EXISTS dm_reply_tone          text NOT NULL DEFAULT 'friendly',
  ADD COLUMN IF NOT EXISTS dm_reply_length        text NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS dm_ai_provider         text,
  ADD COLUMN IF NOT EXISTS dm_ai_model            text;
