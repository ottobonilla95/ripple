# Verification of the POC

## Minimal dark interface update

The interface now uses a fixed near-black theme, system fonts, one column, three text navigation buttons, and collapsed optional capture fields. The sidebar, decorative headings, slogans, prompts, and separate card panels were removed. Browser/PWA theme colors and icons match the dark appearance.

After the update, the production build passed. The actual in-app browser was used with an isolated test collection to verify saving with optional note/source, question-based search, review feedback, and completion. The user’s empty collection was left untouched. The Save screen was visually inspected in the narrow in-app browser. The existing browser-check script was updated for the new labels and controls; the full simulated-microphone test was not repeated for this presentation change.

Verified locally on 21 October 2026 with Node.js 24.6.0, Transformers.js 4.3.1, SQLite, and Chromium (Playwright). Test records were stored in isolated QA databases, not the real collection.

## Passed

- `npm test`: six tests covering durable storage, source preservation, daily review quota and schedule feedback, search index deletion, embedding failure fallback, long-capture chunking, capture validation, same-origin protection, and audio upload/read/delete.
- `npm run test:semantic`: the real local MiniLM model retrieved the intended insight first for three questions, including a question about supporting someone upset that used different words from the saved passage.
- `npm run models:prepare`: both the real embedding and Whisper tiny English models load from the local cache.
- `npm run build`: production bundle and PWA assets build successfully.
- `npm audit` after updating Transformers.js to 4.3.1: zero reported vulnerabilities.
- Desktop browser: opt-in example creation, meaning search, saving a passage with source/context, reload persistence, recall reveal, feedback, and an empty review batch after completion and reload.
- Production browser at 390px and 320px: no horizontal overflow. Save and Review screenshots inspected visually.
- Voice flow using an OS-generated speech fixture as Chromium's simulated microphone: real `getUserMedia`/`MediaRecorder`, original audio upload, browser decoding/resampling, local Whisper transcription, transcript save, and saved audio playback control.
- Production service worker: offline reload opens the cached shell, clearly reports offline state, and restores an unfinished written draft.
- No uncaught browser JavaScript errors during the complete flow.

Browser QA source is `scripts/browser-check.mjs`. It expects an empty isolated server at `QA_URL` (default `http://127.0.0.1:4318`), and a local speech fixture at `data/qa-fixtures/speech.wav`. On macOS the fixture was generated using `say`, then `afconvert -f WAVE -d LEI16@16000 -c 1`. A Playwright-managed browser or `BROWSER_EXECUTABLE` is required. Do not run this against your real collection: it deliberately creates test insights.

## Not yet verified

- Actual iPhone/Safari recording and permission persistence.
- Installation on a physical phone, since private HTTPS access is not configured yet.
- Bluetooth microphones, glasses, other wearables, background/locked-screen recording, and extended noisy speech.
- Long-term production hosting, multi-user authentication, and offline save/synchronisation.

The final desktop preview is a fresh, empty local collection. Models are already cached. The Git repository and remote have not been created.
