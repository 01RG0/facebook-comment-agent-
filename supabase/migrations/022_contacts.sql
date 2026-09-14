-- Migration 022: Contacts table for auto-saving commenters
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page_id UUID REFERENCES pages(id) ON DELETE SET NULL,
  platform_user_id TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'facebook',
  name TEXT,
  picture TEXT,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  comment_count INTEGER NOT NULL DEFAULT 1,
  UNIQUE(user_id, platform_user_id, platform)
);
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contacts_own" ON contacts FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_platform_user_id ON contacts(platform_user_id);
