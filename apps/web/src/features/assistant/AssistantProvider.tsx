import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../../lib/api';
import { conversationHistory, isSearchConsent, isSearchDecline, welcomeMessages, type ChatMessage } from './conversation';

type ChatState = {
  messages: ChatMessage[]; draft: string; setDraft: (value: string) => void;
  pending: boolean; error: string | null; send: (text: string, retryId?: string) => Promise<void>; reset: () => void;
  researching: boolean; research: (messageId: string) => Promise<void>; decline: (messageId: string) => void;
};
const Context = createContext<ChatState | null>(null);

// Memory only: survives navigation, clears on reload or "Новый диалог".
export function AssistantProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState(welcomeMessages);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [researching, setResearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);

  async function send(value: string, retryId?: string, approvedToken?: string) {
    const text = value.trim();
    if (!text || text.length > 2000 || active.current) return;
    const latest = messages.at(-1);
    if (!retryId && !approvedToken && latest?.webSearchOffer && !latest.webSearchState && isSearchConsent(text)) {
      await research(latest.id); return;
    }
    if (!retryId && !approvedToken && latest?.webSearchOffer && !latest.webSearchState && isSearchDecline(text)) {
      const at = new Date().toISOString();
      setMessages(previous => [...previous.map(m => m.id === latest.id ? { ...m, webSearchState: 'declined' as const } : m),
        { id: crypto.randomUUID(), role: 'user', content: text, at, olympiads: [] },
        { id: crypto.randomUUID(), role: 'assistant', content: 'Хорошо, поиск не запускаю. Можем продолжить подбор по каталогу.', at, olympiads: [], revealStartedAt: Date.now() }]);
      setDraft(''); setError(null); return;
    }
    const token = approvedToken ?? (retryId ? messages.find(m => m.id === retryId)?.webSearchToken : undefined);
    const researchContext = token ? messages.find(m => m.webSearchOffer?.token === token)?.webSearchOffer?.olympiads.map(item => item.id) : undefined;
    const controller = new AbortController();
    active.current = controller;
    const id = retryId ?? crypto.randomUUID();
    const history = conversationHistory(retryId ? messages.slice(0, messages.findIndex(m => m.id === retryId)) : messages);
    setMessages(previous => retryId ? previous.map(m => m.id === retryId ? { ...m, failed: false } : m)
      : [...previous, { id, role: 'user', content: text, at: new Date().toISOString(), olympiads: [], webSearchToken: token }]);
    if (!retryId) setDraft('');
    setPending(true); setResearching(Boolean(token)); setError(null);
    try {
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(token ? 80000 : 60000)]);
      const answer = token ? await api.research(token, signal) : await api.chat({ message: text, history }, signal);
      if (active.current !== controller) return;
      setMessages(previous => [...previous, { id: crypto.randomUUID(), role: 'assistant', content: answer.message,
        olympiads: answer.olympiads, webSearchOffer: answer.webSearchOffer, webSources: answer.webSources,
        offerOnly: answer.offerOnly, contextOlympiadIds: researchContext,
        webDisclaimer: answer.webDisclaimer, at: new Date().toISOString(), revealStartedAt: Date.now() }]);
    } catch (cause) {
      if (active.current !== controller) return;
      setMessages(previous => previous.map(m => m.id === id ? { ...m, failed: true } : m));
      setError(cause instanceof Error && cause.name !== 'TimeoutError' && cause.name !== 'AbortError'
        ? cause.message : 'Олимп не успел ответить. Попробуйте ещё раз.');
    } finally {
      if (active.current === controller) { active.current = null; setPending(false); setResearching(false); }
    }
  }
  function reset() {
    active.current?.abort(); active.current = null;
    setMessages(welcomeMessages()); setDraft(''); setError(null); setPending(false); setResearching(false);
  }
  async function research(messageId: string) {
    const message = messages.find(m => m.id === messageId);
    if (!message?.webSearchOffer || message.webSearchState || active.current) return;
    setMessages(previous => previous.map(m => m.id === messageId ? { ...m, webSearchState: 'accepted' } : m));
    await send('Да, поищи в интернете.', undefined, message.webSearchOffer.token);
  }
  function decline(messageId: string) {
    setMessages(previous => previous.map(m => m.id === messageId ? { ...m, webSearchState: 'declined' } : m));
  }
  return <Context.Provider value={{ messages, draft, setDraft, pending, researching, error, send, reset, research, decline }}>{children}</Context.Provider>;
}
export function useAssistant() {
  const value = useContext(Context);
  if (!value) throw new Error('AssistantProvider is missing');
  return value;
}
