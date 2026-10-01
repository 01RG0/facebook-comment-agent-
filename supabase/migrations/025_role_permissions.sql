-- Per-owner custom role permissions: which dashboard pages each role can access
CREATE TABLE IF NOT EXISTS public.owner_role_permissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('viewer', 'editor', 'reviewer')),
  allowed_pages text[] NOT NULL DEFAULT '{}',
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id, role)
);

ALTER TABLE public.owner_role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "role_permissions: owners manage their own"
  ON public.owner_role_permissions FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());
