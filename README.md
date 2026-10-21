# Ripple

A minimal personal memory app for capturing insights, revisiting what matters, and finding ideas through local semantic search.

## Run locally

Requires Node.js 24 or newer. From this folder:

```sh
npm install
npm run models:prepare
npm run dev
```

Open **http://127.0.0.1:4317**. The collection starts empty. You can explicitly add three labelled examples to explore the experience.

`models:prepare` downloads two public models once into `data/models`. It needs internet for the first run. Afterwards, embeddings and English transcription run on this Mac without a paid API or sending your captures to an AI service. The interface uses system fonts and a fixed dark theme.

For the production PWA and app-shell offline caching:

```sh
npm run build
npm start
```

The development server does not register the service worker. Both servers use port 4317; stop one before starting the other.

## What works

- **Save:** written thoughts, pasted passages, links as source references, and short voice captures. Voice recordings are retained, transcribed locally, and editable before saving. Links are not automatically scraped.
- **Review:** at most three items assigned per Dublin calendar day, with a reason for appearing. Practice hides the saved passage until reveal; feedback changes the next due date. Reference-only items stay in Find. Stopping resurfacing retains the original.
- **Find:** questions and exact phrases retrieve saved insights using local embeddings plus SQLite FTS5. Every result retains the source and your note. The app retrieves material; it does not invent an AI answer.
- Persistence across reloads and server restarts. Meaning indexing happens after the durable save, with retry and an honest wording-only fallback if the model is unavailable.
- Home-screen manifest, icons, mobile layouts, and production app-shell caching. Written drafts stay in this browser. Offline saving/sync and offline audio capture are not implemented.

## Storage

All runtime data is ignored by Git:

```text
data/
  commonplace.sqlite       Original text, notes, source, review state, search chunks and vectors
  commonplace.sqlite-wal   SQLite working journal while running
  audio/                   Original microphone recordings
  models/                  Cached embedding and speech models
```

Stop the server before copying the entire `data/` directory for a backup. Do not commit it to a repository.

## Phone access

This is one collection served from your Mac, not separate browser-local databases. Phone and desktop see the same data when connected to that server.

The default binds to loopback only and has no login. **Do not publish this server openly.** For personal phone testing, use an authenticated private HTTPS route such as Tailscale Serve, with your phone and Mac in your private network. A reverse proxy must preserve or rewrite the Host and Origin consistently; allow only the exact private hostname using `ALLOWED_HOSTS` if it forwards that hostname. Add the same hostname to Vite's `server.allowedHosts` for development, or use the production build.

For example, after Tailscale is configured on both devices, you can point Tailscale Serve at `http://127.0.0.1:4317` and configure the app's `ALLOWED_HOSTS` to the exact hostname it issues. Configure the private route on your machine; this project has not created a tunnel, public endpoint, or Tailscale configuration.

On iPhone: open the resulting HTTPS address in Safari → Share → Add to Home Screen → Open as Web App. The Mac needs to be running and reachable. Plain LAN HTTP cannot use the microphone. Microphone permission is required; persistence depends on browser settings. Keep the web app visible during recordings. Background/locked-screen recording, actual iPhone microphone behavior, and Bluetooth devices require testing on your phone.

Short recordings are limited to two minutes. English-only Whisper tiny is a POC tradeoff, and can mistranscribe or hallucinate, especially in noise or silence. Check the transcript. It is not a way to capture another app's internal audiobook audio; record your own spoken takeaway and optionally add the audiobook timestamp.

## Checks

```sh
npm test
npm run test:semantic
npm run build
```

The regular tests use isolated temporary databases. The semantic check uses the real local embedding model and tests paraphrased questions against unrelated insights. `npm run models:prepare` also loads the real transcription model. Browser QA covers the UI and mocked microphone where hardware is unavailable; see `docs/verification.md` for actual results.

See [architecture](docs/architecture.md) for the implementation and future hosting plan.
