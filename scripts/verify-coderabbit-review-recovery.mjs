#!/usr/bin/env node
/**
 * Unit tests for CodeRabbit proper-review classifier + ensure helpers.
 * Run: npm run pr:coderabbit-review-recovery:verify
 */
import {
  canPostRecoveryTrigger,
  classifyCoderabbitActivity,
  isCoderabbitCommandAck,
  isFailedCoderabbitBody,
  isProperCoderabbitReviewBody,
  latestEnsureTrigger,
  latestRecoveryTriggerAt,
  needsCoderabbitRecovery,
  needsOpenEnsure,
  CR_RECOVERY_MARKER,
} from './lib/coderabbit-review-status.mjs';
import { isBotNoise } from './lib/bot-noise.mjs';

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    failed += 1;
  } else {
    console.log(`ok: ${msg}`);
  }
}

assert(isFailedCoderabbitBody('Review failed: internal error during review'), 'failed body');
assert(isFailedCoderabbitBody('Review limit reached'), 'rate-limit is failed-ish');
assert(!isFailedCoderabbitBody('High: null deref in parser'), 'real finding not failed');

assert(isCoderabbitCommandAck('<!-- CodeRabbit review command invocation: abc -->\nAction performed'), 'cmd ack');
assert(
  isCoderabbitCommandAck(
    '<!-- auto-generated reply by CodeRabbit -->\n<details><summary>Action performed</summary>\n\nReview finished.\n\n> Note: CodeRabbit is an incremental review system and does not re-review already reviewed commits.\n',
  ),
  'incremental already-reviewed noop is ack',
);
assert(!isProperCoderabbitReviewBody('<!-- CodeRabbit review command invocation: abc -->\nAction performed'), 'ack not proper');
assert(
  isProperCoderabbitReviewBody('**Actionable comments posted: 2**\n\n<details>\n<summary>Prompt for AI Agents</summary>'),
  'actionable is proper',
);

const rateOnly = classifyCoderabbitActivity(
  [],
  [
    {
      author: { login: 'coderabbitai[bot]' },
      createdAt: '2026-07-29T00:00:00Z',
      body: '<!-- rate limited by coderabbit.ai -->\n> ## Review limit reached\nNext review available in 45 minutes.',
    },
  ],
);
assert(rateOnly.hasRateLimitOnly, 'rate-limit-only');
assert(!rateOnly.hasProperReview, 'no proper on rate-limit');

const ackOnly = classifyCoderabbitActivity(
  [],
  [
    {
      author: { login: 'coderabbitai[bot]' },
      createdAt: '2026-07-29T01:00:00Z',
      body: '<!-- CodeRabbit review command invocation: x -->\n@github-actions I’ll review #207',
    },
  ],
);
assert(ackOnly.hasCommandAckOnly, 'ack-only');
assert(!ackOnly.hasProperReview, 'ack is not proper review');
assert(isBotNoise('<!-- review command invocation -->\nAction performed'), 'ack is bot noise');

const proper = classifyCoderabbitActivity(
  [
    {
      author: { login: 'coderabbitai[bot]' },
      submittedAt: '2026-07-29T01:00:00Z',
      state: 'COMMENTED',
      body: '**Actionable comments posted: 2**\n\n<details><summary>Prompt for AI Agents</summary>',
    },
  ],
  [],
);
assert(proper.hasProperReview, 'proper review');

assert(needsCoderabbitRecovery({ state: 'CLOSED', mergedAt: null }, rateOnly), 'closed + rate-limit needs recovery');
assert(needsCoderabbitRecovery({ state: 'MERGED', mergedAt: '2026-07-29T02:00:00Z' }, rateOnly), 'merged needs recovery');
assert(!needsCoderabbitRecovery({ state: 'CLOSED' }, proper), 'proper skips recovery');
assert(needsOpenEnsure(rateOnly), 'open rate-limit needs ensure');
assert(needsOpenEnsure(ackOnly), 'open ack-only needs ensure');
assert(!needsOpenEnsure(proper), 'proper open skips ensure');

const comments = [
  {
    createdAt: '2026-07-29T03:00:00Z',
    body: `${CR_RECOVERY_MARKER}\n@coderabbitai full review`,
  },
];
assert(latestRecoveryTriggerAt(comments) === '2026-07-29T03:00:00Z', 'latest recovery trigger');
assert(
  latestRecoveryTriggerAt([
    { createdAt: '2026-07-29T02:00:00Z', body: `${CR_RECOVERY_MARKER}\n@coderabbitai review` },
    { createdAt: '2026-07-29T03:00:00Z', body: `${CR_RECOVERY_MARKER}\n@coderabbitai full review` },
  ]) === '2026-07-29T03:00:00Z',
  'legacy incremental trigger still detected; latest wins',
);
assert(
  latestEnsureTrigger([
    {
      createdAt: '2026-07-29T03:58:00Z',
      body: '<!-- simjury-coderabbit-ensure-review -->\n@coderabbitai review',
    },
  ]).isFull === false,
  'incremental ensure trigger is not full',
);
assert(
  latestEnsureTrigger([
    {
      createdAt: '2026-07-29T03:58:00Z',
      body: '<!-- simjury-coderabbit-ensure-review -->\n@coderabbitai full review',
    },
  ]).isFull === true,
  'full ensure trigger marked full',
);
assert(!canPostRecoveryTrigger('2026-07-29T03:00:00Z', Date.parse('2026-07-29T03:30:00Z')), 'within hour blocked');
assert(canPostRecoveryTrigger('2026-07-29T03:00:00Z', Date.parse('2026-07-29T04:00:00Z')), 'after hour allowed');

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nverify-coderabbit-review-recovery: all assertions passed');
