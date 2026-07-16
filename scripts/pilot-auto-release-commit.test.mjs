#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { pushHeadToMain, normalizePushRetries } from './pilot-auto-release-commit.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function result(status = 0, stdout = '', stderr = '') {
  return { status, stdout, stderr };
}

test('clean invocation leaves an older stash untouched', () => {
  const calls = [];
  const responses = [
    result(0, 'old-stash\n'),
    result(0, 'No local changes to save\n'),
    result(0, 'old-stash\n'),
    result(),
    result(),
  ];
  const runCommand = (cmd, args) => {
    calls.push([cmd, args]);
    return responses.shift() ?? result();
  };

  assert.deepEqual(pushHeadToMain({ runCommand }), { ok: true });
  assert.equal(calls.some(([, args]) => args[0] === 'stash' && args[1] === 'apply'), false);
  assert.equal(calls.some(([, args]) => args[0] === 'stash' && args[1] === 'drop'), false);
});

test('restores and drops only the stash commit created by this invocation', () => {
  const calls = [];
  const responses = [
    result(0, 'old-stash\n'),
    result(0, 'Saved working directory\n'),
    result(0, 'new-stash\n'),
    result(),
    result(),
    result(),
    result(0, 'other-stash\tstash@{0}\nnew-stash\tstash@{1}\nold-stash\tstash@{2}\n'),
    result(),
  ];
  const runCommand = (cmd, args) => {
    calls.push([cmd, args]);
    return responses.shift() ?? result();
  };

  assert.deepEqual(pushHeadToMain({ runCommand }), { ok: true });
  assert.ok(calls.some(([, args]) => args.join(' ') === 'stash apply new-stash'));
  assert.ok(calls.some(([, args]) => args.join(' ') === 'stash drop stash@{1}'));
});

test('warns and retains the restored invocation stash when stash listing fails', () => {
  const warnings = [];
  const warn = console.warn;
  console.warn = (message) => warnings.push(String(message));
  const responses = [
    result(1),
    result(0, 'Saved working directory\n'),
    result(0, 'new-stash\n'),
    result(),
    result(),
    result(),
    result(1, '', 'bad stash state'),
  ];
  const runCommand = () => responses.shift() ?? result();

  try {
    assert.deepEqual(pushHeadToMain({ runCommand }), { ok: true });
  } finally {
    console.warn = warn;
  }
  assert.ok(warnings.some((message) => message.includes('stash list warning: bad stash state')));
});

test('normalizePushRetries clamps invalid values to fallback', () => {
  assert.equal(normalizePushRetries(undefined), 3);
  assert.equal(normalizePushRetries(''), 3);
  assert.equal(normalizePushRetries('0'), 3);
  assert.equal(normalizePushRetries('NaN'), 3);
  assert.equal(normalizePushRetries('2.9'), 2);
  assert.equal(normalizePushRetries('5'), 5);
});

test('main workflow dispatches run every APK publication step', () => {
  const workflow = readFileSync(
    join(repoRoot, '.github/workflows/pilot-android-apk.yml'),
    'utf8',
  );
  const drainScript = readFileSync(
    join(repoRoot, 'pilot/scripts/pilot-auto-release-on-drain.mjs'),
    'utf8',
  );
  const conditionPattern =
    /if:\s*github\.ref\s*==\s*['"]refs\/heads\/main['"]\s*&&\s*\(\s*github\.event_name\s*==\s*['"]push['"]\s*\|\|\s*github\.event_name\s*==\s*['"]workflow_dispatch['"]\s*\)/g;

  assert.equal(workflow.match(conditionPattern)?.length ?? 0, 3);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(drainScript, /--ref[\s,'"]+main/);
});
