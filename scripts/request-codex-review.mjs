#!/usr/bin/env node
/**
 * Post @codex review on a PR when ChatGPT Codex Connector has not yet appeared.
 * Idempotent: skips gate-exempt PRs and PRs where codex already commented or reviewed.
 *
 * Usage:
 *   node scripts/request-codex-review.mjs --pr 15
 *   node scripts/request-codex-review.mjs --pr 15 --dry-run
 */
import { spawnSync } from 'node:child_process';
import { loginMatchesRequiredKey } from './lib/bot-wait-config.mjs';
import { gateExemptReason } from './lib/pr-gate-exempt.mjs';
import { ghJson } from './lib/gh-pr-review-threads.mjs';

const CODEX_TRIGGER = '@codex review';
const CODEX_TRIGGER_PATTERN = new RegExp(
  CODEX_TRIGGER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  'i',
);

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

function isCodexLogin(login) {
  return loginMatchesRequiredKey(login, 'codex');
}

function codexSeenOnPr(prNumber) {
  const view = ghJson(['pr', 'view', String(prNumber), '--json', 'comments,reviews']);
  const logins = [
    ...(view?.comments || []).map((c) => c.author?.login),
    ...(view?.reviews || []).map((r) => r.author?.login),
  ].filter(Boolean);
  return logins.some((login) => isCodexLogin(login));
}

function triggerAlreadyPosted(prNumber) {
  const view = ghJson(['pr', 'view', String(prNumber), '--json', 'comments']);
  const comments = view?.comments || [];
  return comments.some((c) => CODEX_TRIGGER_PATTERN.test(String(c.body || '')));
}

function postCodexTrigger(prNumber, dryRun) {
  if (dryRun) {
    console.log(`[dry-run] would post "${CODEX_TRIGGER}" on PR #${prNumber}`);
    return 0;
  }
  const r = spawnSync('gh', ['pr', 'comment', String(prNumber), '--body', CODEX_TRIGGER], {
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    console.error(`request-codex-review: failed to comment on PR #${prNumber}: ${(r.stderr || '').trim()}`);
    return 1;
  }
  console.log(`request-codex-review: posted "${CODEX_TRIGGER}" on PR #${prNumber}`);
  return 0;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.prError) {
    console.error(`request-codex-review: ${args.prError}`);
    process.exit(1);
  }
  if (args.help || !args.pr) {
    console.log(`Usage: node scripts/request-codex-review.mjs --pr <n> [--dry-run]`);
    process.exit(args.help ? 0 : 1);
  }

  const prNumber = String(args.pr).trim();
  const exempt = gateExemptReason(prNumber);
  if (exempt) {
    console.log(`request-codex-review: PR #${prNumber} gate-exempt (${exempt}) — skip`);
    process.exit(0);
  }

  if (codexSeenOnPr(prNumber)) {
    console.log(`request-codex-review: codex already present on PR #${prNumber} — skip`);
    process.exit(0);
  }

  // Re-request when a prior @codex review never produced a connector response
  // (app lag, missed webhook). Idempotent once chatgpt-codex-connector appears.
  if (triggerAlreadyPosted(prNumber)) {
    console.log(
      `request-codex-review: prior @codex review on PR #${prNumber} with no connector reply — re-requesting`,
    );
  }

  process.exit(postCodexTrigger(prNumber, args.dryRun));
}

main();
