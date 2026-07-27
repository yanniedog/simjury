#!/usr/bin/env node
/**
 * Enable squash auto-merge for a PR (WORKFLOW.md).
 * Prefer `npm run pr:arm-and-park` — it arms merge and classifies wait vs actionable.
 */
import { progressPullRequest } from './lib/pr-branch-sync.mjs';
import { mergeCommandLine, PR_MERGE_FLAGS } from './lib/pr-merge.mjs';
import { hasGh } from './lib/gh-pr-review-threads.mjs';

function parseArgs(argv) {
  const out = { pr: null, dryRun: false, enableOnly: false, noSync: false, help: false };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--enable-only') out.enableOnly = true;
    else if (a === '--no-sync') out.noSync = true;
    else if (a === '--pr' && argv[i + 1]) out.pr = Number(argv[++i]);
    else if (a.startsWith('--pr=')) out.pr = Number(a.slice(5));
  }
  if (out.pr != null && (!Number.isInteger(out.pr) || out.pr <= 0)) {
    out.prError = 'invalid --pr (positive integer required)';
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Usage: npm run pr:merge -- --pr <n> [--enable-only] [--no-sync] [--dry-run]

Default merge: ${mergeCommandLine('<n>')}
Flags: ${PR_MERGE_FLAGS.join(' ')}

Prefer: npm run pr:arm-and-park -- --pr <n> (arms merge + classifies; no watch loops).`);
    process.exit(0);
  }
  if (!hasGh()) {
    console.error('pr-merge: install gh CLI and authenticate (gh auth login)');
    process.exit(1);
  }
  if (args.prError) {
    console.error(`pr-merge: ${args.prError}`);
    process.exit(1);
  }
  if (!args.pr) {
    console.error('pr-merge: --pr <n> required');
    process.exit(1);
  }

  const syncBranch = !args.noSync && !args.enableOnly;
  const r = progressPullRequest(args.pr, { dryRun: args.dryRun, syncBranch, enableAuto: true });
  if (r.sync && syncBranch) console.log(`sync ${r.sync.action}: ${r.sync.detail}`);
  if (r.autoMerge) console.log(`auto-merge ${r.autoMerge.action}: ${r.autoMerge.detail}`);
  if (r.blocked) process.exit(r.sync?.exitCode === 2 ? 2 : 1);
  process.exit(r.ok ? 0 : 1);
}

main();
