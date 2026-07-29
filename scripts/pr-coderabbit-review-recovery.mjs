#!/usr/bin/env node
/**
 * Recover closed/merged PRs that never received a proper CodeRabbit review
 * (rate-limit only, failed review, or missing substantive review).
 *
 * - CLOSED (unmerged): reopen, then request @coderabbitai review
 * - MERGED: GitHub cannot reopen a merged PR — comment on it and keep requesting
 *   @coderabbitai review hourly (CR can still review merged PRs)
 * - At most one recovery @coderabbitai review trigger per PR per hour
 * - Stops when a substantive CodeRabbit review is present
 *
 * Usage:
 *   node scripts/pr-coderabbit-review-recovery.mjs [--dry-run] [--lookback-days 14] [--pr N] [--json]
 */
import { spawnSync } from 'node:child_process';
import {
  CR_RECOVERY_INTERVAL_MS,
  CR_RECOVERY_MARKER,
  CR_RECOVERY_TRIGGER,
  canPostRecoveryTrigger,
  classifyCoderabbitActivity,
  latestRecoveryTriggerAt,
  needsCoderabbitRecovery,
} from './lib/coderabbit-review-status.mjs';
import { hasGh, repoSlug } from './lib/gh-pr-review-threads.mjs';
import { gateExemptReasonFromPrMeta } from './lib/pr-gate-exempt.mjs';

function parseArgs(argv) {
  const out = {
    dryRun: false,
    json: false,
    help: false,
    lookbackDays: Number(process.env.CR_RECOVERY_LOOKBACK_DAYS || 14),
    pr: null,
    maxPrs: Number(process.env.CR_RECOVERY_MAX_PRS || 40),
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--json') out.json = true;
    else if (a === '--lookback-days' && argv[i + 1]) out.lookbackDays = Number(argv[++i]);
    else if (a.startsWith('--lookback-days=')) out.lookbackDays = Number(a.split('=')[1]);
    else if (a === '--max-prs' && argv[i + 1]) out.maxPrs = Number(argv[++i]);
    else if (a === '--pr' && argv[i + 1]) out.pr = Number(argv[++i]);
    else if (a.startsWith('--pr=')) out.pr = Number(a.slice(5));
  }
  return out;
}

function ghJson(args) {
  const r = spawnSync('gh', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (r.status !== 0) {
    throw new Error((r.stderr || r.stdout || `gh exit ${r.status}`).trim());
  }
  const text = (r.stdout || '').trim();
  return text ? JSON.parse(text) : null;
}

function ghOk(args, { dryRun = false, label = 'gh' } = {}) {
  if (dryRun) {
    console.log(`[dry-run] ${label}: gh ${args.join(' ')}`);
    return { ok: true, dryRun: true };
  }
  const r = spawnSync('gh', args, { encoding: 'utf8' });
  if (r.status !== 0) {
    return { ok: false, error: (r.stderr || r.stdout || `gh exit ${r.status}`).trim() };
  }
  return { ok: true, stdout: (r.stdout || '').trim() };
}

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function listCandidatePrs({ lookbackDays, maxPrs, pr }) {
  if (pr) {
    const one = ghJson([
      'pr',
      'view',
      String(pr),
      '--json',
      'number,title,state,mergedAt,closedAt,createdAt,author,headRefName,baseRefName,url',
    ]);
    return one ? [one] : [];
  }
  const since = isoDaysAgo(lookbackDays);
  const closed = ghJson([
    'pr',
    'list',
    '--state',
    'closed',
    '--limit',
    String(maxPrs),
    '--json',
    'number,title,state,mergedAt,closedAt,createdAt,author,headRefName,baseRefName,url',
  ]);
  const rows = Array.isArray(closed) ? closed : [];
  return rows.filter((row) => {
    const stamp = row.mergedAt || row.closedAt || row.createdAt;
    if (!stamp) return true;
    return String(stamp) >= since;
  });
}

function loadActivity(prNumber) {
  return ghJson(['pr', 'view', String(prNumber), '--json', 'comments,reviews,state,mergedAt,closedAt,title,author']);
}

function postRecoveryTrigger(prNumber, { dryRun, reason, merged }) {
  const reopenNote = merged
    ? 'This PR is **merged** (GitHub cannot reopen merged PRs). Requesting CodeRabbit review on the merged PR until a substantive review lands; file follow-ups for any findings.'
    : 'This PR was **closed** without a substantive CodeRabbit review and has been reopened.';
  const body = [
    CR_RECOVERY_MARKER,
    `**CodeRabbit review recovery** (${reason}).`,
    '',
    reopenNote,
    '',
    'Lacks a substantive CodeRabbit review (rate-limit notice, failed review, or missing review).',
    `Requesting review (at most once per ${CR_RECOVERY_INTERVAL_MS / 60000} minutes) until CR posts a proper review.`,
    '',
    CR_RECOVERY_TRIGGER,
  ].join('\n');
  return ghOk(['pr', 'comment', String(prNumber), '--body', body], {
    dryRun,
    label: `recovery trigger on #${prNumber}`,
  });
}

function reopenPr(prNumber, dryRun) {
  return ghOk(['pr', 'reopen', String(prNumber)], { dryRun, label: `reopen #${prNumber}` });
}

function processOne(_owner, _name, row, { dryRun }) {
  const result = {
    number: row.number,
    title: row.title,
    url: row.url,
    state: row.state,
    merged: Boolean(row.mergedAt),
    actions: [],
    skipped: null,
    ok: true,
  };

  const exempt = gateExemptReasonFromPrMeta({ title: row.title, author: row.author });
  if (exempt) {
    result.skipped = `gate-exempt (${exempt})`;
    return result;
  }

  const activityView = loadActivity(row.number);
  const activity = classifyCoderabbitActivity(activityView?.reviews || [], activityView?.comments || []);
  const meta = {
    state: activityView?.state || row.state,
    mergedAt: activityView?.mergedAt || row.mergedAt,
    closedAt: activityView?.closedAt || row.closedAt,
    merged: Boolean(activityView?.mergedAt || row.mergedAt),
  };

  if (!needsCoderabbitRecovery(meta, activity)) {
    result.skipped = activity.hasSubstantive
      ? 'substantive CodeRabbit review already present'
      : 'not closed/merged or no recovery needed';
    return result;
  }

  result.reason = activity.hasRateLimitOnly
    ? 'rate-limit-only'
    : activity.hasFailed
      ? 'failed-review'
      : 'missing-substantive-review';

  if (!meta.merged && String(meta.state || '').toUpperCase() === 'CLOSED') {
    const re = reopenPr(row.number, dryRun);
    result.actions.push({ type: 'reopen', ok: re.ok, error: re.error });
    if (!re.ok && !dryRun) {
      // Still try to request CR review even if reopen failed (permissions, etc.).
      result.actions.push({ type: 'reopen-failed-continue', detail: re.error });
    }
  } else if (meta.merged) {
    result.actions.push({
      type: 'merged-note',
      ok: true,
      detail: 'GitHub cannot reopen merged PRs; requesting CR review on the merged PR',
    });
  }

  const comments = activityView?.comments || [];
  const latestTrigger = latestRecoveryTriggerAt(comments);
  if (!canPostRecoveryTrigger(latestTrigger)) {
    result.actions.push({
      type: 'request-review',
      ok: true,
      skipped: `last recovery trigger ${latestTrigger} within hourly window`,
    });
    return result;
  }

  const post = postRecoveryTrigger(row.number, {
    dryRun,
    reason: result.reason,
    merged: meta.merged,
  });
  result.actions.push({
    type: 'request-review',
    ok: post.ok,
    error: post.error,
    targetPr: row.number,
  });
  if (!post.ok) {
    result.ok = false;
    result.error = post.error;
  }
  return result;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Usage: node scripts/pr-coderabbit-review-recovery.mjs [options]

Options:
  --pr <n>              Process a single PR
  --lookback-days <n>   Closed/merged window (default 14)
  --max-prs <n>         Max closed PRs to scan (default 40)
  --dry-run             Print actions only
  --json                JSON summary on stdout
  --help

Hourly GH Action: .github/workflows/pr-coderabbit-review-recovery.yml`);
    process.exit(0);
  }
  if (!hasGh()) {
    console.error('pr-coderabbit-review-recovery: gh CLI required');
    process.exit(1);
  }

  let owner;
  let name;
  try {
    ({ owner, name } = repoSlug());
  } catch (e) {
    console.error(`pr-coderabbit-review-recovery: ${e.message}`);
    process.exit(1);
  }

  let candidates;
  try {
    candidates = listCandidatePrs(args);
  } catch (e) {
    console.error(`pr-coderabbit-review-recovery: list failed: ${e.message}`);
    process.exit(1);
  }

  const report = [];
  for (const row of candidates) {
    try {
      report.push(processOne(owner, name, row, { dryRun: args.dryRun }));
    } catch (e) {
      report.push({ number: row.number, ok: false, error: e.message, actions: [] });
    }
  }

  const acted = report.filter((r) => !r.skipped);
  const failed = report.filter((r) => r.ok === false);

  if (args.json) {
    console.log(JSON.stringify({ scanned: report.length, acted: acted.length, failed: failed.length, report }, null, 2));
  } else {
    console.log(
      `pr-coderabbit-review-recovery: scanned ${report.length}; acted ${acted.length}; failed ${failed.length}`,
    );
    for (const r of report) {
      if (r.skipped) {
        console.log(`  #${r.number}: skip — ${r.skipped}`);
        continue;
      }
      const bits = (r.actions || []).map((a) => `${a.type}:${a.ok === false ? 'fail' : a.skipped ? 'wait' : 'ok'}`);
      console.log(`  #${r.number}: ${r.reason || 'recover'} → ${bits.join(', ') || 'noop'}${r.error ? ` (${r.error})` : ''}`);
    }
  }

  process.exit(failed.length ? 1 : 0);
}

main();
