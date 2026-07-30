-- The Daily Docket waitlist.
--
-- Apply with:
--   wrangler d1 execute simjury-waitlist --remote --file=./schema/waitlist.sql
--
-- Export the list (to send an update) with:
--   wrangler d1 execute simjury-waitlist --remote \
--     --command="SELECT email FROM waitlist WHERE unsubscribed_at IS NULL"
--
-- Single opt-in: consent_text stores what the person actually agreed to, so the
-- record stands on its own even after the landing page copy changes.

CREATE TABLE IF NOT EXISTS waitlist (
  email            TEXT PRIMARY KEY,
  consent_text     TEXT NOT NULL,
  consented_at     TEXT NOT NULL,
  -- SHA-256 of "<ip>:<utc day>". Enough to spot a flood, useless as a location
  -- record: the raw address is never written down.
  source_day_hash  TEXT NOT NULL,
  unsubscribed_at  TEXT
);

-- Sending an update reads only the un-unsubscribed rows.
CREATE INDEX IF NOT EXISTS waitlist_active
  ON waitlist (unsubscribed_at)
  WHERE unsubscribed_at IS NULL;
