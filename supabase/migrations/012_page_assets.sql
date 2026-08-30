-- Knowledge base assets: images and files uploaded per page.
-- The worker injects asset descriptions into the AI prompt so it knows
-- which images are available to attach to private replies.

CREATE TABLE IF NOT EXISTS public.page_assets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id     uuid NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label       text NOT NULL,
  description text,
  tags        text[] DEFAULT '{}',
  file_url    text NOT NULL,
  file_name   text NOT NULL,
  file_type   text NOT NULL DEFAULT 'image',
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.page_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own page assets"
  ON public.page_assets
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Supabase Storage bucket for uploaded assets (public read)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'page-assets',
  'page-assets',
  true,
  10485760,
  ARRAY['image/jpeg','image/png','image/webp','image/gif','image/jpg']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read page-assets bucket"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'page-assets');

CREATE POLICY "Authenticated upload to page-assets"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'page-assets'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Authenticated delete own page-assets"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'page-assets'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
