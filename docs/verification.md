# Verification of the POC

## Pensieve interface — 6 November 2026

An optional pixel-art experiment is available at `/?basin=pixel`; the normal URL retains the soft illustrated bowl. The pixel version draws the bowl, inward silver spiral, dithered smoke, and sparks on a 160px-wide canvas with viewport-sized height and nearest-neighbour scaling and a restricted palette at 12 fps. The same mobile, interaction, and reduced-motion browser checks passed with `QA_URL='http://127.0.0.1:4317/?basin=pixel'`. The experiment changes only the basin. Both styles support the reference-inspired emerald/turquoise palette (default) and luminous silver-white at `?palette=silver`; combine it with `basin=pixel` for the pixel version. All four style/palette combinations were visually inspected on mobile; the emerald soft and silver pixel versions passed the full UI checks.

The basin uses an illustrated SVG bowl, restored after the photoreal stone draft. Both styles now use a larger bowl and a wider plume that reaches just below the header, behind the reading text. Canvas height adapts to the viewport and keeps the water anchored to the bowl. Procedural canvas layers animate flat cloudy sheets spiralling inward, rising mist, curling filaments, and sparse motes. Touch feedback gently accelerates the currents and brightens the rim. Rendering is capped at 24 fps with a 1.5 pixel-ratio cap; it pauses when hidden or offscreen and renders a static frame for reduced motion. The browser check verifies that normal frames change and reduced-motion frames stay identical. The unused photoreal draft and its generation prompt are archived in `design/`; the app loads no basin image asset.

The mobile Return screen presents one thought above an animated silver basin. Touching the basin advances through the current set and loops from the last thought back to the first. Only the first scheduled pass updates review timing. After reload, if nothing is due, eligible saved thoughts remain browsable; reference-only and stopped items are excluded. Recall items require a fresh reveal on each pass. Source, note, audio, and scheduling actions remain available under the disclosure. The server's daily assignment and database schema are unchanged. Collection and Save use bottom navigation.

`scripts/pensieve-check.mjs` verifies the interface with intercepted fixture responses, without changing any saved collection. It passed for both bowl styles in Chrome at 320, 390, 430, and 1440px: no horizontal overflow, reachable basin above navigation, source disclosure, failed-feedback retry, recall reveal/reset, two complete loops without duplicate review writes, continued browsing after reload, single-item looping, stopped/reference-only exclusion, collection/capture navigation, long-passage scrolling, empty state, reduced motion, and no browser JavaScript errors. Mobile, desktop, and Save layouts were visually inspected; loop screenshots are retained with the UI fixtures. The production build passed; all seven existing storage/API/auth tests passed earlier in this interface update. Physical iPhone/Safari testing is still outstanding.

Run the interface check against a local server with `BROWSER_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node scripts/pensieve-check.mjs`. The local design preview uses a separate collection at `data/ui-preview/commonplace.sqlite` with labelled sample thoughts.

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
