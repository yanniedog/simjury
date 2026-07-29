#!/usr/bin/env node
/**
 * Post @coderabbitai review on a PR when CodeRabbit has not yet appeared.
 * Idempotent: skips gate-exempt PRs and PRs where coderabbitai already commented/reviewed.
 *
 * Usage:
 *   node scripts/request-coderabbit-review.mjs --pr 15
 *   node scripts/request-coderabbit-review.mjs --pr 15 --dry-run
 */
import { spawnSync } from 'node:child_process';
import { loginMatchesRequiredKey } from './lib/bot-wait-config.mjs';
import { gateExemptReason } from './lib/pr-gate-exempt.mjs';
import { ghJson } from './lib/gh-pr-review-threads.mjs';

const CR_TRIGGER = '@coderabbitai review';
const CR_TRIGGER_PATTERN = /@coderabbitai\s+review/i;
const RETRY_MARKER = '<!-- simjury-coderabbit-rate-limit-retry -->';

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

function coderabbitSeenOnPr(prNumber) {
  const view = ghJson(['pr', 'view', String(prNumber), '--json', 'comments,reviews']);
  const logins = [
    ...(view?.comments || []).map((c) => c.author?.login),
    ...(view?.reviews || []).map((r) => r.author?.login),
  ].filter(Boolean);
  return logins.some((login) => isCodeRabbitLogin(login));
}

function triggerAlreadyPosted(prNumber) {
  const view = ghJson(['pr', 'view', String(prNumber), '--json', 'comments']);
  const comments = view?.comments || [];
  return comments.some((c) => {
    const body = String(c.body || '');
    // Rate-limit retry owns its own re-trigger; do not double-fire here.
    if (body.includes(RETRY_MARKER)) return true;
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

  if (coderabbitSeenOnPr(prNumber)) {
    console.log(`request-coderabbit-review: CodeRabbit already present on PR #${prNumber} — skip`);
    process.exit(0);
  }

  if (triggerAlreadyPosted(prNumber)) {
    console.log(
      `request-coderabbit-review: prior @coderabbitai review on PR #${prNumber} with no reply — re-requesting`,
    );
  }

  process.exit(postTrigger(prNumber, args.dryRun));
}

main();
