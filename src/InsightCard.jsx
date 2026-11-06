import { useState } from 'react';
import { ArrowUpRight, EyeOff } from 'lucide-react';

export default function InsightCard({ item, review = false, onFeedback, onDelete }) {
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const practice = review && item.intent === 'practice';
  const sourceUrl = /^https?:\/\//i.test(item.source) ? item.source : null;
  const date = new Intl.DateTimeFormat('en-IE', { day: 'numeric', month: 'short' }).format(new Date(item.created_at));
  async function feedback(action) { setBusy(true); try { await onFeedback(item.id, action); } finally { setBusy(false); } }
  return <article className={`insight-card ${practice ? 'practice-card' : ''}`}>
    <div className="card-meta">{item.source_type === 'thought' ? 'Thought' : item.source_type} · {date}{practice && ' · Recall'}</div>
    {practice ? <><h2 className="insight-text">{item.question || 'Explain this idea from memory.'}</h2>{!revealed && <button className="reveal-button" onClick={() => setRevealed(true)}>Show answer</button>}</> : <p className="insight-text">{item.content}</p>}
    {practice && revealed && <p className="answer-text">{item.content}</p>}
    {(!practice || revealed) && item.audio_id && <audio controls preload="none" src={`/api/audio/${item.audio_id}`} />}
    {(!practice || revealed) && <details className="source-details"><summary>Details</summary><div>{item.note && <p className="personal-note">{item.note}</p>}{sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer">{item.source} <ArrowUpRight size={13} /></a> : <span>{item.source || 'No source added'}</span>}{item.reason && <p>{item.reason}</p>}<p>Saved {new Date(item.created_at).toLocaleString('en-IE')}</p>{!review && <button className="delete-button" onClick={() => onDelete(item.id)}>Delete</button>}</div></details>}
    {review && (!practice || revealed) && <div className="review-actions">
      <button disabled={busy} onClick={() => feedback(practice ? 'remembered' : 'used')}>{practice ? 'Remembered' : 'Done'}</button>
      <button disabled={busy} className="text-button" onClick={() => feedback(practice ? 'again' : 'later')}>{practice ? 'Again soon' : 'Later'}</button>
      <button disabled={busy} className="icon-button" aria-label="Stop resurfacing this insight" title="Stop resurfacing" onClick={() => feedback('stop')}><EyeOff size={16} /></button>
    </div>}
  </article>;
}
