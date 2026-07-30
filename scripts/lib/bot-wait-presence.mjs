import { spawnSync } from 'node:child_process';
import {
  allKnownBotLogins,
  formatRequiredKeys,
  missingRequiredKeys,
  resolveRequiredKeys,
} from './bot-wait-config.mjs';
import { isCoderabbitPresenceNoise } from './coderabbit-review-status.mjs';
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
  'query($owner:String!,$name:String!,$num:Int!){repository(owner:$owner,name:$name){pullRequest(number:$num){createdAt headRefOid comments(last:100){nodes{author{login}createdAt body}}reviews(last:30){nodes{author{login}submittedAt body state commit{oid}}}reviewThreads(last:100){nodes{comments(last:10){nodes{author{login}createdAt body}}}}}}}';

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

/**
 * Collect bot events since anchor. Quota/trivial bodies are marked noise and
 * excluded from presence satisfaction. CodeRabbit rate-limits, command acks,
 * and walkthrough-only text do not clear merge protection — only a *proper*
 * CodeRabbit review does (pr-coderabbit-ensure-review owns retries).
 */
export function collectBotEvents(prPayload, knownBots, anchorIso, fallbackIso) {
  const anchorMs = new Date(resolveAnchorIso(anchorIso, fallbackIso)).getTime();
  const headSha = prPayload.headRefOid || null;
  const events = [];
  for (const c of prPayload.comments?.nodes || []) {
    if (c.author?.login && c.createdAt) {
      events.push({
        login: c.author.login,
        at: c.createdAt,
        noise: isCoderabbitPresenceNoise(c.author.login, c.body, { kind: 'comment' }),
      });
    }
  }
  for (const rev of prPayload.reviews?.nodes || []) {
    if (rev.author?.login && rev.submittedAt) {
      events.push({
        login: rev.author.login,
        at: rev.submittedAt,
        sha: rev.commit?.oid || null,
        noise: isCoderabbitPresenceNoise(rev.author.login, rev.body, {
          state: rev.state,
          kind: 'review',
        }),
      });
    }
  }
  for (const t of prPayload.reviewThreads?.nodes || []) {
    for (const c of t.comments?.nodes || []) {
      if (c.author?.login && c.createdAt) {
        events.push({
          login: c.author.login,
          at: c.createdAt,
          noise: isCoderabbitPresenceNoise(c.author.login, c.body, { kind: 'inline' }),
        });
      }
    }
  }
  events.sort((a, b) => new Date(a.at) - new Date(b.at));
  return events.filter(
    (e) => knownBots.has(e.login.toLowerCase()) && isCurrentBotEvent(e, anchorMs, headSha),
  );
}

/**
 * Is this bot event a review of the code as it stands now?
 *
 * The anchor is a timestamp, and timestamps date a review badly: the presence
 * gate anchors on the PR's `updated_at`, which advances on *any* activity —
 * including the gate's own nudge comments. That moved the goalpost past reviews
 * the gate was waiting for. On PR #263 Sourcery reviewed the exact head SHA at
 * 12:52:06, two `github-actions[bot]` comments then pushed `updated_at` to
 * 12:55:10, and the gate discarded the review as stale and waited out its full
 * 220-minute timeout for one that had already happened.
 *
 * A review that names the current head SHA is current by definition, so accept
 * it whatever the clock says. Events carrying no SHA (issue comments,
 * reactions) still fall back to the anchor window.
 */
export function isCurrentBotEvent(event, anchorMs, headSha) {
  if (headSha && event?.sha && event.sha === headSha) return true;
  return new Date(event.at).getTime() >= anchorMs;
}

/**
 * Resolve reviewer-presence slots without letting stale wait state override an
 * explicit empty list. `[]` means the caller deliberately disabled presence;
 * only an omitted value may inherit a prior wait configuration.
 */
export function effectiveRequiredKeys(explicitKeys, stateKeys) {
  if (Array.isArray(explicitKeys)) return [...explicitKeys];
  if (Array.isArray(stateKeys) && stateKeys.length) return [...stateKeys];
  return resolveRequiredKeys();
}

export function checkRequiredBotsOnPr(owner, name, prNumber, { requiredKeys, anchorIso, repoRoot } = {}) {
  const state = readBotWaitState(prNumber, repoRoot);
  const keys = effectiveRequiredKeys(requiredKeys, state?.requiredKeys);
  const knownBots = allKnownBotLogins(keys);
  const data = ghGraphql(owner, name, prNumber);
  const pr = data?.data?.repository?.pullRequest;
  if (!pr) throw new Error('GraphQL: pull request not found');
  const anchor = resolveAnchorIso(anchorIso || state?.anchor, pr.createdAt);
  const events = collectBotEvents(pr, knownBots, anchor, pr.createdAt);
  const substantive = events.filter((e) => !e.noise);
  const seenLogins = [...new Set(substantive.map((e) => e.login))];
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
