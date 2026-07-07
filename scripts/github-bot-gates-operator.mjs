#!/usr/bin/env node
/**
 * Operator helper: GitHub ruleset + bot-review policy for SimJury.
 *
 * Usage:
 *   node scripts/github-bot-gates-operator.mjs
 *   node scripts/github-bot-gates-operator.mjs --verify-pr 123
 *   node scripts/github-bot-gates-operator.mjs --dry-run-protection
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { PR_CI_CHECK_NAME, BOT_GATE_CHECK_NAMES } from './lib/pr-gates-lib.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const RULESET_JSON = join(repoRoot, '.github', 'rulesets', 'main-bot-gates.json');
const REQUIRED_CHECKS = [PR_CI_CHECK_NAME, ...BOT_GATE_CHECK_NAMES];

function parseArgs(argv) {
  const out = { verifyPr: null, dryRunProtection: false, help: false };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--dry-run-protection') out.dryRunProtection = true;
    else if (a === '--verify-pr' && argv[i + 1]) out.verifyPr = argv[++i];
  }
  return out;
}

function printPolicy() {
  console.log(`
=== Bot review policy (repo code — NOT in GitHub ruleset) ===

Required on merge (human work PRs):
  - validate                docs, projectmem, pilot tests (+ Android when present)
  - bot-presence-gate       waits for gemini, sourcery on human PRs
  - bot-feedback-gate       review thread resolution on human PRs

Optional (not in DEFAULT_REQUIRED_KEYS):
  - claude[bot]           only when anthropics/claude-code-action workflow is installed

Skipped automatically (scripts/lib/pr-gate-exempt.mjs):
  - PR author is a GitHub bot (login ends with [bot])
  - Title is conventional chore (chore: or chore(scope):)
`);
}

function printRulesetImport() {
  console.log(`
=== GitHub ruleset (one-time UI import) ===

File to import:
  ${RULESET_JSON}

Steps:
  1. GitHub → Settings → Rules → Rulesets → New ruleset → Import a ruleset
  2. Select the JSON file above
  3. Confirm required checks: ${REQUIRED_CHECKS.join(', ')}
  4. Save → Enforcement: Active
  5. Or run: npm run branch-protection:apply (legacy API; no Actions bypass)

Full doc: docs/GITHUB_RULESET_IMPORT.md
`);
}

function validateRulesetJson() {
  const raw = readFileSync(RULESET_JSON, 'utf8');
  const ruleset = JSON.parse(raw);
  const checks =
    ruleset.rules
      ?.find((r) => r.type === 'required_status_checks')
      ?.parameters?.required_status_checks?.map((c) => c.context) || [];
  const missing = REQUIRED_CHECKS.filter((c) => !checks.includes(c));
  if (missing.length) {
    throw new Error(`ruleset JSON missing checks: ${missing.join(', ')}`);
  }
  console.log('OK ruleset JSON:', RULESET_JSON);
  console.log('   required checks:', checks.join(', '));
}

function runLocalVerifiers() {
  const scripts = ['scripts/verify-pr-gate-exempt-policy.mjs', 'scripts/verify-pr-gate-logic.mjs'];
  for (const rel of scripts) {
    const r = spawnSync(process.execPath, [join(repoRoot, rel)], {
      encoding: 'utf8',
      cwd: repoRoot,
      timeout: 60_000,
    });
    if (r.status !== 0) {
      console.error((r.stderr || r.stdout || '').trim());
      throw new Error(`failed: ${rel}`);
    }
    console.log((r.stdout || '').trim());
  }
}

function verifyPrExemption(prNumber) {
  const r = spawnSync(process.execPath, ['scripts/pr-gate-exempt-reason.mjs'], {
    encoding: 'utf8',
    cwd: repoRoot,
    env: { ...process.env, PR: String(prNumber) },
    timeout: 60_000,
  });
  if (r.status !== 0 || r.error) {
    throw new Error(
      `Failed to verify PR exemption: ${(r.stderr || r.error?.message || '').trim() || `exit ${r.status}`}`,
    );
  }
  const reason = (r.stdout || '').trim();
  if (reason) {
    console.log(`PR #${prNumber}: gate-exempt (${reason}) — bot review NOT required for merge`);
    return;
  }
  console.log(`PR #${prNumber}: NOT gate-exempt — gemini + codex + sourcery + thread closure required`);
}

function dryRunBranchProtection() {
  const r = spawnSync(process.execPath, ['scripts/apply-branch-protection.mjs', '--dry-run'], {
    encoding: 'utf8',
    cwd: repoRoot,
    timeout: 120_000,
  });
  process.stdout.write(r.stdout || '');
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log('Usage: node scripts/github-bot-gates-operator.mjs [--verify-pr N] [--dry-run-protection]');
    process.exit(0);
  }

  printPolicy();
  printRulesetImport();

  try {
    validateRulesetJson();
  } catch (e) {
    console.error(`FAIL ruleset validation: ${e.message}`);
    process.exit(1);
  }

  console.log('\n=== Local policy self-tests ===');
  try {
    runLocalVerifiers();
  } catch (e) {
    console.error(`FAIL: ${e.message}`);
    process.exit(1);
  }

  if (args.verifyPr) {
    console.log('\n=== PR exemption check ===');
    try {
      verifyPrExemption(args.verifyPr);
    } catch (e) {
      console.error(`FAIL PR check: ${e.message}`);
      process.exit(1);
    }
  }

  if (args.dryRunProtection) {
    console.log('\n=== Branch protection dry-run ===');
    dryRunBranchProtection();
  }

  console.log(`
=== After protection is active — verify ===

  npm run pr:gate-logic:verify
  npm run github:bot-gates:operator
  npm run pr:gates:check -- --pr <n>
  npm run repo-merge-settings:apply
`);
}

main();
