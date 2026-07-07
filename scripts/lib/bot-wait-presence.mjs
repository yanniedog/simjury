import { spawnSync } from 'node:child_process';
import {
  allKnownBotLogins,
  formatRequiredKeys,
  missingRequiredKeys,
  resolveRequiredKeys,
} from './bot-wait-config.mjs';
import { gitRepoRoot, readBotWaitStateFile } from './bot-wait-state.mjs';

export function readBotWaitState(prNumber, cwd) {
  return readBotWaitStateFile(prNumber, cwd || gitRepoRoot());
}

function parseAnchorMs(iso) {
  if (iso == null || String(iso).trim() === '') return NaN;
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return NaN;
  return ms;
}

export function resolveAnchorIso(anchorIso, fallbackIso) {
  let ms = parseAnchorMs(anchorIso);
  if (!Number.isFinite(ms)) ms = parseAnchorMs(fallbackIso);
  if (!Number.isFinite(ms)) throw new Error(`Invalid anchor time: ${anchorIso ?? '(none)'}`);
  return new Date(ms).toISOString();
}

const COMMENTS_QUERY =
  'query($owner:String!,$name:String!,$num:Int!){repository(owner:$owner,name:$name){pullRequest(number:$num){createdAt comments(last:100){nodes{author{login}createdAt}}reviews(last:30){nodes{author{login}submittedAt}}reviewThreads(last:100){nodes{comments(last:10){nodes{author{login}createdAt}}}}}}}';

function ghGraphql(owner, name, prNumber) {
  const r = spawnSync(
    'gh',
    [
      'api',
      'graphql',
      '-f',
      `query=${COMMENTS_QUERY}`,
      '-f',
      `owner=${owner}`,
      '-f',
      `name=${name}`,
      '-F',
      `num=${prNumber}`,
    ],
    { encoding: 'utf8' },
  );
  const text = (r.stdout || '').trim();
  if (!text) {
    throw new Error((r.stderr || 'gh api graphql failed').trim());
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`Invalid JSON from gh api graphql: ${e.message}`);
  }
  if (Array.isArray(data.errors) && data.errors.length) {
    throw new Error(data.errors.map((e) => e.message).join('; '));
  }
  if (r.status !== 0) {
    throw new Error((r.stderr || text || 'gh api graphql failed').trim());
  }
  return data;
}

export function collectBotEvents(prPayload, knownBots, anchorIso, fallbackIso) {
  const anchorMs = new Date(resolveAnchorIso(anchorIso, fallbackIso)).getTime();
  const events = [];
  for (const c of prPayload.comments?.nodes || []) {
    if (c.author?.login && c.createdAt) events.push({ login: c.author.login, at: c.createdAt });
  }
  for (const rev of prPayload.reviews?.nodes || []) {
    if (rev.author?.login && rev.submittedAt) events.push({ login: rev.author.login, at: rev.submittedAt });
  }
  for (const t of prPayload.reviewThreads?.nodes || []) {
    for (const c of t.comments?.nodes || []) {
      if (c.author?.login && c.createdAt) events.push({ login: c.author.login, at: c.createdAt });
    }
  }
  events.sort((a, b) => new Date(a.at) - new Date(b.at));
  return events.filter(
    (e) => knownBots.has(e.login.toLowerCase()) && new Date(e.at).getTime() >= anchorMs,
  );
}

export function checkRequiredBotsOnPr(owner, name, prNumber, { requiredKeys, anchorIso, repoRoot } = {}) {
  const state = readBotWaitState(prNumber, repoRoot);
  const keys =
    requiredKeys?.length ? requiredKeys : state?.requiredKeys?.length ? state.requiredKeys : resolveRequiredKeys();
  const knownBots = allKnownBotLogins(keys);
  const data = ghGraphql(owner, name, prNumber);
  const pr = data?.data?.repository?.pullRequest;
  if (!pr) throw new Error('GraphQL: pull request not found');
  const anchor = resolveAnchorIso(anchorIso || state?.anchor, pr.createdAt);
  const events = collectBotEvents(pr, knownBots, anchor, pr.createdAt);
  const seenLogins = [...new Set(events.map((e) => e.login))];
  const missing = missingRequiredKeys(keys, seenLogins);
  return {
    requiredKeys: keys,
    anchor,
    missing,
    botsSeen: seenLogins,
    ok: missing.length === 0,
    detail: formatRequiredKeys(keys),
  };
}
