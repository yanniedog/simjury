#!/usr/bin/env node
/**
 * Unit tests for actionable-vs-waiting classification (no network).
 */
import { readFileSync } from 'node:fs';
import {
  classifyGateFailure,
  classifyProgressionOutcome,
  classifyTerminalPrState,
  classifyWorkMode,
} from './lib/pr-arm-and-park-lib.mjs';
import {
  draftAutoMergeDecision,
  enableSquashAutoMerge,
} from './lib/pr-branch-sync.mjs';
import {
  fetchRequiredCi,
  gateCiRequired,
} from './lib/pr-gates-lib.mjs';
import {
  combineRequiredCheckPolicy,
  evaluateRequiredCheckState,
} from './lib/required-ci-checks.mjs';

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

assert(
  !draftAutoMergeDecision({ isDraft: true }).allowed,
  'background progression cannot publish a draft',
);
assert(
  draftAutoMergeDecision({ isDraft: true }, { allowDraftPromotion: true }).promote,
  'explicit arm/merge may publish a draft',
);

let backgroundMarkedReady = false;
const backgroundDraft = enableSquashAutoMerge(277, {
  fetchMeta: () => ({ state: 'OPEN', isDraft: true }),
  markReady: () => {
    backgroundMarkedReady = true;
    return { ok: true, exitCode: 0 };
  },
  merge: () => ({ ok: true, exitCode: 0 }),
});
assert(
  !backgroundDraft.ok && !backgroundMarkedReady,
  'default auto-merge path leaves drafts unpublished',
);
assert(
  /allowDraftPromotion:\s*!skipArm/.test(readFileSync('scripts/lib/pr-arm-and-park-lib.mjs', 'utf8')),
  'arm-and-park explicitly opts into draft publication',
);
assert(
  /allowDraftPromotion:\s*true/.test(readFileSync('scripts/pr-merge.mjs', 'utf8')),
  'merge command explicitly opts into draft publication',
);

const readyFailure = enableSquashAutoMerge(277, {
  allowDraftPromotion: true,
  fetchMeta: () => ({ state: 'OPEN', isDraft: true }),
  markReady: () => ({ ok: false, stdout: '', stderr: '', exitCode: 7 }),
  merge: () => {
    throw new Error('merge must not run after ready failure');
  },
});
assert(
  !readyFailure.ok &&
    readyFailure.hardError === true &&
    /gh pr ready exited 7/.test(readyFailure.detail),
  'ready failure is a diagnostic hard error',
);

const terminalWins = classifyProgressionOutcome(
  { state: 'MERGED' },
  { ok: false, blocked: true },
  new Error('local progression failed'),
);
assert(terminalWins.kind === 'merged', 'terminal merge wins over progression error and block');
assert(
  classifyProgressionOutcome({ state: 'MERGED' }, null, null).kind === 'merged',
  'merged-terminal progression is null-safe',
);

const progressionFailure = classifyProgressionOutcome(
  { state: 'OPEN' },
  { ok: false, autoMerge: { detail: 'ready failed' } },
);
assert(
  progressionFailure.kind === 'error' && progressionFailure.detail === 'ready failed',
  'non-terminal progression failure remains a hard error',
);

const livePolicy = combineRequiredCheckPolicy({
  protection: {
    ok: true,
    data: { required_status_checks: { contexts: ['validate'] } },
  },
  rules: {
    ok: true,
    data: [{
      type: 'required_status_checks',
      parameters: { required_status_checks: [{ context: 'bot-feedback-gate' }] },
    }],
  },
});
assert(
  livePolicy.names.join(',') === 'validate,bot-feedback-gate',
  'required contexts come from live protection and rules',
);
assert(
  combineRequiredCheckPolicy({
    protection: { ok: false },
    rules: { ok: false },
    fallbackRequiredNames: ['validate', 'bot-feedback-gate'],
  }).names.join(',') === 'validate,bot-feedback-gate',
  'policy API failure preserves validate plus feedback fallback',
);

const exactHeadState = evaluateRequiredCheckState({
  requiredNames: livePolicy.names,
  prChecks: [{
    name: 'validate',
    bucket: 'pass',
    startedAt: '2026-07-31T00:00:00Z',
  }],
  headCheckRuns: [{
    id: 22,
    name: 'validate',
    status: 'in_progress',
    started_at: '2026-07-31T00:01:00Z',
  }],
  commitStatuses: [{
    id: 23,
    context: 'bot-feedback-gate',
    state: 'success',
    updated_at: '2026-07-31T00:01:30Z',
  }],
});
assert(
  exactHeadState.pending &&
    !exactHeadState.failed &&
    exactHeadState.pendingNames.join(',') === 'validate',
  'newest exact-head observation wins across checks and statuses',
);

const missingState = evaluateRequiredCheckState({
  requiredNames: ['validate', 'bot-feedback-gate'],
});
assert(
  missingState.pending &&
    missingState.unreported &&
    missingState.missingNames.join(',') === 'validate,bot-feedback-gate',
  'missing required contexts remain pending',
);
const missingGate = gateCiRequired(279, () => ({ ok: true, ...missingState }));
assert(
  missingGate.pending && classifyGateFailure(missingGate) === 'waiting',
  'missing required contexts classify structurally as waiting',
);

let exactHeadRequest = null;
const wrappedState = fetchRequiredCi(279, {
  fetchPr: () => ({ headRefOid: 'current-head-279', baseRefName: 'main' }),
  resolveRepo: () => ({ owner: 'yanniedog', name: 'simjury' }),
  fetchState: (request) => {
    exactHeadRequest = request;
    return missingState;
  },
});
assert(
  wrappedState.ok &&
    exactHeadRequest?.headSha === 'current-head-279' &&
    exactHeadRequest?.fallbackRequiredNames?.join(',') === 'validate,bot-feedback-gate',
  'gate evaluation is bound to the current PR head and canonical fallback',
);

const feedbackWorkflow = readFileSync('.github/workflows/pr-bot-feedback-check.yml', 'utf8');
const feedbackGroup = feedbackWorkflow.match(/^\s*group:\s*(.+)$/m)?.[1] || '';
assert(/pull_request\.number/.test(feedbackGroup), 'feedback concurrency is grouped by PR');
assert(!/head\.sha|github\.sha/.test(feedbackGroup), 'feedback concurrency excludes head SHA');
assert(
  /^\s*cancel-in-progress:\s*false\s*$/m.test(feedbackWorkflow),
  'feedback events serialize without cancelled required contexts',
);
assert(!/^\s*queue:/m.test(feedbackWorkflow), 'feedback concurrency has no queue cap');
assert(/^\s*timeout-minutes:\s*5\s*$/m.test(feedbackWorkflow), 'feedback run is capped at five minutes');
assert(/PR_STATE=\$\(gh api/.test(feedbackWorkflow), 'stale closed-PR events are skipped');
assert(
  !/seq 1 40|sleep 60|40 minutes/.test(feedbackWorkflow),
  'feedback workflow is single-shot without a retry loop',
);

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\npr-arm-and-park classify: all assertions passed');
