-- Replace single preferred key FK with an array of allowed key IDs.
-- Empty array / NULL means "use all active keys".
ALTER TABLE public.settings
  DROP COLUMN IF EXISTS preferred_ai_key_id,
  ADD COLUMN IF NOT EXISTS preferred_ai_key_ids uuid[] DEFAULT '{}';
