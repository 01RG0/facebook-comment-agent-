CREATE TABLE public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  member_email text NOT NULL,
  member_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'editor')),
  invited_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  UNIQUE(page_id, member_email)
);
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team_members: owner manages" ON public.team_members FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "team_members: member reads own" ON public.team_members FOR SELECT
  USING (auth.uid() = member_id);

CREATE TABLE public.dead_letter_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  fb_comment_id text NOT NULL,
  fb_post_id text NOT NULL,
  commenter_id text NOT NULL,
  commenter_name text NOT NULL,
  comment_text text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.profiles(id),
  UNIQUE(fb_comment_id)
);
ALTER TABLE public.dead_letter_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dlq: users own their rows" ON public.dead_letter_comments FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_dlq_user_id ON public.dead_letter_comments(user_id);
CREATE INDEX idx_dlq_page_id ON public.dead_letter_comments(page_id);

CREATE TABLE public.handoff_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  fb_comment_id text NOT NULL,
  fb_post_id text NOT NULL,
  commenter_id text NOT NULL,
  commenter_name text NOT NULL,
  comment_text text NOT NULL,
  ai_draft text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'replied', 'dismissed')),
  assigned_to uuid REFERENCES public.profiles(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(fb_comment_id)
);
ALTER TABLE public.handoff_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "handoff: users own their rows" ON public.handoff_queue FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_handoff_user_id ON public.handoff_queue(user_id);
CREATE INDEX idx_handoff_status ON public.handoff_queue(status);

CREATE TRIGGER trg_handoff_updated_at
  BEFORE UPDATE ON public.handoff_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS reply_tone text NOT NULL DEFAULT 'friendly' CHECK (reply_tone IN ('friendly', 'formal', 'casual', 'professional')),
  ADD COLUMN IF NOT EXISTS reply_length text NOT NULL DEFAULT 'medium' CHECK (reply_length IN ('short', 'medium', 'long')),
  ADD COLUMN IF NOT EXISTS reply_blacklist_words text[],
  ADD COLUMN IF NOT EXISTS review_mode_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_retry_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS max_retry_attempts integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS human_handoff_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS human_handoff_keywords text[];
