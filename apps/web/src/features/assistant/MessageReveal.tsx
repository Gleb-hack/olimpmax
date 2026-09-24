import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import type { ChatMessage } from './conversation';

export function revealTiming(text: string, cardCount: number) {
  const duration = Math.min(4800, Math.max(280, Array.from(text).length * 18));
  return { duration, total: duration + cardCount * 240 + 360 };
}

export function MessageReveal({ message, active, renderCard, children, onProgress }: {
  message: ChatMessage; active: boolean; renderCard: (index: number) => ReactNode;
  children?: ReactNode; onProgress: () => void;
}) {
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [clock, setClock] = useState(Date.now);
  const glyphs = useMemo(() => Array.from(new Intl.Segmenter('ru', { granularity: 'grapheme' }).segment(message.content), s => s.segment), [message.content]);
  const { duration, total } = message.offerOnly ? { duration: 0, total: 0 } : revealTiming(message.content, message.olympiads.length);
  const elapsed = active && !reducedMotion && message.revealStartedAt ? Math.max(0, clock - message.revealStartedAt) : total;
  const typing = elapsed < duration;
  const text = typing ? glyphs.slice(0, Math.max(1, Math.floor(glyphs.length * elapsed / duration))).join('') : message.content;
  const cards = typing ? 0 : Math.min(message.olympiads.length, 1 + Math.floor((elapsed - duration) / 240));
  const done = elapsed >= total;

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReducedMotion(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (done) return;
    const timer = window.setInterval(() => setClock(Date.now()), 30);
    return () => window.clearInterval(timer);
  }, [done]);
  useLayoutEffect(() => { onProgress(); }, [text, cards, done, onProgress]);

  return <>
    {!message.offerOnly && <div className={`chat-bubble chat-bubble--assistant ${typing ? 'is-typing' : ''}`}>
      <span className="sr-only">Олимп: {message.content}</span>
      <span aria-hidden="true">{text}{typing && <span className="chat-caret" />}</span>
    </div>}
    {message.olympiads.slice(0, cards).map((item, index) => <div key={item.id} className={`chat-card-reveal ${!done && !reducedMotion ? 'is-entering' : ''}`}>{renderCard(index)}</div>)}
    {done && children}
  </>;
}
