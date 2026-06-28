CREATE TABLE IF NOT EXISTS prediction_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  prediction_id UUID NOT NULL REFERENCES predictions(id) ON DELETE CASCADE,
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name TEXT,
  actor_email TEXT,
  previous_result TEXT CHECK (previous_result IN ('OK', 'NOK', 'Pending')),
  next_result TEXT CHECK (next_result IN ('OK', 'NOK', 'Pending')),
  action TEXT NOT NULL CHECK (action IN ('single_result_update', 'mark_all_ok', 'ticket_edit')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prediction_audit_logs_ticket_id
  ON prediction_audit_logs(ticket_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_prediction_audit_logs_prediction_id
  ON prediction_audit_logs(prediction_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_prediction_audit_logs_auth_user_id
  ON prediction_audit_logs(auth_user_id, created_at DESC);

ALTER TABLE prediction_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read prediction audit logs" ON prediction_audit_logs;
CREATE POLICY "Authenticated users can read prediction audit logs"
  ON prediction_audit_logs
  FOR SELECT
  TO authenticated
  USING (TRUE);
