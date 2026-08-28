ALTER TABLE public.pages
  ADD COLUMN IF NOT EXISTS token_refreshed_at timestamptz;

-- Backfill: treat existing pages as if last refreshed at creation time
UPDATE public.pages SET token_refreshed_at = created_at WHERE token_refreshed_at IS NULL;
