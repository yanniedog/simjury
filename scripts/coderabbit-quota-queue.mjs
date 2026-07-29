#!/usr/bin/env node
/**
 * Serialize CodeRabbit full-review requests across open PRs.
 *
 * Rules:
 * - Never nudge while any open PR already has CodeRabbit "in progress"/"queued".
 * - Prefer the oldest ready PR missing exact-head "Review completed".
 * - Skip PRs that already completed on the current head.
 * - At most one full-review comment per invocation.
 */
import { spawnSync } from 'node:child_process';
import { classifyCoderabbitStatuses } from './coderabbit-contract.mjs';
import { CR_REVIEW_TRIGGER } from './lib/coderabbit-rate-limit.mjs';

function ghJson(args) {
  const r = spawnSync('gh', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || `gh exit ${r.status}`).trim());
  return JSON.parse(r.stdout || 'null');
}

function statusesFor(sha) {
  return ghJson(['api', `repos/{owner}/{repo}/commits/${sha}/statuses?per_page=100`]) || [];
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const open = ghJson([
    'pr',
    'list',
    '--state',
    'open',
    '--json',
    'number,title,isDraft,createdAt,headRefOid,url',
  ]).filter((pr) => !pr.isDraft);

  const rows = open
    .map((pr) => ({
      ...pr,
      contract: classifyCoderabbitStatuses(statusesFor(pr.headRefOid)),
    }))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

  for (const row of rows) {
    console.log(
      `PR #${row.number}: ${row.contract.state}` +
        (row.contract.description ? ` (${row.contract.description})` : ''),
    );
  }

  const inFlight = rows.find((r) => r.contract.state === 'pending');
  if (inFlight) {
    console.log(
      `coderabbit-quota-queue: idle — #${inFlight.number} already in flight; do not spend quota elsewhere`,
    );
    process.exit(0);
  }

  const next = rows.find((r) => ['missing', 'skipped', 'blocked', 'rate_limited'].includes(r.contract.state));
  if (!next) {
    console.log('coderabbit-quota-queue: all open PRs have Review completed (or none open)');
    process.exit(0);
  }

  if (next.contract.state === 'rate_limited') {
    console.log(
      `coderabbit-quota-queue: #${next.number} is rate-limited — wait for vendor window; no comment`,
    );
    process.exit(2);
  }

  const body = [
    `<!-- simjury-coderabbit-quota-queue sha=${next.headRefOid} -->`,
    `Serialized CodeRabbit request for head \`${next.headRefOid.slice(0, 12)}\`.`,
    '',
    CR_REVIEW_TRIGGER,
  ].join('\n');

  if (dryRun) {
    console.log(`[dry-run] would request full review on #${next.number}`);
    process.exit(0);
  }

  const r = spawnSync('gh', ['pr', 'comment', String(next.number), '--body', body], {
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || 'comment failed').trim());
  console.log(`coderabbit-quota-queue: requested full review on #${next.number} only`);
}

try {
  main();
} catch (error) {
  console.error(`coderabbit-quota-queue: ${error.message}`);
  process.exit(1);
}
