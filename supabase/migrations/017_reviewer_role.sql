-- 1. Add 'reviewer' role to team_members
ALTER TABLE public.team_members DROP CONSTRAINT IF EXISTS team_members_role_check;
ALTER TABLE public.team_members ADD CONSTRAINT team_members_role_check
  CHECK (role IN ('viewer', 'editor', 'reviewer'));

-- 2. Trigger: auto-link invite to member_id when they sign up / profile is created
CREATE OR REPLACE FUNCTION public.link_team_member_invites()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.team_members
  SET member_id   = NEW.id,
      accepted_at = COALESCE(accepted_at, NOW())
  WHERE member_email = NEW.email
    AND member_id IS NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_profile_created_link_invites ON public.profiles;
CREATE TRIGGER on_profile_created_link_invites
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.link_team_member_invites();

-- Backfill: link any existing profiles to their pending invites
UPDATE public.team_members tm
SET member_id   = p.id,
    accepted_at = COALESCE(tm.accepted_at, NOW())
FROM public.profiles p
WHERE p.email = tm.member_email
  AND tm.member_id IS NULL;

-- 3. RLS: reviewer/editor team member can SELECT handoff_queue for their pages
CREATE POLICY "handoff: team reviewer can select"
  ON public.handoff_queue FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.page_id  = handoff_queue.page_id
        AND tm.member_id = auth.uid()
        AND tm.role IN ('reviewer', 'editor')
    )
  );

-- 4. RLS: reviewer/editor team member can UPDATE handoff_queue for their pages
CREATE POLICY "handoff: team reviewer can update"
  ON public.handoff_queue FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.page_id  = handoff_queue.page_id
        AND tm.member_id = auth.uid()
        AND tm.role IN ('reviewer', 'editor')
    )
  );

-- 5. RLS: any team member can read pages they're assigned to
CREATE POLICY "pages: team member can select"
  ON public.pages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.page_id  = pages.id
        AND tm.member_id = auth.uid()
    )
  );
