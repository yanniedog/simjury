#!/usr/bin/env node
/**
 * Merge/close protection helper.
 *
 * Exit 0 — PR may stay closed (merged, gate-exempt, or no outstanding feedback)
 * Exit 1 — PR was closed with unresolved review feedback; reopen required
 * Exit 2 — waiting / rate-limit soft failure
 * Exit 3 — hard tooling error
 *
 * Usage:
 *   node scripts/pr-bot-close-guard.mjs --pr <n> [--reopen] [--dry-run] [--json]
 */
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  DEFAULT_REQUIRED_SPEC,
  resolveRequiredKeys,
} from './lib/bot-wait-config.mjs';
import { checkRequiredBotsOnPr } from './lib/bot-wait-presence.mjs';
import {
  GhRateLimitError,
  classifyThreads,
  fetchPullRequestThreads,
  hasGh,
  repoSlug,
} from './lib/gh-pr-review-threads.mjs';
import { gateExemptReason } from './lib/pr-gate-exempt.mjs';

function parseArgs(argv) {
  const out = {
    pr: null,
    reopen: false,
    dryRun: false,
    json: false,
    help: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--reopen') out.reopen = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--json') out.json = true;
    else if (a === '--pr' && argv[i + 1]) out.pr = Number(argv[++i]);
    else if (a.startsWith('--pr=')) out.pr = Number(a.slice(5));
  }
  if (out.pr != null && (!Number.isInteger(out.pr) || out.pr <= 0)) {
    out.prError = 'invalid --pr (positive integer required)';
  }
  return out;
}

function ghJson(args) {
  const r = spawnSync('gh', args, { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error((r.stderr || r.stdout || `gh exit ${r.status}`).trim());
  }
  const text = (r.stdout || '').trim();
  return text ? JSON.parse(text) : null;
}

/**
 * Does this PR change nothing at all relative to its base?
 *
 * Requires all three counters to be present and zero. A missing field means the
 * question was not answered, not that the answer is "empty" — treating an
 * absent count as zero would let an API hiccup wave a real PR through.
 */
export function isEmptyDiff(meta) {
  const counts = [meta?.additions, meta?.deletions, meta?.changedFiles];
  return counts.every((n) => n === 0);
}

function reopenPr(prNumber, dryRun) {
  if (dryRun) {
    console.log(`[dry-run] would reopen PR #${prNumber}`);
    return true;
  }
  const r = spawnSync('gh', ['pr', 'reopen', String(prNumber)], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(`pr-bot-close-guard: reopen failed: ${(r.stderr || '').trim()}`);
    return false;
  }
  return true;
}

function commentOnPr(prNumber, body, dryRun) {
  if (dryRun) {
    console.log(`[dry-run] would comment on PR #${prNumber}: ${body.slice(0, 120)}…`);
    return true;
  }
  const r = spawnSync('gh', ['pr', 'comment', String(prNumber), '--body', body], {
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    console.error(`pr-bot-close-guard: comment failed: ${(r.stderr || '').trim()}`);
    return false;
  }
  return true;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Usage: node scripts/pr-bot-close-guard.mjs --pr <n> [--reopen] [--dry-run] [--json]

Blocks premature PR closure while review feedback remains unresolved.
Required presence default: ${DEFAULT_REQUIRED_SPEC} (advisory)
Unresolved substantive review threads also block closure.`);
    process.exit(0);
  }
  if (args.prError) {
    console.error(`pr-bot-close-guard: ${args.prError}`);
    process.exit(3);
  }
  if (!args.pr) {
    console.error('pr-bot-close-guard: --pr <n> required');
    process.exit(3);
  }
  if (!hasGh()) {
    console.error('pr-bot-close-guard: gh CLI required');
    process.exit(3);
  }

  let owner;
  let name;
  try {
    ({ owner, name } = repoSlug());
  } catch (e) {
    console.error(`pr-bot-close-guard: ${e.message}`);
    process.exit(e instanceof GhRateLimitError ? 2 : 3);
  }

  const prNumber = args.pr;
  let meta;
  try {
    meta = ghJson([
      'pr',
      'view',
      String(prNumber),
      '--json',
      'number,title,state,mergedAt,closedAt,author,additions,deletions,changedFiles',
    ]);
  } catch (e) {
    console.error(`pr-bot-close-guard: ${e.message}`);
    process.exit(3);
  }

  const exempt = gateExemptReason(prNumber);
  const result = {
    prNumber,
    state: meta.state,
    merged: Boolean(meta.mergedAt),
    exempt,
    blockClose: false,
    reasons: [],
    reopened: false,
  };

  if (meta.mergedAt || meta.state === 'MERGED') {
    result.ok = true;
    result.detail = 'merged — close guard N/A';
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else console.log(`pr-bot-close-guard: PR #${prNumber} merged — ok`);
    process.exit(0);
  }

  if (exempt) {
    result.ok = true;
    result.detail = `gate-exempt (${exempt})`;
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else console.log(`pr-bot-close-guard: PR #${prNumber} gate-exempt (${exempt}) — ok`);
    process.exit(0);
  }

  // A PR that changes nothing cannot launder anything past review, so closing
  // it is never an evasion. This happens routinely in a dependency chain: when
  // a parent lands carrying a child's commit as an ancestor, the child rebases
  // to empty. PR #263 was closed for exactly that reason and the guard reopened
  // it, leaving a permanently unmergeable PR that no bot could ever satisfy.
  if (isEmptyDiff(meta)) {
    result.ok = true;
    result.detail = 'empty diff — nothing to review';
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else console.log(`pr-bot-close-guard: PR #${prNumber} changes nothing — ok`);
    process.exit(0);
  }

  if (meta.state === 'OPEN') {
    // Still open — evaluate whether a *future* close would be blocked.
    // Exit 0 with blockClose flag for CI dry checks; do not reopen.
  }

  try {
    const requiredKeys = resolveRequiredKeys();
    const presence = checkRequiredBotsOnPr(owner, name, prNumber, { requiredKeys });
    if (!presence.ok) {
      result.blockClose = true;
      result.reasons.push(
        `required bots not present since wait anchor: ${(presence.missing || []).join(', ')}`,
      );
    }

    const pr = fetchPullRequestThreads(owner, name, prNumber);
    const violations = classifyThreads(pr.threads || []);
    if (violations.length) {
      result.blockClose = true;
      result.reasons.push(`${violations.length} unresolved substantive review thread(s)`);
    }
  } catch (e) {
    if (e instanceof GhRateLimitError) {
      console.error(`pr-bot-close-guard: rate limit — ${e.message}`);
      process.exit(2);
    }
    console.error(`pr-bot-close-guard: ${e.message}`);
    process.exit(3);
  }

  if (!result.blockClose) {
    result.ok = true;
    result.detail = 'no outstanding review feedback';
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else console.log(`pr-bot-close-guard: PR #${prNumber} clear to close`);
    process.exit(0);
  }

  result.ok = false;
  result.detail = result.reasons.join('; ');

  if (meta.state === 'CLOSED' && args.reopen) {
    const body = [
      '<!-- simjury-bot-close-guard -->',
      '**Review protection:** this PR was closed while review obligations remained.',
      '',
      ...result.reasons.map((r) => `- ${r}`),
      '',
      'Reopened automatically. Squash merge stays blocked until',
      '`bot-feedback-gate` is green (all substantive threads resolved).',
    ].join('\n');
    result.reopened = reopenPr(prNumber, args.dryRun);
    if (result.reopened) {
      commentOnPr(prNumber, body, args.dryRun);
    } else {
      // Distinct from blocked+reopened (exit 1): workflow must fail when reopen fails.
      if (args.json) console.log(JSON.stringify(result, null, 2));
      else {
        console.error(`pr-bot-close-guard: PR #${prNumber} blocked — ${result.detail}`);
        console.error(`pr-bot-close-guard: failed to reopen PR #${prNumber}`);
      }
      process.exit(3);
    }
  }

  if (args.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.error(`pr-bot-close-guard: PR #${prNumber} blocked — ${result.detail}`);
    if (meta.state === 'CLOSED' && args.reopen && result.reopened) {
      console.error(`pr-bot-close-guard: reopened PR #${prNumber}`);
    }
  }
  process.exit(1);
}

// Only run as a CLI, so the helpers above can be unit-tested by importing this
// module without it exiting on a missing --pr.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
