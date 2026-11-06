import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Search, X, LoaderCircle, Settings2, Library, Plus, Waves } from 'lucide-react';
import Capture from './Capture';
import InsightCard from './InsightCard';
import Pensieve from './Pensieve';
import { api, post } from './api';
import './styles.css';

const examples = [
  { content: 'Before offering advice, ask whether the person wants help solving the problem or simply someone to listen.', note: 'Try this when a friend is having a difficult day.', source: 'Example insight · created to explore the app', source_type: 'thought', intent: 'revisit' },
  { content: 'Authentication verifies your identity. Authorization determines which resources and actions you can access.', note: 'A useful distinction when designing access controls.', source: 'Example technical note · not a book quotation', source_type: 'thought', intent: 'practice', question: 'How do authentication and authorization differ?' },
  { content: 'Make the first step of a new habit small enough to do even on a low-energy day. Put the cue somewhere you will actually notice it.', note: 'For keeping a regular reading routine.', source: 'Example insight · created to explore the app', source_type: 'thought', intent: 'revisit' }
];
function App() {
  const [tab, setTab] = useState('review');
  const [review, setReview] = useState([]);
  const [library, setLibrary] = useState([]);
  const [results, setResults] = useState(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [settings, setSettings] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const toastTimer = useRef(null);
  const searchGeneration = useRef(0);
  const pendingReviews = useRef(new Set());
  const dialog = useRef(null);
  const [online, setOnline] = useState(navigator.onLine);
  function notify(message) { setToast(message); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 4500); }
  async function refresh() {
    try {
      const [r, l, s] = await Promise.all([api('/review'), api('/insights'), api('/status')]);
      pendingReviews.current = new Set(r.map(item => item.id));
      setReview(r.length ? r : l.filter(item => item.intent !== 'reference' && item.review_enabled !== 0));
      setLibrary(l); setStatus(s); setError('');
    }
    catch (err) { setError(err.message); } finally { setLoading(false); }
  }
  useEffect(() => {
    refresh();
    const poll = setInterval(() => api('/status').then(setStatus).catch(() => {}), 5000);
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener('online', updateOnline); window.addEventListener('offline', updateOnline);
    return () => { clearInterval(poll); clearTimeout(toastTimer.current); window.removeEventListener('online', updateOnline); window.removeEventListener('offline', updateOnline); };
  }, []);
  useEffect(() => { if (settings) dialog.current?.showModal(); else dialog.current?.close(); }, [settings]);
  async function find(event, text = query) {
    event?.preventDefault(); const generation = ++searchGeneration.current;
    setQuery(text); setSearching(true); setError('');
    try { const result = await api(`/search?q=${encodeURIComponent(text)}`); if (generation === searchGeneration.current) setResults({ ...result, query: text }); }
    catch (err) { if (generation === searchGeneration.current) setError(err.message); }
    finally { if (generation === searchGeneration.current) setSearching(false); }
  }
  async function feedback(id, action) {
    // Re-reading a completed loop does not count as another scheduled review.
    if ((action === 'used' || action === 'remembered') && !pendingReviews.current.has(id)) return true;
    try { await post(`/insights/${id}/review`, { action }); }
    catch (err) { setError(err.message); return false; }
    pendingReviews.current.delete(id);
    setError('');
    if (action === 'stop' || action === 'again' || action === 'later') notify(action === 'stop' ? 'Removed from reviews.' : 'Back tomorrow.');
    try { const [l, s] = await Promise.all([api('/insights'), api('/status')]); setLibrary(l); setStatus(s); }
    catch (err) { setError(err.message); }
    if (action === 'stop' || action === 'again' || action === 'later') setReview(old => old.filter(item => item.id !== id));
    return true;
  }
  async function remove(id) {
    if (!window.confirm('Delete this insight and its search index? This cannot be undone.')) return;
    try { await api(`/insights/${id}`, { method: 'DELETE' }); setResults(null); await refresh(); notify('Deleted.'); }
    catch (err) { setError(err.message); }
  }
  async function addExamples() {
    setLoading(true);
    try { for (const item of examples) await post('/insights', item); await refresh(); setSettings(false); notify('Examples added.'); }
    catch (err) { setError(err.message); setLoading(false); }
  }
  const nav = [['review','Return', Waves],['find','Collection', Library],['save','Save', Plus]];
  const items = results ? results.results : library;
  return <div className={`app-shell ${tab === 'review' ? 'return-view' : ''}`}>
    <header className="app-header">
      <span className="brand"><span className="brand-ripple" aria-hidden="true" />ripple</span>
      <button className="icon-button" onClick={() => setSettings(true)} aria-label="Settings"><Settings2 size={17} /></button>
    </header>
    <nav className="navigation" aria-label="Main navigation">
      {nav.map(([id,label, Icon]) => <button key={id} disabled={capturing && id !== tab} className={tab === id ? 'active' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => { setTab(id); setError(''); }}><Icon size={19} strokeWidth={1.5} /><span>{label}</span></button>)}
    </nav>
    <main className="main" aria-label={nav.find(([id]) => id === tab)[1]}>
      {!online && <div className="notice">Offline. Your draft is saved on this device.</div>}
      {error && <div className="error" role="alert">{error} <button className="text-button" onClick={refresh}>Try again</button></div>}
      {tab === 'review' && <Pensieve items={review} loading={loading} empty={library.length === 0} onFeedback={feedback} onSave={() => setTab('save')} />}
      {tab === 'save' && <Capture onSaved={refresh} notify={notify} onCapturingChange={setCapturing} />}
      {tab === 'find' && <>
        <form className="search-form" onSubmit={find}>
          <label className="sr-only" htmlFor="search">Ask your collection</label>
          <input id="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search or ask a question…" maxLength={1000} />
          <button type="submit" className="icon-button" aria-label="Search" disabled={searching}>{searching ? <LoaderCircle className="spin" size={18} /> : <Search size={18} />}</button>
        </form>
        {status && (status.pending > 0 || status.models.embeddings === 'loading') && <p className="notice">Preparing meaning search…</p>}
        {results?.mode === 'text' && <p className="notice">Meaning search unavailable. Showing wording matches.</p>}
        <div className="section-line">{items.length} {results?.query.trim() ? items.length === 1 ? 'result' : 'results' : 'saved'}</div>
        {searching ? <div className="loading">Searching…</div>
        : items.length ? <div className="library-grid">{items.map(item => <InsightCard key={item.id} item={item} onDelete={remove} />)}</div>
        : <div className="empty-state"><h1>{library.length ? 'No results.' : 'Nothing saved yet.'}</h1><button className="text-button" onClick={() => { if (library.length) { setQuery(''); setResults(null); } else setTab('save'); }}>{library.length ? 'View all' : 'Save an insight'}</button></div>}
      </>}
    </main>
    <div className={`toast ${toast ? 'visible' : ''}`} role="status" aria-live="polite">{toast}</div>
    <dialog ref={dialog} onCancel={() => setSettings(false)} className="settings-dialog">
      <div className="dialog-top"><h2>Settings</h2><button className="icon-button" onClick={() => setSettings(false)} aria-label="Close settings"><X size={18} /></button></div>
      <p>{status?.total ?? 0} insights saved.</p>
      {!!status?.failed && <button onClick={async () => { try { await post('/index/retry', {}); notify('Retrying indexing.'); await refresh(); } catch (err) { setError(err.message); } }}>Retry search indexing</button>}
      {library.length === 0 && <button className="text-button" disabled={loading} onClick={addExamples}>Add sample insights</button>}
      {status?.authEnabled && <form method="post" action="/logout"><button className="text-button" type="submit">Sign out</button></form>}
    </dialog>
  </div>;
}
createRoot(document.getElementById('root')).render(<App />);
if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
