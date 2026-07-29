#!/usr/bin/env node
/**
 * Local unlimited PR code review via Ollama (qwen2.5-coder:7b by default).
 *
 * Usage:
 *   npm run pr:local-review -- --pr 42
 *   npm run pr:local-review -- --pr 42 --repo owner/name
 *   npm run pr:local-review -- --git   # review working-tree / staged diff
 *   npm run pr:local-review -- --file path/to.diff
 *   gh pr diff 42 | npm run pr:local-review -- --stdin
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ghJson, hasGh, runGh } from './lib/gh-pr-review-threads.mjs';
import {
  DEFAULT_REVIEW_MODEL,
  REVIEW_SYSTEM_PROMPT,
  chatReview,
  ensureOllamaReady,
  log,
} from './lib/local-ollama.mjs';

const MAX_DIFF_CHARS = Number(process.env.LOCAL_REVIEW_MAX_DIFF_CHARS || 120_000);

function parseArgs(argv) {
  const out = {
    pr: null,
    repo: null,
    git: false,
    stdin: false,
    file: null,
    model: DEFAULT_REVIEW_MODEL,
    out: null,
    post: false,
    dryRun: false,
    help: false,
    error: null,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    const need = (flag) => {
      const v = argv[i + 1];
      if (!v || v.startsWith('--')) {
        out.error = `${flag} requires a value`;
        return null;
      }
      i += 1;
      return v;
    };
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--git') out.git = true;
    else if (a === '--stdin') out.stdin = true;
    else if (a === '--post') out.post = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--pr') out.pr = need('--pr');
    else if (a === '--repo') out.repo = need('--repo');
    else if (a === '--file') out.file = need('--file');
    else if (a === '--model') out.model = need('--model');
    else if (a === '--out') out.out = need('--out');
    else out.error = `unknown argument: ${a}`;
  }
  return out;
}

function usage() {
  return `Usage:
  node scripts/local-pr-review.mjs --pr <n> [--repo owner/name] [--model qwen2.5-coder:7b]
  node scripts/local-pr-review.mjs --git [--model ...]
  node scripts/local-pr-review.mjs --file path.diff
  gh pr diff <n> | node scripts/local-pr-review.mjs --stdin

Options:
  --out <path>   Write review markdown to a file
  --post         Post review as a PR comment (requires --pr)
  --dry-run      Print actions without calling the model / posting
  --help         Show help`;
}

function abort(msg, code = 1) {
  console.error(`local-pr-review: ERROR: ${msg}`);
  process.exit(code);
}

function runGit(args) {
  const r = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  if (r.error) abort(`git failed: ${r.error.message}`);
  if (r.status !== 0) abort(`git ${args.join(' ')} failed: ${(r.stderr || '').trim()}`);
  return r.stdout || '';
}

function truncateDiff(diff) {
  if (diff.length <= MAX_DIFF_CHARS) return { diff, truncated: false };
  log(`diff is ${diff.length} chars; truncating to ${MAX_DIFF_CHARS} for model context`);
  return {
    diff: `${diff.slice(0, MAX_DIFF_CHARS)}\n\n[TRUNCATED: original diff ${diff.length} chars]`,
    truncated: true,
  };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function resolveRepo(repoFlag) {
  if (repoFlag) {
    const [owner, name] = repoFlag.split('/');
    if (!owner || !name) abort('--repo must be owner/name');
    return { owner, name, slug: `${owner}/${name}` };
  }
  if (!hasGh()) abort('gh CLI is required unless --git/--file/--stdin is used with no --pr');
  const json = ghJson(['repo', 'view', '--json', 'nameWithOwner']);
  const slug = json.nameWithOwner;
  const [owner, name] = (slug || '').split('/');
  if (!owner || !name) abort('could not resolve repository via gh');
  return { owner, name, slug };
}

function fetchPrMeta(pr, repo) {
  const args = ['pr', 'view', String(pr), '--json', 'number,title,body,baseRefName,headRefName,author,url,files'];
  if (repo?.slug) args.push('--repo', repo.slug);
  return ghJson(args);
}

function fetchPrDiff(pr, repo) {
  const args = ['pr', 'diff', String(pr)];
  if (repo?.slug) args.push('--repo', repo.slug);
  const r = runGh(args, { timeout: 180_000 });
  if (!r.ok) abort(`gh pr diff failed: ${r.stderr || r.stdout || `exit ${r.exitCode}`}`);
  return r.stdout;
}

function fetchGitDiff() {
  const staged = runGit(['diff', '--cached']);
  const unstaged = runGit(['diff']);
  const parts = [];
  if (staged.trim()) {
    parts.push('### Staged\n');
    parts.push(staged);
  }
  if (unstaged.trim()) {
    parts.push('\n### Unstaged\n');
    parts.push(unstaged);
  }
  if (!parts.length) {
    // last commit as fallback when working tree clean
    log('working tree clean; reviewing HEAD~1..HEAD');
    return runGit(['diff', 'HEAD~1..HEAD']);
  }
  return parts.join('');
}

function buildUserPrompt({ title, pr, repoSlug, base, head, author, url, diff, truncated }) {
  const header = [
    pr ? `PR: #${pr}${title ? ` — ${title}` : ''}` : 'Local git diff review',
    repoSlug ? `Repo: ${repoSlug}` : null,
    base && head ? `Branch: ${head} -> ${base}` : null,
    author ? `Author: ${author}` : null,
    url ? `URL: ${url}` : null,
    truncated ? 'NOTE: Diff was truncated for context limits.' : null,
  ]
    .filter(Boolean)
    .join('\n');

  return `${header}

Review the following unified diff. Ignore generated lockfile noise unless it indicates a real dependency risk.

\`\`\`diff
${diff}
\`\`\`
`;
}

function postPrComment(pr, repo, body, dryRun) {
  if (dryRun) {
    log(`[dry-run] would post comment on PR #${pr}`);
    return;
  }
  const args = ['pr', 'comment', String(pr), '--body', body];
  if (repo?.slug) args.push('--repo', repo.slug);
  const r = runGh(args);
  if (!r.ok) abort(`failed to post comment: ${r.stderr || r.stdout}`);
  log(`posted review comment on PR #${pr}`);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.error) abort(args.error);
  if (args.help) {
    console.log(usage());
    process.exit(0);
  }

  const modes = [Boolean(args.pr), args.git, args.stdin, Boolean(args.file)].filter(Boolean).length;
  if (modes !== 1) abort('specify exactly one of --pr, --git, --stdin, or --file');
  if (args.post && !args.pr) abort('--post requires --pr');

  let repo = null;
  let meta = null;
  let rawDiff = '';

  if (args.pr) {
    if (!hasGh()) abort('gh CLI is required for --pr');
    repo = resolveRepo(args.repo);
    log(`loading PR #${args.pr} from ${repo.slug}`);
    meta = fetchPrMeta(args.pr, repo);
    rawDiff = fetchPrDiff(args.pr, repo);
  } else if (args.git) {
    log('collecting local git diff');
    rawDiff = fetchGitDiff();
  } else if (args.file) {
    const path = resolve(args.file);
    log(`reading diff file ${path}`);
    rawDiff = readFileSync(path, 'utf8');
  } else {
    log('reading diff from stdin');
    rawDiff = await readStdin();
  }

  if (!rawDiff || !rawDiff.trim()) abort('diff is empty — nothing to review');

  const { diff, truncated } = truncateDiff(rawDiff);
  log(`diff size: ${rawDiff.length} chars${truncated ? ' (truncated)' : ''}`);

  const user = buildUserPrompt({
    title: meta?.title,
    pr: args.pr,
    repoSlug: repo?.slug,
    base: meta?.baseRefName,
    head: meta?.headRefName,
    author: meta?.author?.login,
    url: meta?.url,
    diff,
    truncated,
  });

  if (args.dryRun) {
    console.log('## Dry run');
    console.log(`Model: ${args.model}`);
    console.log(`Prompt chars: ${user.length}`);
    console.log('Ollama check skipped in dry-run.');
    process.exit(0);
  }

  await ensureOllamaReady();
  const started = Date.now();
  const result = await chatReview({
    model: args.model,
    system: REVIEW_SYSTEM_PROMPT,
    user,
  });
  const elapsedMs = Date.now() - started;
  log(`review completed in ${elapsedMs}ms (eval_count=${result.evalCount ?? 'n/a'})`);

  const banner = [
    `# Local review (${result.model})`,
    args.pr ? `PR: #${args.pr}${meta?.title ? ` — ${meta.title}` : ''}` : null,
    repo?.slug ? `Repo: ${repo.slug}` : null,
    `Generated: ${new Date().toISOString()}`,
    truncated ? 'Warning: diff was truncated before review.' : null,
    '',
    result.content,
  ]
    .filter((x) => x !== null)
    .join('\n');

  console.log(banner);

  if (args.out) {
    const outPath = resolve(args.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${banner}\n`, 'utf8');
    log(`wrote ${outPath}`);
  }

  if (args.post) {
    const comment = [
      `## Local Ollama review (\`${result.model}\`)`,
      '',
      result.content,
      '',
      '_Generated locally — not a substitute for CI or human review._',
    ].join('\n');
    postPrComment(args.pr, repo, comment, false);
  }
}

main().catch((e) => {
  abort(e.message || String(e));
});
