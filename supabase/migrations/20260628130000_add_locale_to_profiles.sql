ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'sk'
CHECK (locale IN ('sk', 'cs'));

UPDATE profiles
SET locale = 'sk'
WHERE locale IS NULL;
