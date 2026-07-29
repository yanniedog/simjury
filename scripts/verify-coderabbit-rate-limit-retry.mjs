#!/usr/bin/env node
/**
 * Unit tests for CodeRabbit rate-limit retry helpers.
 * Run: npm run pr:coderabbit-rate-limit-retry:verify
 */
import {
  clampWaitMs,
  coderabbitReviewedAfter,
  isRateLimitBody,
  latestRateLimitEvent,
  msUntilRetry,
  parseAvailableInMinutes,
  retryAlreadyArmed,
} from './lib/coderabbit-rate-limit.mjs';

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    failed += 1;
  } else {
    console.log(`ok: ${msg}`);
  }
}

assert(isRateLimitBody('## Review limit reached\n@foo'), 'detects review limit');
assert(isRateLimitBody('<!-- rate limited by coderabbit.ai -->'), 'detects html marker');
assert(!isRateLimitBody('normal walkthrough'), 'non-limit body');

assert(parseAvailableInMinutes('**Next review available in:** **51 minutes**') === 51, 'parse next minutes');
assert(parseAvailableInMinutes('More reviews will be available in 42 minutes.') === 42, 'parse more minutes');
assert(parseAvailableInMinutes('available in 2 hours') === 120, 'parse hours');
assert(parseAvailableInMinutes('no timing here') == null, 'unparseable null');

const comments = [
  {
    author: { login: 'coderabbitai[bot]' },
    createdAt: '2026-07-28T18:42:00Z',
    body: 'Review limit reached. Next review available in: 30 minutes',
  },
  {
    author: { login: 'coderabbitai[bot]' },
    createdAt: '2026-07-28T18:50:00Z',
    body: 'Review limit reached. More reviews will be available in 10 minutes.',
  },
];
const latest = latestRateLimitEvent(comments);
assert(latest?.createdAt === '2026-07-28T18:50:00Z', 'latest rate limit wins');
assert(latest?.waitMinutes === 10, 'latest wait minutes');

assert(
  coderabbitReviewedAfter(
    [
      {
        author: { login: 'coderabbitai[bot]' },
        submittedAt: '2026-07-28T19:00:00Z',
        state: 'COMMENTED',
        body: '**Actionable comments posted: 1**\n\n<details><summary>Prompt for AI Agents</summary>\nfix null deref',
      },
    ],
    [],
    '2026-07-28T18:50:00Z',
  ),
  'formal review after limit counts',
);
assert(
  !coderabbitReviewedAfter(
    [
      {
        author: { login: 'coderabbitai[bot]' },
        submittedAt: '2026-07-28T19:00:00Z',
        state: 'COMMENTED',
        body: '<!-- CodeRabbit review command invocation: x -->\nAction performed',
      },
    ],
    [],
    '2026-07-28T18:50:00Z',
  ),
  'command ack after limit does not count',
);
assert(
  !coderabbitReviewedAfter(
    [
      {
        author: { login: 'coderabbitai[bot]' },
        submittedAt: '2026-07-28T19:00:00Z',
        state: 'COMMENTED',
        body:
          '## Walkthrough\n\nLong summarize text without actionable findings should not clear the retry.\n'.repeat(
            4,
          ),
      },
    ],
    [],
    '2026-07-28T18:50:00Z',
  ),
  'long walkthrough-only after limit does not count',
);
assert(
  !coderabbitReviewedAfter(
    [{ author: { login: 'coderabbitai[bot]' }, submittedAt: '2026-07-28T18:40:00Z', state: 'COMMENTED', body: 'bug' }],
    [],
    '2026-07-28T18:50:00Z',
  ),
  'old review ignored',
);

assert(
  retryAlreadyArmed(
    [
      ...comments,
      {
        author: { login: 'github-actions[bot]' },
        createdAt: '2026-07-28T19:05:00Z',
        body: '<!-- simjury-coderabbit-rate-limit-retry -->\n@coderabbitai review',
      },
    ],
    '2026-07-28T18:50:00Z',
  ),
  'retry armed',
);
assert(
  !retryAlreadyArmed(
    [
      ...comments,
      {
        author: { login: 'github-actions[bot]' },
        createdAt: '2026-07-28T19:05:00Z',
        body: '<!-- simjury-coderabbit-rate-limit-retry -->\n@coderabbitai review',
      },
      {
        author: { login: 'coderabbitai[bot]' },
        createdAt: '2026-07-28T19:10:00Z',
        body: 'Review limit reached. Next review available in: 20 minutes',
      },
    ],
    '2026-07-28T18:50:00Z',
  ),
  'newer rate-limit clears armed retry',
);

const now = Date.parse('2026-07-28T18:55:00Z');
assert(msUntilRetry('2026-07-28T18:50:00Z', 10, 2, now) === 7 * 60_000, 'ms until ready with buffer');
assert(clampWaitMs(200 * 60_000, { maxMs: 120 * 60_000 }) === 120 * 60_000, 'clamp max wait');

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nverify-coderabbit-rate-limit-retry: all assertions passed');
