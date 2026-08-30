-- Link a preferred ai_provider_key to each page's settings.
-- Worker will try this key first before falling back to the priority chain.
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS preferred_ai_key_id uuid
    REFERENCES public.ai_provider_keys(id) ON DELETE SET NULL;
