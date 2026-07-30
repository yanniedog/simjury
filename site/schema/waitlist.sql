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
  -- Lowercased address: the case-insensitive identity used for dedupe.
  email_key        TEXT PRIMARY KEY,
  -- The address as typed. RFC 5321 local-parts are case-sensitive, so this is
  -- what gets mailed; email_key only decides who is the same person.
  email            TEXT NOT NULL,
  consent_text     TEXT NOT NULL,
  consented_at     TEXT NOT NULL,
  -- SHA-256 of "<ip>:<utc day>". Enough to spot a flood, useless as a location
  -- record: the raw address is never written down.
  -- HMAC-SHA-256 of "<ip>:<utc day>" under WAITLIST_SALT. NULL when no salt
  -- is configured. A plain digest would not be anonymous: IPv4 is only 2^32
  -- values, so an unkeyed hash can be reversed by exhausting the space.
  source_day_hash  TEXT,
  unsubscribed_at  TEXT
);

-- Sending an update reads only the un-unsubscribed rows.
CREATE INDEX IF NOT EXISTS waitlist_active
  ON waitlist (unsubscribed_at)
  WHERE unsubscribed_at IS NULL;

-- The per-IP-per-day cap counts rows by fingerprint on every signup.
CREATE INDEX IF NOT EXISTS waitlist_source_day
  ON waitlist (source_day_hash);
