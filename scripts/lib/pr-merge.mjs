/**
 * Canonical PR merge flags for ship bar (WORKFLOW.md step 7).
 * Squash + auto-merge + delete branch is the default for all automation.
 */
import { runGh } from './gh-pr-review-threads.mjs';

/** gh pr merge flags used by agents, pr-watch, and CI workflows. */
export const PR_MERGE_FLAGS = ['--auto', '--squash', '--delete-branch'];

/**
 * @param {number} prNumber
 * @param {{ dryRun?: boolean, extraArgs?: string[] }} [opts]
 * @returns {{ ok: boolean, stdout: string, stderr: string, exitCode: number }}
 */
export function mergePullRequest(prNumber, opts = {}) {
  const { dryRun = false, extraArgs = [] } = opts;
  const args = ['pr', 'merge', String(prNumber), ...PR_MERGE_FLAGS, ...extraArgs];
  return runGh(args, { dryRun });
}

/** Human/agent one-liner (documented in skills and WORKFLOW.md). */
export function mergeCommandLine(prNumber) {
  return `gh pr merge ${prNumber} ${PR_MERGE_FLAGS.join(' ')}`;
}
