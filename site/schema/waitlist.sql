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
--
-- Rows are kept until someone asks to be removed. An unsubscribe is recorded
-- rather than deleted, because that record is what stops a later signup being
-- treated as fresh consent — so the table only grows. See docs/WAITLIST.md for
-- the size check; there is no automatic purge by design.

CREATE TABLE IF NOT EXISTS waitlist (
  -- Lowercased address: the case-insensitive identity used for dedupe.
  email_key        TEXT PRIMARY KEY,
  -- The address as typed. RFC 5321 local-parts are case-sensitive, so this is
  -- what gets mailed; email_key only decides who is the same person.
  email            TEXT NOT NULL,
  consent_text     TEXT NOT NULL,
  consented_at     TEXT NOT NULL,
  -- HMAC-SHA-256 of "<ip>:<utc day>" under WAITLIST_SALT. It keys the source
  -- rate limiter and is retained for abuse investigation; the raw address is
  -- never written. A plain digest would be reversible across the IPv4 space.
  source_day_hash  TEXT,
  unsubscribed_at  TEXT
);

-- Sending an update reads only the un-unsubscribed rows.
CREATE INDEX IF NOT EXISTS waitlist_active
  ON waitlist (unsubscribed_at)
  WHERE unsubscribed_at IS NULL;

-- Abuse limits are enforced before D1 by the Worker rate-limit bindings. Do
-- not index source_day_hash: the signup path never queries it, and indexing it
-- would add a second billed row write to every signup.
