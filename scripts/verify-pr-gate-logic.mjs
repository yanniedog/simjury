#!/usr/bin/env node
/**
 * Self-test for review-thread gate logic.
 * Run: npm run pr:gate-logic:verify
 */
import { classifyThreads, isClosureReply } from './lib/gh-pr-review-threads.mjs';
import {
  gateExemptReasonFromPrMeta,
  isBotPrAuthor,
  isChorePrTitle,
} from './lib/pr-gate-exempt.mjs';
import { isKnownBotLogin, loginMatchesRequiredKey } from './lib/bot-wait-config.mjs';
import { isBotNoise } from './lib/bot-noise.mjs';
import { isEmptyDiff } from './pr-bot-close-guard.mjs';

const BOT = { login: 'gemini-code-assist[bot]', __typename: 'Bot' };
const HUMAN = { login: 'yanniedog', __typename: 'User' };
const T0 = '2026-06-06T00:00:00Z';
const T1 = '2026-06-06T01:00:00Z';

function thread(isResolved, comments) {
  return { isResolved, comments: { nodes: comments } };
}
function c(author, body, createdAt = T0) {
  return { author, body, createdAt };
}

const FINDING = 'high-priority: this dereferences a null pointer when the list is empty';
const cases = [
  ['resolved bot thread, no reply -> pass', thread(true, [c(BOT, FINDING)]), 0],
  ['unresolved bot thread, no reply -> 1 violation', thread(false, [c(BOT, FINDING)]), 1],
  ['unresolved bot thread + Fixed in sha -> still 1 (must resolve)', thread(false, [c(BOT, FINDING, T0), c(HUMAN, 'Fixed in 6f3f466', T1)]), 1],
  ['low-signal unresolved bot thread -> pass', thread(false, [c(BOT, 'Useful? React with 👍 / 👎')]), 0],
  ['unresolved human thread -> 1 violation', thread(false, [c(HUMAN, 'please change this blocking thing in the parser now')]), 1],
];

const failures = [];
for (const [name, t, expected] of cases) {
  const got = classifyThreads([t]).length;
  if (got !== expected) failures.push(`${name}: got ${got} violations, expected ${expected}`);
}

for (const [body, want] of [
  ['Fixed in abc123', true],
  ['Declined — by design', true],
  ['not fixed', false],
  ['thanks', false],
]) {
  if (isClosureReply(body) !== want) failures.push(`isClosureReply(${body}) !== ${want}`);
}

for (const [meta, want] of [
  [{ title: 'fix: replay split', authorLogin: 'yanniedog', authorType: 'User' }, null],
  [{ title: 'chore: tidy scripts', authorLogin: 'yanniedog', authorType: 'User' }, null],
  [{ title: 'feat: from actions', authorLogin: 'github-actions[bot]', authorType: 'Bot' }, null],
]) {
  const got = gateExemptReasonFromPrMeta(meta);
  if (got !== want) failures.push(`gateExemptReasonFromPrMeta got ${got}, want ${want}`);
}

if (!isChorePrTitle('chore: update deps')) failures.push('isChorePrTitle(chore) !== true');
if (isBotPrAuthor('sourcery-ai[bot]') !== true) failures.push('isBotPrAuthor(sourcery) !== true');
if (isBotPrAuthor('chatgpt-codex-connector[bot]') !== true) failures.push('isBotPrAuthor(codex) !== true');
if (!loginMatchesRequiredKey('chatgpt-codex-connector[bot]', 'codex')) failures.push('codex alias mismatch');
if (!loginMatchesRequiredKey('cursor[bot]', 'sourcery|cursor|codex')) failures.push('cursor OR-group mismatch');
if (!loginMatchesRequiredKey('coderabbitai[bot]', 'coderabbit')) {
  failures.push('coderabbit alias mismatch');
}
if (!loginMatchesRequiredKey('coderabbitai[bot]', 'sourcery|codex|cursor|coderabbit')) {
  failures.push('coderabbit still matches legacy single OR-group string');
}

// The sunset consumer Code Assist app was dropped from the fleet, so its
// caution banner is not a bot event and needs no noise special case.
if (isKnownBotLogin('gemini-code-assist[bot]')) {
  failures.push('sunset Gemini Code Assist app should not be a recognised reviewer');
}
if (!isBotNoise('Review limit reached. Next review available in 45 minutes.')) {
  failures.push('vendor rate-limit notices should still be noise');
}

// A PR that changes nothing cannot bypass review, so the close guard must let
// it stay closed. Regression cover for PR #263: it rebased to empty once #267
// landed carrying its commit, and the guard reopened it into a permanently
// unmergeable state that no bot could ever satisfy.
if (!isEmptyDiff({ additions: 0, deletions: 0, changedFiles: 0 })) {
  failures.push('an all-zero diff should count as empty');
}
for (const [label, meta] of [
  ['a real PR', { additions: 22, deletions: 13, changedFiles: 1 }],
  ['a deletion-only PR', { additions: 0, deletions: 9, changedFiles: 1 }],
  ['missing counters', {}],
  ['absent metadata', undefined],
  ['null counters', { additions: null, deletions: null, changedFiles: null }],
]) {
  // Absent counts mean the question went unanswered, not that the answer is
  // "empty" — an API hiccup must never wave a real PR past the close guard.
  if (isEmptyDiff(meta)) failures.push(`${label} must not count as an empty diff`);
}

if (failures.length) {
  console.error('FAIL verify-pr-gate-logic:');
  for (const f of failures) console.error('  -', f);
  process.exit(1);
}
console.log(`PASS verify-pr-gate-logic: ${cases.length} live thread checks + no-bypass policy`);
