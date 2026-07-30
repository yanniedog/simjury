#!/usr/bin/env node
/**
 * Unit tests for required-bot slots (peer OR-group + mandatory CodeRabbit) + Gemini noise.
 */
import {
  DEFAULT_REQUIRED_KEYS,
  DEFAULT_REQUIRED_SPEC,
  alternativesForSlot,
  formatRequiredKeys,
  loginMatchesRequiredKey,
  missingRequiredKeys,
  parseRequiredKeys,
  isKnownBotLogin,
  requiredBotsSatisfied,
} from './lib/bot-wait-config.mjs';
import { isBotNoise } from './lib/bot-noise.mjs';
import { collectBotEvents, isCurrentBotEvent } from './lib/bot-wait-presence.mjs';
import {
  isCoderabbitPresenceNoise,
  isProperCoderabbitReviewBody,
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

assert(
  JSON.stringify(parseRequiredKeys('')) === JSON.stringify(['sourcery|codex|cursor', 'coderabbit']),
  'default = peer OR-group + mandatory coderabbit',
);
assert(
  JSON.stringify(DEFAULT_REQUIRED_KEYS) === JSON.stringify(parseRequiredKeys(DEFAULT_REQUIRED_SPEC)),
  'DEFAULT_REQUIRED_SPEC matches DEFAULT_REQUIRED_KEYS',
);
assert(JSON.stringify(alternativesForSlot('sourcery|cursor|codex')) === JSON.stringify(['sourcery', 'cursor', 'codex']), 'alts');
assert(loginMatchesRequiredKey('cursor[bot]', 'cursor'), 'cursor[bot] matches cursor');
assert(loginMatchesRequiredKey('cursor', 'sourcery|cursor|codex'), 'cursor satisfies OR-group');
assert(loginMatchesRequiredKey('coderabbitai[bot]', 'coderabbit'), 'coderabbitai[bot] matches coderabbit');
assert(loginMatchesRequiredKey('sourcery-ai[bot]', 'sourcery|cursor'), 'sourcery satisfies OR-group');
assert(!loginMatchesRequiredKey('gemini-code-assist[bot]', 'sourcery|cursor|codex'), 'gemini does not satisfy review OR-group');

assert(
  missingRequiredKeys(['sourcery|cursor'], ['cursor[bot]']).length === 0,
  'cursor satisfies sourcery|cursor',
);
assert(
  missingRequiredKeys(['sourcery'], ['cursor[bot]']).length === 1,
  'cursor alone does not satisfy sourcery-only',
);

const defaults = DEFAULT_REQUIRED_KEYS;
assert(
  !requiredBotsSatisfied(defaults, ['chatgpt-codex-connector[bot]']),
  'peer alone insufficient without CodeRabbit',
);
assert(
  !requiredBotsSatisfied(defaults, ['coderabbitai[bot]']),
  'CodeRabbit alone insufficient without peer',
);
assert(
  requiredBotsSatisfied(defaults, ['chatgpt-codex-connector[bot]', 'coderabbitai[bot]']),
  'codex + coderabbit satisfies default',
);
assert(
  requiredBotsSatisfied(defaults, ['cursor[bot]', 'coderabbitai[bot]']),
  'cursor + coderabbit satisfies default',
);
assert(
  requiredBotsSatisfied(defaults, ['sourcery-ai[bot]', 'coderabbitai[bot]']),
  'sourcery + coderabbit satisfies default',
);
assert(!requiredBotsSatisfied(defaults, ['gemini-code-assist[bot]']), 'gemini alone insufficient');
assert(
  !requiredBotsSatisfied(defaults, ['gemini-code-assist[bot]', 'coderabbitai[bot]']),
  'gemini does not count as peer slot',
);

const formatted = formatRequiredKeys(['sourcery|cursor']);
assert(/OR/.test(formatted) && /sourcery/.test(formatted) && /cursor/.test(formatted), 'format shows OR');

// The sunset consumer Code Assist app is no longer a recognised bot at all, so
// its caution banner never becomes a bot event and needs no noise special case.
assert(!isKnownBotLogin('gemini-code-assist[bot]'), 'sunset Code Assist app is not a reviewer');
assert(!isKnownBotLogin('gemini-code-assist'), 'sunset Code Assist app is not a reviewer (bare login)');
assert(
  isKnownBotLogin('google-github-actions-bot[bot]'),
  'the API-keyed Gemini review workflow is still recognised',
);
assert(isBotNoise('Review limit reached. Next review available in 45 minutes.'), 'CR rate-limit is noise');
assert(isBotNoise('You are rate limited by coderabbit.ai'), 'CR rate-limit html marker is noise');
assert(!isBotNoise('High: null deref in parser when list is empty — please add a guard.'), 'real finding not noise');

assert(
  isCoderabbitPresenceNoise(
    'coderabbitai[bot]',
    '<!-- rate limited by coderabbit.ai -->\nReview limit reached. Next review available in 20 minutes.',
  ),
  'CR rate-limit is presence noise',
);
assert(
  isCoderabbitPresenceNoise(
    'coderabbitai',
    '<!-- This is an auto-generated reply by CodeRabbit -->\n<details>\n<summary>Action performed</summary>\n\nReview finished.\n\n> Note: CodeRabbit is an incremental review system and does not re-review already reviewed commits.\n',
  ),
  'CR incremental already-reviewed noop is presence noise',
);
assert(
  isCoderabbitPresenceNoise(
    'coderabbitai[bot]',
    '## Walkthrough\n\nThis PR rewires the scheduler and updates docs across many files without posting findings yet.\n'.repeat(3),
  ),
  'CR walkthrough-only is presence noise (not a proper review)',
);
assert(
  !isCoderabbitPresenceNoise(
    'coderabbitai[bot]',
    '## Review\n\n**Actionable comments posted: 2**\n\nPrompt for AI Agents\n\nFix the injection in the workflow inputs.',
  ),
  'CR actionable review clears presence noise',
);
assert(
  !isCoderabbitPresenceNoise('coderabbitai[bot]', '', { state: 'APPROVED' }),
  'CR APPROVED clears presence even with empty body',
);
assert(
  !isCoderabbitPresenceNoise(
    'coderabbitai[bot]',
    '_🔴 Critical_\n\n**Command injection in workflow inputs.** Escape `${{ inputs.pr_number }}` before shell use.',
    { kind: 'inline' },
  ),
  'CR inline finding clears presence',
);
assert(
  isProperCoderabbitReviewBody(
    '**Actionable comments posted: 0**\n\nNo issues found in the ensure-review scheduler.',
  ),
  'zero actionable still counts as proper review',
);
assert(
  !isCoderabbitPresenceNoise(
    'sourcery-ai[bot]',
    'High: null deref in parser when list is empty — please add a guard.',
  ),
  'non-CR bots still use ordinary noise rules',
);

// --- Review freshness: a review of the current head is never stale ----------
// Regression cover for the deadlock on PR #263. Sourcery reviewed head SHA
// cb8eebf at 12:52:06; marking the PR ready for review then advanced the
// anchor to 12:54:01, so the timestamp filter discarded a current review and
// the gate waited out its full 220-minute timeout for one that would never be
// repeated — Sourcery does not re-review a SHA it has already reviewed.
const HEAD = 'cb8eebf0a27ef8b108ace32cb7f2107536650a6c';
const anchorAfterReview = new Date('2026-07-30T12:54:01Z').getTime();

assert(
  isCurrentBotEvent(
    { login: 'sourcery-ai[bot]', at: '2026-07-30T12:52:06Z', sha: HEAD },
    anchorAfterReview,
    HEAD,
  ),
  'a review of the current head counts even when it predates the anchor',
);
assert(
  !isCurrentBotEvent(
    { login: 'sourcery-ai[bot]', at: '2026-07-30T12:52:06Z', sha: 'deadbeef' },
    anchorAfterReview,
    HEAD,
  ),
  'a review of a superseded SHA is still stale',
);
assert(
  isCurrentBotEvent({ login: 'cursor[bot]', at: '2026-07-30T12:56:00Z', sha: null }, anchorAfterReview, HEAD),
  'SHA-less events (comments, reactions) still use the anchor window',
);
assert(
  !isCurrentBotEvent({ login: 'cursor[bot]', at: '2026-07-30T12:52:06Z', sha: null }, anchorAfterReview, HEAD),
  'SHA-less events before the anchor remain stale',
);
assert(
  !isCurrentBotEvent(
    { login: 'sourcery-ai[bot]', at: '2026-07-30T12:52:06Z', sha: HEAD },
    anchorAfterReview,
    null,
  ),
  'an unknown head SHA falls back to the anchor rather than passing everything',
);

// End to end through the collector: the required peer slot is satisfied.
const collected = collectBotEvents(
  {
    headRefOid: HEAD,
    createdAt: '2026-07-30T12:45:00Z',
    reviews: {
      nodes: [
        {
          author: { login: 'sourcery-ai[bot]' },
          submittedAt: '2026-07-30T12:52:06Z',
          state: 'COMMENTED',
          body: 'High: this drops the error path on an empty list.',
          commit: { oid: HEAD },
        },
      ],
    },
  },
  new Set(['sourcery-ai[bot]']),
  '2026-07-30T12:54:01Z',
  '2026-07-30T12:45:00Z',
);
assert(collected.length === 1, 'collectBotEvents keeps a current-head review past the anchor');
assert(
  requiredBotsSatisfied(['sourcery|codex|cursor'], collected.map((e) => e.login)),
  'the peer-bot slot is satisfied, so the presence gate no longer deadlocks',
);

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nverify-bot-wait-or-groups: all assertions passed');
