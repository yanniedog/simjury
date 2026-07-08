/**
 * Git paths and helpers for pilot auto-release version bumps (direct push + gate exempt).
 */
import { ghJson } from './gh-pr-review-threads.mjs';

export const AUTO_RELEASE_BUMP_PREFIX = 'chore(pilot): auto-release bump v';

/** Staged paths for auto-release commits. */
export const AUTO_RELEASE_COMMIT_REL_PATHS = ['pilot/app/build.gradle.kts'];

/**
 * @param {string} filePath
 * @returns {boolean}
 */
export function isAutoReleaseCommitPath(filePath) {
  const p = String(filePath || '').replace(/\\/g, '/');
  return p === 'pilot/app/build.gradle.kts';
}

/**
 * @param {string[]|object[]} paths
 * @returns {boolean}
 */
export function isAutoReleaseCommitOnly(paths) {
  if (!Array.isArray(paths) || paths.length === 0) return false;
  return paths.every((entry) => {
    const path = typeof entry === 'string' ? entry : entry?.path || '';
    return isAutoReleaseCommitPath(path);
  });
}

/**
 * @param {string} title
 * @returns {boolean}
 */
export function isAutoReleaseBumpTitle(title) {
  return String(title || '').trim().startsWith(AUTO_RELEASE_BUMP_PREFIX);
}

/**
 * @param {number|string} prNumber
 * @returns {boolean}
 */
export function isAutoReleaseOnlyPr(prNumber) {
  const view = ghJson(['pr', 'view', String(prNumber), '--json', 'title,files']);
  const title = String(view?.title || '').trim();
  if (!isAutoReleaseBumpTitle(title)) return false;
  const paths = (Array.isArray(view?.files) ? view.files : []).map((f) => f.path);
  // Title matches — exempt when GitHub has not listed files yet (pull_request opened race).
  if (paths.length === 0) return true;
  return isAutoReleaseCommitOnly(paths);
}

/** Shown when protected main rejects workflow push (no ruleset bypass). */
export const AUTO_RELEASE_PUSH_BYPASS_HINT = `Protected main rejected the pilot auto-release push. One-time repo setup (Settings → Rules → Rulesets):
1. Add or edit the main branch ruleset.
2. Under Bypass list, add "GitHub Actions" (bypass mode: always).
3. Optionally scope bypass to workflow file .github/workflows/pilot-auto-release-on-queue-drain.yml.
Legacy branch protection alone cannot grant path-scoped push bypass; a ruleset bypass is required.
See WORKFLOW.md → "Auto release when PR queue drains" → "Direct commit to main".`;
