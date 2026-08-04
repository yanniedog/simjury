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

## 1. Export and verify D1 before unbinding

Install exact `site` dependencies, authenticate Wrangler interactively, and
create an empty encrypted directory outside Git/cloud-sync. Do not pass a token.
Record the real room-disable instant; after the two-hour TTL run:

```powershell
npm --prefix site run runtime:retirement -- export `
  --destination 'X:\encrypted\simjury-retirement' `
  --rooms-disabled-at '2026-08-04T08:30:00Z' `
  --confirm-encrypted ENCRYPTED_AND_OPERATOR_CONTROLLED
```

The command rejects relative, symlinked, in-repository or non-empty paths. It
uses only D1 `SELECT`/export, records every non-system table/schema/count,
restores to temporary SQLite, runs `PRAGMA integrity_check`, requires exact
agreement, hashes every artifact and atomically writes `verification.json`.
It removes the temporary database and prints no credentials or row contents.
Record the receipt hash/counts privately. Unless status is
`verified_for_unbinding`, do not unbind or delete.

## 2. Drain live rooms and deploy static-only

Before deploying static-only configuration:

1. ensure the old UI no longer offers room creation or waitlist submission;
2. wait at least two hours after that version is live;
3. confirm no supported route calls `/api/live/*`, `/api/waitlist` or
   `/discord/interactions`;
4. re-run `runtime:retirement -- verify --package <absolute-encrypted-path>`;
   and
5. deploy the static-only configuration through protected `main`.

The repository intentionally contains no automated Durable Object deletion
migration. Creating one would be an irreversible data action requiring a new
explicit owner decision and a current Cloudflare-state audit.

## 3. Thirty-day D1 quarantine

After static-only deployment, record the exact deployed commit. This re-verifies
the export and starts quarantine; it does not change Cloudflare:

```powershell
npm --prefix site run runtime:retirement -- record-unbound `
  --package 'X:\encrypted\simjury-retirement' `
  --deployment-commit '<full-40-character-main-sha>' `
  --confirm-static STATIC_ASSETS_ONLY_DEPLOYED
```

Record the returned times privately. Keep D1 unbound/read-only and the verified
export encrypted; honour deletion requests in both locations. `quarantine-status
--package <absolute-encrypted-path>` re-verifies the package and remains
`complete: false` for 30 days. Then obtain a new explicit owner decision:

```powershell
npm --prefix site run runtime:retirement -- authorize-deletion `
  --package 'X:\encrypted\simjury-retirement' `
  --authorization-reference '<private-log-reference>' `
  --confirm-deletion OWNER_AUTHORIZED_SEPARATE_DELETION
```

This atomically writes a separate receipt and **never deletes anything**. A
separately authorised operator action using current Cloudflare documentation is
still required; record its result and the export disposition privately.

## 4. Rollback boundary

Code rollback must not silently re-enable runtime services. Restoring a former
commit with Worker routes is prohibited. A genuine rollback must use a new
reviewed static build; restoring D1/live rooms requires a separate owner-approved
architecture and privacy change.
