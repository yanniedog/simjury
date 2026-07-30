/**
 * Guard: never arm auto-merge on a base weaker than the default branch.
 *
 * Required status checks attach to a branch, not to a pull request, so a PR
 * based on any unprotected branch is armed and **merged within seconds,
 * unreviewed**. Observed 2026-07-30: PR #264 was stacked on the base of PR #263
 * and landed that way, silently doubling #263's scope.
 *
 * GitHub cannot fix this from the server side. A branch ruleset that gates
 * merges into a ref necessarily gates *pushes* to that ref as well — both the
 * `required_status_checks` rule ("4 of 4 required status checks are expected")
 * and the `pull_request` rule ("require a pull request") reject a direct push.
 * Applying either to `~ALL` locks every agent out of pushing its own topic
 * branch, which was confirmed by trying it. So gating a feature branch as a PR
 * base and letting agents work on it are mutually exclusive on GitHub.
 *
 * The workable rule is therefore enforced here, in the tooling every agent goes
 * through: every PR must target the repository's exact default branch.
 */
import { MERGE_REQUIRED_CHECK_NAMES } from './pr-gates-lib.mjs';

/** Gate id surfaced when a base is weaker than the default branch. */
export const BASE_GUARD_GATE_ID = 'base-unprotected';

/** Checks used only when the default branch's own config cannot be read. */
export const BASE_REQUIRED_CHECKS = MERGE_REQUIRED_CHECK_NAMES;

/**
 * Reduce whatever GitHub reports for a ref — rulesets and/or legacy branch
 * protection — into the set of required check contexts.
 *
 * @param {{ rules?: unknown, protection?: unknown }} sources
 * @returns {Set<string>}
 */
export function requiredChecksFor(sources = {}) {
  const found = new Set();

  // `GET /repos/{o}/{r}/rules/branches/{branch}` flattens every ruleset that
  // applies to the ref, whichever ruleset defined it.
  for (const rule of Array.isArray(sources.rules) ? sources.rules : []) {
    if (rule?.type !== 'required_status_checks') continue;
    const checks = rule?.parameters?.required_status_checks;
    for (const check of Array.isArray(checks) ? checks : []) {
      if (typeof check?.context === 'string') found.add(check.context);
    }
  }

  const contexts = sources.protection?.required_status_checks?.contexts;
  for (const context of Array.isArray(contexts) ? contexts : []) {
    if (typeof context === 'string') found.add(context);
  }

  return found;
}

/**
 * Decide whether a base is safe to arm auto-merge against.
 *
 * The invariant is comparative — a base may never require less than the default
 * branch — so it calibrates to each repository instead of hard-coding one
 * project's workflow names. A repo gating checks on its default branch
 * demands all of them of any other base; a repo that gates nothing has nothing to
 * bypass and is not blocked.
 *
 * @param {string} baseRefName
 * @param {{ rules?: unknown, protection?: unknown }} baseSources
 * @param {{ rules?: unknown, protection?: unknown }} defaultSources
 * @param {{ defaultBranch?: string }} [opts]
 * @returns {{ covered: boolean, missing: string[], required: string[], detail: string }}
 */
export function evaluateBaseCoverage(baseRefName, baseSources, defaultSources, opts = {}) {
  const required = [...requiredChecksFor(defaultSources)];

  if (opts.defaultBranch && baseRefName === opts.defaultBranch) {
    return {
      covered: true,
      missing: [],
      required,
      detail: `base ${baseRefName} is the default branch`,
    };
  }

  const present = requiredChecksFor(baseSources);
  const missing = required.filter((check) => !present.has(check));

  if (missing.length === 0) {
    return {
      covered: true,
      missing,
      required,
      detail: required.length === 0
        ? `base ${baseRefName}: this repository gates nothing, so nothing can be bypassed`
        : `base ${baseRefName} requires every check the default branch does`,
    };
  }

  return {
    covered: false,
    missing,
    required,
    detail:
      `base ${baseRefName} does not require ${missing.join(', ')}, which the default `
      + 'branch does — merging into it would launder the change past review. '
      + 'Retarget this PR at the default branch. GitHub cannot gate a feature '
      + 'branch as a base without also blocking pushes to it, so stacking is not '
      + 'available; open the PRs in parallel against the default branch instead.',
  };
}

/**
 * Read the rules and legacy protection that apply to a ref. Returns null
 * sources on any failure, which the comparative check treats as "requires
 * nothing" — hence the default branch is read the same way, so an outage makes
 * both sides empty and the guard neither blocks everything nor waves a genuinely
 * weaker base through.
 */
export function fetchBaseSources(repo, baseRefName, ghJson) {
  const read = (path) => {
    try {
      return ghJson(['api', path]);
    } catch {
      // 404 on an unprotected branch is the normal case, not an error.
      return null;
    }
  };
  return {
    rules: read(`repos/${repo}/rules/branches/${encodeURIComponent(baseRefName)}`),
    protection: read(`repos/${repo}/branches/${encodeURIComponent(baseRefName)}/protection`),
  };
}

/** The repository's default branch — the protection floor every base must meet. */
export function resolveDefaultBranch(repo, ghJson) {
  try {
    const info = ghJson(['api', `repos/${repo}`]);
    return typeof info?.default_branch === 'string' ? info.default_branch : null;
  } catch {
    return null;
  }
}

/**
 * Full check for a PR's base.
 *
 * @param {string} repo `owner/name`
 * @param {string|undefined} baseRefName
 * @param {(args: string[]) => unknown} ghJson
 * @param {string} [defaultBranch]
 */
export function checkBaseProtected(repo, baseRefName, ghJson, defaultBranch) {
  if (!baseRefName) {
    return {
      covered: false,
      missing: [...BASE_REQUIRED_CHECKS],
      required: [...BASE_REQUIRED_CHECKS],
      detail: 'PR base is unknown, so it cannot be shown to be gated',
    };
  }
  const floor = defaultBranch ?? resolveDefaultBranch(repo, ghJson);
  if (!floor || baseRefName !== floor) {
    return {
      covered: false,
      missing: [...BASE_REQUIRED_CHECKS],
      required: [...BASE_REQUIRED_CHECKS],
      detail: floor
        ? `base ${baseRefName} is not the default branch ${floor} — retarget it; open PRs in parallel instead`
        : 'repository default branch is unknown, so the PR base cannot be trusted',
    };
  }
  return {
    covered: true,
    missing: [],
    required: [...BASE_REQUIRED_CHECKS],
    detail: `base ${baseRefName} is the default branch`,
  };
}
