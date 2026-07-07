/**
 * Required-bot aliases for wait-for-bots and pr-bot-feedback-check.
 * Keys are short names (gemini, codex, sourcery); values are GitHub logins to match.
 *
 * Claude Code (claude[bot]) is optional — see WORKFLOW.md. It posts via
 * anthropics/claude-code-action when configured; there is no always-on marketplace
 * app like Gemini Code Assist, so it is not in DEFAULT_REQUIRED_KEYS.
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
  claude: ['claude[bot]', 'claude-code[bot]', 'anthropic-claude[bot]'],
};

/** Required on human work PRs (branch protection + wait-for-bots). */
export const DEFAULT_REQUIRED_KEYS = ['gemini', 'codex', 'sourcery'];

export const OPTIONAL_BOT_LOGINS = [
  'claude[bot]',
  'claude-code[bot]',
  'copilot-pull-request-reviewer[bot]',
  'coderabbitai[bot]',
  'greptile-apps[bot]',
];

export function parseRequiredKeys(raw) {
  if (!raw || !String(raw).trim()) return [...DEFAULT_REQUIRED_KEYS];
  return String(raw)
    .split(',')
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
  const k = key.toLowerCase();
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
  for (const key of requiredKeys) {
    for (const login of loginsForKey(key)) set.add(login.toLowerCase());
  }
  return set;
}

export function loginMatchesRequiredKey(login, key) {
  if (!login) return false;
  const lower = login.toLowerCase();
  return loginsForKey(key).some((alias) => lower === alias.toLowerCase());
}

export function missingRequiredKeys(requiredKeys, seenLogins) {
  const seen = [...(seenLogins || [])];
  return requiredKeys.filter((key) => !seen.some((login) => loginMatchesRequiredKey(login, key)));
}

export function formatRequiredKeys(keys) {
  return keys.map((k) => `${k} (${loginsForKey(k).join(' | ')})`).join(', ');
}
