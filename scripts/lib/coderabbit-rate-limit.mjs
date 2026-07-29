/**
 * CodeRabbit rate-limit comment helpers.
 * Used by scripts/coderabbit-rate-limit-retry.mjs
 */

export const CR_RATE_LIMIT_MARKERS = [
  'Review limit reached',
  'rate limited by coderabbit.ai',
  'you\'ve reached your PR review limit',
];

export const CR_RETRY_MARKER = '<!-- simjury-coderabbit-rate-limit-retry -->';
/** Force a from-scratch review — incremental `@coderabbitai review` no-ops after rate-limit false starts. */
export const CR_REVIEW_TRIGGER = '@coderabbitai full review';
export const CR_REVIEW_TRIGGER_PATTERN = /@coderabbitai\s+(?:full\s+)?review\b/i;

export function isCoderabbitLogin(login) {
  const l = String(login || '').toLowerCase();
  return l === 'coderabbitai' || l === 'coderabbitai[bot]';
}

export function isRateLimitBody(body) {
  const text = String(body || '');
  return CR_RATE_LIMIT_MARKERS.some((m) => text.toLowerCase().includes(m.toLowerCase()));
}

/**
 * Parse "available in N minutes/hours" from CodeRabbit rate-limit text.
 * @param {string} body
 * @returns {number|null} minutes, or null if unparseable
 */
export function parseAvailableInMinutes(body) {
  const text = String(body || '');
  const patterns = [
    /next review available in[:\s*]*\*?\*?(\d+)\s*minutes?/i,
    /more reviews will be available in\s+(\d+)\s*minutes?/i,
    /available in[:\s*]*\*?\*?(\d+)\s*minutes?/i,
    /next review available in[:\s*]*\*?\*?(\d+)\s*hours?/i,
    /more reviews will be available in\s+(\d+)\s*hours?/i,
    /available in[:\s*]*\*?\*?(\d+)\s*hours?/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n < 0) continue;
    if (/hours?/i.test(m[0]) && !/minutes?/i.test(m[0])) return Math.ceil(n * 60);
    return Math.ceil(n);
  }
  return null;
}

/**
 * @param {{ body?: string, createdAt?: string, author?: { login?: string }, user?: { login?: string } }[]} comments
 * @returns {{ createdAt: string, body: string, waitMinutes: number } | null}
 */
export function latestRateLimitEvent(comments) {
  let best = null;
  for (const c of comments || []) {
    const login = c.author?.login || c.user?.login;
    if (!isCoderabbitLogin(login)) continue;
    const body = String(c.body || '');
    if (!isRateLimitBody(body)) continue;
    // CodeRabbit edits one long-lived rate-limit comment after later attempts.
    // Use its update time so retry timing follows the latest vendor response.
    const createdAt = c.updatedAt || c.updated_at || c.createdAt || c.created_at;
    if (!createdAt) continue;
    const parsed = parseAvailableInMinutes(body);
    const waitMinutes = parsed == null ? 60 : parsed;
    if (!best || String(createdAt) > String(best.createdAt)) {
      best = { createdAt: String(createdAt), body, waitMinutes };
    }
  }
  return best;
}

/**
 * True when CodeRabbit posted a real review after the rate-limit timestamp.
 * @param {{ createdAt?: string, submittedAt?: string, author?: { login?: string }, user?: { login?: string }, body?: string, state?: string }[]} reviews
 * @param {{ createdAt?: string, author?: { login?: string }, user?: { login?: string }, body?: string }[]} comments
 * @param {string} afterIso
 */
export function coderabbitReviewedAfter(reviews, comments, afterIso) {
  const after = Date.parse(afterIso);
  if (!Number.isFinite(after)) return false;

  for (const r of reviews || []) {
    const login = r.author?.login || r.user?.login;
    if (!isCoderabbitLogin(login)) continue;
    const t = Date.parse(r.submittedAt || r.submitted_at || r.createdAt || r.created_at || '');
    if (!Number.isFinite(t) || t <= after) continue;
    const body = String(r.body || '');
    if (isRateLimitBody(body)) continue;
    if (/review command invocation/i.test(body)) continue;
    if (/does not re-review already reviewed commits/i.test(body)) continue;
    if (/auto-generated reply by CodeRabbit/i.test(body) && /Action performed|I(?:'|’)ll review|Review finished/i.test(body)) {
      continue;
    }
    // Real review only — do not treat long walkthrough / tip text as a review.
    if (r.state === 'APPROVED' || r.state === 'CHANGES_REQUESTED') return true;
    if (/Actionable comments posted|Prompt for AI Agents|cr-comment:v1:/i.test(body)) return true;
    if (/_🟠|_🔴|_🟡/u.test(body) && body.trim().length >= 60) return true;
  }

  for (const c of comments || []) {
    const login = c.author?.login || c.user?.login;
    if (!isCoderabbitLogin(login)) continue;
    const t = Date.parse(c.createdAt || c.created_at || '');
    if (!Number.isFinite(t) || t <= after) continue;
    const body = String(c.body || '');
    if (isRateLimitBody(body)) continue;
    if (/review command invocation/i.test(body)) continue;
    if (/does not re-review already reviewed commits/i.test(body)) continue;
    if (/auto-generated reply by CodeRabbit/i.test(body) && /Action performed|I(?:'|’)ll review|Review finished/i.test(body)) {
      continue;
    }
    if (/Actionable comments posted|Prompt for AI Agents|cr-comment:v1:/i.test(body)) return true;
    if (/_🟠|_🔴|_🟡/u.test(body) && body.trim().length >= 60) return true;
  }
  return false;
}

/**
 * True when we already posted a retry trigger after the rate-limit event,
 * and CodeRabbit has not rate-limited again after that trigger.
 */
export function retryAlreadyArmed(comments, rateLimitCreatedAt) {
  const after = Date.parse(rateLimitCreatedAt);
  if (!Number.isFinite(after)) return false;
  let latestRetry = null;
  let latestLimitAfterRetry = null;
  for (const c of comments || []) {
    const body = String(c.body || '');
    const t = Date.parse(c.createdAt || c.created_at || '');
    if (!Number.isFinite(t) || t <= after) continue;
    if (body.includes(CR_RETRY_MARKER) && CR_REVIEW_TRIGGER_PATTERN.test(body)) {
      if (!latestRetry || t > latestRetry) latestRetry = t;
    }
    const login = c.author?.login || c.user?.login;
    if (isCoderabbitLogin(login) && isRateLimitBody(body)) {
      if (!latestLimitAfterRetry || t > latestLimitAfterRetry) latestLimitAfterRetry = t;
    }
  }
  if (latestRetry == null) return false;
  // Armed and not superseded by a newer rate-limit
  return latestLimitAfterRetry == null || latestLimitAfterRetry < latestRetry;
}

export function msUntilRetry(rateLimitCreatedAt, waitMinutes, bufferMinutes = 2, nowMs = Date.now()) {
  const start = Date.parse(rateLimitCreatedAt);
  if (!Number.isFinite(start)) return Math.max(0, (waitMinutes + bufferMinutes) * 60_000);
  const readyAt = start + (Number(waitMinutes) + Number(bufferMinutes)) * 60_000;
  return Math.max(0, readyAt - nowMs);
}

export function clampWaitMs(ms, { maxMs = 120 * 60_000 } = {}) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, maxMs);
}
