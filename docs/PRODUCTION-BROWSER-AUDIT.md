# Production browser audit

`npm --prefix site/app run audit:production` uses the repository's pinned,
open-source Playwright browser to exercise `https://simjury.com/` without an
LLM, API token or runtime inference.

The audit runs after a successful site deployment, nightly, and on manual
dispatch. It opens Court Week on mobile and desktop, uses real stepped pointer
movement and normal browser actionability, detects centre-point click blockers,
opens every session through the device-local developer preview, checks the
juror desk, verifies narration start/pause/resume and desk interruption recovery,
and records performance, layout, CSP, console, request, image and touch-target
failures. It also verifies that the default-on Microsoft Clarity integration
reaches its collection endpoint; automated sessions are tagged as synthetic QA
by the site loader. Each run writes a stable JSON report, a Markdown summary,
screenshots and Playwright traces under `site/app/test-results/production-audit/`.

```powershell
$env:SIMJURY_AUDIT_URL='https://simjury.com/'
$env:SIMJURY_AUDIT_RUNS='1'
npm --prefix site/app run audit:production
```

Set `SIMJURY_EXPECT_CLARITY=1` when auditing a deployment where Clarity must be
enabled. The scheduled and post-deployment workflow always sets this assertion.

The browser uses an ordinary Chromium identity. A Cloudflare challenge is
retried once and then reported as `BLOCKED`; the audit does not spoof trusted
bots, solve CAPTCHAs, rotate proxies or evade WAF policy. If Cloudflare blocks
the GitHub runner, correct the owner-controlled zone policy or use an approved
self-hosted runner.

Automated checks can reliably detect delivery, interaction, layout and media
availability/control failures. Subjective narration sound quality, legal nuance
and whether a design change is aesthetically appropriate still require reviewed
baselines or human QA.
