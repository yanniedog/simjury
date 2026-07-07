/**
 * Shared classifier for bot comment bodies that should NOT keep the merge
 * gates open. Two consumers:
 *
 *   - wait_for_bots.mjs ignores noise events when computing the quiet window.
 *   - gh-pr-review-threads.mjs treats noise threads as low-signal in classifyThreads.
 */

const QUOTA_PATTERNS = [
  /\brate[\s-]?limit(?:ed)?\b/i,
  /\bapi (?:limit|quota)\b/i,
  /\bquota (?:exceeded|reached|exhausted)\b/i,
  /\bout of (?:credits?|tokens?|quota|usage)\b/i,
  /\binsufficient (?:credits?|tokens?|funds|balance|quota)\b/i,
  /\bsubscription (?:required|expired)\b/i,
  /\btrial (?:expired|ended|has expired)\b/i,
  /\b(?:monthly|daily) (?:limit|quota)\b/i,
  /\bfree[\s-]tier (?:limit|quota)\b/i,
  /\bservice (?:temporarily )?unavailable\b/i,
  /\btoo many requests\b/i,
  /\b429\b/,
  /\bplease (?:try|come back) (?:again )?later\b/i,
  /couldn'?t (?:review|process|complete)/i,
  /unable to (?:review|process|complete)/i,
];

const TRIVIAL_PATTERNS = [
  /^[\s]*(?:lgtm|looks good(?:\s+to\s+me)?|ok|okay|got it|thanks?|thx|noted|nothing to (?:report|add)|no (?:comments?|issues?|concerns?)|all good|approved)[\s.!]*$/i,
  /^[\s\p{Emoji_Presentation}\p{Extended_Pictographic}‍👍👎❤️✅🚀]+$/u,
];

export function isQuotaBotMessage(bodyRaw) {
  if (!bodyRaw) return false;
  const body = String(bodyRaw).trim();
  if (!body) return false;
  return QUOTA_PATTERNS.some((re) => re.test(body));
}

export function isTrivialBotMessage(bodyRaw) {
  if (!bodyRaw) return true;
  const body = String(bodyRaw).trim();
  if (!body) return true;
  const withoutFooter = body.replace(/Useful\?\s*React with[\s\S]*$/i, '').trim();
  if (withoutFooter.length < 40) return true;
  return TRIVIAL_PATTERNS.some((re) => re.test(body));
}

export function isBotNoise(bodyRaw) {
  return isQuotaBotMessage(bodyRaw) || isTrivialBotMessage(bodyRaw);
}
