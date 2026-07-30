/**
 * Classify PR merge-gate failures as actionable (agent must work) vs waiting
 * (GitHub/bots own the clock). Used by pr-arm-and-park to stop agent poll loops.
 */
import { evaluateGates, repoSlug } from './pr-gates-lib.mjs';

/** repoSlug() yields { owner, name }; API paths need "owner/name". */
function repoSlugString() {
  const slug = repoSlug();
  return typeof slug === 'string' ? slug : `${slug.owner}/${slug.name}`;
}
import {
  BASE_GUARD_GATE_ID,
  checkBaseProtected,
} from './pr-base-guard.mjs';
import { ghJson } from './gh-pr-review-threads.mjs';
import {
  fetchPrMergeMeta,
  isAutoMergeEnabled,
  progressPullRequest,
} from './pr-branch-sync.mjs';

/** Gate ids that mean "agent must edit code / resolve threads / fix CI". */
const ALWAYS_ACTIONABLE = new Set(['gh-auth', 'pr-bot-feedback-check', BASE_GUARD_GATE_ID]);

/**
 * @param {{ id: string, pass: boolean, detail?: string, exitCode?: number, action?: string }} gate
 * @returns {'ok'|'waiting'|'actionable'}
 */
export function classifyGateFailure(gate) {
  if (!gate || gate.pass) return 'ok';
  const id = gate.id;
  const detail = gate.detail || '';

  if (ALWAYS_ACTIONABLE.has(id)) return 'actionable';

  if (id === 'branch-fresh') {
    return 'actionable';
  }

  if (id === 'ci-required') {
    if (/pending/i.test(detail)) return 'waiting';
    return 'actionable';
  }

  if (id === 'github-bot-gates') {
    if (/not reported yet|pending|in_progress|queued/i.test(detail)) return 'waiting';
    // Presence often fails while bots have not posted — treat as wait unless feedback failed.
    if (/bot-feedback-gate:\s*(fail|failure|error|cancel)/i.test(detail)) return 'actionable';
    if (/bot-presence-gate:\s*(fail|failure)/i.test(detail)) return 'waiting';
    return 'waiting';
  }

  if (id === 'wait-for-bots') {
    if (gate.exitCode === 2) return 'waiting';
    // exit 1 = missing bots at cap or hard error — agent should tag/request, not sleep-poll
    return 'actionable';
  }

  if (id === 'auto-merge') return 'actionable';

  return 'actionable';
}

/**
 * @param {{ pass: boolean, gates: Array<{id:string,pass:boolean,detail?:string,exitCode?:number}> }} gatesResult
 */
export function classifyWorkMode(gatesResult) {
  const failing = (gatesResult.gates || []).filter((g) => !g.pass);
  if (!failing.length) {
    return { mode: 'ready', actionable: [], waiting: [], gates: gatesResult.gates || [] };
  }
  const actionable = [];
  const waiting = [];
  for (const g of failing) {
    const kind = classifyGateFailure(g);
    if (kind === 'waiting') waiting.push(g);
    else actionable.push(g);
  }
  if (actionable.length) {
    return { mode: 'actionable', actionable, waiting, gates: gatesResult.gates || [] };
  }
  return { mode: 'waiting', actionable: [], waiting, gates: gatesResult.gates || [] };
}

/**
 * One-shot: sync branch, arm squash auto-merge, classify gate state.
 * Never polls. Exit semantics for CLI live in pr-arm-and-park.mjs.
 *
 * @param {number} prNumber
 * @param {{ dryRun?: boolean, skipArm?: boolean, skipSync?: boolean }} [opts]
 */
export function armAndParkOnce(prNumber, opts = {}) {
  const dryRun = Boolean(opts.dryRun);
  const skipArm = Boolean(opts.skipArm);
  const skipSync = Boolean(opts.skipSync);

  // Resolve the base first: arming auto-merge against a base the gates do not
  // cover would merge this PR unreviewed within seconds.
  let baseMeta = null;
  try {
    baseMeta = fetchPrMergeMeta(prNumber);
  } catch {
    baseMeta = null;
  }
  const baseGuard = opts.baseGuard
    ?? checkBaseProtected(repoSlugString(), baseMeta?.baseRefName, ghJson);
  if (!baseGuard.covered) {
    return {
      prNumber,
      ok: false,
      mode: 'actionable',
      error: baseGuard.detail,
      progression: null,
      autoMergeArmed: false,
      baseGuard,
      classification: {
        mode: 'actionable',
        actionable: [{ id: BASE_GUARD_GATE_ID, pass: false, detail: baseGuard.detail }],
        waiting: [],
      },
      gates: null,
    };
  }

  let progression = null;
  if (!skipArm || !skipSync) {
    progression = progressPullRequest(prNumber, {
      dryRun,
      syncBranch: !skipSync,
      enableAuto: !skipArm,
    });
  }

  let meta = null;
  try {
    meta = fetchPrMergeMeta(prNumber);
  } catch (e) {
    return {
      prNumber,
      ok: false,
      mode: 'error',
      error: e.message,
      progression,
      autoMergeArmed: false,
    };
  }

  if (progression?.blocked) {
    return {
      prNumber,
      ok: false,
      mode: 'actionable',
      error: progression.sync?.detail || progression.branchState?.detail || 'branch blocked',
      progression,
      autoMergeArmed: isAutoMergeEnabled(meta),
      classification: {
        mode: 'actionable',
        actionable: [
          {
            id: 'branch-fresh',
            pass: false,
            detail: progression.sync?.detail || progression.branchState?.detail,
          },
        ],
        waiting: [],
      },
      gates: null,
    };
  }

  const gates = evaluateGates(prNumber);
  const classification = classifyWorkMode(gates);
  const autoMergeArmed = isAutoMergeEnabled(meta) || progression?.autoMerge?.ok === true;

  return {
    prNumber,
    ok: true,
    mode: classification.mode,
    classification,
    gates,
    progression,
    autoMergeArmed,
    headRefName: meta.headRefName,
    baseGuard,
  };
}

export { evaluateGates, isAutoMergeEnabled, progressPullRequest };
