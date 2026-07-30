/**
 * Required-bot aliases for wait-for-bots and pr-bot-feedback-check.
 *
 * Keys are short names (gemini, codex, sourcery, cursor, coderabbit); values are GitHub logins.
 *
 * Required list supports OR-groups: "sourcery|cursor|codex" means any one of those
 * keys satisfies that slot. Commas separate ALL-of slots.
 *
 * Bot presence is advisory by default. Operators may opt into an explicit
 * reviewer set for diagnostics, but vendor availability never blocks merge.
 */

/** Canonical env/CLI string for the default required slots. */
export const DEFAULT_REQUIRED_SPEC = 'off';
export const BOT_ALIASES = {
  /**
   * Gemini reviews arrive from the API-keyed `Automated Gemini Code Review`
   * workflow, which posts as the Actions bot. The consumer Code Assist GitHub
   * App is **not** listed: it was sunset and now posts only a caution banner,
   * so it is not a reviewer and its comments are not bot events at all.
   */
  gemini: ['google-github-actions-bot[bot]', 'google-github-actions[bot]'],
  codex: ['chatgpt-codex-connector', 'chatgpt-codex-connector[bot]'],
  sourcery: ['sourcery-ai', 'sourcery-ai[bot]'],
  /** Cursor Automation / Bugbot-style reviews (login is often `cursor` or `cursor[bot]`). */
  cursor: ['cursor', 'cursor[bot]'],
  /** CodeRabbit GitHub App reviews (`coderabbitai[bot]`). */
  coderabbit: ['coderabbitai', 'coderabbitai[bot]'],
  claude: ['claude[bot]', 'claude-code[bot]', 'anthropic-claude[bot]'],
};

/**
 * Default merge-protection slots:
 *   1. sourcery|codex|cursor — at least one peer review bot
 *   2. coderabbit — mandatory (CodeRabbit cannot be skipped via OR)
 * Gemini is advisory: its workflow is `continue-on-error` and free-tier 429s
 * must never block merge.
 */
export const DEFAULT_REQUIRED_KEYS = [];

export const OPTIONAL_BOT_LOGINS = [
  'claude[bot]',
  'claude-code[bot]',
  'copilot-pull-request-reviewer[bot]',
  'greptile-apps[bot]',
];

/**
 * Parse required bot env/CLI string into OR-group slots.
 * "sourcery|cursor,gemini" → ["sourcery|cursor", "gemini"]
 * Each slot may contain "|" alternatives.
 *
 * @param {string|null|undefined} raw
 * @returns {string[]}
 */
export function parseRequiredKeys(raw) {
  if (!raw || !String(raw).trim()) return [...DEFAULT_REQUIRED_KEYS];
  if (/^(off|none)$/i.test(String(raw).trim())) return [];
  return String(raw)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Expand one slot ("sourcery|cursor") into alternative keys.
 * @param {string} slot
 * @returns {string[]}
 */
export function alternativesForSlot(slot) {
  return String(slot || '')
    .split('|')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function resolveRequiredKeys(argvKeys, envRaw) {
  if (argvKeys?.length) return [...argvKeys];
  const fromEnv =
    envRaw ??
    process.env.SIMJURY_BOT_WAIT_REQUIRED ??
    process.env.JCS2_BOT_WAIT_REQUIRED ??
    process.env.AR_BOT_WAIT_REQUIRED ??
    process.env.BOT_WAIT_REQUIRED ??
    '';
  return parseRequiredKeys(fromEnv);
}

export function loginsForKey(key) {
  const k = String(key || '').toLowerCase();
  // OR-group passed by mistake — expand into the union of all alternatives for login list helpers
  if (k.includes('|')) {
    const set = new Set();
    for (const alt of alternativesForSlot(k)) {
      for (const login of loginsForKey(alt)) set.add(login);
    }
    return [...set];
  }
  if (BOT_ALIASES[k]) return BOT_ALIASES[k].slice();
  if (k.includes('[') || k.includes('-')) return [key];
  return [key];
}

export function allBotLoginAliases() {
  const set = new Set(['github-actions[bot]']);
  for (const aliases of Object.values(BOT_ALIASES)) {
    for (const login of aliases) set.add(login.toLowerCase());
  }
  for (const login of OPTIONAL_BOT_LOGINS) set.add(login.toLowerCase());
  return set;
}

export function isKnownBotLogin(login) {
  if (!login) return false;
  return allBotLoginAliases().has(String(login).toLowerCase());
}

export function allKnownBotLogins(requiredKeys) {
  const set = allBotLoginAliases();
  for (const slot of requiredKeys || []) {
    for (const login of loginsForKey(slot)) set.add(login.toLowerCase());
  }
  return set;
}

export function loginMatchesRequiredKey(login, key) {
  if (!login) return false;
  const lower = login.toLowerCase();
  // Support OR-group as key
  for (const alt of alternativesForSlot(key)) {
    if (loginsForKey(alt).some((alias) => lower === alias.toLowerCase())) return true;
  }
  return false;
}

/**
 * Return slots that are still unsatisfied (no alternative matched seen logins).
 * @param {string[]} requiredKeys slots (may include "|")
 * @param {string[]} seenLogins
 * @returns {string[]}
 */
export function missingRequiredKeys(requiredKeys, seenLogins) {
  const seen = [...(seenLogins || [])];
  return (requiredKeys || []).filter(
    (slot) => !alternativesForSlot(slot).some((key) => seen.some((login) => loginMatchesRequiredKey(login, key))),
  );
}

/**
 * True when every required slot has at least one matching seen login.
 */
export function requiredBotsSatisfied(requiredKeys, seenLogins) {
  return missingRequiredKeys(requiredKeys, seenLogins).length === 0;
}

export function formatRequiredKeys(keys) {
  return (keys || [])
    .map((slot) => {
      const alts = alternativesForSlot(slot);
      if (alts.length <= 1) {
        const k = alts[0] || slot;
        return `${k} (${loginsForKey(k).join(' | ')})`;
      }
      return alts.map((k) => `${k} (${loginsForKey(k).join(' | ')})`).join(' OR ');
    })
    .join('; ');
}
