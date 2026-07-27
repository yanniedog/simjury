#!/usr/bin/env node
/**
 * Unit tests for OR-group required bots + Gemini sunset noise.
 */
import {
  alternativesForSlot,
  formatRequiredKeys,
  loginMatchesRequiredKey,
  missingRequiredKeys,
  parseRequiredKeys,
  requiredBotsSatisfied,
} from './lib/bot-wait-config.mjs';
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

assert(JSON.stringify(parseRequiredKeys('')) === JSON.stringify(['sourcery|codex|cursor']), 'default OR-group');
assert(JSON.stringify(alternativesForSlot('sourcery|cursor|codex')) === JSON.stringify(['sourcery', 'cursor', 'codex']), 'alts');
assert(loginMatchesRequiredKey('cursor[bot]', 'cursor'), 'cursor[bot] matches cursor');
assert(loginMatchesRequiredKey('cursor', 'sourcery|cursor|codex'), 'cursor satisfies OR-group');
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
assert(requiredBotsSatisfied(['sourcery|codex|cursor'], ['chatgpt-codex-connector[bot]']), 'codex satisfies default');
assert(!requiredBotsSatisfied(['sourcery|codex|cursor'], ['gemini-code-assist[bot]']), 'gemini alone insufficient');

const formatted = formatRequiredKeys(['sourcery|cursor']);
assert(/OR/.test(formatted) && /sourcery/.test(formatted) && /cursor/.test(formatted), 'format shows OR');

assert(
  isBotNoise(
    '> [!CAUTION]\n> The consumer version of Gemini Code Assist on GitHub has been sunset. All code review activity has officially ceased.\n',
  ),
  'gemini sunset is noise',
);
assert(!isBotNoise('High: null deref in parser when list is empty — please add a guard.'), 'real finding not noise');

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nverify-bot-wait-or-groups: all assertions passed');
