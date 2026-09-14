-- Migration 023: Sequences for automated follow-up messages
CREATE TABLE IF NOT EXISTS sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  page_id UUID REFERENCES pages(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  trigger TEXT NOT NULL DEFAULT 'comment_replied',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sequence_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  delay_hours INTEGER NOT NULL DEFAULT 24,
  message_template TEXT NOT NULL,
  UNIQUE(sequence_id, step_number)
);
CREATE TABLE IF NOT EXISTS sequence_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  current_step INTEGER NOT NULL DEFAULT 1,
  next_step_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active',
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sequence_id, contact_id)
);
ALTER TABLE sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sequences_own" ON sequences FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "sequence_steps_own" ON sequence_steps FOR ALL USING (EXISTS (SELECT 1 FROM sequences s WHERE s.id = sequence_steps.sequence_id AND s.user_id = auth.uid()));
CREATE POLICY "sequence_enrollments_own" ON sequence_enrollments FOR ALL USING (EXISTS (SELECT 1 FROM sequences s WHERE s.id = sequence_enrollments.sequence_id AND s.user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS idx_sequences_user_id ON sequences(user_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_next_step ON sequence_enrollments(next_step_at) WHERE status = 'active';
