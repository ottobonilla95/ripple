import { useEffect, useRef, useState } from 'react';
import { Mic, Square, LoaderCircle, RotateCcw } from 'lucide-react';
import { api, post } from './api';

const initial = { content: '', title: '', note: '', source: '', source_type: 'thought', intent: 'revisit', question: '', audio_id: null };
function readDraft() {
  try { return { ...initial, ...JSON.parse(localStorage.getItem('commonplace-draft') || '{}') }; }
  catch { return initial; }
}
export default function Capture({ onSaved, notify, onCapturingChange }) {
  const [draft, setDraft] = useState(readDraft);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [audio, setAudio] = useState(() => draft.audio_id ? { id: draft.audio_id, url: `/api/audio/${draft.audio_id}` } : null);
  const [error, setError] = useState('');
  const recorder = useRef(null);
  const stream = useRef(null);
  const mounted = useRef(true);
  const timer = useRef(null);
  const pendingBlob = useRef(null);
  const audioId = useRef(draft.audio_id);
  const blobUrl = useRef(null);
  const audioContext = useRef(null);
  const transcriptionGeneration = useRef(0);

  useEffect(() => { try { localStorage.setItem('commonplace-draft', JSON.stringify(draft)); } catch {} }, [draft]);
  useEffect(() => { onCapturingChange(recording || !!busy); return () => onCapturingChange(false); }, [recording, busy, onCapturingChange]);
  useEffect(() => {
    const preventLoss = event => { if (recording || busy || audio) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', preventLoss);
    return () => window.removeEventListener('beforeunload', preventLoss);
  }, [recording, busy, audio]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      transcriptionGeneration.current++;
      if (recorder.current?.state === 'recording') recorder.current.stop();
      stream.current?.getTracks().forEach(track => track.stop());
      clearInterval(timer.current);
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
      audioContext.current?.close().catch(() => {});
    };
  }, []);
  function field(name, value) { setDraft(old => ({ ...old, [name]: value })); }

  async function processAudio(blob, id = null) {
    const generation = ++transcriptionGeneration.current;
    setBusy('Transcribing…'); setError('');
    try {
      if (!blob && id) {
        const response = await fetch(`/api/audio/${id}`);
        if (!response.ok) throw new Error('Could not load the saved recording.');
        blob = await response.blob(); pendingBlob.current = blob;
      }
      if (!id) {
        const result = await api('/audio', { method: 'POST', body: blob, headers: { 'Content-Type': blob.type || 'audio/webm' } });
        id = result.id; audioId.current = id;
        if (mounted.current) {
          setAudio({ id, url: `/api/audio/${id}` });
          setDraft(old => ({ ...old, audio_id: id }));
        }
      }
      const context = audioContext.current || new AudioContext();
      audioContext.current = context;
      const decoded = await context.decodeAudioData(await blob.arrayBuffer());
      const offline = new OfflineAudioContext(1, Math.min(16000 * 120, Math.ceil(decoded.duration * 16000)), 16000);
      const source = offline.createBufferSource(); source.buffer = decoded; source.connect(offline.destination); source.start();
      const buffer = await offline.startRendering();
      const samples = buffer.getChannelData(0);
      const result = await api(`/audio/${id}/transcribe`, { method: 'POST', body: samples.buffer, headers: { 'Content-Type': 'application/octet-stream' } });
      if (mounted.current && generation === transcriptionGeneration.current) {
        setDraft(old => ({ ...old, content: [old.content, result.text].filter(Boolean).join('\n\n'), source_type: 'voice' }));
        if (!result.text) setError('No speech was detected. You can listen back and add a written note.');
      }
    } catch (err) { if (mounted.current) setError(`${err.message} You can also type a note and keep the recording.`); }
    finally { if (mounted.current && generation === transcriptionGeneration.current) setBusy(''); }
  }
  async function removeRecording() {
    try {
      if (audioId.current) await api(`/audio/${audioId.current}`, { method: 'DELETE' });
      setAudio(null); audioId.current = null; pendingBlob.current = null;
      setDraft(old => ({ ...old, audio_id: null }));
    } catch (err) { setError(err.message); }
  }
  async function startRecording() {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError('Recording needs a supported browser over HTTPS (or localhost on this Mac). You can still type or paste an insight.'); return;
    }
    try {
      // Create the audio context during the tap so iOS can unlock it before later decoding.
      audioContext.current ||= new AudioContext();
      await audioContext.current.resume();
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      const mime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
      const rec = new MediaRecorder(media, mime ? { mimeType: mime } : undefined);
      const pieces = [];
      rec.ondataavailable = event => { if (event.data.size) pieces.push(event.data); };
      rec.onerror = () => {
        media.getTracks().forEach(track => track.stop()); clearInterval(timer.current);
        if (mounted.current) { setRecording(false); setError('The recording was interrupted. Please try again.'); }
      };
      rec.onstop = () => {
        clearInterval(timer.current); media.getTracks().forEach(track => track.stop());
        if (!mounted.current) return;
        setRecording(false);
        const blob = new Blob(pieces, { type: rec.mimeType || mime || 'audio/webm' });
        pendingBlob.current = blob; audioId.current = null;
        if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
        blobUrl.current = URL.createObjectURL(blob); setAudio({ url: blobUrl.current });
        processAudio(blob);
      };
      recorder.current = rec; rec.start(1000); setRecording(true); setSeconds(0);
      let elapsed = 0;
      timer.current = setInterval(() => { elapsed++; setSeconds(elapsed); if (elapsed >= 120 && rec.state === 'recording') rec.stop(); }, 1000);
    } catch (err) {
      stream.current?.getTracks().forEach(track => track.stop());
      setError(err.name === 'NotAllowedError' ? 'Microphone access wasn’t allowed. Enable it in your browser settings, or type your insight.' : 'Could not start the microphone. Please try again.');
    }
  }
  async function save(event) {
    event.preventDefault(); setError(''); setBusy('Saving…');
    try {
      const item = await post('/insights', { ...draft, audio_id: audioId.current });
      setDraft(initial); setAudio(null); audioId.current = null; pendingBlob.current = null;
      onSaved(item); notify('Saved.');
    } catch (err) { setError(err.message); }
    finally { setBusy(''); }
  }
  return <form onSubmit={save} className="capture-form">
      <label className="sr-only" htmlFor="content">Your insight</label>
      <textarea id="content" className="main-input" placeholder="Write or paste an insight…" required maxLength={50000} value={draft.content} onChange={e => field('content', e.target.value)} />
      <div className="capture-toolbar">
        <button type="button" className={`record-button ${recording ? 'recording' : ''}`} disabled={!!busy || !!audio} onClick={() => recording ? recorder.current?.stop() : startRecording()}>
          {recording ? <Square size={15} fill="currentColor" /> : <Mic size={16} />} {recording ? `Stop · ${seconds}s` : 'Record'}
        </button>
        <span className="capture-status" role="status">{recording ? 'Keep this screen open' : busy}</span>
        <button className="primary" aria-label="Save insight" disabled={!!busy || recording || !draft.content.trim()} type="submit">{busy && <LoaderCircle className="spin" size={15} />} Save</button>
      </div>
      {audio && <div className="audio-draft"><audio controls src={audio.url} /><div className="button-row">
        <button type="button" className="text-button" disabled={!!busy} onClick={() => processAudio(pendingBlob.current, audioId.current)}><RotateCcw size={14} /> Retry transcription</button>
        <button type="button" className="text-button" disabled={!!busy} onClick={removeRecording}>Remove recording</button>
      </div><p className="muted tiny">Check the transcript before saving.</p></div>}
      <details className="capture-details">
        <summary>Details</summary>
        <div className="capture-fields">
        <label>Note<input maxLength={2000} value={draft.note} onChange={e => field('note', e.target.value)} placeholder="Why it matters" /></label>
        <label>Source<input value={draft.source} maxLength={2000} onChange={e => field('source', e.target.value)} placeholder="Link, book page, or timestamp" /></label>
        <label>From<select value={draft.source_type} onChange={e => field('source_type', e.target.value)}><option value="thought">My own thought</option><option value="newsletter">Newsletter</option><option value="book">Book</option><option value="audiobook">Audiobook</option><option value="article">Article</option><option value="voice">Voice note</option></select></label></div>
        <label>Return<select value={draft.intent} onChange={e => field('intent', e.target.value)}><option value="revisit">Review occasionally</option><option value="practice">Practise recall</option><option value="reference">Search only</option></select></label>
        {draft.intent === 'practice' && <label>Recall question<input maxLength={500} value={draft.question} onChange={e => field('question', e.target.value)} placeholder="What would you like to recall?" /></label>}
      </details>
      {error && <p className="error" role="alert">{error}</p>}
    </form>;
}
