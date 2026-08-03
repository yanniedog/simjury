# Cloudflare runtime retirement runbook

The active SimJury deployment is Cloudflare Static Assets only. This runbook
records the separate operator actions required to preserve and later retire the
former live-room and email-waitlist data. CI must never perform these steps.

## Safety boundary

- D1 may contain email addresses and consent records. Export only on an
  operator-controlled workstation to an encrypted directory outside every Git
  checkout and cloud-synchronised folder.
- Durable Object rooms are deliberately ephemeral. Stop new room creation and
  wait more than the documented two-hour TTL before removing their bindings.
- Removing a binding from `wrangler.json` does not authorise deleting the remote
  database. The unbound D1 database stays in read-only quarantine for 30 days.
- Never commit/export secrets. The former `WAITLIST_SALT` can remain in the
  Cloudflare secret store until final data-retention approval; it need not be
  readable for the export.

## 1. Export and verify D1 before static-only deployment

Authenticate Wrangler interactively on the operator workstation. Choose an
encrypted directory outside the repository, then record the schema, logical row
counts and database export:

```powershell
$retirementExportDir = '<encrypted-export-directory>'
New-Item -ItemType Directory -Path $retirementExportDir -Force

wrangler d1 execute simjury-waitlist --remote --json `
  --command="SELECT COUNT(*) AS rows, SUM(unsubscribed_at IS NOT NULL) AS unsubscribed FROM waitlist" `
  | Set-Content -Encoding utf8 (Join-Path $retirementExportDir 'row-counts.json')

wrangler d1 export simjury-waitlist --remote --no-data `
  --output (Join-Path $retirementExportDir 'schema.sql')
wrangler d1 export simjury-waitlist --remote `
  --output (Join-Path $retirementExportDir 'waitlist-export.sql')

Get-FileHash -Algorithm SHA256 `
  (Join-Path $retirementExportDir 'schema.sql'), `
  (Join-Path $retirementExportDir 'waitlist-export.sql'), `
  (Join-Path $retirementExportDir 'row-counts.json')
```

Open the export locally and verify that the `waitlist` table exists and the
exported `INSERT` count agrees with `row-counts.json`. Record the three hashes in
the owner's private retention log—not in GitHub.

If export, count or checksum verification fails, stop. Do not deploy the
binding-removal change and do not delete anything remotely.

## 2. Drain live rooms

Before deploying static-only configuration:

1. ensure the old UI no longer offers room creation or waitlist submission;
2. wait at least two hours after that version is live;
3. confirm no supported application route calls `/api/live/*`, `/api/waitlist`
   or `/discord/interactions`; and
4. deploy the static-only configuration through the normal protected `main`
   workflow.

The repository intentionally contains no automated Durable Object deletion
migration. Creating one would be an irreversible data action requiring a new
explicit owner decision and a current Cloudflare-state audit.

## 3. Thirty-day D1 quarantine

After static-only deployment, leave `simjury-waitlist` unbound and do not write
to it. Record the deployment time and quarantine end in the private retention
log. During the 30 days:

- retain the encrypted verified export;
- do not attach D1 to another Worker;
- honour any deletion/unsubscribe request against both retained locations; and
- verify production continues to make zero calls to the retired routes.

At the end of quarantine, review legal/operational retention needs and obtain an
explicit deletion decision. Only then may an operator use Cloudflare's current
documented deletion command or dashboard. Record the remote deletion result and
the chosen encrypted-export retention/destruction result in the private log.

## 4. Rollback boundary

Code rollback must not silently re-enable runtime services. Restoring a former
commit with Worker routes is prohibited. A genuine rollback must use a new
reviewed static build; restoring D1/live rooms requires a separate owner-approved
architecture and privacy change.
