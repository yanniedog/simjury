# #0001 Site deployment workflow omits Worker tests, so narration/API regressions can reach deployment after only a Wrangler dry run

- 2026-07-23T10:52:29Z `issue`: Site deployment workflow omits Worker tests, so narration/API regressions can reach deployment after only a Wrangler dry run [.github/workflows/site.yml]
- 2026-07-23T10:52:54Z `attempt`: Added the existing Worker routing and narration suite to the deployment workflow’s required check job [.github/workflows/site.yml] (partial)
- 2026-07-23T10:53:10Z `attempt`: Ran the Worker suite from the hygiene worktree; manifest generation hit the same sandbox EPERM on its tracked output [site/src/narration-manifest.generated.js] (failed)
- 2026-07-23T10:53:26Z `attempt`: Worker routing and narration suite passed 4/4 with the workflow command [.github/workflows/site.yml] (worked)
- 2026-07-23T10:53:27Z `fix`: Deployment workflow now runs the Worker test suite before Wrangler validation and deployment [.github/workflows/site.yml]
