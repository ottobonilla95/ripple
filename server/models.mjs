import { pipeline, env } from '@huggingface/transformers';
import { resolve } from 'node:path';

env.cacheDir = resolve(process.env.MODEL_CACHE_DIR || resolve(process.env.DATA_DIR || 'data', 'models'));
export const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
const SPEECH_MODEL = 'Xenova/whisper-tiny.en';
const state = { embeddings: 'idle', speech: 'idle', error: null };
let extractorPromise;
let transcriberPromise;
let speechQueue = Promise.resolve();

export function modelStatus() { return { ...state }; }
async function extractor() {
  if (!extractorPromise) {
    state.embeddings = 'loading';
    extractorPromise = pipeline('feature-extraction', EMBEDDING_MODEL, { dtype: 'q8', device: 'cpu' })
      .then(value => { state.embeddings = 'ready'; state.error = null; return value; })
      .catch(error => { state.embeddings = 'error'; state.error = 'Meaning search is unavailable. Text search still works. Retry indexing when connected.'; extractorPromise = null; throw error; });
  }
  return extractorPromise;
}
export async function embed(texts) {
  const model = await extractor();
  const output = await model(texts, { pooling: 'mean', normalize: true });
  return output.tolist();
}
export async function prepareSpeech() {
  if (!transcriberPromise) {
    state.speech = 'loading';
    transcriberPromise = pipeline('automatic-speech-recognition', SPEECH_MODEL, { dtype: 'q8', device: 'cpu' })
      .then(value => { state.speech = 'ready'; return value; })
      .catch(error => { state.speech = 'error'; transcriberPromise = null; throw error; });
  }
  return transcriberPromise;
}
export function transcribe(samples) {
  const work = speechQueue.then(async () => {
    const model = await prepareSpeech();
    const output = await model(samples, { chunk_length_s: 25, stride_length_s: 4 });
    return output.text.trim();
  });
  speechQueue = work.catch(() => {});
  return work;
}
