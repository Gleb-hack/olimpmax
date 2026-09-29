import { useId, useRef } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Button, Icon, Loading, Notice } from '@olimp/ui';
import { api, isMock } from '../../lib/api';
import { useProfile } from '../../lib/profile';
import { usePlan } from '../../lib/queries';
import { OlympiadCard } from '../catalog/OlympiadCard';
import { useAssistant } from './AssistantProvider';
import { useBottomSheet } from './bottom-sheet';
import { olimpPicksPath, useOlimpChatRoute } from './chat-route';
import { hasGoalIn, hasPreferences, morePicks, morePicksQuery } from './overview-format';
import olimpAvatar from '../../assets/olimp/avatar.webp';

const refinePrompt = 'Подбери ещё олимпиады под мою цель и профиль, которых нет в моём плане, и объясни, чем каждая полезна.';

/**
 * «Ещё варианты» from «Подобрано для тебя»: a sheet in the style of the Olimp chat with the rest of the same selection
 * (the catalog ordered by the goal or the profile), page by page. «Уточнить с Олимпом» continues in the real chat.
 */
export function MorePicksSheet({ shownIds, onClose }: { shownIds: number[]; onClose: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const sheet = useBottomSheet(onClose, heading);
  const titleId = useId();
  const { profile } = useProfile();
  const plan = usePlan();
  const chat = useAssistant();
  const chatRoute = useOlimpChatRoute();
  const goal = hasGoalIn(profile);
  const personal = hasPreferences(profile);
  const results = useInfiniteQuery({
    queryKey: ['olimp-more', morePicksQuery(profile, 1)], initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => api.catalog(morePicksQuery(profile, pageParam), signal),
    getNextPageParam: last => last.page * last.pageSize < last.total ? last.page + 1 : undefined,
  });
  const items = morePicks(results.data?.pages.flatMap(page => page.items) ?? [], new Set(shownIds));
  const entries = plan.data?.items ?? [];
  const saved = new Set(entries.map(entry => entry.olympiad.id));
  const intro = goal ? 'Вот ещё олимпиады под твою цель. Сверху — те, что сильнее связаны с твоими вузами и направлениями: причины указаны на карточках.'
    : personal ? 'Вот ещё олимпиады по твоему классу и предметам. Сверху — с датами этапов и льготами вузов.'
    : 'Вот ещё популярные олимпиады из каталога. Укажи класс и предметы в профиле — подбор станет точнее.';
  function refine() {
    if (!isMock && !chat.pending) void chat.send(refinePrompt);
    chatRoute.switchToChat();
  }

  return <dialog {...sheet.dialogProps} className={`chat-sheet ${sheet.closing ? 'is-closing' : ''}`} aria-labelledby={titleId}>
    <section className={`chat-sheet__panel olimp-chat picks-sheet ${sheet.dragging ? 'is-dragging' : ''}`} style={sheet.panelStyle}>
      <div className="chat-sheet__top" {...sheet.dragProps}>
        <span className="chat-sheet__handle" aria-hidden="true" />
        <header className="chat-sheet__header">
          <img className="chat-sheet__avatar" src={olimpAvatar} alt="" width={38} height={38} />
          <div className="chat-sheet__title"><h2 id={titleId} ref={heading} tabIndex={-1}>Ещё варианты</h2><p>{goal ? 'Подобрано по твоей цели' : personal ? 'Подобрано по профилю' : 'Популярное в каталоге'}</p></div>
          <button type="button" className="chat-sheet__icon-button chat-sheet__close" aria-label="Закрыть" onClick={sheet.close}><Icon name="x" size={14} /></button>
        </header>
      </div>
      <div className="chat-log picks-sheet__log">
        <div className="chat-turn"><div className="chat-bubble chat-bubble--assistant">{intro}</div></div>
        {results.isPending ? <Loading label="Подбираем олимпиады…" />
          : results.isError && !results.data ? <Notice tone="error">{results.error.message} <button type="button" className="text-button" onClick={() => results.refetch()}>Повторить</button></Notice>
          : !items.length ? <div className="chat-turn"><div className="chat-bubble chat-bubble--assistant">Других подходящих олимпиад пока нет. Попробуй расширить профиль или спроси меня в чате.</div></div>
          : <div className="catalog-list picks-sheet__list">{items.map(item => <OlympiadCard key={item.id} item={item} saved={saved.has(item.id)}
            tracking={entries.find(entry => entry.olympiad.id === item.id)?.tracking} backTo={olimpPicksPath} />)}</div>}
        {results.hasNextPage && <Button className="full-width picks-sheet__more" variant="secondary" disabled={results.isFetchingNextPage} onClick={() => results.fetchNextPage()}>
          {results.isFetchingNextPage ? 'Загружаем…' : 'Показать ещё'}</Button>}
        {results.isFetchNextPageError && <Notice tone="error">Не удалось загрузить следующие варианты. Попробуй ещё раз.</Notice>}
      </div>
      <footer className="chat-footer picks-sheet__footer">
        <Button className="full-width" onClick={refine} disabled={isMock}><Icon name="sparkle" size={14} />Уточнить подбор с Олимпом</Button>
        {isMock && <p className="chat-footer__hint">Чат с Олимпом работает при подключении к серверу.</p>}
      </footer>
    </section>
  </dialog>;
}
