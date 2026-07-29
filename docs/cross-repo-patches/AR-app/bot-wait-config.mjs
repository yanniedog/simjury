/**
 * Required-bot aliases for wait-for-bots and pr-bot-feedback-check (AR-app).
 *
 * AR-app is intentionally NOT the same as simjury:
 *   - Peer OR is `sourcery|cursor` (no Codex requirement)
 *   - No hourly `pr-coderabbit-review-recovery` / close-guard stack
 *   - Presence gate is single-shot; agents use arm-and-park when available
 *
 * CodeRabbit remains a hard ALL-of slot. Gemini consumer reviews are sunset (noise).
 * See docs/CROSS_REPO_BOT_MATRIX.md.
 */
export const BOT_ALIASES = {
  gemini: [
    'gemini-code-assist',
    'gemini-code-assist[bot]',
    'google-github-actions-bot[bot]',
    'google-github-actions[bot]',
  ],
  codex: ['chatgpt-codex-connector', 'chatgpt-codex-connector[bot]'],
  sourcery: ['sourcery-ai', 'sourcery-ai[bot]'],
  /** Cursor Automation / Bugbot-style reviews (login is often `cursor` or `cursor[bot]`). */
  cursor: ['cursor', 'cursor[bot]'],
  /** CodeRabbit GitHub App reviews (`coderabbitai[bot]`). */
  coderabbit: ['coderabbitai', 'coderabbitai[bot]'],
  claude: ['claude[bot]', 'claude-code[bot]', 'anthropic-claude[bot]'],
};

/**
 * AR-app default: sourcery|cursor peer OR + mandatory CodeRabbit.
 * Do not copy simjury's `sourcery|codex|cursor,coderabbit` here.
 */
export const DEFAULT_REQUIRED_SPEC = 'sourcery|cursor,coderabbit';
export const DEFAULT_REQUIRED_KEYS = ['sourcery|cursor', 'coderabbit'];

export const OPTIONAL_BOT_LOGINS = [
  'claude[bot]',
  'claude-code[bot]',
  'copilot-pull-request-reviewer[bot]',
  'greptile-apps[bot]',
  'gemini-code-assist[bot]',
  'gemini-code-assist',
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
