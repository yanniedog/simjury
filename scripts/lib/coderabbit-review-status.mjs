/**
 * Shared classifiers for "does this PR have a proper CodeRabbit review?"
 * Used by hourly recovery and presence helpers.
 */
import { isBotNoise } from './bot-noise.mjs';
import { isCoderabbitLogin, isRateLimitBody } from './coderabbit-rate-limit.mjs';

export const CR_RECOVERY_MARKER = '<!-- simjury-coderabbit-review-recovery -->';
export const CR_RECOVERY_TRIGGER = '@coderabbitai review';
export const CR_RECOVERY_INTERVAL_MS = 60 * 60 * 1000;

const FAILED_REVIEW_PATTERNS = [
  /\breview failed\b/i,
  /\bfailed to (?:review|analyze|process)\b/i,
  /\berror (?:while|during) (?:review|analysis)\b/i,
  /\bcould not (?:complete|generate) (?:the )?review\b/i,
  // Keep "internal error" / "something went wrong" scoped to review/analysis —
  // bare phrases appear in legitimate finding text and must not mark a review as failed.
  /\breview\b.{0,40}\binternal error\b/i,
  /\binternal error\b.{0,40}\breview\b/i,
  /\breview\b.{0,40}\bsomething went wrong\b/i,
  /\bsomething went wrong\b.{0,40}\breview\b/i,
];

/**
 * @param {string|null|undefined} body
 * @returns {boolean}
 */
export function isFailedCoderabbitBody(body) {
  const text = String(body || '');
  if (!text.trim()) return false;
  if (isRateLimitBody(text)) return true;
  return FAILED_REVIEW_PATTERNS.some((re) => re.test(text));
}

/**
 * @param {{ author?: { login?: string }, user?: { login?: string }, body?: string, state?: string, submittedAt?: string, createdAt?: string, created_at?: string, submitted_at?: string }[]} reviews
 * @param {{ author?: { login?: string }, user?: { login?: string }, body?: string, createdAt?: string, created_at?: string }[]} comments
 * @returns {{ hasSubstantive: boolean, hasRateLimitOnly: boolean, hasFailed: boolean, hasAnyCoderabbit: boolean, latestSubstantiveAt: string|null, latestCoderabbitAt: string|null }}
 */
export function classifyCoderabbitActivity(reviews = [], comments = []) {
  let hasSubstantive = false;
  let hasRateLimit = false;
  let hasFailed = false;
  let hasAnyCoderabbit = false;
  let latestSubstantiveAt = null;
  let latestCoderabbitAt = null;

  const noteTime = (iso, substantive) => {
    if (!iso) return;
    if (!latestCoderabbitAt || String(iso) > latestCoderabbitAt) latestCoderabbitAt = String(iso);
    if (substantive && (!latestSubstantiveAt || String(iso) > latestSubstantiveAt)) {
      latestSubstantiveAt = String(iso);
    }
  };

  for (const r of reviews || []) {
    const login = r.author?.login || r.user?.login;
    if (!isCoderabbitLogin(login)) continue;
    hasAnyCoderabbit = true;
    const body = String(r.body || '');
    const at = r.submittedAt || r.submitted_at || r.createdAt || r.created_at;
    if (isRateLimitBody(body) || isFailedCoderabbitBody(body)) {
      if (isRateLimitBody(body)) hasRateLimit = true;
      else hasFailed = true;
      noteTime(at, false);
      continue;
    }
    if (isBotNoise(body) && !(r.state === 'APPROVED' || r.state === 'CHANGES_REQUESTED')) {
      noteTime(at, false);
      continue;
    }
    if (r.state === 'COMMENTED' || r.state === 'APPROVED' || r.state === 'CHANGES_REQUESTED' || body.trim()) {
      hasSubstantive = true;
      noteTime(at, true);
    }
  }

  for (const c of comments || []) {
    const login = c.author?.login || c.user?.login;
    if (!isCoderabbitLogin(login)) continue;
    hasAnyCoderabbit = true;
    const body = String(c.body || '');
    const at = c.createdAt || c.created_at;
    if (isRateLimitBody(body)) {
      hasRateLimit = true;
      noteTime(at, false);
      continue;
    }
    if (isFailedCoderabbitBody(body)) {
      hasFailed = true;
      noteTime(at, false);
      continue;
    }
    if (isBotNoise(body)) {
      noteTime(at, false);
      continue;
    }
    // Walkthrough / finished / real findings count as a completed review run.
    if (
      /Review finished|Actionable comments posted|Action performed|summarize by coderabbit\.ai/i.test(
        body,
      ) ||
      body.trim().length >= 40
    ) {
      hasSubstantive = true;
      noteTime(at, true);
    }
  }

  return {
    hasSubstantive,
    hasRateLimitOnly: hasRateLimit && !hasSubstantive,
    hasFailed: hasFailed && !hasSubstantive,
    hasAnyCoderabbit,
    latestSubstantiveAt,
    latestCoderabbitAt,
  };
}

/**
 * True when the PR needs recovery: no proper CR review, and CR only rate-limited,
 * failed, or never completed a substantive review despite being expected.
 * @param {{ state?: string, merged?: boolean, mergedAt?: string|null, closedAt?: string|null, createdAt?: string }} meta
 * @param {ReturnType<typeof classifyCoderabbitActivity>} activity
 */
export function needsCoderabbitRecovery(meta, activity) {
  if (activity.hasSubstantive) return false;
  const closedOrMerged =
    Boolean(meta.merged || meta.mergedAt) || String(meta.state || '').toUpperCase() === 'CLOSED';
  if (!closedOrMerged) return false;
  // Any finished PR without a proper CR review (rate-limit-only, failed, or missing).
  return true;
}

/**
 * @param {{ body?: string, createdAt?: string, created_at?: string }[]} comments
 * @returns {string|null} ISO timestamp of latest recovery trigger
 */
export function latestRecoveryTriggerAt(comments = []) {
  let best = null;
  for (const c of comments || []) {
    const body = String(c.body || '');
    if (!body.includes(CR_RECOVERY_MARKER)) continue;
    if (!/@coderabbitai\s+review/i.test(body)) continue;
    const at = c.createdAt || c.created_at;
    if (!at) continue;
    if (!best || String(at) > best) best = String(at);
  }
  return best;
}

/**
 * @param {string|null} latestTriggerIso
 * @param {number} [nowMs]
 * @param {number} [intervalMs]
 */
export function canPostRecoveryTrigger(
  latestTriggerIso,
  nowMs = Date.now(),
  intervalMs = CR_RECOVERY_INTERVAL_MS,
) {
  if (!latestTriggerIso) return true;
  const t = Date.parse(latestTriggerIso);
  if (!Number.isFinite(t)) return true;
  return nowMs - t >= intervalMs;
}
