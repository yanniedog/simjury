#!/usr/bin/env node
/**
 * Unit tests for CodeRabbit review recovery helpers.
 * Run: npm run pr:coderabbit-review-recovery:verify
 */
import {
  canPostRecoveryTrigger,
  classifyCoderabbitActivity,
  isFailedCoderabbitBody,
  latestRecoveryTriggerAt,
  needsCoderabbitRecovery,
  CR_RECOVERY_MARKER,
} from './lib/coderabbit-review-status.mjs';

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    failed += 1;
  } else {
    console.log(`ok: ${msg}`);
  }
}

assert(isFailedCoderabbitBody('Review failed: internal error'), 'failed body');
assert(isFailedCoderabbitBody('Review limit reached'), 'rate-limit is failed-ish for recovery');
assert(!isFailedCoderabbitBody('High: null deref in parser'), 'real finding not failed');

const rateOnly = classifyCoderabbitActivity(
  [],
  [
    {
      author: { login: 'coderabbitai[bot]' },
      createdAt: '2026-07-29T00:00:00Z',
      body: 'Review limit reached. Next review available in 45 minutes.',
    },
  ],
);
assert(rateOnly.hasRateLimitOnly, 'rate-limit-only');
assert(!rateOnly.hasSubstantive, 'no substantive on rate-limit');

const substantive = classifyCoderabbitActivity(
  [
    {
      author: { login: 'coderabbitai[bot]' },
      submittedAt: '2026-07-29T01:00:00Z',
      state: 'COMMENTED',
      body: 'High: null deref in parser when list is empty — please add a guard.',
    },
  ],
  [],
);
assert(substantive.hasSubstantive, 'substantive review');

assert(
  needsCoderabbitRecovery({ state: 'CLOSED', mergedAt: null }, rateOnly),
  'closed + rate-limit needs recovery',
);
assert(
  needsCoderabbitRecovery({ state: 'MERGED', mergedAt: '2026-07-29T02:00:00Z' }, rateOnly),
  'merged + rate-limit needs recovery',
);
assert(
  !needsCoderabbitRecovery({ state: 'CLOSED', mergedAt: null }, substantive),
  'substantive skips recovery',
);
assert(
  !needsCoderabbitRecovery({ state: 'OPEN' }, rateOnly),
  'open PRs are not recovery targets (rate-limit-retry owns those)',
);

const comments = [
  {
    createdAt: '2026-07-29T03:00:00Z',
    body: `${CR_RECOVERY_MARKER}\n@coderabbitai review`,
  },
];
assert(latestRecoveryTriggerAt(comments) === '2026-07-29T03:00:00Z', 'latest recovery trigger');
assert(
  !canPostRecoveryTrigger('2026-07-29T03:00:00Z', Date.parse('2026-07-29T03:30:00Z')),
  'within hour blocked',
);
assert(
  canPostRecoveryTrigger('2026-07-29T03:00:00Z', Date.parse('2026-07-29T04:00:00Z')),
  'after hour allowed',
);
assert(canPostRecoveryTrigger(null), 'no prior trigger allowed');

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nverify-coderabbit-review-recovery: all assertions passed');
