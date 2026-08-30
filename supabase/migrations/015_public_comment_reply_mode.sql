ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS public_comment_reply_mode text NOT NULL DEFAULT 'static'
    CHECK (public_comment_reply_mode IN ('static', 'ai'));
