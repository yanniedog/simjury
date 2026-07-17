import assert from 'node:assert/strict';
import test from 'node:test';
import { narrationManifest } from './narration-manifest.generated.js';
import { handleNarration } from './index.js';
import { deepgramSpeakerFor } from '../scripts/generate-narration-manifest.mjs';

class MemoryCache {
  entries = new Map();
  async match(request) { return this.entries.get(request.url)?.clone(); }
  async put(request, response) { this.entries.set(request.url, response.clone()); }
}

test('known speaker roles never share a neural voice', () => {
  const counsel = ['pc', 'dc'];
  const witnesses = Array.from({ length: 8 }, (_, i) => `w${i + 1}`);
  const jurors = Array.from({ length: 11 }, (_, i) => `J-${String(i + 1).padStart(2, '0')}`);
  const knownRoles = [...counsel, 'judge', 'narrator', ...witnesses, ...jurors];
  assert.equal(new Set(knownRoles.map(deepgramSpeakerFor)).size, knownRoles.length);
  assert.notEqual(deepgramSpeakerFor('pc'), deepgramSpeakerFor('dc'));
  for (const advocate of counsel) {
    for (const witness of witnesses) {
      assert.notEqual(deepgramSpeakerFor(advocate), deepgramSpeakerFor(witness));
    }
  }
});

test('narration accepts only corpus ids and edge-caches raw Aura audio', async () => {
  const calls = [];
  const waits = [];
  const env = {
    AI: {
      run: async (...args) => {
        calls.push(args);
        return new Response(new Uint8Array([0x49, 0x44, 0x33]));
      },
    },
  };
  const ctx = { waitUntil(promise) { waits.push(promise); } };
  const cache = new MemoryCache();
  const rejected = await handleNarration(
    new Request('https://simjury.com/api/narration/free-form-deadbeef.mp3'), env, ctx, cache,
  );
  assert.equal(rejected.status, 404);
  assert.equal(calls.length, 0);

  const [id, line] = Object.entries(narrationManifest)[0];
  const request = new Request(`https://simjury.com/api/narration/${id}.mp3?bust=1`);
  const first = await handleNarration(request, env, ctx, cache);
  await Promise.all(waits);
  const second = await handleNarration(request, env, ctx, cache);
  assert.equal(first.headers.get('content-type'), 'audio/mpeg');
  assert.equal(first.headers.get('content-security-policy')?.includes("default-src 'self'"), true);
  assert.equal(first.headers.get('x-frame-options'), 'DENY');
  assert.equal(second.status, 200);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [
    '@cf/deepgram/aura-2-en',
    { text: line.text, speaker: line.speaker, encoding: 'mp3' },
    { returnRawResponse: true },
  ]);
});

test('narration fails closed when Workers AI is unavailable', async () => {
  const [id] = Object.keys(narrationManifest);
  const env = { AI: { run: async () => { throw new Error('provider down'); } } };
  const response = await handleNarration(
    new Request(`https://simjury.com/api/narration/${id}.mp3`),
    env,
    { waitUntil() {} },
    new MemoryCache(),
  );
  assert.equal(response.status, 502);
  assert.equal(await response.text(), 'Narration unavailable');
});

test('narration works when Cache API and waitUntil are unavailable', async () => {
  const calls = [];
  const [id, line] = Object.entries(narrationManifest)[0];
  const env = {
    AI: {
      run: async (...args) => {
        calls.push(args);
        return new Response(new Uint8Array([0x49, 0x44, 0x33]));
      },
    },
  };
  const response = await handleNarration(
    new Request(`https://simjury.com/api/narration/${id}.mp3`),
    env,
    {},
    undefined,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'audio/mpeg');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].text, line.text);
});
