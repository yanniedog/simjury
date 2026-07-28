#!/usr/bin/env node
/**
 * After CodeRabbit rate-limits a PR, wait until the stated window clears, then
 * post `@coderabbitai review` so the PR gets reviewed automatically.
 *
 * Usage:
 *   node scripts/coderabbit-rate-limit-retry.mjs --pr 187
 *   node scripts/coderabbit-rate-limit-retry.mjs --pr 187 --dry-run
 *   node scripts/coderabbit-rate-limit-retry.mjs --pr 187 --no-sleep
 */
import { spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { gateExemptReason } from './lib/pr-gate-exempt.mjs';
import { ghJson } from './lib/gh-pr-review-threads.mjs';
import {
  CR_RETRY_MARKER,
  CR_REVIEW_TRIGGER,
  clampWaitMs,
  coderabbitReviewedAfter,
  latestRateLimitEvent,
  msUntilRetry,
  retryAlreadyArmed,
} from './lib/coderabbit-rate-limit.mjs';

function parseArgs(argv) {
  const out = {
    pr: null,
    prError: null,
    dryRun: false,
    noSleep: false,
    bufferMinutes: 2,
    maxWaitMinutes: 120,
    help: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--no-sleep') out.noSleep = true;
    else if (a === '--pr') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) out.prError = '--pr requires a value';
      else out.pr = argv[++i];
    } else if (a === '--buffer-minutes') {
      out.bufferMinutes = Number(argv[++i]);
    } else if (a === '--max-wait-minutes') {
      out.maxWaitMinutes = Number(argv[++i]);
    }
  }
  return out;
}

function loadPrActivity(prNumber) {
  const view = ghJson(['pr', 'view', String(prNumber), '--json', 'state,comments,reviews']);
  return {
    state: view?.state || null,
    comments: view?.comments || [],
    reviews: view?.reviews || [],
  };
}

function postRetryTrigger(prNumber, dryRun) {
  const body = `${CR_RETRY_MARKER}\n${CR_REVIEW_TRIGGER}`;
  if (dryRun) {
    console.log(`[dry-run] would post retry trigger on PR #${prNumber}:\n${body}`);
    return 0;
  }
  const r = spawnSync('gh', ['pr', 'comment', String(prNumber), '--body', body], {
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    console.error(
      `coderabbit-rate-limit-retry: failed to comment on PR #${prNumber}: ${(r.stderr || '').trim()}`,
    );
    return 1;
  }
  console.log(`coderabbit-rate-limit-retry: posted ${CR_REVIEW_TRIGGER} on PR #${prNumber}`);
  return 0;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.prError) {
    console.error(`coderabbit-rate-limit-retry: ${args.prError}`);
    process.exit(1);
  }
  if (args.help || !args.pr) {
    console.log(
      `Usage: node scripts/coderabbit-rate-limit-retry.mjs --pr <n> [--dry-run] [--no-sleep] [--buffer-minutes 2] [--max-wait-minutes 120]`,
    );
    process.exit(args.help ? 0 : 1);
  }

  const prNumber = String(args.pr).trim();
  const exempt = gateExemptReason(prNumber);
  if (exempt) {
    console.log(`coderabbit-rate-limit-retry: PR #${prNumber} gate-exempt (${exempt}) — skip`);
    process.exit(0);
  }

  let activity = loadPrActivity(prNumber);
  if (String(activity.state || '').toUpperCase() !== 'OPEN') {
    console.log(`coderabbit-rate-limit-retry: PR #${prNumber} not open (${activity.state}) — skip`);
    process.exit(0);
  }

  const limit = latestRateLimitEvent(activity.comments);
  if (!limit) {
    console.log(`coderabbit-rate-limit-retry: no CodeRabbit rate-limit comment on PR #${prNumber} — skip`);
    process.exit(0);
  }

  if (coderabbitReviewedAfter(activity.reviews, activity.comments, limit.createdAt)) {
    console.log(
      `coderabbit-rate-limit-retry: CodeRabbit already reviewed PR #${prNumber} after rate-limit — skip`,
    );
    process.exit(0);
  }

  if (retryAlreadyArmed(activity.comments, limit.createdAt)) {
    console.log(
      `coderabbit-rate-limit-retry: retry already posted for PR #${prNumber} after latest rate-limit — skip`,
    );
    process.exit(0);
  }

  const waitMs = clampWaitMs(
    msUntilRetry(limit.createdAt, limit.waitMinutes, args.bufferMinutes),
    { maxMs: args.maxWaitMinutes * 60_000 },
  );
  console.log(
    `coderabbit-rate-limit-retry: PR #${prNumber} rate-limited at ${limit.createdAt}; ` +
      `waitMinutes=${limit.waitMinutes}; sleeping ${Math.ceil(waitMs / 1000)}s` +
      (args.noSleep ? ' (skipped --no-sleep)' : ''),
  );

  if (!args.noSleep && waitMs > 0) {
    const chunk = 5 * 60_000;
    let left = waitMs;
    while (left > 0) {
      const step = Math.min(chunk, left);
      await sleep(step);
      left -= step;
      if (left > 0) {
        console.log(`coderabbit-rate-limit-retry: ${Math.ceil(left / 1000)}s remaining…`);
      }
    }
  }

  activity = loadPrActivity(prNumber);
  if (String(activity.state || '').toUpperCase() !== 'OPEN') {
    console.log(`coderabbit-rate-limit-retry: PR #${prNumber} closed during wait — skip`);
    process.exit(0);
  }

  const limitAfterWait = latestRateLimitEvent(activity.comments);
  const anchor = limitAfterWait?.createdAt || limit.createdAt;
  if (coderabbitReviewedAfter(activity.reviews, activity.comments, anchor)) {
    console.log(
      `coderabbit-rate-limit-retry: CodeRabbit reviewed PR #${prNumber} during wait — skip`,
    );
    process.exit(0);
  }
  if (retryAlreadyArmed(activity.comments, anchor)) {
    console.log(`coderabbit-rate-limit-retry: retry already armed on PR #${prNumber} — skip`);
    process.exit(0);
  }

  process.exit(postRetryTrigger(prNumber, args.dryRun));
}

main().catch((err) => {
  console.error(`coderabbit-rate-limit-retry: ${err?.stack || err}`);
  process.exit(1);
});
