#!/usr/bin/env node
/**
 * Exact-head CodeRabbit merge contract.
 *
 * Source of truth: CodeRabbit's legacy commit-status history on the current PR
 * head SHA. Comments are used only to parse quota timing, never as review proof.
 */
import { spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import {
  CR_REVIEW_TRIGGER,
  isCoderabbitLogin,
  latestRateLimitEvent,
  msUntilRetry,
} from './lib/coderabbit-rate-limit.mjs';

const MARKER = '<!-- simjury-coderabbit-contract';
const POLL_MS = Number(process.env.CR_CONTRACT_POLL_MS || 60_000);
const MAX_ATTEMPTS = Number(process.env.CR_CONTRACT_MAX_ATTEMPTS || 4);

function ghJson(args) {
  const r = spawnSync('gh', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || `gh exit ${r.status}`).trim());
  return JSON.parse(r.stdout || 'null');
}

function parseArgs(argv) {
  const out = { pr: null, watch: false, dryRun: false, timeoutMin: 220 };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--pr') out.pr = Number(argv[++i]);
    else if (arg === '--watch') out.watch = true;
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--timeout-min') out.timeoutMin = Number(argv[++i]);
  }
  return out;
}

export function classifyCoderabbitStatuses(statuses = []) {
  const cr = statuses
    .filter(
      (s) =>
        String(s.context || '').toLowerCase() === 'coderabbit' &&
        isCoderabbitLogin(s.creator?.login),
    )
    .sort((a, b) => Date.parse(b.created_at || '') - Date.parse(a.created_at || ''));
  const completed = cr.find(
    (s) =>
      String(s.state).toLowerCase() === 'success' &&
      /^review completed\b/i.test(String(s.description || '')),
  );
  if (completed) return { state: 'completed', at: completed.created_at, statuses: cr };
  const latest = cr[0];
  if (!latest) return { state: 'missing', at: null, statuses: [] };
  const description = String(latest.description || '');
  if (/queued|in progress/i.test(description) || latest.state === 'pending') {
    return { state: 'pending', at: latest.created_at, description, statuses: cr };
  }
  if (/rate limit/i.test(description)) {
    return { state: 'rate_limited', at: latest.created_at, description, statuses: cr };
  }
  return { state: 'blocked', at: latest.created_at, description, statuses: cr };
}

function markerInfo(comments, headSha) {
  const marked = (comments || []).filter((c) => {
    const body = String(c.body || '');
    return body.includes(MARKER) && body.includes(`sha=${headSha}`);
  });
  return {
    count: marked.length,
    latestAt: marked.reduce((best, c) => {
      const at = c.createdAt || c.created_at;
      return at && (!best || at > best) ? at : best;
    }, null),
  };
}

function postReview(pr, headSha, reason, dryRun) {
  const body = [
    `<!-- simjury-coderabbit-contract sha=${headSha} reason=${reason} -->`,
    `CodeRabbit contract requires a complete review of current head \`${headSha.slice(0, 12)}\`.`,
    '',
    CR_REVIEW_TRIGGER,
  ].join('\n');
  if (dryRun) {
    console.log(`[dry-run] would request CodeRabbit on #${pr} (${reason})`);
    return;
  }
  // REST issue comments work with issues:write; `gh pr comment` uses GraphQL
  // addComment, which can reject an otherwise sufficient Actions token.
  const r = spawnSync(
    'gh',
    ['api', `repos/{owner}/{repo}/issues/${pr}/comments`, '-f', `body=${body}`],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || 'comment failed').trim());
  console.log(`coderabbit-contract: requested full review on #${pr} (${reason})`);
}

function load(pr) {
  const view = ghJson([
    'pr',
    'view',
    String(pr),
    '--json',
    'state,isDraft,headRefOid,comments,url',
  ]);
  const statuses = ghJson([
    'api',
    `repos/{owner}/{repo}/commits/${view.headRefOid}/statuses?per_page=100`,
  ]);
  view.comments = ghJson([
    'api',
    `repos/{owner}/{repo}/issues/${pr}/comments?per_page=100`,
  ]);
  return { view, contract: classifyCoderabbitStatuses(statuses || []) };
}

function evaluate(pr, expectedSha, dryRun) {
  const { view, contract } = load(pr);
  if (view.state !== 'OPEN') return { terminal: true, ok: false, message: `PR is ${view.state}` };
  if (view.isDraft) return { terminal: false, message: 'PR is draft; no review requested' };
  if (expectedSha && view.headRefOid !== expectedSha) {
    return { terminal: true, ok: false, message: 'head SHA changed; synchronize run owns new head' };
  }
  if (contract.state === 'completed') {
    return {
      terminal: true,
      ok: true,
      message: `exact-head review completed at ${contract.at}`,
      headSha: view.headRefOid,
    };
  }

  const markers = markerInfo(view.comments, view.headRefOid);
  if (markers.count >= MAX_ATTEMPTS) {
    return {
      terminal: true,
      ok: false,
      message: `${contract.state}; ${markers.count} attempts exhausted on this SHA`,
    };
  }

  const statusAt = contract.at ? Date.parse(contract.at) : 0;
  const markerAt = markers.latestAt ? Date.parse(markers.latestAt) : 0;
  if (contract.state === 'missing' && markers.count === 0) {
    postReview(pr, view.headRefOid, 'missing', dryRun);
  } else if (contract.state === 'rate_limited' && markerAt <= statusAt) {
    const limit = latestRateLimitEvent(view.comments || []);
    const waitMinutes = limit?.waitMinutes ?? 60;
    const waitMs = msUntilRetry(contract.at, waitMinutes, 2);
    if (waitMs <= 0) postReview(pr, view.headRefOid, 'rate-limit-due', dryRun);
    else return { terminal: false, message: `rate limited; retry due in ${Math.ceil(waitMs / 1000)}s` };
  } else if (contract.state === 'blocked' && markerAt <= statusAt) {
    postReview(pr, view.headRefOid, 'blocked-status', dryRun);
  }
  return {
    terminal: false,
    message: `${contract.state}; waiting for exact-head Review completed`,
    headSha: view.headRefOid,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.pr) {
    console.error('Usage: node scripts/coderabbit-contract.mjs --pr <n> [--watch] [--dry-run]');
    process.exit(1);
  }
  const first = load(args.pr);
  const expectedSha = first.view.headRefOid;
  const deadline = Date.now() + args.timeoutMin * 60_000;
  for (;;) {
    const result = evaluate(args.pr, expectedSha, args.dryRun);
    console.log(`coderabbit-contract: ${result.message}`);
    if (result.terminal) process.exit(result.ok ? 0 : 1);
    if (!args.watch || args.dryRun) process.exit(2);
    if (Date.now() >= deadline) {
      console.error(`coderabbit-contract: timed out on head ${expectedSha}`);
      process.exit(1);
    }
    await sleep(POLL_MS);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(`coderabbit-contract: ${error.message}`);
    process.exit(1);
  });
}
