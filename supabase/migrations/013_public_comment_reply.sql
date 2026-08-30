ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS public_comment_reply_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_comment_reply_text    text    NOT NULL DEFAULT 'تم إرسال التفاصيل برايفت 📩';
