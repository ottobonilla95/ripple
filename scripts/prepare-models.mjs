import { embed, prepareSpeech } from '../server/models.mjs';
console.log('Preparing local meaning search (one-time model download)…');
await embed(['An idea worth remembering.']);
console.log('Preparing local English transcription (one-time model download)…');
await prepareSpeech();
console.log('Both models are ready. Future use reads the local cache in data/models.');
