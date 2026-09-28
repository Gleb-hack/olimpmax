import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../../lib/api';
import { conversationHistory, welcomeMessages, type ChatMessage } from './conversation';

type ChatState = {
  messages: ChatMessage[]; draft: string; setDraft: (value: string) => void;
  pending: boolean; error: string | null; send: (text: string, retryId?: string) => Promise<void>; reset: () => void;
  researching: boolean; retryResearch: (messageId: string) => Promise<void>;
};
const Context = createContext<ChatState | null>(null);
const failure = (cause: unknown, fallback: string) =>
  cause instanceof Error && cause.name !== 'TimeoutError' && cause.name !== 'AbortError' ? cause.message : fallback;

// Memory only: survives navigation, clears on reload or "Новый диалог".
export function AssistantProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState(welcomeMessages);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [researching, setResearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);

  /**
   * The chat answered «не нашёл в базе — сейчас поищу в интернете»: search right away and append the result.
   * Called in the same request cycle, so the input stays locked until the web answer arrives.
   */
  async function runResearch(message: ChatMessage, controller: AbortController) {
    if (!message.webSearch) return;
    setResearching(true);
    setMessages(previous => previous.map(m => m.id === message.id ? { ...m, webSearchState: 'running' } : m));
    try {
      const answer = await api.research(message.webSearch.token, AbortSignal.any([controller.signal, AbortSignal.timeout(110000)]));
      if (active.current !== controller) return;
      setMessages(previous => [...previous.map(m => m.id === message.id ? { ...m, webSearchState: 'done' as const } : m),
        { id: crypto.randomUUID(), role: 'assistant', content: answer.message, olympiads: answer.olympiads, webSources: answer.webSources,
          webDisclaimer: answer.webDisclaimer, contextOlympiadIds: message.webSearch!.olympiadIds, at: new Date().toISOString(), revealStartedAt: Date.now() }]);
    } catch (cause) {
      if (active.current !== controller) return;
      setMessages(previous => previous.map(m => m.id === message.id ? { ...m, webSearchState: 'failed' } : m));
      setError(failure(cause, 'Поиск в интернете не успел завершиться. Попробуй ещё раз.'));
    }
  }

  async function send(value: string, retryId?: string) {
    const text = value.trim();
    if (!text || text.length > 2000 || active.current) return;
    const controller = new AbortController();
    active.current = controller;
    const id = retryId ?? crypto.randomUUID();
    const history = conversationHistory(retryId ? messages.slice(0, messages.findIndex(m => m.id === retryId)) : messages);
    setMessages(previous => retryId ? previous.map(m => m.id === retryId ? { ...m, failed: false } : m)
      : [...previous, { id, role: 'user', content: text, at: new Date().toISOString(), olympiads: [] }]);
    if (!retryId) setDraft('');
    setPending(true); setResearching(false); setError(null);
    try {
      const answer = await api.chat({ message: text, history }, AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]));
      if (active.current !== controller) return;
      const reply: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: answer.message,
        olympiads: answer.olympiads, webSearch: answer.webSearch, webSources: answer.webSources,
        webDisclaimer: answer.webDisclaimer, at: new Date().toISOString(), revealStartedAt: Date.now() };
      setMessages(previous => [...previous, reply]);
      await runResearch(reply, controller);
    } catch (cause) {
      if (active.current !== controller) return;
      setMessages(previous => previous.map(m => m.id === id ? { ...m, failed: true } : m));
      setError(failure(cause, 'Олимп не успел ответить. Попробуйте ещё раз.'));
    } finally {
      if (active.current === controller) { active.current = null; setPending(false); setResearching(false); }
    }
  }
  async function retryResearch(messageId: string) {
    const message = messages.find(m => m.id === messageId);
    if (!message?.webSearch || message.webSearchState !== 'failed' || active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setPending(true); setError(null);
    try { await runResearch(message, controller); }
    finally { if (active.current === controller) { active.current = null; setPending(false); setResearching(false); } }
  }
  function reset() {
    active.current?.abort(); active.current = null;
    setMessages(welcomeMessages()); setDraft(''); setError(null); setPending(false); setResearching(false);
  }
  return <Context.Provider value={{ messages, draft, setDraft, pending, researching, error, send, reset, retryResearch }}>{children}</Context.Provider>;
}
export function useAssistant() {
  const value = useContext(Context);
  if (!value) throw new Error('AssistantProvider is missing');
  return value;
}
