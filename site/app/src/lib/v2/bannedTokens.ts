import type { DocketCase } from './caseSchema'

/**
 * Banned-token scan for the Daily Docket — the daily analogue of the pilot's
 * F-4 rule (DAILY-PIVOT.md): no real names of people, companies, brands, or
 * platforms in player-visible text. 2026 relevance is achieved with invented
 * platforms ("a rideshare app"), never real ones.
 *
 * The list is a best-effort tripwire, not an exhaustive registry: it holds
 * the real-world tokens most likely to leak from LLM-drafted 2026 cases
 * (major platforms, brands, companies). **Extend it whenever new content
 * introduces a new risk** — a caught token is a rewording, a missed one is a
 * shipped invariant violation. Only unambiguous tokens belong here: a word
 * that is also plain English ("target", "zoom", "meta", "intel") would flag
 * legitimate fiction and teach authors to fight the gate.
 */
export const BANNED_TOKENS: readonly string[] = [
  // Social / media platforms
  'facebook',
  'instagram',
  'tiktok',
  'twitter',
  'youtube',
  'whatsapp',
  'telegram',
  'snapchat',
  'reddit',
  'linkedin',
  'pinterest',
  'onlyfans',
  'twitch',
  // Tech companies and products
  'google',
  'gmail',
  'android',
  'iphone',
  'ipad',
  'macbook',
  'microsoft',
  'amazon',
  'alexa',
  'netflix',
  'spotify',
  'samsung',
  'nvidia',
  'openai',
  'chatgpt',
  'github',
  // Gig / commerce / payments
  'uber',
  'lyft',
  'doordash',
  'airbnb',
  'instacart',
  'grubhub',
  'ebay',
  'etsy',
  'shopify',
  'paypal',
  'venmo',
  'zelle',
  'coinbase',
  'robinhood',
  'gofundme',
  'kickstarter',
  'craigslist',
  // Household brands
  'walmart',
  'starbucks',
  'mcdonalds',
  "mcdonald's",
  'fedex',
  'tesla',
  'waymo',
  'spacex',
  'boeing',
  'pfizer',
  'moderna',
]

const BANNED_RES = BANNED_TOKENS.map((t) => ({
  token: t,
  re: new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
}))

/** Recursively collect every string field with its path, skipping gen_meta. */
function collectStrings(
  value: unknown,
  path: string,
  out: Array<{ path: string; text: string }>,
): void {
  if (typeof value === 'string') {
    out.push({ path, text: value })
    return
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => collectStrings(v, `${path}[${i}]`, out))
    return
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      // gen_meta is authoring provenance (model, prompt version, reviewer) —
      // never rendered to a player, and legitimately contains real names.
      if (path === '' && k === 'gen_meta') continue
      collectStrings(v, path === '' ? k : `${path}.${k}`, out)
    }
  }
}

/**
 * Scan every player-visible string of a docket case for banned tokens.
 * Returns one issue message per (field, token) hit; empty array = clean.
 */
export function scanDocketCaseTokens(c: DocketCase): string[] {
  const strings: Array<{ path: string; text: string }> = []
  collectStrings(c, '', strings)
  const issues: string[] = []
  for (const { path, text } of strings) {
    for (const { token, re } of BANNED_RES) {
      if (re.test(text)) {
        issues.push(`banned token "${token}" in ${path}`)
      }
    }
  }
  return issues
}
