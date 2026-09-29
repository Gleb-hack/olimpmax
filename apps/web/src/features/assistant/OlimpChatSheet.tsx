import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Dialog, Button, Notice, Icon } from '@olimp/ui';
import { isMock, type Olympiad } from '../../lib/api';
import { max } from '../../lib/max';
import { useAssistant } from './AssistantProvider';
import { MessageReveal } from './MessageReveal';
import { chatCardMeta } from './chat-card-format';
import { olimpChatPath } from './chat-route';
import { useBottomSheet } from './bottom-sheet';
import olimpAvatar from '../../assets/olimp/avatar.webp';

const sourceKinds = { page: 'страница прочитана', pdf: 'документ прочитан', faq: 'база «Вопросы по олимпиадам»' } as const;
const sourceKind = (kind?: keyof typeof sourceKinds) => sourceKinds[kind ?? 'page'];

/** Figma «Олимп» (177:309): title, «организатор · срок» and «Подробнее ›». Saving happens on the olympiad page. */
function ChatCard({ item }: { item: Olympiad }) {
  const meta = chatCardMeta(item);
  return <article className="chat-card">
    <h2>{item.title}</h2>
    {meta && <p className="chat-card__meta">{meta}</p>}
    <Link className="chat-card__more" to={`/olympiads/${item.id}`} state={{ backTo: olimpChatPath }} aria-label={`Подробнее: ${item.title}`}>Подробнее<Icon name="chevron-right" size={15} /></Link>
  </article>;
}

/**
 * Figma «🗂️ Чат Олимпа (bottom sheet)» (1206:1404): the whole chat of the former «Олимп» page in a sheet over the overview.
 * The conversation lives in AssistantProvider, so closing the sheet keeps it.
 */
export function OlimpChatSheet({ onClose }: { onClose: () => void }) {
  const chat = useAssistant();
  const heading = useRef<HTMLHeadingElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const followBottom = useRef(true);
  // The heading, not the text field, gets the focus: focusing the field would open the keyboard at once.
  const sheet = useBottomSheet(onClose, heading);
  const [confirmReset, setConfirmReset] = useState(false);
  const titleId = useId();
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
  // The sheet follows the visible viewport, so the composer stays above the on-screen keyboard.
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

  const status = chat.researching ? 'Ищет в интернете…' : chat.pending ? 'Подбирает ответ…' : isMock ? 'Чат недоступен в деморежиме'
    : chat.error ? 'Не удалось получить ответ' : 'на связи · отвечает быстро';
  return <dialog {...sheet.dialogProps} className={`chat-sheet ${sheet.closing ? 'is-closing' : ''}`} aria-labelledby={titleId}>
    <section className={`chat-sheet__panel olimp-chat ${sheet.dragging ? 'is-dragging' : ''}`} style={sheet.panelStyle}>
      <div className="chat-sheet__top" {...sheet.dragProps}>
        <span className="chat-sheet__handle" aria-hidden="true" />
        <header className="chat-sheet__header">
          <img className="chat-sheet__avatar" src={olimpAvatar} alt="" width={38} height={38} />
          <div className="chat-sheet__title"><h2 id={titleId} ref={heading} tabIndex={-1}>Олимп</h2><p>{status}</p></div>
          {hasConversation && <button type="button" className="chat-sheet__icon-button" aria-label="Новый диалог" title="Новый диалог" onClick={() => setConfirmReset(true)}><Icon name="rotate-ccw" size={16} /></button>}
          <button type="button" className="chat-sheet__icon-button chat-sheet__close" aria-label="Закрыть чат" onClick={sheet.close}><Icon name="x" size={14} /></button>
        </header>
      </div>
      <div className="chat-log" ref={log} role="log" aria-label="Переписка" aria-live="polite" aria-relevant="additions text" onScroll={event => {
        const element = event.currentTarget; followBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
      }}>
        {chat.messages.map(message => <div key={message.id} className={`chat-turn chat-turn--${message.role}`}>
          {message.role === 'assistant' ? <MessageReveal message={message} active={last?.id === message.id} onProgress={scrollWithReply}
            renderCard={index => <ChatCard item={message.olympiads[index]!} />}>
            {message.webSearch && message.webSearchState === 'failed' && <div className="chat-web-status"><Icon name="globe" size={15} /><span>Поиск в интернете не завершился</span>
              <button type="button" disabled={chat.pending} onClick={() => { followBottom.current = true; void chat.retryResearch(message.id); }}><Icon name="rotate-ccw" size={13} />Повторить поиск</button></div>}
            {!!message.webSources?.length && <div className="chat-web-sources"><strong><Icon name={message.webSources.every(s => s.kind === 'faq') ? 'book' : 'globe'} size={14} />{message.webSources.every(s => s.kind === 'faq') ? 'Источники' : 'Источники из интернета'}</strong><ol>{message.webSources.map((source, index) => <li key={source.url}><button type="button" onClick={() => max.openExternal(source.url)}><span>{index + 1}. {source.title}</span><Icon name="external-link" size={13} /></button><small>{new URL(source.url).hostname} · {sourceKind(source.kind)} · {new Date(source.checkedAt).toLocaleDateString('ru-RU')}</small></li>)}</ol></div>}
            {message.webDisclaimer && <p className="chat-web-disclaimer">{message.webDisclaimer}</p>}
          </MessageReveal>
            : <div className="chat-bubble chat-bubble--user"><span className="sr-only">Вы: </span>{message.content}</div>}
          {message.failed && <small className="chat-failed">Ответ не получен</small>}
        </div>)}
        {!hasConversation && <div className="chat-suggestions" aria-label="Подсказки для начала разговора">
          {['Математика', 'Информатика', 'Ближайшие дедлайны'].map(text => <button type="button" key={text} onClick={() => send(text)} disabled={isMock}><Icon name="sparkle" size={13} />{text}</button>)}
        </div>}
        {chat.pending && <div className="chat-pending" role="status" aria-label={chat.researching ? 'Олимп ищет информацию в интернете' : 'Олимп готовит ответ'}><div className="chat-typing" aria-hidden="true"><span /><span /><span /></div>{chat.researching && <small>Открываю сайты вузов и организаторов, читаю правила…</small>}</div>}
        {chat.error && <div className="chat-error" role="alert"><p>{chat.error}</p>{last?.role === 'user' && last.failed && <button type="button" disabled={chat.pending} onClick={() => { followBottom.current = true; void chat.send(last.content, last.id); }}><Icon name="rotate-ccw" size={14} />Повторить</button>}</div>}
      </div>
      <footer className="chat-footer">
        {isMock && <Notice tone="info">Для общения с Олимпом нужен сервер с подключённым ИИ.</Notice>}
        <form className="chat-composer" onSubmit={event => { event.preventDefault(); send(); }}>
          <textarea ref={field} aria-label="Сообщение Олимпу" placeholder="Написать сообщение…" rows={1} maxLength={2000} value={chat.draft} disabled={isMock}
            onChange={event => chat.setDraft(event.target.value)} onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); }
            }} />
          <button type="submit" className="chat-send" aria-label="Отправить сообщение" disabled={chat.pending || !chat.draft.trim() || isMock}><Icon name="send" size={14} /></button>
        </form>
        <p className="chat-footer__hint">Сообщения обрабатывает ИИ. <Link to="/profile/privacy">О данных</Link>{chat.draft.length > 1800 && <span> · {chat.draft.length}/2000</span>}</p>
      </footer>
    </section>
    {confirmReset && <Dialog title="Начать новый диалог?" onClose={() => setConfirmReset(false)}><p className="hint">Текущая переписка очистится. Сохранённые в план олимпиады останутся.</p><Button className="full-width" onClick={() => { chat.reset(); setConfirmReset(false); followBottom.current = true; }}>Новый диалог</Button><Button className="full-width dialog-cancel" variant="secondary" onClick={() => setConfirmReset(false)}>Продолжить разговор</Button></Dialog>}
  </dialog>;
}
