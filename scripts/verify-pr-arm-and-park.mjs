#!/usr/bin/env node
/**
 * Unit tests for actionable-vs-waiting classification (no network).
 */
import {
  classifyGateFailure,
  classifyTerminalPrState,
  classifyWorkMode,
} from './lib/pr-arm-and-park-lib.mjs';
import {
  fetchRequiredCi,
  gateCiRequired,
} from './lib/pr-gates-lib.mjs';

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    failed += 1;
  } else {
    console.log(`ok: ${msg}`);
  }
}

assert(classifyGateFailure({ id: 'wait-for-bots', pass: false, exitCode: 2 }) === 'waiting', 'wait exit 2 = waiting');
assert(classifyGateFailure({ id: 'wait-for-bots', pass: false, exitCode: 1 }) === 'actionable', 'wait exit 1 = actionable');
assert(classifyGateFailure({ id: 'ci-required', pass: false, detail: 'Required checks still pending' }) === 'waiting', 'ci pending = waiting');
assert(classifyGateFailure({ id: 'ci-required', pass: false, detail: 'Failed: validate' }) === 'actionable', 'ci fail = actionable');
assert(
  classifyGateFailure({
    id: 'github-bot-gates',
    pass: false,
    detail: 'bot-presence-gate: fail; bot-feedback-gate: not reported yet',
  }) === 'waiting',
  'optional presence failure remains waiting when explicitly enabled',
);
assert(
  classifyGateFailure({
    id: 'github-bot-gates',
    pass: false,
    detail: 'bot-presence-gate: pass; bot-feedback-gate: fail',
  }) === 'actionable',
  'feedback fail = actionable',
);
assert(classifyGateFailure({ id: 'pr-bot-feedback-check', pass: false, detail: 'threads' }) === 'actionable', 'threads = actionable');
assert(classifyGateFailure({ id: 'branch-fresh', pass: false, detail: 'behind' }) === 'actionable', 'behind = actionable');

const ready = classifyWorkMode({
  pass: true,
  gates: [{ id: 'ci-required', pass: true }],
});
assert(ready.mode === 'ready', 'all pass = ready');

const parked = classifyWorkMode({
  pass: false,
  gates: [
    { id: 'wait-for-bots', pass: false, exitCode: 2, detail: 'waiting for bots' },
    { id: 'ci-required', pass: false, detail: 'Required checks still pending' },
  ],
});
assert(parked.mode === 'waiting', 'only waiting gates = park');

const act = classifyWorkMode({
  pass: false,
  gates: [
    { id: 'wait-for-bots', pass: false, exitCode: 2, detail: 'waiting' },
    { id: 'pr-bot-feedback-check', pass: false, detail: 'open threads' },
  ],
});
assert(act.mode === 'actionable', 'any actionable gate wins');

const merged = classifyTerminalPrState({ state: 'MERGED' });
assert(merged.terminal && merged.mode === 'ready', 'merged during progression = ready success');

const closed = classifyTerminalPrState({ state: 'CLOSED' });
assert(closed.terminal && closed.mode === 'actionable', 'closed without merge = actionable');

const openDraft = classifyTerminalPrState({ state: 'OPEN', isDraft: true });
assert(!openDraft.terminal && openDraft.mode === null, 'open draft remains non-terminal');

for (const message of ['no checks reported', 'no required checks reported']) {
  const ci = fetchRequiredCi(276, () => ({ status: 1, stdout: '', stderr: message }));
  assert(ci.ok && ci.pending && !ci.failed, `${message} = pending`);
  const gate = gateCiRequired(276, () => ci);
  assert(
    !gate.pass && classifyGateFailure(gate) === 'waiting',
    `${message} gate = waiting`,
  );
}

const emptyChecks = fetchRequiredCi(276, () => ({ status: 0, stdout: '[]', stderr: '' }));
assert(emptyChecks.ok && emptyChecks.pending, 'empty required-check list = pending');

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\npr-arm-and-park classify: all assertions passed');
