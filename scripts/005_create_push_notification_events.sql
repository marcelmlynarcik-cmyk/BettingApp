CREATE TABLE IF NOT EXISTS push_notification_events (
  key TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload JSONB,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_notification_events_type
  ON push_notification_events(type);

CREATE INDEX IF NOT EXISTS idx_push_notification_events_sent_at
  ON push_notification_events(sent_at DESC);

CREATE TABLE IF NOT EXISTS notification_state (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Mark already existing ticket events as handled so enabling the server sync
-- does not send a historical burst to every phone.
INSERT INTO push_notification_events (key, type, payload, sent_at)
SELECT
  'ticket-submitted:' || id::text,
  'ticket-submitted',
  jsonb_build_object('backfilled', true),
  NOW()
FROM tickets
ON CONFLICT (key) DO NOTHING;

INSERT INTO push_notification_events (key, type, payload, sent_at)
SELECT
  'ticket-settled:' || id::text,
  'ticket-settled',
  jsonb_build_object('backfilled', true),
  NOW()
FROM tickets
WHERE status IN ('win', 'loss')
ON CONFLICT (key) DO NOTHING;
