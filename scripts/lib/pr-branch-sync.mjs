/**
 * PR branch freshness + squash auto-merge progression (WORKFLOW.md step 7).
 */
import { mergePullRequest } from './pr-merge.mjs';
import { ghJson, runGh } from './gh-pr-review-threads.mjs';

const PR_VIEW_FIELDS =
  'number,state,headRefName,baseRefName,mergeable,mergeStateStatus,autoMergeRequest,isDraft';

export function classifyBranchState(meta) {
  const ms = meta?.mergeStateStatus || 'UNKNOWN';
  const mergeable = meta?.mergeable;
  if (ms === 'DIRTY' || mergeable === 'CONFLICTING') {
    return {
      status: 'conflict',
      behind: false,
      canUpdate: false,
      detail: 'merge conflict — rebase onto origin/main and resolve before merge',
    };
  }
  if (ms === 'BEHIND') {
    return {
      status: 'behind',
      behind: true,
      canUpdate: true,
      detail: 'branch behind base — update with gh pr update-branch or rebase origin/main',
    };
  }
  if (ms === 'BLOCKED' && mergeable === 'MERGEABLE') {
    return {
      status: 'blocked',
      behind: false,
      canUpdate: true,
      detail: 'merge blocked (checks or branch protection) — may need branch update',
    };
  }
  if (ms === 'CLEAN' || ms === 'UNSTABLE' || mergeable === 'MERGEABLE') {
    return {
      status: 'current',
      behind: false,
      canUpdate: false,
      detail: 'branch up to date with base (or mergeable)',
    };
  }
  return {
    status: 'unknown',
    behind: false,
    canUpdate: true,
    detail: `merge state ${ms} — try gh pr update-branch if checks require fresh base`,
  };
}

export function isAutoMergeEnabled(meta) {
  return Boolean(meta?.autoMergeRequest?.enabledAt);
}

export function fetchPrMergeMeta(prNumber, { requireOpen = true } = {}) {
  const view = ghJson(['pr', 'view', String(prNumber), '--json', PR_VIEW_FIELDS]);
  if (requireOpen && view.state !== 'OPEN') {
    throw new Error(`PR #${prNumber} is not open (state=${view.state})`);
  }
  return view;
}

function ghUpdateBranch(prNumber, { dryRun = false } = {}) {
  return runGh(['pr', 'update-branch', String(prNumber)], { dryRun });
}

/**
 * @param {number} prNumber
 * @param {{ dryRun?: boolean, force?: boolean, meta?: object }} [opts]
 *   Pass `meta` from a prior `fetchPrMergeMeta` to avoid a duplicate `gh pr view`.
 */
export function updatePrBranch(prNumber, { dryRun = false, force = false, meta: metaIn } = {}) {
  const meta = metaIn || fetchPrMergeMeta(prNumber);
  const state = classifyBranchState(meta);
  if (state.status === 'conflict') {
    return {
      ok: false,
      action: 'blocked',
      detail: state.detail,
      headRefName: meta.headRefName,
      exitCode: 2,
    };
  }
  if (!force && !state.canUpdate) {
    return {
      ok: true,
      action: 'skipped',
      detail: state.detail,
      headRefName: meta.headRefName,
      exitCode: 0,
    };
  }
  if (!force && state.status !== 'behind' && state.status !== 'blocked' && state.status !== 'unknown') {
    return {
      ok: true,
      action: 'skipped',
      detail: 'branch already current',
      headRefName: meta.headRefName,
      exitCode: 0,
    };
  }
  const result = ghUpdateBranch(prNumber, { dryRun });
  if (!result.ok) {
    const hint =
      /merge conflict|conflict/i.test(result.stderr)
        ? 'resolve conflicts locally: git fetch && git rebase origin/main && push'
        : 'try local rebase: git fetch && git checkout <branch> && git rebase origin/main && git push';
    return {
      ok: false,
      action: 'failed',
      detail: result.stderr || result.stdout || `gh pr update-branch exit ${result.exitCode}`,
      hint,
      headRefName: meta.headRefName,
      exitCode: result.exitCode || 1,
    };
  }
  return {
    ok: true,
    action: dryRun ? 'skipped' : 'updated',
    detail: dryRun ? result.stdout : 'branch update requested (GitHub will rebase/merge base into head)',
    headRefName: meta.headRefName,
    exitCode: 0,
  };
}

function ghMarkReady(prNumber, { dryRun = false } = {}) {
  return runGh(['pr', 'ready', String(prNumber)], { dryRun });
}

export function enableSquashAutoMerge(prNumber, { dryRun = false } = {}) {
  let meta = fetchPrMergeMeta(prNumber);
  if (isAutoMergeEnabled(meta)) {
    return {
      ok: true,
      action: 'skipped',
      detail: `squash auto-merge already enabled (${meta.autoMergeRequest?.enabledAt})`,
      exitCode: 0,
    };
  }
  // Draft PRs cannot arm auto-merge — mark ready first (AGENTS.md step after CI starts).
  if (meta.isDraft) {
    const ready = ghMarkReady(prNumber, { dryRun });
    if (!ready.ok && !dryRun) {
      return {
        ok: false,
        action: 'failed',
        detail: `PR is draft and gh pr ready failed: ${ready.stderr || ready.stdout}`,
        exitCode: ready.exitCode || 1,
      };
    }
    if (!dryRun) meta = fetchPrMergeMeta(prNumber);
  }
  const result = mergePullRequest(prNumber, { dryRun });
  if (!result.ok) {
    return {
      ok: false,
      action: 'failed',
      detail: result.stderr || result.stdout || `gh pr merge exit ${result.exitCode}`,
      exitCode: result.exitCode || 1,
    };
  }
  return {
    ok: true,
    action: dryRun ? 'skipped' : 'enabled',
    detail: dryRun
      ? result.stdout
      : meta.isDraft
        ? 'marked ready + squash auto-merge enabled'
        : 'squash auto-merge enabled',
    exitCode: 0,
  };
}

export function progressPullRequest(prNumber, { dryRun = false, syncBranch = true, enableAuto = true } = {}) {
  const meta = fetchPrMergeMeta(prNumber);
  const state = classifyBranchState(meta);
  const out = {
    prNumber,
    headRefName: meta.headRefName,
    branchState: state,
    sync: null,
    autoMerge: null,
    blocked: false,
    ok: true,
  };
  if (state.status === 'conflict') {
    out.blocked = true;
    out.ok = false;
    return out;
  }
  if (syncBranch && (state.behind || state.status === 'blocked' || state.status === 'unknown')) {
    // Reuse the meta we already fetched — avoid a second `gh pr view`.
    out.sync = updatePrBranch(prNumber, { dryRun, force: state.behind, meta });
    if (!out.sync.ok) {
      out.blocked = true;
      out.ok = false;
      return out;
    }
  } else if (syncBranch) {
    out.sync = { ok: true, action: 'skipped', detail: state.detail, exitCode: 0 };
  }
  if (enableAuto) {
    out.autoMerge = enableSquashAutoMerge(prNumber, { dryRun });
    if (!out.autoMerge.ok) out.ok = false;
  }
  return out;
}
