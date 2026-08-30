ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS public_comment_on_approval boolean NOT NULL DEFAULT true;
