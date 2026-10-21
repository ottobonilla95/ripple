import { chunkText } from './store.mjs';

export function cosine(a, b) {
  if (a.length !== b.length) return 0;
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2; }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}

export function createSearch(store, embed, model) {
  let queue = Promise.resolve();
  const pending = new Set();
  function enqueue(id) {
    if (pending.has(id)) return queue;
    pending.add(id);
    queue = queue.then(async () => {
      const item = store.get(id);
      if (!item) return;
      const parts = chunkText(item.content);
      const texts = parts.map(part => `${item.title}\n${part}\n${item.note}`);
      const vectors = await embed(texts);
      store.setChunks(id, parts, vectors, model);
    }).catch(error => {
      store.setIndexStatus(id, 'error');
      console.error('Could not index insight:', error.message);
    }).finally(() => pending.delete(id));
    return queue;
  }
  async function search(query) {
    if (!query.trim()) return { results: store.list(), mode: 'library' };
    const lexical = store.lexicalSearch(query);
    let semantic = [], mode = 'hybrid';
    try {
      const [vector] = await embed([query]);
      const best = new Map();
      for (const row of store.vectorRows(model)) {
        const similarity = cosine(vector, row.vector);
        if (similarity >= 0.27 && (!best.has(row.insight_id) || similarity > best.get(row.insight_id).similarity)) {
          best.set(row.insight_id, { id: row.insight_id, similarity, passage: row.content });
        }
      }
      semantic = [...best.values()].sort((a, b) => b.similarity - a.similarity).slice(0, 40);
    } catch { mode = 'text'; }
    // Reciprocal rank fusion combines different score scales without pretending they are probabilities.
    const scores = new Map();
    for (const [kind, rows] of [['text', lexical], ['meaning', semantic]]) {
      rows.forEach((row, i) => {
        const score = scores.get(row.id) || { id: row.id, score: 0, matches: [] };
        score.score += 1 / (20 + i + 1);
        score.matches.push(kind);
        if (row.passage) score.passage = row.passage;
        scores.set(row.id, score);
      });
    }
    return { mode, results: [...scores.values()].sort((a, b) => b.score - a.score).slice(0, 12)
      .map(result => ({ ...store.get(result.id), matches: result.matches, passage: result.passage })) };
  }
  return { enqueue, search, idle: () => queue, pending: () => pending.size };
}
