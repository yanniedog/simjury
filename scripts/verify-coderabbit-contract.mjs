#!/usr/bin/env node
import assert from 'node:assert/strict';
import { classifyCoderabbitStatuses } from './coderabbit-contract.mjs';

const cr = (description, state = 'success', created_at = '2026-07-29T04:00:00Z') => ({
  context: 'CodeRabbit',
  state,
  description,
  created_at,
  creator: { login: 'coderabbitai[bot]' },
});

assert.equal(classifyCoderabbitStatuses([]).state, 'missing');
assert.equal(classifyCoderabbitStatuses([cr('Review queued', 'pending')]).state, 'pending');
assert.equal(classifyCoderabbitStatuses([cr('Review in progress', 'pending')]).state, 'pending');
assert.equal(classifyCoderabbitStatuses([cr('Review rate limited')]).state, 'rate_limited');
assert.equal(classifyCoderabbitStatuses([cr('Review skipped: ignored keyword')]).state, 'blocked');
assert.equal(
  classifyCoderabbitStatuses([
    cr('Review completed', 'success', '2026-07-29T04:00:00Z'),
    cr('Review rate limited', 'success', '2026-07-29T04:05:00Z'),
  ]).state,
  'completed',
  'a later redundant rate limit must not invalidate completion on the same SHA',
);
assert.equal(
  classifyCoderabbitStatuses([
    {
      ...cr('Review completed'),
      creator: { login: 'github-actions[bot]' },
    },
  ]).state,
  'missing',
  'only the CodeRabbit app may satisfy the contract',
);
assert.equal(
  classifyCoderabbitStatuses([cr('Review completed with 0 actionable comments')]).state,
  'completed',
);

console.log('PASS verify-coderabbit-contract');
