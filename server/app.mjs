import express from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { installAuth } from './auth.mjs';

export function createApp({ store, search, transcribe, modelStatus, dataDir, authConfig = null }) {
  const app = express();
  app.disable('x-powered-by');
  if (authConfig) installAuth(app, authConfig);
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const host = req.headers.host || '';
    const allowed = ['localhost', '127.0.0.1', '[::1]', ...(process.env.ALLOWED_HOSTS || '').split(',').filter(Boolean)];
    if (!allowed.some(name => host === name || host.startsWith(`${name}:`))) return res.status(403).json({ error: 'This host is not enabled.' });
    const origin = req.get('origin');
    if (origin) {
      try { if (new URL(origin).host !== host) return res.status(403).json({ error: 'Cross-origin requests are not allowed.' }); }
      catch { return res.status(403).json({ error: 'Invalid origin.' }); }
    }
    next();
  });
  app.use(express.json({ limit: '160kb' }));
  app.get('/api/status', (req, res) => res.json({ ...store.stats(), pending: search.pending(), models: modelStatus(), authEnabled: Boolean(authConfig) }));
  app.get('/api/insights', (req, res) => res.json(store.list()));
  app.get('/api/review', (req, res) => res.json(store.review()));
  app.get('/api/search', async (req, res) => {
    const query = String(req.query.q || '').trim();
    if (query.length > 1000) return res.status(400).json({ error: 'Please keep the question under 1,000 characters.' });
    res.json(await search.search(query));
  });
  app.post('/api/insights', (req, res) => {
    const input = req.body || {};
    const limits = { content: 50000, title: 160, note: 2000, source: 2000, question: 500 };
    for (const [field, limit] of Object.entries(limits)) {
      if (input[field] !== undefined && (typeof input[field] !== 'string' || input[field].length > limit))
        return res.status(400).json({ error: `${field} must be text, up to ${limit.toLocaleString()} characters.` });
    }
    if (!input.content?.trim()) return res.status(400).json({ error: 'Add a passage, a thought, or a transcript first.' });
    if (!['revisit','practice','reference'].includes(input.intent)) return res.status(400).json({ error: 'Choose how to return to this insight.' });
    if (!['thought','newsletter','book','audiobook','article','voice'].includes(input.source_type)) return res.status(400).json({ error: 'Choose a source type.' });
    if (input.audio_id && (typeof input.audio_id !== 'string' || !store.getAudio(input.audio_id))) return res.status(400).json({ error: 'Recording not found.' });
    const clean = Object.fromEntries(Object.entries(limits).map(([key]) => [key, (input[key] || '').trim()]));
    const item = store.create({ ...clean, intent: input.intent, source_type: input.source_type, audio_id: input.audio_id });
    search.enqueue(item.id);
    res.status(201).json(item);
  });
  app.post('/api/insights/:id/review', (req, res) => {
    if (!['remembered','again','used','later','stop'].includes(req.body?.action)) return res.status(400).json({ error: 'Unknown review action.' });
    const item = store.feedback(req.params.id, req.body.action);
    return item ? res.json(item) : res.status(404).json({ error: 'Insight not found.' });
  });
  app.delete('/api/insights/:id', (req, res) => {
    const item = store.get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Insight not found.' });
    store.remove(item.id);
    // A capture can be attached to more than one insight; only remove an unreferenced file.
    if (item.audio_id && !store.db.prepare('SELECT 1 FROM insights WHERE audio_id = ?').get(item.audio_id)) {
      const audio = store.getAudio(item.audio_id);
      if (audio) {
        store.db.prepare('DELETE FROM audio WHERE id = ?').run(audio.id);
        unlink(resolve(dataDir, 'audio', audio.filename)).catch(() => {});
      }
    }
    res.status(204).end();
  });
  app.post('/api/index/retry', (req, res) => {
    for (const item of store.list().filter(item => item.index_status !== 'ready')) search.enqueue(item.id);
    res.json({ pending: search.pending() });
  });
  const audioTypes = new Map([['audio/webm','webm'],['audio/mp4','m4a'],['audio/ogg','ogg'],['audio/wav','wav']]);
  app.post('/api/audio', express.raw({ type: 'audio/*', limit: '15mb' }), async (req, res) => {
    const mime = req.get('content-type')?.split(';')[0];
    if (!audioTypes.has(mime) || !Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Please upload a supported audio recording.' });
    const id = randomUUID(), filename = `${id}.${audioTypes.get(mime)}`;
    await mkdir(resolve(dataDir, 'audio'), { recursive: true });
    await writeFile(resolve(dataDir, 'audio', filename), req.body);
    store.addAudio(id, filename, mime);
    res.status(201).json({ id });
  });
  app.get('/api/audio/:id', (req, res) => {
    const audio = store.getAudio(req.params.id);
    if (!audio) return res.status(404).json({ error: 'Recording not found.' });
    res.type(audio.mime).sendFile(resolve(dataDir, 'audio', audio.filename));
  });
  app.delete('/api/audio/:id', async (req, res) => {
    const audio = store.getAudio(req.params.id);
    if (!audio) return res.status(404).json({ error: 'Recording not found.' });
    if (store.db.prepare('SELECT 1 FROM insights WHERE audio_id = ?').get(audio.id)) return res.status(409).json({ error: 'This recording is attached to a saved insight.' });
    await unlink(resolve(dataDir, 'audio', audio.filename)).catch(error => { if (error.code !== 'ENOENT') throw error; });
    store.db.prepare('DELETE FROM audio WHERE id = ?').run(audio.id);
    res.status(204).end();
  });
  app.post('/api/audio/:id/transcribe', express.raw({ type: 'application/octet-stream', limit: '8mb' }), async (req, res) => {
    if (!store.getAudio(req.params.id)) return res.status(404).json({ error: 'Recording not found.' });
    if (!Buffer.isBuffer(req.body) || !req.body.length || req.body.length % 4 || req.body.length > 16000 * 4 * 120)
      return res.status(400).json({ error: 'Use a recording of up to two minutes.' });
    const samples = new Float32Array(req.body.buffer.slice(req.body.byteOffset, req.body.byteOffset + req.body.byteLength));
    if (samples.some(value => !Number.isFinite(value) || Math.abs(value) > 1.01)) return res.status(400).json({ error: 'Invalid audio samples.' });
    try { res.json({ text: await transcribe(samples) }); }
    catch (error) { console.error('Transcription failed:', error.message); res.status(503).json({ error: 'Could not transcribe. Your audio is retained; add a written note or try again.' }); }
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'That capture is too large.' });
    if (error instanceof SyntaxError && error.status === 400) return res.status(400).json({ error: 'Invalid request.' });
    console.error(error);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });
  return app;
}
