import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function gitRepoRoot() {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  return (r.stdout || '').trim() || process.cwd();
}

/**
 * Directory for per-PR bot-wait anchor JSON.
 * Override: SIMJURY_BOT_WAIT_STATE_DIR (or JCS2_/AR_ for template compatibility).
 * Default: <repo>/.simjury-bot-wait
 */
export function botWaitStateDir(repoRoot) {
  const env =
    process.env.SIMJURY_BOT_WAIT_STATE_DIR?.trim() ||
    process.env.JCS2_BOT_WAIT_STATE_DIR?.trim() ||
    process.env.AR_BOT_WAIT_STATE_DIR?.trim();
  const root = repoRoot || gitRepoRoot();
  if (env) {
    return path.isAbsolute(env) ? path.resolve(env) : path.resolve(root, env);
  }
  return path.join(root, '.simjury-bot-wait');
}

export function botWaitStatePath(prNumber, repoRoot) {
  return path.join(botWaitStateDir(repoRoot), `${prNumber}.json`);
}

export function legacyBotWaitStatePath(prNumber, repoRoot) {
  const root = repoRoot || gitRepoRoot();
  return path.join(root, '.git', 'simjury-bot-wait', `${prNumber}.json`);
}

export function readBotWaitStateFile(prNumber, repoRoot) {
  const candidates = [botWaitStatePath(prNumber, repoRoot)];
  if (
    !process.env.SIMJURY_BOT_WAIT_STATE_DIR?.trim() &&
    !process.env.JCS2_BOT_WAIT_STATE_DIR?.trim() &&
    !process.env.AR_BOT_WAIT_STATE_DIR?.trim()
  ) {
    candidates.push(legacyBotWaitStatePath(prNumber, repoRoot));
  }
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      continue;
    }
  }
  return null;
}

export function writeBotWaitStateFile(prNumber, state, repoRoot) {
  const p = botWaitStatePath(prNumber, repoRoot);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}
