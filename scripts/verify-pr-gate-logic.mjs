#!/usr/bin/env node
/**
 * Self-test for review-thread gate logic.
 * Run: npm run pr:gate-logic:verify
 */
import { classifyThreads, isClosureReply } from './lib/gh-pr-review-threads.mjs';
import { reviewsInFlight } from './lib/pr-gates-lib.mjs';
import { classifyGateFailure } from './lib/pr-arm-and-park-lib.mjs';
import {
  gateExemptReasonFromPrMeta,
  isBotPrAuthor,
  isChorePrTitle,
} from './lib/pr-gate-exempt.mjs';
import { isKnownBotLogin, loginMatchesRequiredKey } from './lib/bot-wait-config.mjs';
import { isBotNoise } from './lib/bot-noise.mjs';
import { filesAreSuperseded, isEmptyDiff } from './pr-bot-close-guard.mjs';

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

// GitHub counts a PR's diff against the merge base, not the current tip, so a
// PR whose work already landed elsewhere still reports additions. PR #263 read
// +22/-13 while its one file was byte-identical to main, because #267 had
// squash-merged a commit carrying the same change — and the close guard
// reopened it every time. Complete tree entries answer what the counters cannot.
const BLOB = '1c52d9f3fa39266a48e702d54c77553ec9cee07c';
const present = (sha, mode = '100644', type = 'blob') => ({ state: 'present', sha, mode, type });
const ABSENT = { state: 'absent' };
const UNKNOWN = { state: 'unknown' };
const onTree = (map) => (path) => (path in map ? map[path] : ABSENT);
const mod = (over = {}) => ({ status: 'modified', additions: 3, deletions: 1, ...over });

if (!filesAreSuperseded(
  [mod({ filename: 'site/app/src/engine/deliberation.test.ts', sha: BLOB })],
  onTree({ 'site/app/src/engine/deliberation.test.ts': present(BLOB) }),
  onTree({ 'site/app/src/engine/deliberation.test.ts': present(BLOB) }),
)) {
  failures.push('a PR whose files already match the base should count as superseded');
}

for (const [label, files, base, head] of [
  [
    'a file that still differs on base',
    [mod({ filename: 'a.ts', sha: 'aaa' })],
    { 'a.ts': present('bbb') },
    { 'a.ts': present('aaa') },
  ],
  [
    'one of several files still differing',
    [mod({ filename: 'a.ts', sha: 'aaa' }), mod({ filename: 'b.ts', sha: 'bbb' })],
    { 'a.ts': present('aaa'), 'b.ts': present('zzz') },
    { 'a.ts': present('aaa'), 'b.ts': present('bbb') },
  ],
  [
    'a deletion whose file is still on base',
    [{ filename: 'gone.ts', status: 'removed', additions: 0, deletions: 9 }],
    { 'gone.ts': present('aaa') },
    {},
  ],
  [
    'a deletion whose base lookup failed',
    [{ filename: 'gone.ts', status: 'removed', additions: 0, deletions: 9 }],
    { 'gone.ts': UNKNOWN },
    {},
  ],
  [
    'a deletion whose head lookup failed',
    [{ filename: 'gone.ts', status: 'removed', additions: 0, deletions: 9 }],
    {},
    { 'gone.ts': UNKNOWN },
  ],
  [
    'an unreadable path on an edit',
    [mod({ filename: 'a.ts', sha: 'aaa' })],
    { 'a.ts': UNKNOWN },
    { 'a.ts': present('aaa') },
  ],
  [
    'a file entry with no blob sha',
    [mod({ filename: 'a.ts', sha: '' })],
    { 'a.ts': present('') },
    { 'a.ts': present('') },
  ],
  [
    'a pure mode change',
    [mod({ filename: 'script.sh', sha: 'aaa', additions: 0, deletions: 0 })],
    { 'script.sh': present('aaa', '100644') },
    { 'script.sh': present('aaa', '100755') },
  ],
  [
    // Another PR may land the same content but not the executable-bit change.
    'a combined content and mode change whose content already landed',
    [mod({ filename: 'script.sh', sha: 'aaa', additions: 1, deletions: 1 })],
    { 'script.sh': present('aaa', '100644') },
    { 'script.sh': present('aaa', '100755') },
  ],
  [
    'a tree type change',
    [mod({ filename: 'link', sha: 'aaa' })],
    { link: present('aaa', '100644', 'blob') },
    { link: present('aaa', '160000', 'commit') },
  ],
  [
    // A rename also deletes the source; matching the destination is not enough.
    'a rename whose source is still on base',
    [{ filename: 'new.ts', previous_filename: 'old.ts', status: 'renamed', additions: 1, deletions: 1, sha: 'aaa' }],
    { 'new.ts': present('aaa'), 'old.ts': present('aaa') },
    { 'new.ts': present('aaa') },
  ],
  [
    'a rename with no recorded source',
    [{ filename: 'new.ts', status: 'renamed', additions: 1, deletions: 1, sha: 'aaa' }],
    { 'new.ts': present('aaa') },
    { 'new.ts': present('aaa') },
  ],
  ['an empty file list', [], {}, {}],
  ['a non-array file list', null, {}, {}],
]) {
  if (filesAreSuperseded(files, onTree(base), onTree(head))) {
    failures.push(`${label} must not count as superseded`);
  }
}

// A deletion is superseded once the file is genuinely gone from the base.
if (!filesAreSuperseded(
  [{ filename: 'gone.ts', status: 'removed', additions: 0, deletions: 9 }],
  onTree({}),
  onTree({}),
)) {
  failures.push('a deletion already applied on base should count as superseded');
}

// A rename is superseded once the destination matches and the source is gone.
if (!filesAreSuperseded(
  [{ filename: 'new.ts', previous_filename: 'old.ts', status: 'renamed', additions: 1, deletions: 1, sha: 'aaa' }],
  onTree({ 'new.ts': present('aaa') }),
  onTree({ 'new.ts': present('aaa') }),
)) {
  failures.push('a fully-applied rename should count as superseded');
}

// Tree entries are keyed by the exact paths returned by GitHub, so reserved
// filename characters never enter a request URL.
for (const path of ['docs/what?.md', 'docs/c#/notes.md', 'a b/c.ts']) {
  if (!filesAreSuperseded(
    [mod({ filename: path, sha: 'aaa' })],
    onTree({ [path]: present('aaa') }),
    onTree({ [path]: present('aaa') }),
  )) {
    failures.push(`a superseded path containing reserved characters should match: ${path}`);
  }
}


// --- Racing an in-flight review ------------------------------------------
// Reviewer presence is advisory on this repository, so nothing requires a bot
// to have looked before merge. Auto-merge only waits for *required* checks, and
// `validate` plus `bot-feedback-gate` both go green in seconds while no threads
// exist yet — so a PR could merge while CodeRabbit was still writing, and the
// thread gate would have nothing left to block on. Arming waits for a review
// already in progress; it never demands one.
const NOW = Date.parse('2026-08-02T04:10:00Z');
const check = (over) => ({ name: 'CodeRabbit', bucket: 'pending', startedAt: '2026-08-02T04:05:00Z', ...over });

if (reviewsInFlight([check()], NOW).length !== 1) {
  failures.push('a review in progress should hold the merge');
}
if (reviewsInFlight([check({ name: 'Sourcery review', bucket: undefined, state: 'IN_PROGRESS' })], NOW).length !== 1) {
  failures.push('other reviewers count too');
}
for (const [label, checks] of [
  ['a finished review', [check({ bucket: 'pass' })]],
  ['a skipped review', [check({ bucket: 'skipping', state: 'SKIPPED' })]],
  // A reviewer that hangs must not block merges forever.
  ['a reviewer stuck past the window', [check({ startedAt: '2026-08-02T03:00:00Z' })]],
  ['a pending non-reviewer check', [check({ name: 'validate' })]],
  // Presence stays advisory: no reviewer running is not something to wait for.
  ['no checks at all', []],
  ['unreadable checks', null],
]) {
  if (reviewsInFlight(checks, NOW).length !== 0) {
    failures.push(`${label} must not hold the merge`);
  }
}

if (classifyGateFailure({ id: 'reviews-in-flight', pass: false, detail: 'x' }) !== 'waiting') {
  failures.push('an in-flight review is a wait, never agent work');
}

if (failures.length) {
  console.error('FAIL verify-pr-gate-logic:');
  for (const f of failures) console.error('  -', f);
  process.exit(1);
}
console.log(`PASS verify-pr-gate-logic: ${cases.length} live thread checks + no-bypass policy`);
