#!/usr/bin/env node
/**
 * Merge/close protection helper.
 *
 * Exit 0 — PR may stay closed (merged, gate-exempt, or no outstanding bot work)
 * Exit 1 — PR was closed with outstanding bot review obligations; reopen required
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

/**
 * Has every file this PR touches already reached the base branch?
 *
 * `isEmptyDiff` is not enough on its own. GitHub counts additions and deletions
 * against the **merge base**, not against the current tip, so a PR whose work
 * landed inside another PR still reports a diff. PR #263 read `+22/-13` while
 * its one file was byte-identical to `main`, because #267 had squash-merged a
 * commit carrying the same change. The guard reopened it on every close.
 *
 * Comparing blob SHAs answers the question the counters cannot: if each changed
 * file already has this exact content on the base branch, merging would be a
 * no-op and there is nothing left for a reviewer to look at.
 *
 * Fails closed. An unreadable path yields null, which matches no blob SHA, so a
 * transient API error makes the PR look un-superseded rather than waving it
 * through.
 *
 * @param {Array<{filename: string, sha: string, status: string}>} files
 * @param {(path: string) => string|null} blobShaOnBase
 */
export function filesAreSuperseded(files, lookup) {
  if (!Array.isArray(files) || files.length === 0) return false;
  return files.every((file) => {
    if (!file?.filename) return false;

    // A mode or type change — making a script executable, say — leaves the blob
    // identical, so comparing SHAs would call a real change superseded. The
    // compare entry gives it away: it is listed, but has no content diff.
    if (file.additions === 0 && file.deletions === 0 && file.status !== 'removed') return false;

    if (file.status === 'removed') {
      // Only a confirmed not-found proves the deletion already landed. An API
      // failure must not read as "already gone".
      return lookup(file.filename).state === 'absent';
    }

    // A rename also deletes the source. The destination matching is not enough:
    // if another PR added that destination while the source still exists,
    // merging this one would still remove it.
    if (file.status === 'renamed') {
      if (!file.previous_filename) return false;
      if (lookup(file.previous_filename).state !== 'absent') return false;
    }

    const onBase = lookup(file.filename);
    return onBase.state === 'present' && Boolean(file.sha) && onBase.sha === file.sha;
  });
}

/**
 * Escape a path for the contents API without destroying its separators.
 *
 * `encodeURI` leaves `?` and `#` alone, and both are legal in a Git filename —
 * so a file called `what?.md` addressed a truncated path and the lookup quietly
 * answered about the wrong file.
 */
export function encodeContentsPath(path) {
  return String(path).split('/').map(encodeURIComponent).join('/');
}

/**
 * What does this path look like on a ref?
 *
 * Tri-state on purpose. Collapsing a failed request into the same answer as a
 * genuine 404 would let a transient 5xx read as "the file is already gone", and
 * a deletion would count as superseded when nothing of the sort had happened.
 *
 * @returns {{state: 'present', sha: string} | {state: 'absent'} | {state: 'unknown'}}
 */
function blobOnRef(repo, ref, path) {
  const r = spawnSync(
    'gh',
    [
      'api',
      `repos/${repo}/contents/${encodeContentsPath(path)}?ref=${encodeURIComponent(ref)}`,
      '--jq',
      '.sha',
    ],
    { encoding: 'utf8' },
  );
  if (r.status === 0) {
    const sha = (r.stdout || '').trim();
    return sha ? { state: 'present', sha } : { state: 'unknown' };
  }
  const stderr = `${r.stderr || ''}${r.stdout || ''}`;
  // gh reports a missing path as HTTP 404; anything else is a failure to answer.
  return /HTTP 404|Not Found/i.test(stderr) ? { state: 'absent' } : { state: 'unknown' };
}

/** Wire filesAreSuperseded up to the compare and contents APIs. */
function prIsSuperseded(owner, name, meta) {
  const repo = `${owner}/${name}`;
  const base = meta?.baseRefName;
  const head = meta?.headRefOid;
  if (!base || !head) return false;
  let files;
  try {
    files = ghJson(['api', `repos/${repo}/compare/${base}...${head}`, '--jq', '.files']);
  } catch {
    return false;
  }
  // Bail on very large PRs rather than spend a request per file; a PR this size
  // is not the superseded-chain-link case this exists for.
  if (!Array.isArray(files) || files.length > 40) return false;
  const cache = new Map();
  return filesAreSuperseded(files, (path) => {
    // A rename asks about two paths, and chains often touch the same file twice.
    if (!cache.has(path)) cache.set(path, blobOnRef(repo, base, path));
    return cache.get(path);
  });
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

Blocks premature PR closure while bot merge protection still applies.
Required presence default: ${DEFAULT_REQUIRED_SPEC}
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
      'number,title,state,mergedAt,closedAt,author,additions,deletions,changedFiles,baseRefName,headRefOid',
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
  if (isEmptyDiff(meta) || prIsSuperseded(owner, name, meta)) {
    result.ok = true;
    result.detail = 'nothing left to review — the base already has this content';
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else console.log(`pr-bot-close-guard: PR #${prNumber} adds nothing to ${meta.baseRefName} — ok`);
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
    result.detail = 'no outstanding bot obligations';
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else console.log(`pr-bot-close-guard: PR #${prNumber} clear to close`);
    process.exit(0);
  }

  result.ok = false;
  result.detail = result.reasons.join('; ');

  if (meta.state === 'CLOSED' && args.reopen) {
    const body = [
      '<!-- simjury-bot-close-guard -->',
      '**Bot merge protection:** this PR was closed while review obligations remained.',
      '',
      ...result.reasons.map((r) => `- ${r}`),
      '',
      'Reopened automatically. Squash merge stays blocked until `bot-presence-gate` and',
      '`bot-feedback-gate` are green (CodeRabbit + peer review bots, threads resolved).',
      '',
      `Required presence: \`${DEFAULT_REQUIRED_SPEC}\``,
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
