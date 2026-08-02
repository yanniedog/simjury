-- One-time, idempotent production migration for the pre-rate-limit schema.
-- The Worker no longer queries source_day_hash, so retaining this index only
-- adds a billed index write to every accepted signup.
DROP INDEX IF EXISTS waitlist_source_day;
