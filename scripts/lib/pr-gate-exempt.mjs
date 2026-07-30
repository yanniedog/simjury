/**
 * PRs that skip bot-feedback-gate.
 *
 * Policy: protected PRs are never exempt based on mutable titles or author
 * naming. A `chore:` rename previously let human PRs bypass required reviews.
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
 * @returns {null}
 */
export function gateExemptReasonFromPrMeta(meta = {}) {
  void meta;
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
 * @returns {null}
 */
export function gateExemptReason(prNumber) {
  const view = ghJson(['pr', 'view', String(prNumber), '--json', 'title,author']);
  return gateExemptReasonFromPrMeta({ title: view?.title, author: view?.author });
}
