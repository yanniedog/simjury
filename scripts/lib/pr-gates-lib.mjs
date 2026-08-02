/**
 * Shared helpers for npm run pr:gates:check (merge-blocking PR gate audit).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBotWaitStateFile } from './bot-wait-state.mjs';
import { hasGh, ghJson, repoSlug } from './gh-pr-review-threads.mjs';
import { gateExemptReason } from './pr-gate-exempt.mjs';
import { fetchRequiredCheckState } from './required-ci-checks.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');

export const BOT_GATE_CHECK_NAMES = ['bot-feedback-gate'];
export const PR_CI_CHECK_NAME = 'validate';
export const LOCAL_LLM_REVIEW_CHECK_NAME = 'local-llm-review';
export const MERGE_REQUIRED_CHECK_NAMES = [PR_CI_CHECK_NAME, ...BOT_GATE_CHECK_NAMES];

const DEFAULT_TIMEOUT_MIN = 35;
const DEFAULT_POLL_SEC = 45;
const MAX_TIMEOUT_MIN = 180;
const MAX_POLL_SEC = 600;

export function normalizePositiveNumber(value, fallback, max = Infinity) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

export function parseGateArgs(argv) {
  const out = {
    pr: null,
    watch: false,
    json: false,
    quiet: false,
    timeoutMin: normalizePositiveNumber(
      process.env.PR_GATES_WATCH_MAX_MIN,
      DEFAULT_TIMEOUT_MIN,
      MAX_TIMEOUT_MIN,
    ),
    help: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--watch' || a === '-w') out.watch = true;
    else if (a === '--json') out.json = true;
    else if (a === '--quiet' || a === '-q') out.quiet = true;
    else if (a === '--pr' && argv[i + 1]) out.pr = Number(argv[++i]);
    else if (a.startsWith('--pr=')) out.pr = Number(a.slice(5));
    else if (a === '--timeout-min' && argv[i + 1]) {
      out.timeoutMin = normalizePositiveNumber(argv[++i], DEFAULT_TIMEOUT_MIN, MAX_TIMEOUT_MIN);
    } else if (a.startsWith('--timeout-min=')) {
      out.timeoutMin = normalizePositiveNumber(
        a.slice('--timeout-min='.length),
        DEFAULT_TIMEOUT_MIN,
        MAX_TIMEOUT_MIN,
      );
    }
  }
  if (out.pr != null) {
    const pr = Number(out.pr);
    if (!Number.isInteger(pr) || pr <= 0) {
      out.pr = null;
      out.prError = 'invalid --pr (must be a positive integer)';
    } else {
      out.pr = pr;
    }
  }
  return out;
}

export function prForBranch(branch) {
  if (!branch || branch === 'main') return null;
  try {
    const rows = ghJson(['pr', 'list', '--state', 'open', '--head', branch, '--json', 'number,headRefName,baseRefName,state']);
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  } catch {
    return null;
  }
}

export function resolvePrNumber(prArg) {
  if (prArg && Number.isFinite(prArg) && prArg > 0) {
    const view = ghJson(['pr', 'view', String(prArg), '--json', 'number,state,title,headRefName,baseRefName']);
    if (view.state !== 'OPEN') {
      return { error: `PR #${prArg} is not open (state=${view.state})` };
    }
    return { pr: view };
  }
  const branch = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).stdout?.trim();
  const row = prForBranch(branch);
  if (!row) {
    return { error: branch === 'main' ? 'on main — pass --pr <n>' : `no open PR for branch ${branch}` };
  }
  const view = ghJson(['pr', 'view', String(row.number), '--json', 'number,state,title,headRefName,baseRefName']);
  return { pr: view, branch };
}

function preferLatestCheck(checks) {
  /** @type {Map<string, any>} */
  const byName = new Map();
  for (const c of checks) {
    const name = c.name || '';
    const prev = byName.get(name);
    if (!prev) {
      byName.set(name, c);
      continue;
    }
    const prevMs = Date.parse(prev.completedAt || '') || 0;
    const nextMs = Date.parse(c.completedAt || '') || 0;
    if (nextMs >= prevMs) byName.set(name, c);
  }
  return [...byName.values()];
}
export function fetchRequiredCi(
  prNumber,
  {
    fetchPr = ghJson,
    resolveRepo = repoSlug,
    fetchState = fetchRequiredCheckState,
  } = {},
) {
  try {
    const pr = fetchPr([
      'pr',
      'view',
      String(prNumber),
      '--json',
      'headRefOid,baseRefName',
    ]);
    const slug = resolveRepo();
    const repo = typeof slug === 'string' ? slug : `${slug.owner}/${slug.name}`;
    const result = fetchState({
      prNumber,
      repo,
      headSha: pr.headRefOid,
      baseRefName: pr.baseRefName,
      fallbackRequiredNames: MERGE_REQUIRED_CHECK_NAMES,
    });
    if (result.error) return { ok: false, error: result.error };
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export function fetchNamedChecks(prNumber, names) {
  const r = spawnSync(
    'gh',
    ['pr', 'checks', String(prNumber), '--json', 'name,bucket,state,completedAt,startedAt'],
    { encoding: 'utf8' },
  );
  const stdout = (r.stdout || '').trim();
  if (stdout) {
    try {
      const all = JSON.parse(stdout);
      const want = new Set(names.map((n) => n.toLowerCase()));
      const found = {};
      if (Array.isArray(all)) {
        const latest = preferLatestCheck(all);
        for (const c of latest) {
          const lower = (c.name || '').toLowerCase();
          const tail = lower.includes('/') ? lower.slice(lower.lastIndexOf('/') + 1) : lower;
          for (const key of want) {
            if (lower === key || tail === key) found[key] = c;
          }
        }
      }
      return { found };
    } catch {
      // fall through to status-based handling
    }
  }
  if (r.status !== 0) {
    const msg = (r.stderr || '').trim() || `gh pr checks exit ${r.status}`;
    if (/no checks reported/i.test(msg)) return { found: {}, skipped: true };
    return { found: {}, error: msg };
  }
  return { found: {} };
}


/**
 * Reviewer checks that mean "a review of this head is being written right now".
 *
 * Not the same thing as requiring a review. Presence is deliberately advisory
 * on this repository, and nothing here reinstates it: if a reviewer never
 * starts, this never waits.
 */
export const REVIEWER_CHECK_NAMES = ['coderabbit', 'sourcery review', 'cursor', 'codex'];

/** How long a reviewer may hold the merge before it is treated as stuck. */
const REVIEW_IN_FLIGHT_MAX_MIN = Number(process.env.PR_REVIEW_IN_FLIGHT_MAX_MIN || 20);

function minutesSince(iso, nowMs) {
  const started = Date.parse(iso || '');
  if (!Number.isFinite(started)) return 0;
  return (nowMs - started) / 60_000;
}

/**
 * Is a reviewer still mid-review on this head?
 *
 * Auto-merge only waits for *required* checks, and reviewer checks are not
 * required here, so a PR whose `validate` and `bot-feedback-gate` both go green
 * in seconds merges while CodeRabbit is still typing. The thread gate then has
 * nothing to block on, because the findings arrive after the merge.
 *
 * This does not add a gate a PR must satisfy; it declines to *arm* while a
 * review is visibly in progress. A reviewer that hangs stops mattering after
 * REVIEW_IN_FLIGHT_MAX_MIN, so a stuck vendor cannot block merges indefinitely.
 *
 * @param {Array<{name?: string, bucket?: string, state?: string, startedAt?: string}>} checks
 * @param {number} [nowMs]
 */
export function reviewsInFlight(checks, nowMs = Date.now()) {
  if (!Array.isArray(checks)) return [];
  return checks
    .filter((check) => {
      const name = String(check?.name || '').toLowerCase();
      if (!REVIEWER_CHECK_NAMES.some((reviewer) => name.includes(reviewer))) return false;
      const pending = check?.bucket === 'pending'
        || check?.state === 'PENDING'
        || check?.state === 'IN_PROGRESS'
        || check?.state === 'QUEUED';
      if (!pending) return false;
      return minutesSince(check?.startedAt, nowMs) < REVIEW_IN_FLIGHT_MAX_MIN;
    })
    .map((check) => check.name);
}

function checkBucketPass(c) {
  if (!c) return null;
  if (c.bucket === 'pass' || c.state === 'SUCCESS') return true;
  if (c.bucket === 'pending' || c.state === 'PENDING' || c.state === 'IN_PROGRESS') return false;
  return false;
}

export function gateCiRequired(prNumber, fetchCi = fetchRequiredCi) {
  const ci = fetchCi(prNumber);
  if (!ci.ok) {
    return { id: 'ci-required', pass: false, detail: ci.error, action: 'Fix gh auth or repo access; run gh pr checks <n>' };
  }
  if (ci.failed) {
    return {
      id: 'ci-required',
      pass: false,
      detail: `Failed: ${ci.failedNames.join(', ')}`,
      action: 'Fix failing required checks; then npm run pr:arm-and-park -- --pr <n>',
    };
  }
  if (ci.pending) {
    return {
      id: 'ci-required',
      pass: false,
      pending: true,
      unreported: ci.unreported === true,
      detail: ci.unreported ? 'Required checks not reported yet' : 'Required checks still pending',
      action: 'Park — npm run pr:arm-and-park -- --pr <n> (do not --watch in agents)',
    };
  }
  return { id: 'ci-required', pass: true, detail: 'All required checks passed' };
}

export function gateGithubBotChecks(prNumber) {
  const { found, error, skipped } = fetchNamedChecks(prNumber, BOT_GATE_CHECK_NAMES);
  if (error) {
    return {
      id: 'github-bot-gates',
      pass: false,
      detail: error,
      action: 'Ensure the GitHub Actions workflow pr-bot-feedback-check ran',
    };
  }
  if (skipped || !BOT_GATE_CHECK_NAMES.some((name) => found[name])) {
    return {
      id: 'github-bot-gates',
      pass: true,
      detail: 'No GitHub bot gate checks reported; relying on local wait/thread gates',
      skipped: true,
    };
  }
  const parts = [];
  let pass = true;
  for (const name of BOT_GATE_CHECK_NAMES) {
    const c = found[name];
    if (!c) {
      parts.push(`${name}: not reported yet`);
      pass = false;
      continue;
    }
    const ok = checkBucketPass(c);
    if (ok === true) {
      parts.push(`${name}: pass`);
    } else if (ok === false) {
      parts.push(`${name}: ${c.bucket || c.state}`);
      pass = false;
    } else {
      parts.push(`${name}: ${c.bucket || c.state} (failed)`);
      pass = false;
    }
  }
  return {
    id: 'github-bot-gates',
    pass,
    detail: parts.join('; '),
    action: pass
      ? undefined
      : 'Resolve review feedback and wait for bot-feedback-gate to pass',
  };
}

export function runNodeScript(relPath, extraArgs = [], { env: envOverrides, maxBuffer, timeout } = {}) {
  const script = path.join(REPO_ROOT, relPath);
  const r = spawnSync(process.execPath, [script, ...extraArgs], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...(envOverrides || {}) },
    maxBuffer: maxBuffer || 1024 * 1024,
    timeout: timeout || 120_000,
  });
  return {
    exitCode: r.status ?? 1,
    stdout: (r.stdout || '').trim(),
    stderr: (r.stderr || '').trim(),
  };
}

export function gateWaitForBots(prNumber, githubBotGate) {
  const exempt = gateExemptReason(prNumber);
  if (exempt) {
    return {
      id: 'wait-for-bots',
      pass: true,
      detail: `Skipped (${exempt} — human bot review not required)`,
      skipped: true,
    };
  }
  if (githubBotGate?.botPresencePass) {
    const state = readBotWaitStateFile(prNumber, REPO_ROOT);
    const anchorMs = new Date(state?.anchor || '').getTime();
    const gateMs = new Date(githubBotGate.botPresenceCompletedAt || '').getTime();
    if (!Number.isFinite(anchorMs) || (Number.isFinite(gateMs) && anchorMs <= gateMs)) {
      return {
        id: 'wait-for-bots',
        pass: true,
        detail: 'Bot wait satisfied by green GitHub bot-presence-gate',
        exitCode: 0,
      };
    }
  }
  const { exitCode, stderr, stdout } = runNodeScript('wait_for_bots.mjs', ['--pr', String(prNumber)]);
  if (exitCode === 0) {
    return { id: 'wait-for-bots', pass: true, detail: 'Bot wait satisfied (exit 0)', exitCode };
  }
  const msg = stderr || stdout || `exit ${exitCode}`;
  return {
    id: 'wait-for-bots',
    pass: false,
    detail: msg.split('\n').slice(-3).join(' '),
    exitCode,
    action:
      exitCode === 2
        ? `npm run pr:arm-and-park -- --pr ${prNumber} (park if exit 2 — do not --watch)`
        : `npm run wait-for-bots -- --pr ${prNumber} (exit 1 = missing bots — request reviews, do not poll)`,
  };
}

export function gateBotFeedback(prNumber) {
  const exempt = gateExemptReason(prNumber);
  if (exempt) {
    return {
      id: 'pr-bot-feedback-check',
      pass: true,
      detail: `Skipped (${exempt} — human bot review not required)`,
      skipped: true,
    };
  }
  const { exitCode, stderr, stdout } = runNodeScript('scripts/pr-bot-feedback-check.mjs', [
    '--pr',
    String(prNumber),
    '--quiet',
    '--skip-bot-presence',
  ]);
  if (exitCode === 0) {
    return { id: 'pr-bot-feedback-check', pass: true, detail: 'Thread closure gate passed', exitCode };
  }
  return {
    id: 'pr-bot-feedback-check',
    pass: false,
    detail: (stderr || stdout || `exit ${exitCode}`).split('\n').slice(0, 4).join(' '),
    exitCode,
    action: `Resolve review threads on GitHub; npm run pr:bot-feedback-check -- --pr ${prNumber}`,
  };
}

function classifyBranchState(meta) {
  const ms = meta?.mergeStateStatus || 'UNKNOWN';
  const mergeable = meta?.mergeable;
  if (ms === 'DIRTY' || mergeable === 'CONFLICTING') {
    return { status: 'conflict', behind: false, detail: 'merge conflict — rebase onto origin/main' };
  }
  if (ms === 'BEHIND') {
    return { status: 'behind', behind: true, detail: 'branch behind base — update with gh pr update-branch' };
  }
  if (ms === 'CLEAN' || ms === 'UNSTABLE' || mergeable === 'MERGEABLE') {
    return { status: 'current', behind: false, detail: 'branch up to date with base (or mergeable)' };
  }
  return { status: 'unknown', behind: false, detail: `merge state ${ms}` };
}

export function gateBranchFresh(prNumber) {
  try {
    const meta = ghJson([
      'pr',
      'view',
      String(prNumber),
      '--json',
      'number,headRefName,mergeable,mergeStateStatus',
    ]);
    const state = classifyBranchState(meta);
    if (state.status === 'conflict') {
      return {
        id: 'branch-fresh',
        pass: false,
        detail: state.detail,
        action: `Resolve conflicts on ${meta.headRefName}; gh pr update-branch ${prNumber}`,
      };
    }
    if (state.behind) {
      return {
        id: 'branch-fresh',
        pass: false,
        detail: state.detail,
        action: `gh pr update-branch ${prNumber}`,
      };
    }
    return { id: 'branch-fresh', pass: true, detail: state.detail || 'Branch current with base' };
  } catch (e) {
    return { id: 'branch-fresh', pass: false, detail: e.message };
  }
}


/**
 * Decline to arm while a reviewer is mid-review on this head.
 *
 * Reviewer presence is advisory here, so this never demands a review — it only
 * refuses to race one that has already started. Passes when nothing is in
 * flight, when no reviewer runs at all, and when the checks cannot be read.
 */
export function gateReviewsInFlight(prNumber) {
  const r = spawnSync(
    'gh',
    ['pr', 'checks', String(prNumber), '--json', 'name,bucket,state,startedAt'],
    { encoding: 'utf8' },
  );
  const stdout = (r.stdout || '').trim();
  if (!stdout) {
    return { id: 'reviews-in-flight', pass: true, detail: 'no checks reported', skipped: true };
  }
  let checks;
  try {
    checks = JSON.parse(stdout);
  } catch {
    return { id: 'reviews-in-flight', pass: true, detail: 'checks unreadable; not blocking' };
  }
  const busy = reviewsInFlight(checks);
  if (busy.length === 0) {
    return { id: 'reviews-in-flight', pass: true, detail: 'no review in progress' };
  }
  return {
    id: 'reviews-in-flight',
    pass: false,
    pending: true,
    detail: `review in progress: ${busy.join(', ')}`,
    action: 'Let the in-flight review land, then re-run pr:arm-and-park',
  };
}

export function evaluateGates(prNumber) {
  if (!hasGh()) {
    return {
      prNumber,
      pass: false,
      gates: [
        {
          id: 'gh-auth',
          pass: false,
          detail: 'gh CLI missing or not on PATH',
          action: 'Install GitHub CLI and run gh auth login',
        },
      ],
    };
  }

  const branchFresh = gateBranchFresh(prNumber);
  const ci = gateCiRequired(prNumber);
  const ghBot = gateGithubBotChecks(prNumber);
  const feedback = gateBotFeedback(prNumber);
  const inFlight = gateReviewsInFlight(prNumber);

  const gates = [
    { id: 'gh-auth', pass: true, detail: 'gh available' },
    branchFresh,
    ci,
    ghBot,
    feedback,
    inFlight,
  ];

  return {
    prNumber,
    pass: gates.every((g) => g.pass),
    gates,
  };
}

export { hasGh, repoSlug };
