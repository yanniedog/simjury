// Assemble the web player's case assets into site/public/cases/<id>/.
//   1. Copy trial content from the pilot's single source of truth
//      (pilot/src/main/resources/cases/<id>/) — mirrors Android `syncCaseAssets`.
//   2. Overlay web-only content from site/content/cases/<id>/ (e.g. jury_room.json).
//   3. Scan web-only pre-reveal text for F-4 banned tokens (the Kotlin validator does
//      not cover web-only files, so this is the web's spoiler safety net).
// Runs automatically before dev/check/deploy (see package.json pre-hooks).
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = join(here, '..');
const repoRoot = join(siteRoot, '..');
const srcCases = join(repoRoot, 'pilot', 'src', 'main', 'resources', 'cases');
const webContent = join(siteRoot, 'content', 'cases');
const outCases = join(siteRoot, 'public', 'cases');

// Cases exposed to the web player. truth_file.json ships too (client-side reveal);
// the player only fetches it after a verdict is locked.
const CASES = ['c_001'];
const FILES = ['case.json', 'trial.json', 'pseudonyms.json', 'sources.json', 'truth_file.json'];

// v3 §7 F-4 static list + reveal-only names verified absent from play-reachable trial text.
// (Beck/Smith/Gurrin/Spurrell/Thomas already static; Gardiner/Willoughby appear IN play, so
//  they are intentionally NOT banned.)
const BANNED = [
  'beck', 'smith', 'thomas', 'gurrin', 'spurrell', 'fulton', 'avory', 'gill',
  'old bailey', '1896', '1877', '1904',
  'nutt', 'froest', 'sinclair', 'townsend', 'wyatt',
];
const BANNED_RE = BANNED.map((t) => ({ t, re: new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i') }));

function scanText(label, text, hits) {
  for (const { t, re } of BANNED_RE) if (re.test(text)) hits.push(`${label}: banned token "${t}"`);
}

// Collect every string in the web-only jury_room.json (all of it is pre-reveal, play-reachable).
function scanJuryRoom(id, obj) {
  const hits = [];
  scanText(`${id}/jury_room.intro`, String(obj.intro || ''), hits);
  (obj.jurors || []).forEach((j) => {
    scanText(`${id}/jury_room ${j.id}.label`, String(j.label || ''), hits);
    scanText(`${id}/jury_room ${j.id}.persona`, String(j.persona || ''), hits);
  });
  (obj.script || []).forEach((b, i) => {
    scanText(`${id}/jury_room script[${i}].text`, String(b.text || ''), hits);
    scanText(`${id}/jury_room script[${i}].note`, String(b.note || ''), hits);
  });
  return hits;
}

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

  // Overlay web-only content, scanning any jury_room.json for spoilers first.
  const overlay = join(webContent, id);
  if (existsSync(overlay)) {
    for (const file of readdirSync(overlay)) {
      const src = join(overlay, file);
      if (file === 'jury_room.json') {
        const hits = scanJuryRoom(id, JSON.parse(readFileSync(src, 'utf8')));
        if (hits.length) throw new Error(`sync-cases: F-4 spoiler scan failed:\n  - ${hits.join('\n  - ')}`);
      }
      cpSync(src, join(to, file));
    }
    console.log(`sync-cases: ${id} + web overlay -> public/cases/${id} (spoiler scan clean)`);
  } else {
    console.log(`sync-cases: ${id} -> public/cases/${id}`);
  }
}
