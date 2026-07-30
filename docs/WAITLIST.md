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
rows written per day. A waitlist writes one row per signup and reads the table
only when an update is sent, so this stays inside the free tier indefinitely.
No paid Cloudflare product is introduced.

## Operator setup (one time)

```powershell
cd site
wrangler d1 create simjury-waitlist
```

Copy the printed `database_id` into `wrangler.json`, replacing
`REPLACE_WITH_D1_DATABASE_ID`, then create the table:

```powershell
wrangler d1 execute simjury-waitlist --remote --file=./schema/waitlist.sql
npm run check
```

Until that is done, `guard:cloudflare` prints a reminder rather than failing, so
CI stays green before the database exists. Shipping without it fails safely
anyway: an unbound `WAITLIST` makes the route answer `503 WAITLIST_NOT_READY`
instead of accepting signups into nothing.

## Reading the list

```powershell
wrangler d1 execute simjury-waitlist --remote `
  --command="SELECT email FROM waitlist WHERE unsubscribed_at IS NULL"
```

## What is stored, and what is not

| Column | Why |
|---|---|
| `email` | Primary key, lowercased. A repeat signup updates nothing and adds no row. |
| `consent_text` | The exact wording agreed to, so the record stands even after the page copy changes. |
| `consented_at` | When it was agreed. |
| `source_day_hash` | SHA-256 of `<ip>:<utc day>` — enough to spot a flood, useless as a location record. The raw address is never written down. |
| `unsubscribed_at` | Set on unsubscribe; the row is kept so a later signup is not treated as fresh consent. |

No progress, notes, verdicts or case history are stored, and none of them are
linked to an address.

## Sending an update

Sending is deliberately **not** built into the Worker. It needs a mail provider
credential, and putting one in a Worker that also serves the site widens the
blast radius of the whole deployment for a job that runs a handful of times a
year. Export the list and send from wherever you normally send mail.

Every update must carry a working unsubscribe path. When someone unsubscribes:

```powershell
wrangler d1 execute simjury-waitlist --remote `
  --command="UPDATE waitlist SET unsubscribed_at = datetime('now') WHERE email = 'them@example.com'"
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
