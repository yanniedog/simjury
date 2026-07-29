#!/usr/bin/env node
/**
 * Post @coderabbitai review on a PR when CodeRabbit has not yet appeared.
 * Idempotent: skips gate-exempt PRs and PRs where coderabbitai already reviewed.
 *
 * Rate limits: do NOT re-request here. `pr-coderabbit-rate-limit-retry` waits up
 * to 120 minutes then posts `@coderabbitai review` with its own marker.
 *
 * Usage:
 *   node scripts/request-coderabbit-review.mjs --pr 15
 *   node scripts/request-coderabbit-review.mjs --pr 15 --dry-run
 */
import { spawnSync } from 'node:child_process';
import { isBotNoise } from './lib/bot-noise.mjs';
import {
  CR_RETRY_MARKER,
  CR_REVIEW_TRIGGER,
  isRateLimitBody,
  latestRateLimitEvent,
  retryAlreadyArmed,
} from './lib/coderabbit-rate-limit.mjs';
import { loginMatchesRequiredKey } from './lib/bot-wait-config.mjs';
import { gateExemptReason } from './lib/pr-gate-exempt.mjs';
import { ghJson } from './lib/gh-pr-review-threads.mjs';

const CR_TRIGGER = CR_REVIEW_TRIGGER;
const CR_TRIGGER_PATTERN = /@coderabbitai\s+review/i;

function parseArgs(argv) {
  const out = { pr: null, prError: null, dryRun: false, help: false };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--pr') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) out.prError = '--pr requires a value';
      else out.pr = argv[++i];
    }
  }
  return out;
}

function isCodeRabbitLogin(login) {
  return loginMatchesRequiredKey(login, 'coderabbit');
}

function loadPrActivity(prNumber) {
  return ghJson(['pr', 'view', String(prNumber), '--json', 'comments,reviews']);
}

/** True when CodeRabbit posted a substantive (non-quota) comment or review. */
function coderabbitSubstantiveOnPr(view) {
  for (const c of view?.comments || []) {
    if (!isCodeRabbitLogin(c.author?.login)) continue;
    const body = String(c.body || '');
    if (isRateLimitBody(body) || isBotNoise(body)) continue;
    return true;
  }
  for (const r of view?.reviews || []) {
    if (!isCodeRabbitLogin(r.author?.login)) continue;
    const body = String(r.body || '');
    if (isRateLimitBody(body) || isBotNoise(body)) continue;
    return true;
  }
  return false;
}

function rateLimitOwnsRetry(view) {
  const comments = view?.comments || [];
  const latest = latestRateLimitEvent(comments);
  if (!latest) return false;
  // Retry Action is armed, or rate-limit is the latest CR signal (Action will arm).
  if (retryAlreadyArmed(comments, latest.createdAt)) return true;
  return true;
}

function humanTriggerAlreadyPosted(view) {
  const comments = view?.comments || [];
  return comments.some((c) => {
    const body = String(c.body || '');
    if (body.includes(CR_RETRY_MARKER)) return false; // owned by rate-limit Action
    return CR_TRIGGER_PATTERN.test(body);
  });
}

function postTrigger(prNumber, dryRun) {
  if (dryRun) {
    console.log(`[dry-run] would post "${CR_TRIGGER}" on PR #${prNumber}`);
    return 0;
  }
  const r = spawnSync('gh', ['pr', 'comment', String(prNumber), '--body', CR_TRIGGER], {
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    console.error(
      `request-coderabbit-review: failed to comment on PR #${prNumber}: ${(r.stderr || '').trim()}`,
    );
    return 1;
  }
  console.log(`request-coderabbit-review: posted "${CR_TRIGGER}" on PR #${prNumber}`);
  return 0;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.prError) {
    console.error(`request-coderabbit-review: ${args.prError}`);
    process.exit(1);
  }
  if (args.help || !args.pr) {
    console.log(`Usage: node scripts/request-coderabbit-review.mjs --pr <n> [--dry-run]`);
    process.exit(args.help ? 0 : 1);
  }

  const prNumber = String(args.pr).trim();
  const exempt = gateExemptReason(prNumber);
  if (exempt) {
    console.log(`request-coderabbit-review: PR #${prNumber} gate-exempt (${exempt}) — skip`);
    process.exit(0);
  }

  const view = loadPrActivity(prNumber);

  if (coderabbitSubstantiveOnPr(view)) {
    console.log(
      `request-coderabbit-review: CodeRabbit substantive review already on PR #${prNumber} — skip`,
    );
    process.exit(0);
  }

  if (rateLimitOwnsRetry(view)) {
    console.log(
      `request-coderabbit-review: CodeRabbit rate-limited on PR #${prNumber} — ` +
        `defer to pr-coderabbit-rate-limit-retry (≤120m)`,
    );
    process.exit(0);
  }

  if (humanTriggerAlreadyPosted(view)) {
    console.log(
      `request-coderabbit-review: prior @coderabbitai review on PR #${prNumber} with no reply — re-requesting`,
    );
  }

  process.exit(postTrigger(prNumber, args.dryRun));
}

main();
