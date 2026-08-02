# The email waitlist

`/api/waitlist` collects email addresses on the landing page so the owner can
send occasional updates about The Daily Docket. It is the only non-live Worker
route, added under the amended static-first allowlist in
[`DAILY-PIVOT.md`](../DAILY-PIVOT.md).

Nothing about play is stored, the route is never consulted while a case is
running, and the docket stays fully playable with no account and no address.

## Why D1 and not a Durable Object

The three SQLite Durable Objects are pinned to the `live-jury-v1` migration.
Adding a fourth class for an unrelated feature would widen that migration and
weaken the live-jury boundary the guard exists to protect. D1 is also the right
shape for the job: the list is read in bulk, exactly once, when an update goes
out.

## Cost

D1's free tier covers 5 GB of storage, 5 million rows read per day, and 100,000
rows written per day.

The public route does not use D1 to count or rate-limit requests. Two Cloudflare
Rate Limiting bindings run first: one bounds a keyed source fingerprint to two
attempts per minute, and one bounds all traffic at each Cloudflare location to
five attempts per minute. A rejected request performs **zero D1 operations**.

A permitted signup performs one primary-key upsert. It never runs `SELECT`,
`COUNT(*)`, or a second update statement. That preserves deduplication and lets
an unsubscribed person consent again without a table or source-fingerprint scan.
The rate-limit counters are local and eventually consistent, so they are an
abuse circuit breaker rather than accounting; the indexed upsert remains the
data-integrity boundary.

Ordinary use is nowhere near either limit — sending an update reads the table
once — and no paid Cloudflare product is introduced.

There is deliberately **no automatic purge**. Rows are kept until someone asks
to be removed, because an unsubscribe record is what stops a later signup being
treated as fresh consent. That means the table only grows, so this is an
operational boundary rather than an unlimited one — Cloudflare stops writes once
the storage limit is reached. Check the size before a large import:

```powershell
cd site
wrangler d1 execute simjury-waitlist --remote `
  --command="SELECT COUNT(*) AS rows, SUM(unsubscribed_at IS NOT NULL) AS unsubscribed FROM waitlist"
```

At roughly 150 bytes a row, 5 GB is tens of millions of addresses; if the list
ever approaches that, it needs a retention policy, not a bigger plan.

## Operator setup — already done

The database exists (`simjury-waitlist`, id in `wrangler.json`), the schema is
applied, and `WAITLIST_SALT` is set. Nothing below needs running again unless
the database is recreated. It is recorded so the setup is reproducible.

The salt is a Worker secret and cannot be read back. Losing it is not a data
loss: only the keyed source fingerprints rotate. If it is missing, the waitlist
fails closed before D1 instead of accepting unbounded traffic.

## How it was set up

```powershell
cd site
wrangler d1 create simjury-waitlist
```

Copy the printed `database_id` over the existing one in `wrangler.json` —
there is a real id committed now, not a placeholder — then create the table:

```powershell
wrangler d1 execute simjury-waitlist --remote --file=./schema/waitlist.sql
wrangler secret put WAITLIST_SALT   # any long random string
npm run check
```

`guard:cloudflare` **fails** while the placeholder id is in `wrangler.json`, and
that is deliberate. A push to `main` runs a real `wrangler deploy`, which
rejects a `database_id` that is not a UUID — so a placeholder would not merely
leave the waitlist unbound, it would fail the deployment of the whole site.
`wrangler deploy --dry-run` does not catch it, because it never contacts the
API. Failing in CI makes this a visible prerequisite instead of a landmine.

`WAITLIST_SALT` is a secret, so it lives outside `wrangler.json` entirely and
needs no allowlist change. Without it the endpoint returns unavailable before
touching D1 — see below for why an unkeyed fingerprint would be worthless.

## Reading the list

```powershell
wrangler d1 execute simjury-waitlist --remote `
  --command="SELECT email FROM waitlist WHERE unsubscribed_at IS NULL"
```

## What is stored, and what is not

| Column | Why |
|---|---|
| `email_key` | Primary key: the lowercased address. A repeat signup adds no row, whatever case it arrives in. |
| `email` | The address as typed. RFC 5321 local-parts are case-sensitive, so this is what gets mailed; only `email_key` decides who is the same person. |
| `consent_text` | The exact wording agreed to, so the record stands even after the page copy changes. |
| `consented_at` | When it was agreed. |
| `source_day_hash` | HMAC-SHA-256 of `<ip>:<utc day>` under `WAITLIST_SALT`. Used as the source rate-limit key and retained for abuse investigation; useless as a location record without the key. |
| `unsubscribed_at` | Set on unsubscribe; the row is kept so a later signup is not treated as fresh consent. |

The fingerprint is **keyed**, not a plain digest. A bare SHA-256 of an IP is not
anonymous: IPv4 is only 2³² values, so the whole space can be hashed and the
digest looked up. Without the secret there is no such table to build; the route
fails closed rather than storing an unkeyed value or bypassing its limiter.

No progress, notes, verdicts or case history are stored, and none of them are
linked to an address.

## Sending an update

Sending is deliberately **not** built into the Worker. It needs a mail provider
credential, and putting one in a Worker that also serves the site widens the
blast radius of the whole deployment for a job that runs a handful of times a
year. Export the list and send from wherever you normally send mail.

Every update must carry a working unsubscribe path. When someone unsubscribes:

`wrangler d1 execute` accepts only `--command` or `--file` — it cannot bind a
parameter. An address may legally contain an apostrophe
(`o'connor@example.com`), which would end the SQL string early, so the quoting
is done in a script rather than left to whoever is honouring the request:

```powershell
cd site
npm run waitlist:unsubscribe -- them@example.com
npm run waitlist:unsubscribe -- them@example.com -- --dry-run   # print the SQL only
```

## Deliberately not included

- **No double opt-in.** Single opt-in with the consent text recorded verbatim.
  If the list is ever used for anything beyond product updates, revisit this
  first.
- **No login.** Accounts are a separate track; the waitlist neither creates nor
  implies one.
- **No signup counter on the page.** It would leak list size and invite gaming.
- **No "already subscribed" response.** The endpoint answers identically either
  way, so it cannot be used to test whether an address is on the list.
