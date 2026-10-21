import express from 'express';
import { resolve } from 'node:path';
import { createStore } from './store.mjs';
import { createSearch } from './search.mjs';
import { embed, transcribe, modelStatus, EMBEDDING_MODEL } from './models.mjs';
import { createApp } from './app.mjs';

const dataDir = resolve(process.env.DATA_DIR || 'data');
const store = createStore(resolve(dataDir, 'commonplace.sqlite'));
const search = createSearch(store, embed, EMBEDDING_MODEL);
const app = createApp({ store, search, transcribe, modelStatus, dataDir });
const production = process.argv.includes('--production');
let vite;
if (production) {
  app.use(express.static(resolve('dist')));
  app.get('/{*path}', (req, res) => res.sendFile(resolve('dist/index.html')));
} else {
  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
const port = Number(process.env.PORT || 4317);
const host = process.env.HOST || '127.0.0.1';
if (host !== '127.0.0.1' && !process.env.ALLOWED_HOSTS) throw new Error('Set ALLOWED_HOSTS before enabling a private network host. See README.');
const server = app.listen(port, host, () => {
  console.log(`Commonplace is ready: http://${host}:${port}`);
  console.log('Saved insights and models stay in:', dataDir);
});
for (const item of store.list().filter(item => item.index_status !== 'ready')) search.enqueue(item.id);
async function stop() { await vite?.close(); server.close(() => { store.close(); process.exit(0); }); }
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
