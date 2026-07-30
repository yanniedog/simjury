import { spawnSync } from 'node:child_process';

function runGhJson(args) {
  const result = spawnSync('gh', args, {
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) return { ok: false, error: result.error.message };
  if (result.status !== 0) {
    return {
      ok: false,
      error: (result.stderr || result.stdout || `gh exit ${result.status}`).trim(),
    };
  }
  try {
    return { ok: true, data: JSON.parse((result.stdout || '').trim() || '[]') };
  } catch (error) {
    return { ok: false, error: `Invalid JSON from gh: ${error.message}` };
  }
}

function readPrChecks(prNumber) {
  const result = spawnSync(
    'gh',
    [
      'pr',
      'checks',
      String(prNumber),
      '--required',
      '--json',
      'name,bucket,state,startedAt,completedAt',
    ],
    { encoding: 'utf8', timeout: 120_000 },
  );
  if (result.error) return { ok: false, error: result.error.message };
  if (result.status === 0 || result.status === 8) {
    try {
      return { ok: true, data: JSON.parse((result.stdout || '').trim() || '[]') };
    } catch (error) {
      return { ok: false, error: `Invalid JSON from gh pr checks: ${error.message}` };
    }
  }
  const error = (result.stderr || result.stdout || `gh exit ${result.status}`).trim();
  if (/no (required )?checks reported/i.test(error)) return { ok: true, data: [] };
  return { ok: false, error };
}

export function requiredChecksFromProtection(protection) {
  return [
    ...(protection?.required_status_checks?.checks || []).map((row) => row.context),
    ...(protection?.required_status_checks?.contexts || []),
  ].filter(Boolean);
}

export function requiredChecksFromRules(rules) {
  return (rules || [])
    .filter((rule) => rule?.type === 'required_status_checks')
    .flatMap((rule) => rule?.parameters?.required_status_checks || [])
    .map((row) => row.context)
    .filter(Boolean);
}

export function combineRequiredCheckPolicy({
  protection,
  rules,
  fallbackRequiredNames = [],
}) {
  if (protection.ok || rules.ok) {
    const sources = [];
    if (protection.ok) sources.push('branch protection');
    if (rules.ok) sources.push('rules');
    return {
      names: [
        ...new Set([
          ...requiredChecksFromProtection(protection.data),
          ...requiredChecksFromRules(rules.data),
        ]),
      ],
      source: `live ${sources.join(' + ')}`,
    };
  }
  return {
    names: [...fallbackRequiredNames],
    source: 'configured policy fallback; live policy APIs unavailable',
  };
}

function normalized(value) {
  return String(value || '').trim().toLowerCase();
}

function nameMatches(candidate, expected) {
  const actual = normalized(candidate);
  const wanted = normalized(expected);
  if (actual === wanted) return true;
  const slash = actual.lastIndexOf('/');
  return slash >= 0 && actual.slice(slash + 1).trim() === wanted;
}

function observedAt(row) {
  return Date.parse(
    row.startedAt ||
      row.started_at ||
      row.completedAt ||
      row.completed_at ||
      row.updated_at ||
      row.created_at ||
      0,
  ) || 0;
}

function newest(rows) {
  return rows.reduce((latest, row) => {
    if (!latest) return row;
    const delta = observedAt(row) - observedAt(latest);
    if (delta) return delta > 0 ? row : latest;
    return Number(row.id || 0) >= Number(latest.id || 0) ? row : latest;
  }, null);
}

function observationState(row) {
  const bucket = normalized(row?.bucket);
  const state = normalized(row?.state || row?.status);
  const conclusion = normalized(row?.conclusion);
  if (
    bucket === 'fail' ||
    bucket === 'cancel' ||
    ['failure', 'error', 'cancelled', 'timed_out', 'action_required'].includes(state) ||
    ['failure', 'cancelled', 'timed_out', 'action_required', 'startup_failure'].includes(conclusion)
  ) {
    return 'failed';
  }
  if (
    bucket === 'pending' ||
    ['queued', 'pending', 'in_progress', 'waiting', 'requested'].includes(state)
  ) {
    return 'pending';
  }
  if (
    bucket === 'pass' ||
    state === 'success' ||
    ['success', 'neutral', 'skipped'].includes(conclusion)
  ) {
    return 'passed';
  }
  return 'pending';
}

/**
 * Evaluate only the configured required contexts. Missing contexts are pending,
 * and the newest observation across PR checks, check-runs, and statuses wins.
 */
export function evaluateRequiredCheckState({
  requiredNames,
  prChecks = [],
  headCheckRuns = [],
  commitStatuses = [],
}) {
  const observations = [...prChecks, ...headCheckRuns, ...commitStatuses];
  const checks = [];
  const failedNames = [];
  const pendingNames = [];
  const missingNames = [];

  for (const name of [...new Set((requiredNames || []).filter(Boolean))]) {
    const row = newest(
      observations.filter((candidate) =>
        nameMatches(candidate.name || candidate.context, name)),
    );
    if (!row) {
      missingNames.push(name);
      pendingNames.push(name);
      continue;
    }
    const state = observationState(row);
    checks.push({ name, state });
    if (state === 'failed') failedNames.push(name);
    else if (state !== 'passed') pendingNames.push(name);
  }

  return {
    pending: pendingNames.length > 0,
    unreported: missingNames.length > 0,
    failed: failedNames.length > 0,
    failedNames,
    pendingNames,
    missingNames,
    checks,
  };
}

/**
 * Read live policy plus observations attached to the exact current PR head.
 */
export function fetchRequiredCheckState({
  prNumber,
  repo,
  headSha,
  baseRefName = 'main',
  fallbackRequiredNames = [],
  runJson = runGhJson,
  runPrChecks = readPrChecks,
}) {
  const branch = encodeURIComponent(baseRefName);
  const protection = runJson(['api', `repos/${repo}/branches/${branch}/protection`]);
  const rules = runJson(['api', `repos/${repo}/rules/branches/${branch}`]);
  const policy = combineRequiredCheckPolicy({
    protection,
    rules,
    fallbackRequiredNames,
  });
  const prChecks = runPrChecks(prNumber);
  const checkRuns = runJson(['api', `repos/${repo}/commits/${headSha}/check-runs?per_page=100`]);
  const statuses = runJson(['api', `repos/${repo}/commits/${headSha}/status?per_page=100`]);
  const evaluated = evaluateRequiredCheckState({
    requiredNames: policy.names,
    prChecks: prChecks.ok ? prChecks.data : [],
    headCheckRuns: checkRuns.ok ? checkRuns.data?.check_runs || [] : [],
    commitStatuses: statuses.ok ? statuses.data?.statuses || [] : [],
  });

  if (evaluated.missingNames.length && !prChecks.ok && !checkRuns.ok && !statuses.ok) {
    return {
      ...evaluated,
      policySource: policy.source,
      error: [prChecks.error, checkRuns.error, statuses.error].filter(Boolean).join('; '),
    };
  }
  return { ...evaluated, policySource: policy.source };
}
