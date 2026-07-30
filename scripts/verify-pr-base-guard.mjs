/**
 * Verify the PR base guard.
 *
 * Regression cover for the failure that let PR #264 merge unreviewed: required
 * status checks attach to a branch, not to a pull request, so a PR based on an
 * unprotected branch was armed and landed in seconds.
 *
 * Usage: npm run pr:base-guard:verify
 */
import assert from 'node:assert/strict';
import { MERGE_REQUIRED_CHECK_NAMES } from './lib/pr-gates-lib.mjs';
import {
  BASE_GUARD_GATE_ID,
  checkBaseProtected,
  evaluateBaseCoverage,
  requiredChecksFor,
} from './lib/pr-base-guard.mjs';
import { classifyGateFailure } from './lib/pr-arm-and-park-lib.mjs';
import { readFileSync } from 'node:fs';

const checks = [...MERGE_REQUIRED_CHECK_NAMES];
const gated = {
  rules: [{
    type: 'required_status_checks',
    parameters: { required_status_checks: checks.map((context) => ({ context })) },
  }],
};
const bare = { rules: [], protection: null };

function test(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (e) {
    console.error(`  FAIL  ${name}\n        ${e.message}`);
    process.exitCode = 1;
  }
}

console.log('pr:base-guard:verify');

test('reads required checks out of a ruleset response', () => {
  assert.deepEqual([...requiredChecksFor(gated)].sort(), [...checks].sort());
});

test('reads required checks out of legacy branch protection', () => {
  const legacy = { protection: { required_status_checks: { contexts: checks } } };
  assert.deepEqual([...requiredChecksFor(legacy)].sort(), [...checks].sort());
});

test('ignores rule types that are not status checks', () => {
  assert.equal(requiredChecksFor({ rules: [{ type: 'pull_request' }] }).size, 0);
});

test('a base matching the default branch floor is safe to arm', () => {
  const result = evaluateBaseCoverage('feat/x', gated, gated);
  assert.equal(result.covered, true);
  assert.deepEqual(result.missing, []);
});

test('a base weaker than the default branch is refused', () => {
  const result = evaluateBaseCoverage('feat/x', bare, gated);
  assert.equal(result.covered, false);
  assert.deepEqual(result.missing.sort(), [...checks].sort());
  assert.match(result.detail, /default branch/);
});

test('the refusal explains that stacking is unavailable, not merely wrong', () => {
  // GitHub cannot gate a feature base without blocking pushes to it, so the
  // message must send the agent to parallel PRs rather than to a config fix.
  const result = evaluateBaseCoverage('feat/x', bare, gated);
  assert.match(result.detail, /blocking pushes/);
  assert.match(result.detail, /parallel/);
});

test('a base missing the feedback gate is still refused', () => {
  const ciOnly = {
    rules: [{
      type: 'required_status_checks',
      parameters: { required_status_checks: [{ context: 'validate' }] },
    }],
  };
  const result = evaluateBaseCoverage('feat/x', ciOnly, gated);
  assert.equal(result.covered, false);
  assert.ok(result.missing.includes('bot-feedback-gate'));
});

test('the default branch is always its own floor', () => {
  const result = evaluateBaseCoverage('main', bare, gated, { defaultBranch: 'main' });
  assert.equal(result.covered, true);
});

test('a repository that gates nothing is not blocked from merging', () => {
  // The invariant is comparative: with no floor there is nothing to bypass, so
  // an absolute check list must not freeze unconfigured repositories.
  const result = evaluateBaseCoverage('feat/x', bare, bare);
  assert.equal(result.covered, true);
  assert.deepEqual(result.required, []);
});

test('an unreadable base with a gated floor is refused', () => {
  assert.equal(evaluateBaseCoverage('feat/x', { rules: null }, gated).covered, false);
});

test('fails closed when the base ref is unknown', () => {
  assert.equal(checkBaseProtected('o/r', undefined, () => null).covered, false);
});

test('fails closed when the repository default branch is unreadable', () => {
  assert.equal(checkBaseProtected('o/r', 'main', () => { throw new Error('offline'); }).covered, false);
});

test('refuses a non-default base even when it has equivalent protection', () => {
  const gh = (args) => args.at(-1) === 'repos/o/r' ? { default_branch: 'main' } : gated;
  assert.equal(checkBaseProtected('o/r', 'feat/x', gh).covered, false);
});

test('accepts the exact default branch without protection API lookups', () => {
  const gh = () => ({ default_branch: 'main' });
  assert.equal(checkBaseProtected('o/r', 'main', gh).covered, true);
});

test('both merge wrappers invoke the exact-base guard', () => {
  for (const file of ['scripts/pr-merge.mjs', 'scripts/lib/pr-arm-and-park-lib.mjs']) {
    assert.match(readFileSync(file, 'utf8'), /checkBaseProtected/);
  }
});

test('an unguarded base is actionable, never a wait', () => {
  assert.equal(
    classifyGateFailure({ id: BASE_GUARD_GATE_ID, pass: false, detail: 'x' }),
    'actionable',
  );
});

if (process.exitCode) {
  console.error('pr:base-guard:verify: FAILED');
} else {
  console.log('pr:base-guard:verify: all checks passed');
}
