-- Add hard link from finance transactions to tickets.
ALTER TABLE finance_transactions
ADD COLUMN IF NOT EXISTS ticket_id UUID;

-- Backfill from tagged descriptions: [ticket:<uuid>]
WITH tagged AS (
  SELECT
    id,
    (regexp_match(description, '\[ticket:([0-9a-fA-F-]{36})\]'))[1]::uuid AS parsed_ticket_id
  FROM finance_transactions
  WHERE ticket_id IS NULL
    AND description ~ '\[ticket:[0-9a-fA-F-]{36}\]'
)
UPDATE finance_transactions ft
SET ticket_id = tagged.parsed_ticket_id
FROM tagged
WHERE ft.id = tagged.id;

ALTER TABLE finance_transactions
DROP CONSTRAINT IF EXISTS finance_transactions_ticket_id_fkey;

ALTER TABLE finance_transactions
ADD CONSTRAINT finance_transactions_ticket_id_fkey
FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_finance_transactions_ticket_id
ON finance_transactions(ticket_id);
