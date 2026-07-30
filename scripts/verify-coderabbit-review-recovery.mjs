#!/usr/bin/env node
/**
 * Unit tests for CodeRabbit proper-review classifier + ensure helpers.
 * Run: npm run pr:coderabbit-review-recovery:verify
 */
import { isCliEntry, reviewCoversHead } from './pr-coderabbit-ensure-review.mjs';
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


// --- Head freshness -------------------------------------------------------
// The presence gate accepts a review only when it names the current head SHA,
// so recovery must ask the same question. Judging on presence alone meant a
// force-push left the gate waiting for a review of the new head while this
// script reported "already present" and never re-requested one — observed on
// PR #273, where both bot reviews sat on the superseded head c020ab6.
const CR = { login: 'coderabbitai[bot]' };
const properReview = (oid, over = {}) => ({
  author: CR,
  commit: { oid },
  body: [
    '**Actionable comments posted: 2**',
    '',
    'Prompt for AI Agents',
    '',
    'Fix the injection in the workflow inputs.',
  ].join('\n'),
  state: 'COMMENTED',
  ...over,
});
const rateLimited = (oid) => ({
  author: CR,
  commit: { oid },
  body: [
    '<!-- rate limited by coderabbit.ai -->',
    'Review limit reached. Next review available in 20 minutes.',
  ].join('\n'),
  state: 'COMMENTED',
});

assert(reviewCoversHead([properReview('abc')], 'abc'), 'a review of the head is current');

// The freshness question belongs to the review that qualified as proper. A
// newer rate-limit notice naming the head must not vouch for an older
// substantive review of a superseded commit, or recovery stops while the
// presence gate keeps waiting.
assert(
  !reviewCoversHead([properReview('old'), rateLimited('abc')], 'abc'),
  'a rate-limit review on the head does not cover for a stale proper review',
);
assert(
  reviewCoversHead([rateLimited('old'), properReview('abc')], 'abc'),
  'a proper review on the head is current even beside older noise',
);

// The back-compat alias delegates by importing the module, so guarding on this
// module's own path alone turned that command — and its scheduled job — into a
// silent no-op.
assert(isCliEntry('/repo/scripts/pr-coderabbit-ensure-review.mjs'), 'direct entry runs');
assert(isCliEntry('/repo/scripts/pr-coderabbit-review-recovery.mjs'), 'the alias entry runs');
assert(isCliEntry('C:' + String.fromCharCode(92) + 'repo' + String.fromCharCode(92) + 'scripts' + String.fromCharCode(92) + 'pr-coderabbit-review-recovery.mjs'), 'windows paths run');
assert(!isCliEntry('/repo/scripts/verify-coderabbit-review-recovery.mjs'), 'a verifier import does not run main');
assert(!isCliEntry('/repo/scripts/my-pr-coderabbit-ensure-review.mjs'), 'a partial filename match does not run main');
assert(!isCliEntry(undefined), 'a bare import does not run main');
assert(!reviewCoversHead([properReview('old')], 'abc'), 'a review of a superseded head is stale');
assert(
  reviewCoversHead([properReview('old'), properReview('abc')], 'abc'),
  'any review naming the head counts',
);
assert(reviewCoversHead([properReview(undefined, { commit: undefined, commit_id: 'abc' })], 'abc'), 'the legacy commit_id field is read too');
assert(reviewCoversHead([properReview(undefined, { commit: undefined })], 'abc'), 'reviews with no sha count as current, not stale');
assert(reviewCoversHead([], 'abc'), 'no reviews at all is not a stale-head problem');
assert(reviewCoversHead([properReview('old')], null), 'an unknown head does not force a re-request');

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nverify-coderabbit-review-recovery: all assertions passed');
