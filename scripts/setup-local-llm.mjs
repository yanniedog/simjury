#!/usr/bin/env node
/**
 * Bootstrap local unlimited PR reviews (Ollama + Continue + qwen2.5-coder).
 *
 * Usage:
 *   npm run local-llm:setup
 *   npm run local-llm:setup -- --verify
 *   npm run local-llm:setup -- --pull
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_OLLAMA_HOST,
  DEFAULT_REVIEW_MODEL,
  ensureOllamaReady,
  findOllamaBin,
  log,
  modelNamesFromTags,
  ollamaFetch,
} from './lib/local-ollama.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = join(__dirname, 'continue-config.yaml');
const CONTINUE_DIR = join(homedir(), '.continue');
const CONTINUE_CONFIG = join(CONTINUE_DIR, 'config.yaml');
const REVIEW_MODEL = DEFAULT_REVIEW_MODEL;
const AUTOCOMPLETE_MODEL = process.env.LOCAL_AUTOCOMPLETE_MODEL || 'qwen2.5-coder:1.5b';

function parseArgs(argv) {
  const out = { verify: false, pull: false, help: false, forceConfig: false };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--verify') out.verify = true;
    else if (a === '--pull') out.pull = true;
    else if (a === '--force-config') out.forceConfig = true;
    else {
      console.error(`setup-local-llm: unknown argument: ${a}`);
      process.exit(1);
    }
  }
  return out;
}

function abort(msg) {
  console.error(`setup-local-llm: ERROR: ${msg}`);
  process.exit(1);
}

function run(bin, args, opts = {}) {
  log(`$ ${bin} ${args.join(' ')}`);
  const r = spawnSync(bin, args, { encoding: 'utf8', stdio: 'inherit', ...opts });
  if (r.status !== 0) abort(`${bin} ${args.join(' ')} failed (exit ${r.status ?? 1})`);
}

function installContinueConfig(force) {
  if (!existsSync(TEMPLATE)) abort(`missing template: ${TEMPLATE}`);
  mkdirSync(CONTINUE_DIR, { recursive: true });
  if (existsSync(CONTINUE_CONFIG) && !force) {
    const current = readFileSync(CONTINUE_CONFIG, 'utf8');
    const desired = readFileSync(TEMPLATE, 'utf8');
    if (current === desired) {
      log(`Continue config already up to date: ${CONTINUE_CONFIG}`);
      return;
    }
    const backup = join(CONTINUE_DIR, `config.yaml.bak.${Date.now()}`);
    writeFileSync(backup, current, 'utf8');
    log(`backed up existing Continue config to ${backup}`);
  }
  copyFileSync(TEMPLATE, CONTINUE_CONFIG);
  log(`wrote Continue config: ${CONTINUE_CONFIG}`);
}

async function pullModel(ollamaBin, model) {
  const tags = await ensureOllamaReady();
  const names = modelNamesFromTags(tags);
  if (names.includes(model)) {
    log(`model already present: ${model}`);
    return;
  }
  run(ollamaBin, ['pull', model]);
}

async function verify() {
  log(`checking Ollama at ${DEFAULT_OLLAMA_HOST}`);
  const tags = await ensureOllamaReady();
  const names = modelNamesFromTags(tags);
  for (const model of [REVIEW_MODEL, AUTOCOMPLETE_MODEL]) {
    if (!names.includes(model)) abort(`missing model ${model}. Run: npm run local-llm:setup -- --pull`);
    log(`ok model: ${model}`);
  }
  if (!existsSync(CONTINUE_CONFIG)) abort(`missing Continue config at ${CONTINUE_CONFIG}`);
  log(`ok Continue config: ${CONTINUE_CONFIG}`);

  log('running smoke generation...');
  const r = await ollamaFetch('/api/generate', {
    method: 'POST',
    timeoutMs: 180_000,
    body: {
      model: REVIEW_MODEL,
      prompt: 'Reply with exactly: READY',
      stream: false,
      options: { temperature: 0, num_predict: 8 },
    },
  });
  if (!r.ok) abort(`smoke generate failed HTTP ${r.status}: ${(r.text || '').slice(0, 300)}`);
  const text = String(r.json?.response || '').trim();
  log(`smoke response: ${text || '(empty)'}`);
  if (!/READY/i.test(text)) {
    abort(`smoke test did not return READY (got: ${text.slice(0, 120)})`);
  }
  log('verify passed');
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Usage: node scripts/setup-local-llm.mjs [--pull] [--verify] [--force-config]`);
    process.exit(0);
  }

  const ollamaBin = findOllamaBin();
  if (!ollamaBin) {
    abort(
      'ollama not found on PATH. Install with: winget install -e --id Ollama.Ollama then re-open the terminal.',
    );
  }
  log(`ollama binary: ${ollamaBin}`);

  try {
    await ensureOllamaReady();
  } catch (e) {
    log('Ollama API not reachable; attempting to start `ollama serve` in background');
    spawnSync(ollamaBin, ['serve'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    // give the daemon a moment
    await new Promise((r) => setTimeout(r, 2500));
    await ensureOllamaReady().catch((err) => abort(err.message));
  }

  installContinueConfig(args.forceConfig);

  if (args.pull || !args.verify) {
    await pullModel(ollamaBin, REVIEW_MODEL);
    await pullModel(ollamaBin, AUTOCOMPLETE_MODEL);
  }

  if (args.verify || !args.pull) {
    // default path does pull (above) + verify
    await verify();
  }

  console.log(`
Local LLM review stack is ready.

Editor (Continue):
  - Extension: Continue.continue (Cursor + VS Code)
  - Config: ${CONTINUE_CONFIG}
  - Chat/edit model: ${REVIEW_MODEL}
  - Autocomplete: ${AUTOCOMPLETE_MODEL}
  - Slash prompt: /PR review

CLI (any repo with gh auth):
  npm run pr:local-review -- --pr <n>
  npm run pr:local-review -- --git
  npm run pr:local-review -- --pr <n> --post

Verify later:
  npm run local-llm:setup -- --verify
`);
}

main().catch((e) => abort(e.message || String(e)));
