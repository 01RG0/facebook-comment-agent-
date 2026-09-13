-- Migration 019: Replace Meta page tokens with Zernio account IDs
-- Zernio manages all Facebook OAuth tokens — we store only the Zernio account ID.

-- 1. Add zernio_account_id to pages
ALTER TABLE pages
  ADD COLUMN IF NOT EXISTS zernio_account_id TEXT,
  ADD COLUMN IF NOT EXISTS zernio_profile_id  TEXT;

-- 2. Keep access_token_enc/iv columns for now (soft migration) but mark obsolete.
--    They will be dropped after all pages are re-connected via Zernio.
--    token_refreshed_at is also kept for now and will be dropped in a later migration.

-- 3. Create an index so webhook lookups by zernio_account_id are fast.
CREATE INDEX IF NOT EXISTS idx_pages_zernio_account_id ON pages(zernio_account_id);

-- 4. Store the Zernio webhook subscription ID so we can manage it later.
ALTER TABLE pages
  ADD COLUMN IF NOT EXISTS zernio_webhook_subscription_id TEXT;

COMMENT ON COLUMN pages.zernio_account_id IS 'Zernio SocialAccount ID returned by POST /v1/connect/facebook/select-page. Replaces direct Meta page token storage.';
COMMENT ON COLUMN pages.zernio_profile_id IS 'Zernio Profile ID this account belongs to.';
COMMENT ON COLUMN pages.zernio_webhook_subscription_id IS 'Zernio webhook subscription ID for comment.received events.';
