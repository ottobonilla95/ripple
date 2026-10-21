# Architecture

## One application, not an agent system

```text
Phone home-screen app / desktop browser
                    │ same-origin HTTP API
                    ▼
          Node.js + Express process
          ├─ React + Vite interface
          ├─ Save / review / retrieval routes
          ├─ Local embedding model (Transformers.js + ONNX)
          ├─ Local English speech model (Whisper tiny)
          ├─ SQLite: originals + review schedule + FTS5 + vector blobs
          └─ Files: original audio + cached model weights
```

This is a single-user local POC. There is no agent loop, orchestration library, separate vector database, account service, or generative chat model. The client never receives model weights; inference runs on the Mac serving the app. Production phone access still needs private HTTPS setup.

## Save and index

1. Persist original content, optional title, note, source, source type, return intention, recall question, and audio attachment.
2. Return success immediately after SQLite commits.
3. Queue an in-process indexing task. Split long captures into overlapping 90-word chunks. Preserve the full original independently.
4. Embed each chunk with its title and personal context using `Xenova/all-MiniLM-L6-v2`, a small English-focused 384-dimensional sentence embedding model. Store Float32 vectors and the model identity in SQLite.
5. Mark ready. Failure leaves the original intact, marks an error, and enables retry. Pending/error records are retried on server restart.

The vectors are a derived index, not the source of truth. The queue has one worker, but it is not a durable job system; persisted index status allows recovery after a crash. Changing models requires explicitly re-embedding all records because vectors from different models are not comparable.

## Ask a question

1. Embed the question using the same local model.
2. Compute cosine similarity against stored chunks; retain the best passage per insight above a conservative POC cutoff.
3. Independently query SQLite FTS5, using BM25 ranking to retrieve exact wording, names, and technical terms.
4. Combine ranks with reciprocal rank fusion, deduplicate, and return the best saved insights with original text, source, and note.

The UI shows whether meaning, wording, or both found each item. If embedding inference fails, it explicitly labels results as wording-only. The score threshold is a heuristic, not a guarantee of relevance. No generated synthesis is included in this POC. A future answer layer can receive only retrieved passages and cite their IDs, but retrieval should be useful before adding it.

For a personal collection of hundreds or a few thousand short insights, brute-force vector comparison is a simple starting point. It is linear in chunk count and loads vectors into memory. At larger scale move this module to a vector index or PostgreSQL + pgvector; do not change the capture/review UI or discard original records. No separate vector service is needed for this POC.

## Review

Review has its own scheduling logic; vector similarity does not decide when a fact is due. At most three items are assigned each Dublin day. Due practice items take priority, then overdue revisits, with a deterministic daily tie breaker. Completing the batch does not refill it that day.

“Remembered” / “Useful to revisit” at least doubles the interval to a minimum of seven days (capped at 120). “Again soon” / “Another time” returns it after one day. “Stop resurfacing” disables reviews but keeps it searchable. This is deliberately simple scheduling, not a claim to implement FSRS or an optimised learning algorithm.

## Voice

`getUserMedia` + `MediaRecorder` captures the microphone after a user tap and permission. Original audio uploads first. Browser audio decoding and `OfflineAudioContext` produce mono 16 kHz PCM; the server validates a two-minute maximum and runs `Xenova/whisper-tiny.en` locally. The user corrects the transcript before saving, and can replay the original. Failure retains the uploaded audio so a written note or retry can still be attached.

Original audio and SQLite belong on persistent storage, not an ephemeral serverless filesystem. POC voice requires an open foreground app; actual device and browser testing is essential.

## Growing beyond the Mac

Keep the same API and UI. Host the Node app on a machine/container with persistent disk and HTTPS, add proper account/session authentication, and optionally use managed PostgreSQL with pgvector plus object storage for audio. Keep keys server-side if replacing local inference with a hosted provider. Deploying publicly, creating paid services, and creating a Git remote are not part of this local build.

The local server binds to loopback and rejects unexpected API hosts and cross-origin writes. This is not a replacement for authentication on a public deployment. If used through a reverse proxy, configure exact allowed hosts and preserve same-origin semantics. The service worker caches only the app shell/assets, never the collection API or audio. Written drafts in localStorage are device-local and readable to the same origin.
