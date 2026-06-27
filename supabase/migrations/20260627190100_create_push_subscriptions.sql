DROP TABLE IF EXISTS push_subscriptions CASCADE;
DROP TABLE IF EXISTS push_notification_preferences CASCADE;

CREATE TABLE IF NOT EXISTS push_notification_preferences (
  auth_user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  push_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ticket_created BOOLEAN NOT NULL DEFAULT TRUE,
  ticket_settled BOOLEAN NOT NULL DEFAULT TRUE,
  prediction_result_changed BOOLEAN NOT NULL DEFAULT TRUE,
  monthly_summary BOOLEAN NOT NULL DEFAULT TRUE,
  ranking_milestones BOOLEAN NOT NULL DEFAULT TRUE,
  pending_ticket_reminders BOOLEAN NOT NULL DEFAULT TRUE,
  finance_updates BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  platform TEXT,
  user_agent TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  revoked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_auth_user_id
  ON push_subscriptions(auth_user_id);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_enabled
  ON push_subscriptions(enabled)
  WHERE enabled = TRUE;

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_updated_at
  ON push_subscriptions(updated_at DESC);

ALTER TABLE push_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own push preferences" ON push_notification_preferences;
CREATE POLICY "Users can read their own push preferences"
  ON push_notification_preferences
  FOR SELECT
  USING (auth.uid() = auth_user_id);

DROP POLICY IF EXISTS "Users can update their own push preferences" ON push_notification_preferences;
CREATE POLICY "Users can update their own push preferences"
  ON push_notification_preferences
  FOR UPDATE
  USING (auth.uid() = auth_user_id)
  WITH CHECK (auth.uid() = auth_user_id);

DROP POLICY IF EXISTS "Users can insert their own push preferences" ON push_notification_preferences;
CREATE POLICY "Users can insert their own push preferences"
  ON push_notification_preferences
  FOR INSERT
  WITH CHECK (auth.uid() = auth_user_id);

DROP POLICY IF EXISTS "Users can read their own push subscriptions" ON push_subscriptions;
CREATE POLICY "Users can read their own push subscriptions"
  ON push_subscriptions
  FOR SELECT
  USING (auth.uid() = auth_user_id);

DROP POLICY IF EXISTS "Users can insert their own push subscriptions" ON push_subscriptions;
CREATE POLICY "Users can insert their own push subscriptions"
  ON push_subscriptions
  FOR INSERT
  WITH CHECK (auth.uid() = auth_user_id);

DROP POLICY IF EXISTS "Users can update their own push subscriptions" ON push_subscriptions;
CREATE POLICY "Users can update their own push subscriptions"
  ON push_subscriptions
  FOR UPDATE
  USING (auth.uid() = auth_user_id)
  WITH CHECK (auth.uid() = auth_user_id);
