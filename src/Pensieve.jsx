import { useRef, useState } from 'react';
import { ArrowDown, ArrowUpRight, Check, ChevronRight } from 'lucide-react';

import MemoryBasin from './MemoryBasin';

export default function Pensieve({ items, loading, empty, onFeedback, onSave }) {
  const [busy, setBusy] = useState(false);
  const [revealedId, setRevealedId] = useState(null);
  const [cursor, setCursor] = useState({ index: 0, visit: 0 });
  const submitting = useRef(false);
  const index = Math.min(cursor.index, Math.max(0, items.length - 1));
  const item = items[index];
  const practice = item?.intent === 'practice';
  const revealed = !practice || revealedId === item?.id;
  const sourceUrl = /^https?:\/\//i.test(item?.source) ? item.source : null;
  async function next(action) {
    if (submitting.current || !item) return;
    submitting.current = true;
    setBusy(true);
    try {
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) await new Promise(resolve => setTimeout(resolve, 650));
      const success = await onFeedback(item.id, action);
      if (success) {
        const removed = action === 'stop' || action === 'again' || action === 'later';
        setCursor(previous => ({ index: removed ? index % Math.max(1, items.length - 1) : (index + 1) % items.length, visit: previous.visit + 1 }));
        setRevealedId(null);
      }
    } finally { submitting.current = false; setBusy(false); }
  }
  const basinAction = () => practice && !revealed ? setRevealedId(item.id) : next(practice ? 'remembered' : 'used');
  const date = new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  return <section className={`pensieve ${busy ? 'is-changing' : ''}`} aria-label="Your thoughts">
    <div className="ritual-heading"><span>{date}</span><span className="daily-progress" aria-label={items.length ? `Thought ${index + 1} of ${items.length}` : 'No thoughts to revisit'}>{items.length <= 7 ? items.map((entry, i) => <i key={entry.id} className={i === index ? 'current' : ''} />) : <span>{index + 1} / {items.length}</span>}</span></div>
    <div className="thought-space" aria-live="polite" aria-busy={busy || loading}>
      {loading ? <div className="ritual-empty"><p className="thought-caption">A quiet moment…</p></div>
      : item ? <article className={`floating-thought ${item.content.length > 380 ? 'long-thought' : ''}`} key={`${item.id}-${cursor.visit}`}>
        <p className="thought-text">{practice && !revealed ? item.question || 'What do you remember about this idea?' : item.content}</p>
        {revealed && <>
          <details className="thought-context"><summary>Stay with this thought <ChevronRight size={13} /></summary><div>
            <p className="muted">Saved {new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' }).format(new Date(item.created_at))}</p>
            {item.note && <p>{item.note}</p>}
            {item.source && <p>{sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer">{item.source} <ArrowUpRight size={12} /></a> : item.source}</p>}
            {item.audio_id && <audio controls preload="none" src={`/api/audio/${item.audio_id}`} />}
            <p>{item.reason}</p>
            <div className="thought-options"><button className="text-button" disabled={busy} onClick={() => next(practice ? 'again' : 'later')}>Bring back tomorrow</button><button className="text-button" disabled={busy} onClick={() => next('stop')}>Stop resurfacing</button></div>
          </div></details>
        </>}
      </article>
      : <div className="ritual-empty">
        <span className="quiet-symbol" aria-hidden="true">{empty ? <ArrowDown size={22} strokeWidth={1} /> : <Check size={24} strokeWidth={1} />}</span>
        <h1>{empty ? 'Some things are worth\ncoming back to.' : 'Let it settle.'}</h1>
        <p>{empty ? 'A phrase. A lesson. A thought you don’t want to lose. Leave it here for another day.' : 'That’s everything for today. Take a little of it with you.'}</p>
        {empty && <button className="text-button empty-link" onClick={onSave}>Save your first thought <ChevronRight size={14} /></button>}
      </div>}
    </div>
    <div className="basin-space">
      <div className="thought-thread" aria-hidden="true" />
      <svg className="memory-wisp" viewBox="0 0 100 200" fill="none" aria-hidden="true"><path d="M50 200C-15 156 112 135 50 97C-8 61 95 35 50 0" /><path d="M50 200C106 157 6 125 50 97C104 63 20 37 50 0" /></svg>
      <MemoryBasin stirring={busy} onClick={basinAction} disabled={!item || busy || loading} label={practice && !revealed ? 'Reveal this thought' : 'Let this thought settle and continue'} />
      <div className="basin-invitation">{item ? <>
        <button className="basin-label" disabled={busy} onClick={basinAction}>{busy ? 'Letting it settle…' : practice && !revealed ? 'Touch the water to remember' : items.length > 1 ? 'Let it settle. Meet the next thought.' : 'Let it settle. Read it again.'}</button>
        <p>One thought at a time. Stay as long as you like.</p>
      </> : <p>{loading ? '' : empty ? 'A little space for what stays with you.' : 'You can leave the water still.'}</p>}</div>
    </div>
  </section>;
}
