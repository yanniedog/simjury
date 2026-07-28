#!/usr/bin/env node
/**
 * Install portable CodeRabbit rate-limit retry workflow on repos.
 *
 * Usage:
 *   node scripts/install-coderabbit-rate-limit-retry-all-repos.mjs
 *   node scripts/install-coderabbit-rate-limit-retry-all-repos.mjs --dry-run
 *   node scripts/install-coderabbit-rate-limit-retry-all-repos.mjs --repos AR-app,AR-local
 *   node scripts/install-coderabbit-rate-limit-retry-all-repos.mjs --owner yanniedog
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const WORKFLOW_SRC = join(repoRoot, '.github/workflows/pr-coderabbit-rate-limit-retry.yml');
const WORKFLOW_REL = '.github/workflows/pr-coderabbit-rate-limit-retry.yml';
const BRANCH = 'cursor/coderabbit-rate-limit-retry-a7ca';

function parseArgs(argv) {
  const out = { dryRun: false, owner: 'yanniedog', repos: null, help: false, skipExisting: true };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--owner') out.owner = argv[++i];
    else if (a === '--repos') out.repos = String(argv[++i] || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    else if (a === '--force') out.skipExisting = false;
  }
  return out;
}

function ghJson(args) {
  const out = execFileSync('gh', args, { encoding: 'utf8' });
  return JSON.parse(out);
}

function gh(args, opts = {}) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: opts.stdio || 'pipe', ...opts });
}

function listRepos(owner) {
  const rows = ghJson([
    'repo',
    'list',
    owner,
    '--limit',
    '200',
    '--json',
    'name,isArchived,isFork,defaultBranchRef,viewerPermission',
  ]);
  return rows.filter(
    (r) =>
      !r.isArchived &&
      !r.isFork &&
      r.defaultBranchRef?.name &&
      ['ADMIN', 'MAINTAIN', 'WRITE'].includes(String(r.viewerPermission || '').toUpperCase()),
  );
}

function remoteHasWorkflow(owner, name) {
  try {
    gh(['api', `repos/${owner}/${name}/contents/${WORKFLOW_REL}`], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function openPr(owner, name, defaultBranch, workflowBody, dryRun) {
  const full = `${owner}/${name}`;
  if (!defaultBranch) {
    const meta = ghJson(['api', `repos/${owner}/${name}`, '--jq', '{default_branch:.default_branch}']);
    defaultBranch = meta.default_branch || 'main';
  }
  if (dryRun) {
    console.log(`[dry-run] would install ${WORKFLOW_REL} on ${full} (base ${defaultBranch})`);
    return { status: 'dry-run' };
  }

  const dir = mkdtempSync(join(tmpdir(), `cr-retry-${name}-`));
  try {
    execFileSync(
      'git',
      ['clone', '--depth', '1', '--branch', defaultBranch, `https://github.com/${full}.git`, dir],
      { encoding: 'utf8', stdio: 'pipe' },
    );
    const wfDir = join(dir, '.github', 'workflows');
    mkdirSync(wfDir, { recursive: true });
    writeFileSync(join(dir, WORKFLOW_REL), workflowBody, 'utf8');

    execFileSync('git', ['-C', dir, 'checkout', '-B', BRANCH], { encoding: 'utf8', stdio: 'pipe' });
    execFileSync('git', ['-C', dir, 'add', WORKFLOW_REL], { encoding: 'utf8', stdio: 'pipe' });
    const staged = execFileSync('git', ['-C', dir, 'diff', '--cached', '--name-only'], {
      encoding: 'utf8',
    }).trim();
    if (!staged) {
      return { status: 'unchanged' };
    }
    execFileSync(
      'git',
      [
        '-C',
        dir,
        '-c',
        'user.email=cursor-agent@users.noreply.github.com',
        '-c',
        'user.name=cursor-agent',
        'commit',
        '-m',
        'ci: auto-retry CodeRabbit review after rate limit\n\nRole: Engineer — portable workflow waits for CR quota then @coderabbitai review.',
      ],
      { encoding: 'utf8', stdio: 'pipe' },
    );
    try {
      execFileSync('git', ['-C', dir, 'push', '-u', 'origin', `HEAD:${BRANCH}`, '--force-with-lease'], {
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch {
      execFileSync('git', ['-C', dir, 'push', '-u', 'origin', `HEAD:${BRANCH}`], {
        encoding: 'utf8',
        stdio: 'pipe',
      });
    }

    let prUrl = null;
    try {
      const existing = ghJson([
        'pr',
        'list',
        '--repo',
        full,
        '--head',
        BRANCH,
        '--json',
        'url,number',
      ]);
      if (existing[0]?.url) {
        prUrl = existing[0].url;
      }
    } catch {
      /* create below */
    }
    if (!prUrl) {
      prUrl = gh([
        'pr',
        'create',
        '--repo',
        full,
        '--base',
        defaultBranch,
        '--head',
        BRANCH,
        '--title',
        'ci: auto-retry CodeRabbit review after rate limit',
        '--body',
        [
          '## Summary',
          '',
          'Adds portable `.github/workflows/pr-coderabbit-rate-limit-retry.yml`.',
          'When CodeRabbit posts **Review limit reached**, waits for the stated window, then comments `@coderabbitai review`.',
          '',
          'Self-contained (no repo scripts). Same workflow as simjury.',
          '',
          '## Role',
          '',
          'Engineer',
        ].join('\n'),
      ]).trim();
    }
    return { status: 'pr', url: prUrl };
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Usage: node scripts/install-coderabbit-rate-limit-retry-all-repos.mjs [--dry-run] [--owner yanniedog] [--repos a,b] [--force]`);
    process.exit(0);
  }
  if (!existsSync(WORKFLOW_SRC)) {
    console.error(`missing ${WORKFLOW_SRC}`);
    process.exit(1);
  }
  const workflowBody = readFileSync(WORKFLOW_SRC, 'utf8');
  const repos = args.repos
    ? args.repos.map((name) => ({ name, defaultBranchRef: { name: 'main' } }))
    : listRepos(args.owner);

  const summary = { pr: [], skipped: [], dryRun: [], errors: [], unchanged: [] };
  for (const r of repos) {
    const name = r.name;
    const defaultBranch = r.defaultBranchRef?.name || 'main';
    const full = `${args.owner}/${name}`;
    if (name === 'simjury' && !args.repos) {
      console.log(`skip ${full} (canonical source — use in-repo PR)`);
      summary.skipped.push(full);
      continue;
    }
    if (args.skipExisting && remoteHasWorkflow(args.owner, name)) {
      console.log(`skip ${full} (workflow already present)`);
      summary.skipped.push(full);
      continue;
    }
    try {
      const result = openPr(args.owner, name, defaultBranch, workflowBody, args.dryRun);
      console.log(`${result.status} ${full}${result.url ? ` ${result.url}` : ''}`);
      if (result.status === 'pr') summary.pr.push(result.url || full);
      else if (result.status === 'dry-run') summary.dryRun.push(full);
      else if (result.status === 'unchanged') summary.unchanged.push(full);
      else summary.skipped.push(full);
    } catch (err) {
      console.error(`ERROR ${full}: ${err?.message || err}`);
      summary.errors.push(full);
    }
  }
  console.log('\n=== summary ===');
  console.log(JSON.stringify(summary, null, 2));
  if (summary.errors.length) process.exit(1);
}

main();
