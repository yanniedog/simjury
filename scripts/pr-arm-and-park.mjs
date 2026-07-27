#!/usr/bin/env node
/**
 * Arm squash auto-merge and classify PR state in ONE shot — never poll.
 *
 * Replaces agent babysit loops (`wait-for-bots --watch`, `pr:gates:check --watch`,
 * sleep-until-bots). GitHub Actions + auto-merge own the wait clock.
 *
 * Exit codes:
 *   0  ready — all gates pass (auto-merge armed when possible)
 *   2  parked — waiting on CI/bots only; auto-merge armed; END AGENT TURN
 *   3  actionable — agent must fix CI / threads / conflicts (do not park)
 *   1  hard error
 */
import { resolvePrNumber } from './lib/pr-gates-lib.mjs';
import { armAndParkOnce } from './lib/pr-arm-and-park-lib.mjs';

function parseArgs(argv) {
  const out = {
    pr: null,
    json: false,
    quiet: false,
    dryRun: false,
    skipArm: false,
    skipSync: false,
    help: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--json') out.json = true;
    else if (a === '--quiet' || a === '-q') out.quiet = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--skip-arm') out.skipArm = true;
    else if (a === '--skip-sync') out.skipSync = true;
    else if (a === '--pr' && argv[i + 1]) out.pr = Number(argv[++i]);
    else if (a.startsWith('--pr=')) out.pr = Number(a.slice(5));
  }
  if (out.pr != null && (!Number.isInteger(out.pr) || out.pr <= 0)) {
    out.prError = 'invalid --pr (positive integer required)';
  }
  return out;
}

function printGateList(label, gates) {
  if (!gates?.length) return;
  console.error(`${label}:`);
  for (const g of gates) {
    console.error(`  [${g.id}] ${g.detail || ''}`);
    if (g.action) console.error(`     → ${g.action}`);
  }
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Usage: npm run pr:arm-and-park -- [--pr N] [--json] [--quiet] [--dry-run]

One-shot PR progression for agents (no --watch, no sleep polls):
  1. Sync branch when behind (gh pr update-branch)
  2. Enable squash auto-merge (gh pr merge --auto --squash --delete-branch)
  3. Classify merge gates as ready | waiting | actionable

Exit codes:
  0  ready — gates green; auto-merge will land (or already mergeable)
  2  parked — only waiting on bots/CI; END TURN (do not poll)
  3  actionable — fix CI, conflicts, or review threads then re-run
  1  error

Never run wait-for-bots --watch or pr:gates:check --watch in an agent session.
GitHub Actions re-fire bot gates; auto-merge merges when green.`);
    process.exit(0);
  }
  if (args.prError) {
    console.error(`pr:arm-and-park: ${args.prError}`);
    process.exit(1);
  }

  let prMeta;
  try {
    prMeta = resolvePrNumber(args.pr);
  } catch (e) {
    console.error(`pr:arm-and-park: ${e.message}`);
    process.exit(1);
  }
  if (prMeta.error) {
    console.error(`pr:arm-and-park: ${prMeta.error}`);
    process.exit(1);
  }

  const prNumber = prMeta.pr.number;
  const result = armAndParkOnce(prNumber, {
    dryRun: args.dryRun,
    skipArm: args.skipArm,
    skipSync: args.skipSync,
  });

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  }

  if (result.mode === 'error' || result.error && !result.classification) {
    if (!args.json) {
      console.error(`pr:arm-and-park: ERROR on PR #${prNumber}: ${result.error}`);
    }
    process.exit(1);
  }

  const mode = result.mode || result.classification?.mode;
  const armed = result.autoMergeArmed ? 'armed' : 'NOT armed';

  if (mode === 'ready') {
    if (!args.quiet && !args.json) {
      console.log(
        `pr:arm-and-park: PR #${prNumber} READY — all gates pass; auto-merge ${armed}`,
      );
      if (result.progression?.autoMerge) {
        console.log(`  auto-merge: ${result.progression.autoMerge.action} — ${result.progression.autoMerge.detail}`);
      }
    }
    process.exit(0);
  }

  if (mode === 'waiting') {
    if (!args.quiet && !args.json) {
      console.log(
        `pr:arm-and-park: PR #${prNumber} PARKED — waiting only; auto-merge ${armed}. END AGENT TURN.`,
      );
      if (result.progression?.autoMerge && !result.autoMergeArmed) {
        console.error(
          `  auto-merge arm failed: ${result.progression.autoMerge.detail || result.progression.autoMerge.action}`,
        );
      } else if (result.progression?.autoMerge) {
        console.log(`  auto-merge: ${result.progression.autoMerge.action} — ${result.progression.autoMerge.detail}`);
      }
      printGateList('Waiting on', result.classification?.waiting);
      console.log('  Do NOT run --watch / sleep polls. Re-run pr:arm-and-park when woken for actionable work.');
    }
    // Parked is success for token efficiency — exit 2 so closeout can detect open PR,
    // but AGENTS.md treats exit 2 from arm-and-park as OK to end turn.
    process.exit(2);
  }

  // actionable
  if (!args.json) {
    console.error(
      `pr:arm-and-park: PR #${prNumber} ACTIONABLE — agent must work; auto-merge ${armed}`,
    );
    printGateList('Actionable', result.classification?.actionable);
    if (result.classification?.waiting?.length) {
      printGateList('Also waiting', result.classification.waiting);
    }
    if (result.error) console.error(`  detail: ${result.error}`);
  }
  process.exit(3);
}

main();
