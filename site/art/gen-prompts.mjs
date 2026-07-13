// Emit site/art/prompts/ — 00-primer.md + one numbered, self-contained prompt file
// per image, generated from site/art/image-manifest.json (the source of truth).
// Designed for feeding to ChatGPT one message at a time in a single thread.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const m = JSON.parse(readFileSync('site/art/image-manifest.json', 'utf8'));
const outDir = 'site/art/prompts';

const requireString = (value, label) => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
};

const validateManifest = (manifest) => {
  if (!manifest || typeof manifest !== 'object') throw new Error('Manifest must be an object');
  if (!manifest.style || typeof manifest.style !== 'object') throw new Error('Manifest is missing style');
  requireString(manifest.style.base_prompt, 'style.base_prompt');
  requireString(manifest.style.avoid, 'style.avoid');
  if (!manifest.pov || typeof manifest.pov !== 'object') throw new Error('Manifest is missing pov');
  requireString(manifest.pov.rule, 'pov.rule');
  requireString(manifest.pov.never, 'pov.never');
  if (!manifest.cast || typeof manifest.cast !== 'object' || Array.isArray(manifest.cast)) {
    throw new Error('Manifest is missing cast definitions');
  }
  Object.entries(manifest.cast).forEach(([id, description]) => {
    requireString(description, `cast.${id}`);
  });
  if (!Array.isArray(manifest.images) || manifest.images.length === 0) {
    throw new Error('Manifest must include a non-empty images array');
  }

  const ids = new Set();
  const files = new Set();
  manifest.images.forEach((img, index) => {
    const label = img && img.id ? `image ${img.id}` : `images[${index}]`;
    requireString(img?.id, `${label}.id`);
    requireString(img?.file, `${label}.file`);
    requireString(img?.priority, `${label}.priority`);
    requireString(img?.composition, `${label}.composition`);
    requireString(img?.quiet_zone, `${label}.quiet_zone`);
    if (ids.has(img.id)) throw new Error(`Duplicate image id: ${img.id}`);
    if (files.has(img.file)) throw new Error(`Duplicate image file: ${img.file}`);
    ids.add(img.id);
    files.add(img.file);

    if (!img.size || typeof img.size.w !== 'number' || typeof img.size.h !== 'number') {
      throw new Error(`${label}.size must include numeric w and h`);
    }
    if (!Number.isFinite(img.size.w) || !Number.isFinite(img.size.h) || img.size.w <= 0 || img.size.h <= 0) {
      throw new Error(`${label}.size values must be positive finite numbers`);
    }
    if (!Array.isArray(img.cast)) throw new Error(`${label}.cast must be an array`);
    img.cast.forEach((castId) => {
      if (!Object.hasOwn(manifest.cast, castId)) {
        throw new Error(`${label}.cast references unknown character ${castId}`);
      }
    });
  });
};

validateManifest(m);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const total = m.images.length;
const pad = (n) => String(n).padStart(2, '0');

const ratioLabel = (img) => {
  if (img.alpha) return 'the widest landscape you can produce, with a TRANSPARENT background (PNG with alpha) — I will crop it to a strip';
  const r = img.size.w / img.size.h;
  if (r > 3) return 'the widest landscape you can produce — I will crop to a strip';
  if (r >= 1.6) return 'wide landscape (16:9 feel; 3:2 is fine — keep key content clear of the top and bottom edges)';
  return 'landscape (4:3 feel; 3:2 is fine)';
};

const stem = (img) => img.file.replace(/\.(webp|png)$/, '');

const targetSizeLine = (img) => `${img.size.w}x${img.size.h}px target; ${ratioLabel(img)}`;

const promptIntro = (img, n) => {
  const sharedRules = 'No text anywhere, no speech bubbles, no gavel; keep the cast consistent.';
  if (img.alpha) {
    return `Image ${n} of ${total}. Same house rules as the primer, except this is a transparent overlay asset rather than a courtroom scene. ${sharedRules}`;
  }
  if (img.ships === false) {
    return `Image ${n} of ${total}. Same house style and character rules as the primer, except this is a reference model sheet rather than a juror-POV scene. ${sharedRules}`;
  }
  return `Image ${n} of ${total}. Same house rules as the primer: a buff-paper court sketch of a
real moment exactly as Juror #1 sees it — strict first person, seated eye-level, no
narrated summary. ${sharedRules}`;
};

// Render the "quiet zone" instruction so it reads as a clean sentence for the
// special cases (no bubble / whole-frame backdrop / transparent centre) as well
// as the normal corner regions.
const quietZoneLine = (img) => {
  const qz = (img.quiet_zone || '').trim();
  if (!qz || qz === 'none') {
    return `QUIET ZONE: none needed — this is a reference sheet, no speech bubble sits on it.`;
  }
  if (/^everywhere/i.test(qz)) {
    const tail = qz.replace(/^everywhere\s*[—-]\s*/i, '');
    return `QUIET ZONE: the whole frame — ${tail}. Keep every region calm; a speech bubble may be overlaid anywhere.`;
  }
  if (/^entire middle/i.test(qz)) {
    return `QUIET ZONE: the entire middle must stay clear — website content and speech bubbles show through it.`;
  }
  return `QUIET ZONE: keep the ${qz} calm and uncluttered — my website overlays a speech bubble there.`;
};

/* ---------------------------------- primer ---------------------------------- */
const primer = `# 00 — PRIMER (paste this into ChatGPT first, before any image prompt)

I need you to draw a series of ${total} images for my website, one at a time. I will send
you one prompt per message. Read these rules now and apply them to EVERY image in this
thread without me repeating them.

## What the images are

My website puts the player in the seat of Juror #1 at an 1890s English criminal trial.
Every image is a courtroom sketch, drawn from the juror's own eyes.

## Style — identical for every image

${m.style.base_prompt}

## Point of view — identical for every image

${m.pov.rule} ${m.pov.never}

## Absolute rules (every image, no exceptions)

1. NO text anywhere: no letters, numerals, signatures, watermarks, or legible writing.
   Papers, charts and documents in shot show only illegible scribble strokes.
2. NO speech bubbles drawn in the image — my website overlays live speech bubbles on
   top. Each prompt names a "quiet zone"; keep that region calm and uncluttered.
3. NO real person's likeness. Court-sketch faces: a few confident strokes, types not
   portraits.
4. Era-correct 1890s English criminal court: NO gavel (English courts have none), no
   microphones, no modern objects or clothing.
5. Do not reinterpret or restyle. If a prompt conflicts with your instinct, the prompt
   wins.

## Avoid in every image (treat as a permanent negative prompt)

${m.style.avoid}

## The recurring cast — keep these characters visually consistent all thread long

${Object.entries(m.cast).map(([k, v]) => `- ${k} — ${v}`).join('\n')}

The very first image I ask for is a cast model sheet of these characters. After you
draw it, treat it as the reference for every later image: same faces, same clothes.

## How to answer each prompt

- Generate exactly ONE image per prompt, at the orientation the prompt asks for.
- With each image, print on its own line: SAVE AS: <filename from the prompt>
  (so I can save the file under the right name). Never draw the filename in the image.
- If you can't output .webp, any format is fine — I rename the file; the name matters,
  not the extension.
- Then wait for my next prompt.

Reply "ready" if you've understood, and I'll send image 1 of ${total}.
`;
writeFileSync(join(outDir, '00-primer.md'), primer);

/* ------------------------------- image prompts ------------------------------- */
const files = [];
m.images.forEach((img, i) => {
  const n = i + 1;
  const fname = `${pad(n)}-${stem(img)}.md`;
  files.push({ fname, save: img.file, priority: img.priority });

  const castInstruction = img.ships === false
    ? 'match these descriptions'
    : 'match the cast sheet and your earlier images';
  const castBlock = img.cast.length
    ? `\nCHARACTERS in this scene (${castInstruction}):\n${img.cast.map((c) => `- ${c} — ${m.cast[c]}`).join('\n')}\n`
    : '';

  const body = `# ${pad(n)} — image ${n} of ${total} — save as: ${img.file}

Paste everything below the line into ChatGPT as ONE message.

---

${promptIntro(img, n)}

FILENAME: after generating, print on its own line: SAVE AS: ${img.file}
(Never draw the filename or any text in the image.)

FORMAT: ${targetSizeLine(img)}.

SCENE TO DRAW:
${img.composition}
${castBlock}
${quietZoneLine(img)}${img.ships === false ? `\n\nNOTE: this one is a reference sheet for our thread, not a website image — accuracy to the cast descriptions matters more than composition.` : ''}
`;
  writeFileSync(join(outDir, fname), body);
});

/* ---------------------------------- README ----------------------------------- */
const readme = `# Feeding these prompts to ChatGPT

1. Open ONE new ChatGPT thread (image generation enabled).
2. Paste \`00-primer.md\` in full. Wait for it to acknowledge.
3. Paste the files below one at a time, in order — one message per file, each below
   its \`---\` line. Save each returned image under the SAVE AS filename (extension can
   differ; the name stem is what matters).
4. Drop finished files into \`site/public/art/\` — the site references those exact names
   (see \`../image-manifest.json\`, the source of truth these prompts are generated from).

Do image 01 (cast sheet) first and iterate on it until the style and characters look
right — every later image inherits from it. P0 = needed first, P2 = polish.

These files are generated: edit \`../image-manifest.json\`, then run
\`node site/art/gen-prompts.mjs\` from the repo root — do not edit prompts by hand.

| # | Prompt file | Save as | Priority |
| --- | --- | --- | --- |
${files.map((f, i) => `| ${i + 1} | \`${f.fname}\` | \`${f.save}\` | ${f.priority} |`).join('\n')}
`;
writeFileSync(join(outDir, 'README.md'), readme);

console.log(`wrote ${files.length} prompts + primer + README to ${outDir}`);
