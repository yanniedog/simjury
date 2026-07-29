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
  requiredBotsSatisfied,
} from './lib/bot-wait-config.mjs';
import { isBotNoise } from './lib/bot-noise.mjs';
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

assert(
  isBotNoise(
    '> [!CAUTION]\n> The consumer version of Gemini Code Assist on GitHub has been sunset. All code review activity has officially ceased.\n',
  ),
  'gemini sunset is noise',
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
    '<!-- review command invocation -->\n<details>\n<summary>Auto reply</summary>\n\nAction performed\n\n</details>\nI\'ll review the changes.',
  ),
  'CR command ack is presence noise',
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

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nverify-bot-wait-or-groups: all assertions passed');
