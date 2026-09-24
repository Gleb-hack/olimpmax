import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronRight, ExternalLink, Globe, Plus, RotateCcw, Send, Sparkles } from 'lucide-react';
import { Dialog, Button, Notice } from '@olimp/ui';
import { isMock, type Olympiad } from '../../lib/api';
import { calendarLabels, formatDay, gradeLabel } from '../../lib/format';
import { usePlan, usePlanActions } from '../../lib/queries';
import { max } from '../../lib/max';
import { useAssistant } from './AssistantProvider';
import { MessageReveal } from './MessageReveal';
import olimpLogo from '../../assets/olimp/logo.jpg';

function ChatCard({ item }: { item: Olympiad }) {
  const plan = usePlan();
  const action = usePlanActions();
  const saved = plan.data?.items.some(entry => entry.olympiad.id === item.id);
  return <article className="chat-card">
    <h2>{item.title}</h2>
    <p className="chat-card__meta">{[item.organizers?.[0], gradeLabel(item)].filter(Boolean).join(' · ')}</p>
    <p className="chat-card__date">{item.nextEvent ? `${item.nextEvent.name || 'Этап'}: ${item.nextEvent.kind === 'ends' ? 'до' : 'с'} ${formatDay(item.nextEvent.date)}` : calendarLabels[item.calendarState]}</p>
    <div className="chat-card__actions"><Link to={`/olympiads/${item.id}`} state={{ backTo: '/olimp' }}>Подробнее<ChevronRight size={14} /></Link>
      <button type="button" disabled={saved || action.isPending || plan.isPending} onClick={() => action.mutate({ id: item.id, action: 'save' })} aria-label={saved ? `${item.title} уже в плане` : `Добавить в план: ${item.title}`}>
        {saved ? <Check size={14} /> : <Plus size={14} />}{saved ? 'В плане' : action.isPending ? 'Сохраняем…' : 'В план'}
      </button></div>
    <button type="button" className="chat-card__source" onClick={() => max.openLink(item.sourceUrl)}>Источник: {new URL(item.sourceUrl).hostname}</button>
    {action.isError && <p className="chat-card__error" role="alert">{action.error.message}</p>}
  </article>;
}

export function OlimpPage() {
  const chat = useAssistant();
  const log = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const followBottom = useRef(true);
  const [confirmReset, setConfirmReset] = useState(false);
  const hasConversation = chat.messages.some(m => m.role === 'user');
  const last = chat.messages.at(-1);
  const scrollWithReply = useCallback(() => {
    if (log.current && followBottom.current) log.current.scrollTop = log.current.scrollHeight;
  }, []);

  useLayoutEffect(() => {
    const box = log.current;
    if (box && followBottom.current) box.scrollTop = box.scrollHeight;
  }, [chat.messages, chat.pending, chat.error]);
  useEffect(() => {
    if (!field.current) return;
    field.current.style.height = 'auto';
    field.current.style.height = `${Math.min(field.current.scrollHeight, 112)}px`;
  }, [chat.draft]);
  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () => {
      document.documentElement.style.setProperty('--chat-viewport-height', `${viewport?.height ?? window.innerHeight}px`);
      document.documentElement.style.setProperty('--chat-viewport-top', `${viewport?.offsetTop ?? 0}px`);
      if (log.current && followBottom.current) log.current.scrollTop = log.current.scrollHeight;
    };
    resize(); viewport?.addEventListener('resize', resize); viewport?.addEventListener('scroll', resize);
    return () => {
      viewport?.removeEventListener('resize', resize); viewport?.removeEventListener('scroll', resize);
      document.documentElement.style.removeProperty('--chat-viewport-height');
      document.documentElement.style.removeProperty('--chat-viewport-top');
    };
  }, []);
  function send(text = chat.draft) { followBottom.current = true; void chat.send(text); }

  return <section className="olimp-chat" aria-label="Чат с Олимпом">
    <header className="chat-header"><span className="chat-avatar"><img src={olimpLogo} alt="" width={42} height={42} /></span>
      <div><h1 tabIndex={-1}>Олимп</h1><p><span className={chat.error || isMock ? 'chat-status chat-status--away' : 'chat-status'} />{chat.researching ? 'Проверяет сайты…' : chat.pending ? 'Подбирает ответ…' : isMock ? 'Чат недоступен в деморежиме' : chat.error ? 'Не удалось получить ответ' : 'ИИ-помощник по олимпиадам'}</p></div>
      {hasConversation && <button type="button" className="chat-reset" aria-label="Новый диалог" title="Новый диалог" onClick={() => setConfirmReset(true)}><RotateCcw size={18} /></button>}
    </header>
    <div className="chat-log" ref={log} role="log" aria-label="Переписка" aria-live="polite" aria-relevant="additions text" onScroll={event => {
      const element = event.currentTarget; followBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
    }}>
      <p className="chat-date">Сегодня, {new Date(chat.messages[0]!.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</p>
      {chat.messages.map(message => <div key={message.id} className={`chat-turn chat-turn--${message.role}`}>
        {message.role === 'assistant' ? <MessageReveal message={message} active={last?.id === message.id} onProgress={scrollWithReply}
          renderCard={index => <ChatCard item={message.olympiads[index]!} />}>
          {message.webSearchOffer && <div className="chat-web-offer">
            <div className="chat-web-offer__title"><Globe size={17} /><strong>Поискать в интернете?</strong></div>
            <p className="chat-web-offer__question">«{message.webSearchOffer.question}»</p>
            {message.webSearchState ? <small>{message.webSearchState === 'accepted' ? 'Поиск разрешён' : 'Поиск не запускался'}</small>
              : <div className="chat-web-offer__actions"><button type="button" disabled={chat.pending} onClick={() => { followBottom.current = true; void chat.research(message.id); }}>Да</button><button type="button" disabled={chat.pending} onClick={() => chat.decline(message.id)}>Нет</button></div>}
          </div>}
          {!!message.webSources?.length && <div className="chat-web-sources"><strong><Globe size={14} />Источники из интернета</strong><ol>{message.webSources.map((source, index) => <li key={source.url}><button type="button" onClick={() => max.openLink(source.url)}><span>{index + 1}. {source.title}</span><ExternalLink size={13} /></button><small>{new URL(source.url).hostname} · {source.kind === 'search_result' ? 'выдержка из поиска' : 'страница прочитана'} · {new Date(source.checkedAt).toLocaleDateString('ru-RU')}</small></li>)}</ol></div>}
          {message.webDisclaimer && <p className="chat-web-disclaimer">{message.webDisclaimer}</p>}
        </MessageReveal>
          : <div className="chat-bubble chat-bubble--user"><span className="sr-only">Вы: </span>{message.content}</div>}
        {message.failed && <small className="chat-failed">Ответ не получен</small>}
      </div>)}
      {!hasConversation && <div className="chat-suggestions" aria-label="Подсказки для начала разговора">
        {['Математика', 'Информатика', 'Ближайшие дедлайны'].map(text => <button type="button" key={text} onClick={() => send(text)} disabled={isMock}><Sparkles size={13} />{text}</button>)}
      </div>}
      {chat.pending && <div className="chat-pending" role="status" aria-label={chat.researching ? 'Олимп ищет информацию на сайтах' : 'Олимп готовит ответ'}><div className="chat-typing" aria-hidden="true"><span /><span /><span /></div>{chat.researching && <small>Ищу в интернете и проверяю источники…</small>}</div>}
      {chat.error && <div className="chat-error" role="alert"><p>{chat.error}</p>{last?.failed && <button type="button" disabled={chat.pending} onClick={() => { followBottom.current = true; void chat.send(last.content, last.id); }}><RotateCcw size={14} />Повторить</button>}</div>}
      {!hasConversation && <p className="chat-intro-note">Подберём варианты из каталога.<br />Если даты ещё не подтверждены, я об этом скажу.</p>}
    </div>
    <footer className="chat-footer">
      {isMock && <Notice tone="info">Для общения с Олимпом нужен сервер с подключённым ИИ.</Notice>}
      <form className="chat-composer" onSubmit={event => { event.preventDefault(); send(); }}>
        <textarea ref={field} aria-label="Сообщение Олимпу" placeholder="Написать сообщение…" rows={1} maxLength={2000} value={chat.draft} disabled={isMock}
          onChange={event => chat.setDraft(event.target.value)} onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); }
          }} />
        <button type="submit" className="chat-send" aria-label="Отправить сообщение" disabled={chat.pending || !chat.draft.trim() || isMock}><Send size={19} /></button>
      </form>
      <p className="chat-footer__hint">Сообщения обрабатывает ИИ. <Link to="/profile/privacy">О данных</Link>{chat.draft.length > 1800 && <span> · {chat.draft.length}/2000</span>}</p>
    </footer>
    {confirmReset && <Dialog title="Начать новый диалог?" onClose={() => setConfirmReset(false)}><p className="hint">Текущая переписка очистится. Сохранённые в план олимпиады останутся.</p><Button className="full-width" onClick={() => { chat.reset(); setConfirmReset(false); followBottom.current = true; }}>Новый диалог</Button><Button className="full-width dialog-cancel" variant="secondary" onClick={() => setConfirmReset(false)}>Продолжить разговор</Button></Dialog>}
  </section>;
}
