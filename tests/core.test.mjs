import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore, chunkText } from '../server/store.mjs';
import { createSearch } from '../server/search.mjs';
import { createApp } from '../server/app.mjs';

test('insights and sources survive closing the database', () => {
  const directory = mkdtempSync(join(tmpdir(), 'commonplace-'));
  const file = join(directory, 'test.sqlite');
  let store = createStore(file);
  const item = store.create({ content: 'Keep the original words.', note: 'My interpretation', source: 'Book, page 42', intent: 'reference' });
  store.close(); store = createStore(file);
  assert.equal(store.get(item.id).source, 'Book, page 42');
  assert.equal(store.get(item.id).content, 'Keep the original words.');
  assert.equal(store.review().length, 0);
  store.close(); rmSync(directory, { recursive: true });
});

test('review stays at three for the day and honours feedback and reference-only saves', () => {
  const store = createStore(':memory:');
  const now = new Date('2026-10-21T10:00:00Z');
  store.create({ content: 'Reference only', intent: 'reference' }, now);
  for (let i = 0; i < 6; i++) store.create({ content: `Thought ${i}`, intent: 'revisit' }, now);
  const batch = store.review(now);
  assert.equal(batch.length, 3);
  assert.deepEqual(store.review(now).map(x => x.id), batch.map(x => x.id));
  for (const item of batch) store.feedback(item.id, 'remembered', now);
  assert.equal(store.review(now).length, 0, 'no replacement backlog after completing the daily batch');
  const tomorrow = new Date(+now + 86400000);
  const next = store.review(tomorrow);
  assert.equal(next.length, 3);
  assert.ok(next.every(item => !batch.some(old => old.id === item.id)));
  store.feedback(next[0].id, 'stop', tomorrow);
  assert.equal(store.get(next[0].id).review_enabled, 0);
  assert.ok(store.list().some(item => item.id === next[0].id), 'stopping reviews preserves the insight');
  store.close();
});

test('hybrid search retrieves semantic matches without shared words; deletion removes every index', async () => {
  const store = createStore(':memory:');
  const item = store.create({ content: 'Listen before advising.', intent: 'revisit' });
  const engine = createSearch(store, async () => [[1, 0]], 'test-model');
  await engine.enqueue(item.id);
  const result = await engine.search('Supporting an upset friend');
  assert.equal(result.mode, 'hybrid');
  assert.equal(result.results[0].id, item.id);
  assert.deepEqual(result.results[0].matches, ['meaning']);
  store.remove(item.id);
  assert.equal((await engine.search('Listen')).results.length, 0);
  assert.equal(store.vectorRows('test-model').length, 0);
  store.close();
});

test('model failure preserves the save and exposes wording-only fallback', async () => {
  const store = createStore(':memory:');
  const item = store.create({ content: 'A thought about gardening.', intent: 'revisit' });
  const engine = createSearch(store, async () => { throw new Error('offline'); }, 'test-model');
  await engine.enqueue(item.id);
  assert.equal(store.get(item.id).index_status, 'error');
  const result = await engine.search('gardening');
  assert.equal(result.mode, 'text');
  assert.equal(result.results[0].id, item.id);
  store.close();
});

test('long captures are split with overlap instead of discarding their ending', () => {
  const words = Array.from({ length: 250 }, (_, i) => `word${i}`);
  const chunks = chunkText(words.join(' '));
  assert.ok(chunks.length > 1);
  assert.ok(chunks.at(-1).endsWith('word249'));
  assert.ok(chunks[0].includes('word75') && chunks[1].includes('word75'));
});

test('API validates captures, rejects cross-origin writes, and stores audio durably', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'commonplace-api-'));
  const store = createStore(':memory:');
  const engine = createSearch(store, async () => [[1, 0]], 'test-model');
  const app = createApp({ store, search: engine, transcribe: async () => 'Hello', modelStatus: () => ({}), dataDir: directory });
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  try {
    const crossOrigin = await fetch(`${base}/insights`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://unrelated.example' }, body: '{}' });
    assert.equal(crossOrigin.status, 403);
    const invalid = await fetch(`${base}/insights`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: ' ' }) });
    assert.equal(invalid.status, 400);
    const upload = await fetch(`${base}/audio`, { method: 'POST', headers: { 'Content-Type': 'audio/webm' }, body: new Uint8Array([1, 2, 3, 4]) });
    assert.equal(upload.status, 201);
    const { id } = await upload.json();
    assert.deepEqual(new Uint8Array(await (await fetch(`${base}/audio/${id}`)).arrayBuffer()), new Uint8Array([1, 2, 3, 4]));
    const created = await fetch(`${base}/insights`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: 'Keep this recording.', source_type: 'voice', intent: 'reference', audio_id: id }) });
    assert.equal(created.status, 201);
    await engine.idle();
    const insight = await created.json();
    const deleted = await fetch(`${base}/insights/${insight.id}`, { method: 'DELETE' });
    assert.equal(deleted.status, 204);
    assert.equal((await fetch(`${base}/audio/${id}`)).status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); store.close(); rmSync(directory, { recursive: true }); }
});
