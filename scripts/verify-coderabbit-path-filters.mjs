#!/usr/bin/env node
/**
 * Verify CodeRabbit's path filters cannot silently disable review.
 *
 * CodeRabbit treats `path_filters` as a denylist only while every pattern is a
 * negation. Add one positive pattern and it flips to allowlist mode: from then
 * on anything not explicitly named is "included by none" and is not reviewed.
 *
 * That happened here. A single `site/app/public/media/**` entry — added so that
 * media-only PRs stayed reviewable — silently made *only* media reviewable.
 * CodeRabbit answered every PR with "Review skipped ... due to path filters",
 * and because it is the mandatory presence slot, `bot-presence-gate` could
 * never go green. The gates looked broken; the config was.
 *
 * Run: npm run pr:coderabbit-filters:verify
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = readFileSync(join(repoRoot, '.coderabbit.yaml'), 'utf8');

const failures = [];

/**
 * Read the `path_filters:` list without a YAML dependency. Returns the quoted
 * or bare scalar of each `- ` item until the block's indentation ends.
 */
export function readPathFilters(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /^\s*path_filters:\s*$/.test(line));
  if (start === -1) return null;
  const indent = lines[start].match(/^\s*/)[0].length;
  const filters = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.trim()) continue;
    const lead = line.match(/^\s*/)[0].length;
    if (lead <= indent) break;
    const item = line.trim();
    if (item.startsWith('#')) continue;
    if (!item.startsWith('- ')) break;
    filters.push(item.slice(2).trim().replace(/^["']|["']$/g, ''));
  }
  return filters;
}

const filters = readPathFilters(raw);

if (!filters) {
  failures.push('reviews.path_filters block not found in .coderabbit.yaml');
} else {
  if (filters.length === 0) failures.push('path_filters is empty');

  const positive = filters.filter((pattern) => !pattern.startsWith('!'));
  if (positive.length) {
    failures.push(
      `path_filters must be exclusions only — ${positive.join(', ')} would switch `
      + 'CodeRabbit to allowlist mode and skip review of everything else',
    );
  }

  // The product surface must stay reviewable: CodeRabbit is the mandatory
  // presence slot, so anything excluded here can never clear merge protection.
  const mustBeReviewable = [
    'site/app/src/App.tsx',
    'site/app/src/engine/deliberation.ts',
    'site/src/worker.js',
    '.github/workflows/ci.yml',
    'scripts/pr-arm-and-park.mjs',
    'site/app/public/media/cover.webp',
  ];
  for (const path of mustBeReviewable) {
    if (!isReviewable(path, filters)) {
      failures.push(`${path} would not be reviewed by CodeRabbit`);
    }
  }

  // Noise should still be excluded, or reviews drown in generated files.
  for (const path of ['site/app/node_modules/react/index.js', 'package-lock.json', 'site/art/poster.psd']) {
    if (isReviewable(path, filters)) failures.push(`${path} should be excluded`);
  }
}

/** Minimal glob match for the subset of syntax used in path_filters. */
export function globMatches(pattern, path) {
  const expanded = pattern.replace(/\{([^}]*)\}/g, (_, group) => `(${group.split(',').join('|')})`);
  const source = expanded
    .split(/(\*\*\/|\*\*|\*|\?|\([^)]*\))/)
    .map((part) => {
      if (part === '**/') return '(?:.*/)?';
      if (part === '**') return '.*';
      if (part === '*') return '[^/]*';
      if (part === '?') return '[^/]';
      if (part.startsWith('(') && part.endsWith(')')) return part;
      return part.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  return new RegExp(`^${source}$`).test(path);
}

/** With an exclusion-only list, a path is reviewed unless something excludes it. */
export function isReviewable(path, filters) {
  const positive = filters.filter((pattern) => !pattern.startsWith('!'));
  const excluded = filters
    .filter((pattern) => pattern.startsWith('!'))
    .some((pattern) => globMatches(pattern.slice(1), path));
  if (excluded) return false;
  // Allowlist mode: an unnamed path is "included by none".
  if (positive.length) return positive.some((pattern) => globMatches(pattern, path));
  return true;
}

if (failures.length) {
  console.error('FAIL verify-coderabbit-path-filters:');
  for (const failure of failures) console.error('  -', failure);
  process.exit(1);
}
console.log(
  `PASS verify-coderabbit-path-filters: ${filters.length} exclusion-only filters; `
  + 'product surface stays reviewable',
);
