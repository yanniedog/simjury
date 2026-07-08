#!/usr/bin/env node
/**
 * Self-test for pilot auto-release commit push helper.
 * Run: npm run pilot:auto-release-commit:verify
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const testFile = join(repoRoot, 'scripts/pilot-auto-release-commit.test.mjs');

const r = spawnSync(process.execPath, ['--test', testFile], {
  encoding: 'utf8',
  cwd: repoRoot,
});

if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);

if (r.status !== 0) {
  console.error('FAIL pilot:auto-release-commit:verify');
  process.exit(r.status || 1);
}
console.log('PASS pilot:auto-release-commit:verify');
