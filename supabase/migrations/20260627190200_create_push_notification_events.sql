DROP TABLE IF EXISTS push_notification_events CASCADE;

CREATE TABLE IF NOT EXISTS push_notification_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_key TEXT NOT NULL,
  payload JSONB,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_push_notification_events_unique_account_event
  ON push_notification_events(auth_user_id, event_type, event_key)
  WHERE auth_user_id IS NOT NULL AND event_type IS NOT NULL AND event_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_push_notification_events_auth_user_id
  ON push_notification_events(auth_user_id);

CREATE INDEX IF NOT EXISTS idx_push_notification_events_type
  ON push_notification_events(event_type);

CREATE INDEX IF NOT EXISTS idx_push_notification_events_sent_at
  ON push_notification_events(sent_at DESC);

ALTER TABLE push_notification_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own push events" ON push_notification_events;
CREATE POLICY "Users can read their own push events"
  ON push_notification_events
  FOR SELECT
  USING (auth.uid() = auth_user_id);
