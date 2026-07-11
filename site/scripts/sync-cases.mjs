// Copy playable case assets from the pilot's single source of truth
// (pilot/src/main/resources/cases/<id>/) into the web build (site/public/cases/<id>/).
// Mirrors the Android `syncCaseAssets` idea: one source, no hand-maintained copies.
// Run automatically before `dev`/`check`/`deploy` (see package.json pre-hooks).
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = join(here, '..');
const repoRoot = join(siteRoot, '..');
const srcCases = join(repoRoot, 'pilot', 'src', 'main', 'resources', 'cases');
const outCases = join(siteRoot, 'public', 'cases');

// Cases exposed to the web player. truth_file.json ships too (client-side reveal);
// the player only fetches it after a verdict is locked.
const CASES = ['c_001'];
const FILES = ['case.json', 'trial.json', 'pseudonyms.json', 'sources.json', 'truth_file.json'];

rmSync(outCases, { recursive: true, force: true });

for (const id of CASES) {
  const from = join(srcCases, id);
  const to = join(outCases, id);
  if (!existsSync(from)) throw new Error(`sync-cases: source case not found: ${from}`);
  mkdirSync(to, { recursive: true });

  for (const file of FILES) {
    const src = join(from, file);
    if (!existsSync(src)) throw new Error(`sync-cases: missing ${id}/${file}`);
    cpSync(src, join(to, file));
  }

  const exhibits = join(from, 'exhibits');
  if (existsSync(exhibits)) cpSync(exhibits, join(to, 'exhibits'), { recursive: true });

  console.log(`sync-cases: ${id} -> public/cases/${id}`);
}
