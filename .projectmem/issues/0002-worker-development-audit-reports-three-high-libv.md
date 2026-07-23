# #0002 Worker development audit reports three high libvips CVEs through Wrangler Miniflare’s pinned sharp 0.34.5

- 2026-07-23T11:08:13Z `issue`: Worker development audit reports three high libvips CVEs through Wrangler Miniflare’s pinned sharp 0.34.5 [site/package.json]
- 2026-07-23T11:08:56Z `attempt`: Updated Wrangler to 4.113.0 and overrode Miniflare’s vulnerable Sharp pin with patched 0.35.3; lockfile audit is now clean [site/package.json] (partial)
- 2026-07-23T11:09:51Z `attempt`: npm 11.16 clean install, Worker tests, Wrangler 4.113 dry-run, production audit, and full audit all passed with zero vulnerabilities [site/package.json] (worked)
- 2026-07-23T11:09:51Z `fix`: Worker development dependency chain is current and clean, with Sharp 0.35.3 overriding Miniflare’s vulnerable pin [site/package.json]
