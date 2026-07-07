/**
 * PRs that skip bot-presence-gate, bot-feedback-gate, and wait-for-bots.
 *
 * Policy: Gemini / Codex / Sourcery are required only on human-initiated work PRs.
 * Skip for:
 *   - PRs opened by GitHub bots (github-actions[bot], dependabot, …)
 *   - Conventional chore PRs (chore: / chore(scope):)
 */
import { ghJson } from './gh-pr-review-threads.mjs';

/**
 * @param {{ login?: string, __typename?: string, type?: string }|string} author
 * @returns {boolean}
 */
export function isBotPrAuthor(author) {
  if (typeof author === 'string') {
    const login = author.trim();
    return login.endsWith('[bot]');
  }
  const login = String(author?.login || '').trim();
  const type = String(author?.__typename || author?.type || '').trim();
  if (type === 'Bot') return true;
  return login.endsWith('[bot]');
}

/**
 * @param {string} title
 * @returns {boolean}
 */
export function isChorePrTitle(title) {
  return /^chore(\(|:)/i.test(String(title || '').trim());
}

/**
 * @param {{ title?: string, authorLogin?: string, authorType?: string, author?: object }} meta
 * @returns {'bot-authored'|'chore'|null}
 */
export function gateExemptReasonFromPrMeta(meta = {}) {
  const title = String(meta.title || '').trim();
  const author = meta.author || {
    login: meta.authorLogin,
    __typename: meta.authorType,
    type: meta.authorType,
  };

  if (isBotPrAuthor(author)) return 'bot-authored';
  if (isChorePrTitle(title)) return 'chore';
  return null;
}

/** @deprecated Use gateExemptReasonFromPrMeta */
export function gateExemptReasonFromTitle(title) {
  return gateExemptReasonFromPrMeta({ title });
}

/**
 * @param {number|string} prNumber
 * @returns {boolean}
 */
export function isGateExemptPr(prNumber) {
  return gateExemptReason(prNumber) !== null;
}

/**
 * @param {number|string} prNumber
 * @returns {'bot-authored'|'chore'|null}
 */
export function gateExemptReason(prNumber) {
  const view = ghJson(['pr', 'view', String(prNumber), '--json', 'title,author']);
  return gateExemptReasonFromPrMeta({ title: view?.title, author: view?.author });
}
