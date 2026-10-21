import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function chunkText(text, size = 90, overlap = 15) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const chunks = [];
  for (let i = 0; i < words.length; i += size - overlap) {
    chunks.push(words.slice(i, i + size).join(' '));
    if (i + size >= words.length) break;
  }
  return chunks;
}

export function createStore(filename) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS audio (
      id TEXT PRIMARY KEY, filename TEXT NOT NULL, mime TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS insights (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '', source_type TEXT NOT NULL DEFAULT 'thought',
      intent TEXT NOT NULL DEFAULT 'revisit', question TEXT NOT NULL DEFAULT '',
      audio_id TEXT REFERENCES audio(id), created_at TEXT NOT NULL,
      last_reviewed_at TEXT, next_review_at TEXT NOT NULL, review_count INTEGER NOT NULL DEFAULT 0,
      interval_days INTEGER NOT NULL DEFAULT 1, review_enabled INTEGER NOT NULL DEFAULT 1,
      index_status TEXT NOT NULL DEFAULT 'pending'
    );
    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY, insight_id TEXT NOT NULL REFERENCES insights(id) ON DELETE CASCADE,
      content TEXT NOT NULL, embedding BLOB NOT NULL, model TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS chunks_insight ON chunks(insight_id);
    CREATE TABLE IF NOT EXISTS daily_review (
      day TEXT NOT NULL, insight_id TEXT NOT NULL, position INTEGER NOT NULL,
      PRIMARY KEY (day, insight_id)
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS insights_fts USING fts5(
      insight_id UNINDEXED, title, content, note, source, tokenize='porter unicode61'
    );
  `);

  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function get(id) { return db.prepare('SELECT * FROM insights WHERE id = ?').get(id); }
  function create(input, now = new Date()) {
    const id = randomUUID();
    const date = now.toISOString();
    transaction(() => {
      db.prepare(`INSERT INTO insights (id,title,content,note,source,source_type,intent,question,audio_id,created_at,next_review_at,review_enabled)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, input.title || input.content.slice(0, 90), input.content,
        input.note || '', input.source || '', input.source_type || 'thought', input.intent || 'revisit',
        input.question || '', input.audio_id || null, date, date, input.intent === 'reference' ? 0 : 1);
      db.prepare('INSERT INTO insights_fts (insight_id,title,content,note,source) VALUES (?,?,?,?,?)')
        .run(id, input.title || input.content.slice(0, 90), input.content, input.note || '', input.source || '');
    });
    return get(id);
  }
  function remove(id) {
    return transaction(() => {
      db.prepare('DELETE FROM insights_fts WHERE insight_id = ?').run(id);
      return db.prepare('DELETE FROM insights WHERE id = ?').run(id).changes > 0;
    });
  }
  function list() { return db.prepare('SELECT * FROM insights ORDER BY created_at DESC').all(); }
  function setChunks(id, chunks, vectors, model) {
    if (!get(id)) return;
    transaction(() => {
      db.prepare('DELETE FROM chunks WHERE insight_id = ?').run(id);
      const insert = db.prepare('INSERT INTO chunks (insight_id,content,embedding,model) VALUES (?,?,?,?)');
      chunks.forEach((content, i) => insert.run(id, content, Buffer.from(new Float32Array(vectors[i]).buffer), model));
      db.prepare("UPDATE insights SET index_status = 'ready' WHERE id = ?").run(id);
    });
  }
  function lexicalSearch(query) {
    const words = query.match(/[\p{L}\p{N}]+/gu) || [];
    const stopwords = new Set('a an the i me my we our you your what why how when where can could should would do does did is are was were to of for in on about and or with have has saved something'.split(' '));
    const terms = [...new Set(words.filter(w => !stopwords.has(w.toLowerCase())))].slice(0, 24);
    if (!terms.length) return [];
    const match = terms.map(word => `"${word.replaceAll('"', '""')}"`).join(' OR ');
    return db.prepare(`SELECT insight_id AS id, bm25(insights_fts,0,3,1,2,1) AS rank
      FROM insights_fts WHERE insights_fts MATCH ? ORDER BY rank LIMIT 40`).all(match);
  }
  function vectorRows(model) {
    return db.prepare('SELECT insight_id, content, embedding FROM chunks WHERE model = ?').all(model).map(row => ({
      ...row, vector: new Float32Array(row.embedding.buffer.slice(row.embedding.byteOffset, row.embedding.byteOffset + row.embedding.byteLength))
    }));
  }
  function review(now = new Date()) {
    const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Dublin' }).format(now);
    const priority = item => {
      const seed = createHash('sha256').update(dateKey + item.id).digest().readUInt32BE(0) / 0xffffffff;
      const overdue = Math.min(30, Math.max(0, (now - new Date(item.next_review_at)) / 86400000));
      return (item.intent === 'practice' ? 100 : 0) + overdue + seed;
    };
    if (!db.prepare('SELECT 1 FROM daily_review WHERE day = ?').get(dateKey)) {
      const eligible = db.prepare('SELECT * FROM insights WHERE review_enabled = 1 AND next_review_at <= ?').all(now.toISOString());
      transaction(() => {
        eligible.sort((a, b) => priority(b) - priority(a)).slice(0, 3).forEach((item, i) =>
          db.prepare('INSERT INTO daily_review (day,insight_id,position) VALUES (?,?,?)').run(dateKey, item.id, i));
      });
    }
    return db.prepare(`SELECT i.* FROM daily_review d JOIN insights i ON i.id = d.insight_id
      WHERE d.day = ? AND i.review_enabled = 1 AND i.next_review_at <= ? ORDER BY d.position`).all(dateKey, now.toISOString()).map(item => ({ ...item,
      reason: item.intent === 'practice' ? 'You chose to practise this. It’s ready for another try.'
        : item.last_reviewed_at ? 'A little time has passed. See what this means to you now.' : 'You saved this to return to. Here’s your first revisit.'
    }));
  }
  function feedback(id, action, now = new Date()) {
    const item = get(id);
    if (!item) return null;
    if (action === 'stop') { db.prepare('UPDATE insights SET review_enabled = 0 WHERE id = ?').run(id); return get(id); }
    const interval = action === 'again' || action === 'later' ? 1 : Math.min(120, Math.max(7, item.interval_days * 2));
    db.prepare(`UPDATE insights SET last_reviewed_at = ?, next_review_at = ?, interval_days = ?, review_count = review_count + ? WHERE id = ?`)
      .run(now.toISOString(), new Date(+now + interval * 86400000).toISOString(), interval, action === 'later' ? 0 : 1, id);
    return get(id);
  }
  function stats() {
    return db.prepare(`SELECT count(*) AS total, coalesce(sum(index_status = 'ready'),0) AS indexed,
      coalesce(sum(index_status = 'error'),0) AS failed FROM insights`).get();
  }
  return { db, get, create, remove, list, setChunks, lexicalSearch, vectorRows, review, feedback, stats,
    setIndexStatus: (id, status) => db.prepare('UPDATE insights SET index_status = ? WHERE id = ?').run(status, id),
    addAudio: (id, filename, mime) => db.prepare('INSERT INTO audio VALUES (?,?,?,?)').run(id, filename, mime, new Date().toISOString()),
    getAudio: id => db.prepare('SELECT * FROM audio WHERE id = ?').get(id),
    close: () => db.close()
  };
}
