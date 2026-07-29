/**
 * Shared classifiers for "does this PR have a proper CodeRabbit review?"
 * Used by ensure/recovery schedulers and presence helpers.
 *
 * Proper review ≠ rate-limit notice, command ack, or empty COMMENTED review.
 */
import { isBotNoise } from './bot-noise.mjs';
import { isCoderabbitLogin, isRateLimitBody } from './coderabbit-rate-limit.mjs';

export const CR_RECOVERY_MARKER = '<!-- simjury-coderabbit-review-recovery -->';
export const CR_ENSURE_MARKER = '<!-- simjury-coderabbit-ensure-review -->';
export const CR_RECOVERY_TRIGGER = '@coderabbitai review';
export const CR_RECOVERY_INTERVAL_MS = 60 * 60 * 1000;
/** Open-PR rate-limit follow-ups can retry every 15 minutes once due. */
export const CR_OPEN_RETRY_INTERVAL_MS = 15 * 60 * 1000;

const FAILED_REVIEW_PATTERNS = [
  /\breview failed\b/i,
  /\bfailed to (?:review|analyze|process)\b/i,
  /\berror (?:while|during) (?:review|analysis)\b/i,
  /\bcould not (?:complete|generate) (?:the )?review\b/i,
  /\breview\b.{0,40}\binternal error\b/i,
  /\binternal error\b.{0,40}\breview\b/i,
  /\breview\b.{0,40}\bsomething went wrong\b/i,
  /\bsomething went wrong\b.{0,40}\breview\b/i,
];

/** CR auto-replies that acknowledge @coderabbitai review without reviewing. */
export function isCoderabbitCommandAck(body) {
  const text = String(body || '');
  if (!text.trim()) return false;
  if (/review command invocation/i.test(text)) return true;
  if (/auto-generated reply by CodeRabbit/i.test(text) && /I(?:'|’)ll review|Action performed/i.test(text)) {
    return true;
  }
  return false;
}

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
 * True when a review/comment body is a real CodeRabbit review outcome.
 * @param {string|null|undefined} body
 */
export function isProperCoderabbitReviewBody(body) {
  const text = String(body || '');
  if (!text.trim()) return false;
  if (isRateLimitBody(text)) return false;
  if (isFailedCoderabbitBody(text)) return false;
  if (isCoderabbitCommandAck(text)) return false;
  if (isBotNoise(text)) return false;

  // Strong signals from real CR reviews
  if (/Actionable comments posted/i.test(text)) return true;
  if (/Prompt for AI Agents/i.test(text)) return true;
  if (/cr-comment:v1:/i.test(text)) return true;
  if (/potential_issue|critical|major/i.test(text) && text.length >= 80) return true;
  // Inline-style finding headers CR uses
  if (/_🟠|_🔴|_🟡/u.test(text) && text.length >= 60) return true;
  return false;
}

/**
 * Presence / quiet-window classifier: CodeRabbit only counts when the event is a
 * *proper* review (or APPROVED / CHANGES_REQUESTED). Rate-limits, command acks,
 * and long walkthrough/summarize text without review signals stay noise so merge
 * protection does not clear early.
 *
 * @param {string|null|undefined} login
 * @param {string|null|undefined} body
 * @param {{ state?: string|null, forceSubstantive?: boolean, kind?: 'comment'|'review'|'inline' }} [opts]
 */
export function isCoderabbitPresenceNoise(login, body, opts = {}) {
  const { state = null, forceSubstantive = false, kind = 'comment' } = opts;
  if (!isCoderabbitLogin(login)) {
    return forceSubstantive ? false : isBotNoise(body);
  }
  if (forceSubstantive) return false;
  if (state === 'APPROVED' || state === 'CHANGES_REQUESTED') return false;
  if (isProperCoderabbitReviewBody(body)) return false;
  // Inline thread findings often omit the summary "Actionable comments" banner.
  if (kind === 'inline') {
    const text = String(body || '').trim();
    if (
      text.length >= 40 &&
      !isRateLimitBody(text) &&
      !isCoderabbitCommandAck(text) &&
      !isBotNoise(text)
    ) {
      return false;
    }
  }
  return true;
}

/**
 * @param {{ author?: { login?: string }, user?: { login?: string }, body?: string, state?: string, submittedAt?: string, createdAt?: string, created_at?: string, submitted_at?: string }[]} reviews
 * @param {{ author?: { login?: string }, user?: { login?: string }, body?: string, createdAt?: string, created_at?: string }[]} comments
 * @param {{ user?: { login?: string }, author?: { login?: string }, body?: string, createdAt?: string, created_at?: string }[]} [inlineComments]
 */
export function classifyCoderabbitActivity(reviews = [], comments = [], inlineComments = []) {
  let hasProper = false;
  let hasRateLimit = false;
  let hasFailed = false;
  let hasAnyCoderabbit = false;
  let hasCommandAck = false;
  let latestProperAt = null;
  let latestCoderabbitAt = null;

  const noteTime = (iso, proper) => {
    if (!iso) return;
    if (!latestCoderabbitAt || String(iso) > latestCoderabbitAt) latestCoderabbitAt = String(iso);
    if (proper && (!latestProperAt || String(iso) > latestProperAt)) {
      latestProperAt = String(iso);
    }
  };

  for (const r of reviews || []) {
    const login = r.author?.login || r.user?.login;
    if (!isCoderabbitLogin(login)) continue;
    hasAnyCoderabbit = true;
    const body = String(r.body || '');
    const at = r.submittedAt || r.submitted_at || r.createdAt || r.created_at;

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
    if (isCoderabbitCommandAck(body)) {
      hasCommandAck = true;
      noteTime(at, false);
      continue;
    }

    if (r.state === 'APPROVED' || r.state === 'CHANGES_REQUESTED') {
      hasProper = true;
      noteTime(at, true);
      continue;
    }

    if (isProperCoderabbitReviewBody(body)) {
      hasProper = true;
      noteTime(at, true);
      continue;
    }

    // Empty or trivial COMMENTED reviews do not count.
    noteTime(at, false);
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
    if (isCoderabbitCommandAck(body)) {
      hasCommandAck = true;
      noteTime(at, false);
      continue;
    }
    if (isProperCoderabbitReviewBody(body)) {
      hasProper = true;
      noteTime(at, true);
      continue;
    }
    noteTime(at, false);
  }

  for (const c of inlineComments || []) {
    const login = c.user?.login || c.author?.login;
    if (!isCoderabbitLogin(login)) continue;
    hasAnyCoderabbit = true;
    const body = String(c.body || '');
    const at = c.createdAt || c.created_at;
    if (isRateLimitBody(body) || isCoderabbitCommandAck(body) || isBotNoise(body)) {
      noteTime(at, false);
      continue;
    }
    if (body.trim().length >= 40 || isProperCoderabbitReviewBody(body)) {
      hasProper = true;
      noteTime(at, true);
    }
  }

  return {
    /** @deprecated use hasProperReview */
    hasSubstantive: hasProper,
    hasProperReview: hasProper,
    hasRateLimitOnly: hasRateLimit && !hasProper,
    hasFailed: hasFailed && !hasProper,
    hasCommandAckOnly: hasCommandAck && !hasProper && !hasRateLimit,
    hasAnyCoderabbit,
    latestSubstantiveAt: latestProperAt,
    latestProperAt,
    latestCoderabbitAt,
  };
}

/**
 * True when the PR still needs a CodeRabbit ensure/recovery pass.
 */
export function needsCoderabbitRecovery(meta, activity) {
  if (activity.hasProperReview || activity.hasSubstantive) return false;
  const state = String(meta.state || '').toUpperCase();
  const merged = Boolean(meta.merged || meta.mergedAt);
  const closedOrMerged = merged || state === 'CLOSED';
  const open = state === 'OPEN';
  if (!closedOrMerged && !open) return false;
  return true;
}

/**
 * Open PR still needs a follow-up @coderabbitai review after rate-limit / missing proper review.
 */
export function needsOpenEnsure(activity) {
  if (activity.hasProperReview || activity.hasSubstantive) return false;
  // Rate-limit only, failed-only, ack-only, or CR never completed a proper review.
  return (
    activity.hasRateLimitOnly ||
    activity.hasFailed ||
    activity.hasCommandAckOnly ||
    !activity.hasAnyCoderabbit ||
    !activity.hasProperReview
  );
}

/**
 * @param {{ body?: string, createdAt?: string, created_at?: string }[]} comments
 * @param {string} [marker]
 */
export function latestEnsureTriggerAt(comments = [], marker = CR_ENSURE_MARKER) {
  let best = null;
  for (const c of comments || []) {
    const body = String(c.body || '');
    const isMarked =
      body.includes(marker) ||
      body.includes(CR_RECOVERY_MARKER) ||
      body.includes('<!-- simjury-coderabbit-rate-limit-retry -->');
    if (!isMarked) continue;
    if (!/@coderabbitai\s+review/i.test(body)) continue;
    const at = c.createdAt || c.created_at;
    if (!at) continue;
    if (!best || String(at) > best) best = String(at);
  }
  return best;
}

/** @deprecated alias */
export function latestRecoveryTriggerAt(comments = []) {
  return latestEnsureTriggerAt(comments, CR_RECOVERY_MARKER);
}

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
