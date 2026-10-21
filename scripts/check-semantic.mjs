import assert from 'node:assert/strict';
import { createStore } from '../server/store.mjs';
import { createSearch } from '../server/search.mjs';
import { embed, EMBEDDING_MODEL } from '../server/models.mjs';

const store = createStore(':memory:');
const search = createSearch(store, embed, EMBEDDING_MODEL);
const friend = store.create({ content: 'Before offering advice, ask whether the person wants help solving the problem or simply someone to listen.', intent: 'revisit' });
const technical = store.create({ content: 'Authentication verifies your identity. Authorization determines which resources and actions you can access.', intent: 'practice' });
const habit = store.create({ content: 'Make the first step of a new habit small enough to do even on a low-energy day. Put the cue somewhere you will actually notice it.', intent: 'revisit' });
for (const item of [friend, technical, habit]) await search.enqueue(item.id);
for (const [query, expected] of [
  ['Someone I care about is upset. How should I respond?', friend],
  ['Identity and permissions', technical],
  ['Starting a daily routine', habit]
]) {
  const result = await search.search(query);
  assert.equal(result.mode, 'hybrid');
  assert.equal(result.results[0]?.id, expected.id, `Expected a relevant first result for: ${query}`);
  console.log(`PASS: ${query} → ${result.results[0].title.slice(0, 65)}`);
}
store.close();
