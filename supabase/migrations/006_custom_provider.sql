-- Add custom base URL support for openai-compatible providers
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS custom_base_url text;
