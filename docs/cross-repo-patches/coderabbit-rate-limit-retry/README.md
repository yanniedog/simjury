# Cross-repo: CodeRabbit rate-limit auto-retry

Portable, **self-contained** workflow (no Node scripts required).

When `coderabbitai[bot]` posts **Review limit reached**, the workflow waits for
the stated window (+2m, max 120m) then comments `@coderabbitai review`.

## Apply one repo

```sh
mkdir -p .github/workflows
cp docs/cross-repo-patches/coderabbit-rate-limit-retry/pr-coderabbit-rate-limit-retry.yml \
  .github/workflows/
```

Or from simjury root after this lands on `main`.

## Apply all non-archived repos (owner)

```sh
npm run coderabbit:rate-limit-retry:install-all
# dry-run:
npm run coderabbit:rate-limit-retry:install-all -- --dry-run
```

Skips **simjury** (canonical source) and **AR-app** by default — AR-app keeps a
distinct bot policy and is not auto-mirrored. Force with `--repos AR-app` if needed.

Canonical source: `.github/workflows/pr-coderabbit-rate-limit-retry.yml` in simjury.
