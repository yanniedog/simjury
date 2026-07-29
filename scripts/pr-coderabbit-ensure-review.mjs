#!/usr/bin/env node
/**
 * Ensure CodeRabbit actually reviews PRs (open + closed + merged).
 *
 * Durable replacement for sleep-based rate-limit retry (GHA cancels long sleeps).
 *
 * - OPEN: if rate-limited / ack-only / missing proper review, and wait window elapsed
 *   (or no rate-limit timing), post @coderabbitai full review (≤1 / 15 min)
 * - CLOSED (unmerged): reopen, then request review (≤1 / hour)
 * - MERGED: cannot reopen — keep requesting on the merged PR (≤1 / hour)
 * - Stops only when a *proper* CR review exists (not rate-limit / command ack)
 *
 * Usage:
 *   node scripts/pr-coderabbit-ensure-review.mjs [--dry-run] [--lookback-days 14] [--pr N]
 *   node scripts/pr-coderabbit-review-recovery.mjs …   # alias entry
 */
import { spawnSync } from 'node:child_process';
import {
  CR_ENSURE_MARKER,
  CR_OPEN_RETRY_INTERVAL_MS,
  CR_RECOVERY_INTERVAL_MS,
  CR_RECOVERY_MARKER,
  CR_RECOVERY_TRIGGER,
  canPostRecoveryTrigger,
  classifyCoderabbitActivity,
  latestEnsureTriggerAt,
  needsCoderabbitRecovery,
  needsOpenEnsure,
} from './lib/coderabbit-review-status.mjs';
import { latestRateLimitEvent, msUntilRetry } from './lib/coderabbit-rate-limit.mjs';
import { hasGh, repoSlug } from './lib/gh-pr-review-threads.mjs';
import { gateExemptReasonFromPrMeta } from './lib/pr-gate-exempt.mjs';

function parseArgs(argv) {
  const out = {
    dryRun: false,
    json: false,
    help: false,
    includeOpen: true,
    includeClosed: true,
    lookbackDays: Number(process.env.CR_RECOVERY_LOOKBACK_DAYS || 14),
    pr: null,
    maxPrs: Number(process.env.CR_RECOVERY_MAX_PRS || 50),
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--json') out.json = true;
    else if (a === '--open-only') {
      out.includeOpen = true;
      out.includeClosed = false;
    } else if (a === '--closed-only') {
      out.includeOpen = false;
      out.includeClosed = true;
    } else if (a === '--lookback-days' && argv[i + 1]) out.lookbackDays = Number(argv[++i]);
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

function listCandidatePrs({ lookbackDays, maxPrs, pr, includeOpen, includeClosed }) {
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
  const fields =
    'number,title,state,mergedAt,closedAt,createdAt,author,headRefName,baseRefName,url';
  const rows = [];
  if (includeOpen) {
    const open = ghJson(['pr', 'list', '--state', 'open', '--limit', String(maxPrs), '--json', fields]);
    rows.push(...(Array.isArray(open) ? open : []));
  }
  if (includeClosed) {
    const since = isoDaysAgo(lookbackDays);
    const closed = ghJson([
      'pr',
      'list',
      '--state',
      'closed',
      '--limit',
      String(maxPrs),
      '--json',
      fields,
    ]);
    for (const row of Array.isArray(closed) ? closed : []) {
      const stamp = row.mergedAt || row.closedAt || row.createdAt;
      if (!stamp || String(stamp) >= since) rows.push(row);
    }
  }
  // Dedupe by number
  const byNum = new Map();
  for (const row of rows) byNum.set(row.number, row);
  return [...byNum.values()];
}

function loadActivity(prNumber, owner, name) {
  const view = ghJson([
    'pr',
    'view',
    String(prNumber),
    '--json',
    'comments,reviews,state,mergedAt,closedAt,title,author',
  ]);
  let inline = [];
  try {
    inline =
      ghJson(['api', `repos/${owner}/${name}/pulls/${prNumber}/comments`, '--paginate']) || [];
  } catch {
    inline = [];
  }
  return { view, inline: Array.isArray(inline) ? inline : [] };
}

function rateLimitWaitElapsed(comments, nowMs = Date.now()) {
  const limit = latestRateLimitEvent(comments);
  if (!limit) return { due: true, limit: null, waitMs: 0 };
  const waitMs = msUntilRetry(limit.createdAt, limit.waitMinutes, 2, nowMs);
  return { due: waitMs <= 0, limit, waitMs };
}

function postEnsureTrigger(prNumber, { dryRun, reason, merged, open }) {
  const marker = open ? CR_ENSURE_MARKER : CR_RECOVERY_MARKER;
  let note;
  if (merged) {
    note =
      'This PR is **merged** (GitHub cannot reopen). Requesting a proper CodeRabbit review on the merged PR until findings or a clean actionable review land.';
  } else if (open) {
    note =
      'Open PR still lacks a **proper** CodeRabbit review (rate-limit / command-ack / missing). Scheduler posts `@coderabbitai full review` when the quota window is due — no GHA sleep. Incremental `@coderabbitai review` is insufficient after a rate-limit false start.';
  } else {
    note =
      'This PR was **closed** without a proper CodeRabbit review and has been reopened for review.';
  }
  const body = [
    marker,
    `**CodeRabbit ensure-review** (${reason}).`,
    '',
    note,
    '',
    'Stops only after a real CR review (Actionable comments / inline findings / approve-changes) — not rate-limit notices, command acks, or incremental “already reviewed” no-ops.',
    '',
    CR_RECOVERY_TRIGGER,
  ].join('\n');
  return ghOk(['pr', 'comment', String(prNumber), '--body', body], {
    dryRun,
    label: `ensure trigger on #${prNumber}`,
  });
}

function reopenPr(prNumber, dryRun) {
  return ghOk(['pr', 'reopen', String(prNumber)], { dryRun, label: `reopen #${prNumber}` });
}

function processOne(row, { dryRun, owner, name }) {
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

  const { view, inline } = loadActivity(row.number, owner, name);
  const activity = classifyCoderabbitActivity(view?.reviews || [], view?.comments || [], inline);
  const meta = {
    state: view?.state || row.state,
    mergedAt: view?.mergedAt || row.mergedAt,
    closedAt: view?.closedAt || row.closedAt,
    merged: Boolean(view?.mergedAt || row.mergedAt),
  };
  const open = String(meta.state || '').toUpperCase() === 'OPEN' && !meta.merged;

  if (activity.hasProperReview) {
    result.skipped = 'proper CodeRabbit review already present';
    return result;
  }

  if (open) {
    if (!needsOpenEnsure(activity)) {
      result.skipped = 'open PR does not need ensure';
      return result;
    }
    const { due, limit, waitMs } = rateLimitWaitElapsed(view?.comments || []);
    if (limit && !due) {
      result.skipped = `rate-limit wait not due (${Math.ceil(waitMs / 1000)}s remaining; available≈${limit.waitMinutes}m)`;
      return result;
    }
    result.reason = activity.hasRateLimitOnly
      ? 'open-rate-limit-due'
      : activity.hasCommandAckOnly
        ? 'open-ack-only'
        : activity.hasFailed
          ? 'open-failed-review'
          : 'open-missing-proper-review';

    const latestTrigger = latestEnsureTriggerAt(view?.comments || []);
    if (!canPostRecoveryTrigger(latestTrigger, Date.now(), CR_OPEN_RETRY_INTERVAL_MS)) {
      result.actions.push({
        type: 'request-review',
        ok: true,
        skipped: `last ensure trigger ${latestTrigger} within 15m window`,
      });
      return result;
    }

    const post = postEnsureTrigger(row.number, {
      dryRun,
      reason: result.reason,
      merged: false,
      open: true,
    });
    result.actions.push({ type: 'request-review', ok: post.ok, error: post.error });
    if (!post.ok) {
      result.ok = false;
      result.error = post.error;
    }
    return result;
  }

  // Closed / merged recovery path
  if (!needsCoderabbitRecovery(meta, activity)) {
    result.skipped = 'not closed/merged or no recovery needed';
    return result;
  }

  result.reason = activity.hasRateLimitOnly
    ? 'rate-limit-only'
    : activity.hasCommandAckOnly
      ? 'ack-only'
      : activity.hasFailed
        ? 'failed-review'
        : 'missing-proper-review';

  if (!meta.merged && String(meta.state || '').toUpperCase() === 'CLOSED') {
    const re = reopenPr(row.number, dryRun);
    result.actions.push({ type: 'reopen', ok: re.ok, error: re.error });
  } else if (meta.merged) {
    result.actions.push({
      type: 'merged-note',
      ok: true,
      detail: 'GitHub cannot reopen merged PRs; requesting CR review on the merged PR',
    });
  }

  const latestTrigger = latestEnsureTriggerAt(view?.comments || []);
  if (!canPostRecoveryTrigger(latestTrigger, Date.now(), CR_RECOVERY_INTERVAL_MS)) {
    result.actions.push({
      type: 'request-review',
      ok: true,
      skipped: `last recovery trigger ${latestTrigger} within hourly window`,
    });
    return result;
  }

  const post = postEnsureTrigger(row.number, {
    dryRun,
    reason: result.reason,
    merged: meta.merged,
    open: false,
  });
  result.actions.push({ type: 'request-review', ok: post.ok, error: post.error });
  if (!post.ok) {
    result.ok = false;
    result.error = post.error;
  }
  return result;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Usage: node scripts/pr-coderabbit-ensure-review.mjs [options]

Options:
  --pr <n>              Process a single PR
  --lookback-days <n>   Closed/merged window (default 14)
  --max-prs <n>         Max PRs per list (default 50)
  --open-only           Only open PRs (rate-limit due / missing proper review)
  --closed-only         Only closed/merged recovery
  --dry-run             Print actions only
  --json                JSON summary
  --help

Schedule: .github/workflows/pr-coderabbit-ensure-review.yml (every 15 minutes)`);
    process.exit(0);
  }
  if (!hasGh()) {
    console.error('pr-coderabbit-ensure-review: gh CLI required');
    process.exit(1);
  }

  let owner;
  let name;
  try {
    ({ owner, name } = repoSlug());
  } catch (e) {
    console.error(`pr-coderabbit-ensure-review: ${e.message}`);
    process.exit(1);
  }

  let candidates;
  try {
    candidates = listCandidatePrs(args);
  } catch (e) {
    console.error(`pr-coderabbit-ensure-review: list failed: ${e.message}`);
    process.exit(1);
  }

  const report = [];
  for (const row of candidates) {
    try {
      report.push(processOne(row, { dryRun: args.dryRun, owner, name }));
    } catch (e) {
      report.push({ number: row.number, ok: false, error: e.message, actions: [] });
    }
  }

  const acted = report.filter((r) => !r.skipped);
  const failed = report.filter((r) => r.ok === false);

  if (args.json) {
    console.log(
      JSON.stringify({ scanned: report.length, acted: acted.length, failed: failed.length, report }, null, 2),
    );
  } else {
    console.log(
      `pr-coderabbit-ensure-review: scanned ${report.length}; acted ${acted.length}; failed ${failed.length}`,
    );
    for (const r of report) {
      if (r.skipped) {
        console.log(`  #${r.number}: skip — ${r.skipped}`);
        continue;
      }
      const bits = (r.actions || []).map((a) => `${a.type}:${a.ok === false ? 'fail' : a.skipped ? 'wait' : 'ok'}`);
      console.log(
        `  #${r.number}: ${r.reason || 'ensure'} → ${bits.join(', ') || 'noop'}${r.error ? ` (${r.error})` : ''}`,
      );
    }
  }

  process.exit(failed.length ? 1 : 0);
}

main();
