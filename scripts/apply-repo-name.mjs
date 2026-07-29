#!/usr/bin/env node
/**
 * Apply GitHub repository display name casing: simjury → SimJury.
 *
 * GitHub preserves name casing for display; URLs remain case-insensitive.
 * Requires a token with admin permission on the repository.
 *
 * Usage:
 *   npm run repo-name:apply
 *   npm run repo-name:apply -- --dry-run
 *   npm run repo-name:apply -- --name SimJury
 */
import { spawnSync } from 'node:child_process';
import { ghJson, hasGh } from './lib/gh-pr-review-threads.mjs';

const GH_TIMEOUT_MS = 120_000;
const DEFAULT_NAME = 'SimJury';
const CANONICAL_SLUG = 'simjury';

function parseArgs(argv) {
  const out = { dryRun: false, help: false, name: DEFAULT_NAME };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--name' && argv[i + 1]) out.name = String(argv[++i]);
  }
  return out;
}

function printManualSteps(owner, currentName, wantName) {
  console.log(`
Could not PATCH repository name via API (token may lack admin:repo scope).

Manual steps:
1. Open https://github.com/${owner}/${currentName}/settings
2. Under "General" → "Repository name", set the name to: ${wantName}
3. Click Rename

GitHub keeps redirects for the old casing. Clone URLs are case-insensitive.
`);
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Usage: npm run repo-name:apply [-- --dry-run] [-- --name ${DEFAULT_NAME}]`);
    process.exit(0);
  }

  const wantName = String(args.name || '').trim();
  if (!wantName) {
    console.error('apply-repo-name: --name must be non-empty');
    process.exit(1);
  }
  if (wantName.toLowerCase() !== CANONICAL_SLUG) {
    console.error(
      `apply-repo-name: refusing rename to "${wantName}" (must be a casing of "${CANONICAL_SLUG}")`,
    );
    process.exit(1);
  }

  if (!hasGh()) {
    console.error('apply-repo-name: install gh CLI and authenticate');
    process.exit(1);
  }

  let repo;
  try {
    repo = ghJson(['repo', 'view', '--json', 'nameWithOwner,name,owner']).nameWithOwner;
  } catch (e) {
    console.error(`apply-repo-name: ${e.message}`);
    process.exit(1);
  }

  let current;
  try {
    current = ghJson(['api', `repos/${repo}`]);
  } catch (e) {
    console.error(`apply-repo-name: could not read repo: ${e.message}`);
    process.exit(1);
  }

  const owner = current.owner?.login || String(repo).split('/')[0];
  const currentName = current.name;
  if (String(currentName).toLowerCase() !== CANONICAL_SLUG) {
    console.error(
      `apply-repo-name: unexpected current repo name "${currentName}" (expected casing of ${CANONICAL_SLUG})`,
    );
    process.exit(1);
  }

  if (currentName === wantName) {
    console.log(`Repository name already "${wantName}" on ${owner}/${currentName}`);
    process.exit(0);
  }

  if (args.dryRun) {
    console.log(JSON.stringify({ owner, currentName, wantName }, null, 2));
    process.exit(0);
  }

  const r = spawnSync('gh', ['api', '--method', 'PATCH', `repos/${owner}/${currentName}`, '--input', '-'], {
    encoding: 'utf8',
    input: JSON.stringify({ name: wantName }),
    timeout: GH_TIMEOUT_MS,
  });

  if (r.status === 0) {
    let updated;
    try {
      updated = JSON.parse(r.stdout || '{}');
    } catch {
      updated = {};
    }
    console.log(`Repository renamed: ${owner}/${currentName} → ${owner}/${updated.name || wantName}`);
    if (updated.html_url) console.log(`URL: ${updated.html_url}`);
    process.exit(0);
  }

  console.error(`apply-repo-name: API failed (exit ${r.status})`);
  if (r.stderr) console.error(r.stderr.trim());
  printManualSteps(owner, currentName, wantName);
  const hasAuthError = r.stderr && (r.stderr.includes('403') || r.stderr.includes('404'));
  process.exit(hasAuthError ? 2 : 1);
}

main();
