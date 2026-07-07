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
import { loginMatchesRequiredKey } from './lib/bot-wait-config.mjs';

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
  [{ title: 'chore: tidy scripts', authorLogin: 'yanniedog', authorType: 'User' }, 'chore'],
  [{ title: 'feat: from actions', authorLogin: 'github-actions[bot]', authorType: 'Bot' }, 'bot-authored'],
]) {
  const got = gateExemptReasonFromPrMeta(meta);
  if (got !== want) failures.push(`gateExemptReasonFromPrMeta got ${got}, want ${want}`);
}

if (!isChorePrTitle('chore: update deps')) failures.push('isChorePrTitle(chore) !== true');
if (isBotPrAuthor('sourcery-ai[bot]') !== true) failures.push('isBotPrAuthor(sourcery) !== true');
if (isBotPrAuthor('chatgpt-codex-connector[bot]') !== true) failures.push('isBotPrAuthor(codex) !== true');
if (!loginMatchesRequiredKey('chatgpt-codex-connector[bot]', 'codex')) failures.push('codex alias mismatch');

if (failures.length) {
  console.error('FAIL verify-pr-gate-logic:');
  for (const f of failures) console.error('  -', f);
  process.exit(1);
}
console.log(`PASS verify-pr-gate-logic: ${cases.length} live thread checks + exempt policy`);
