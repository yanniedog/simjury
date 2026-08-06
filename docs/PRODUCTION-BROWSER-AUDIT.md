# Production browser audit

`npm --prefix site/app run audit:production` uses the repository's pinned,
open-source Playwright browser to exercise `https://simjury.com/` without an
LLM, API token or runtime inference.

The audit runs once after each successful `main` site deployment. It is a
separate `workflow_run`, so a failure is visible but cannot block or roll back
the deployment. A stable GitHub issue receives one idempotent comment per
deployed commit. It opens Court Week at 320x568, browser-chrome-reduced phone,
phone landscape, tablet, 200% desktop reflow and desktop sizes, uses real
stepped pointer movement and normal browser actionability, detects centre-point
click blockers and controls clipped outside the viewport,
opens every session through the device-local developer preview, checks the
juror desk, verifies narration start/pause/resume and desk interruption recovery,
and records performance, layout, CSP, console, request, image and touch-target
failures. It also verifies that the default-on Microsoft Clarity integration
reaches its collection endpoint; automated sessions are tagged as synthetic QA
by the site loader. Each run writes a stable JSON report, a Markdown summary and
a complete deterministic log. Raw output and browser traces are never uploaded:
credentials, IP addresses, email addresses, local paths, URL parameters and any
browser-storage lines are removed and checked before publication. The issue links
to a terminal-style paste when paste.rs is available and always links to the
90-day GitHub Actions artifact fallback. Paste retention is external and is not
the evidence system of record.

```powershell
$env:SIMJURY_AUDIT_URL='https://simjury.com/'
$env:SIMJURY_AUDIT_RUNS='1'
npm --prefix site/app run audit:production
```

Set `SIMJURY_EXPECT_CLARITY=1` when auditing a deployment where Clarity must be
enabled. The post-deployment workflow always sets this assertion.

The browser uses an ordinary Chromium identity. A Cloudflare challenge is
retried once and then reported as `BLOCKED`; the audit does not spoof trusted
bots, solve CAPTCHAs, rotate proxies or evade WAF policy. If Cloudflare blocks
the GitHub runner, correct the owner-controlled zone policy or use an approved
self-hosted runner.

The downstream workflow accepts only a successful same-repository `push` run on
`main`, checks the full deployed SHA against prior tracker comments before doing
work, and uses only `contents: read` plus `issues: write`. It does not run fork
code, accept an arbitrary target URL, hold Cloudflare credentials, or read player
profiles, progress, notes or ballots. Issue and paste delivery failure can be
retried because a SHA is considered complete only after its result comment is
stored. Each deployment also publishes a tiny static commit marker. The audit
checks that marker before opening a browser, so a queued run cannot attribute a
newer mutable deployment to an older SHA. A deployment overtaken before its run
is reported honestly as `SUPERSEDED`, without claiming browser-quality results.

SimJury is a public repository, so this uses a standard public-repository GitHub
hosted runner rather than a billable larger runner. GitHub currently documents
[standard hosted Actions as free for public repositories](https://docs.github.com/actions/concepts/billing-and-usage).
The 90-day artifact is
small text-only evidence; repository Actions storage and retention still need
normal owner monitoring because those limits are separate from runner minutes.

Automated checks can reliably detect delivery, interaction, layout and media
availability/control failures. Subjective narration sound quality, legal nuance
and whether a design change is aesthetically appropriate still require reviewed
baselines or human QA.
