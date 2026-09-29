import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { EmptyState, Icon, Loading, Notice, SettingsRow, type IconName } from '@olimp/ui';
import { api, isMock } from '../../lib/api';
import { moscowToday } from '../../lib/format';
import { useProfile } from '../../lib/profile';
import { useEvents, usePlan } from '../../lib/queries';
import { useTheme } from '../../lib/theme';
import { OlympiadCard } from '../catalog/OlympiadCard';
import { useAssistant } from './AssistantProvider';
import { OlimpChatSheet } from './OlimpChatSheet';
import { useOlimpChatRoute, useOlimpPicksRoute } from './chat-route';
import { MorePicksSheet } from './MorePicksSheet';
import { dueItems, hasGoalIn, hasPreferences, olimpActions, pickRecommendations, recommendationQuery } from './overview-format';
import greetLight from '../../assets/olimp/greet-light.webp';
import greetDark from '../../assets/olimp/greet-dark.webp';

function SectionHead({ icon, title, id }: { icon: IconName; title: string; id: string }) {
  return <div className="overview-section__head"><span className="overview-section__icon" aria-hidden="true"><Icon name={icon} size={16} /></span><h2 id={id}>{title}</h2></div>;
}

/**
 * Figma «📱 Олимп — Обзор» (light 1235:6108, dark 1214:5512): greeting, the nearest plan dates, olympiads picked
 * by the profile, ready requests to Olimp and the floating «Спросить Олимпа», which opens the chat sheet (1206:1404).
 */
export function OlimpPage() {
  const chat = useAssistant();
  const route = useOlimpChatRoute();
  const picksRoute = useOlimpPicksRoute();
  const { profile } = useProfile();
  const theme = useTheme(state => state.theme);
  const plan = usePlan();
  const events = useEvents();
  const query = recommendationQuery(profile);
  const catalog = useQuery({ queryKey: ['catalog', query], queryFn: ({ signal }) => api.catalog(query, signal) });
  const entries = plan.data?.items ?? [];
  const savedIds = new Set(entries.map(entry => entry.olympiad.id));
  const due = dueItems(entries, events.data?.items ?? [], moscowToday());
  const picks = catalog.data ? pickRecommendations(catalog.data.items, savedIds) : [];
  const personal = hasPreferences(profile);

  // An action asks its question right away; the answer arrives in the sheet. The demo has no AI, so it only opens the sheet.
  function ask(prompt?: string) {
    if (prompt && !isMock && !chat.pending) void chat.send(prompt);
    route.openChat();
  }

  return <div className="olimp-overview">
    <section className="greet-card">
      <div className="greet-card__copy"><h1 tabIndex={-1}>Олимп</h1><p>твой проводник в мир олимпиад</p></div>
      <img className={`greet-card__art greet-card__art--${theme}`} src={theme === 'dark' ? greetDark : greetLight} alt="" />
    </section>

    <section className="overview-section" aria-labelledby="overview-due">
      <SectionHead id="overview-due" icon="bell" title="Не пропусти" />
      <p className="overview-section__lead">Дедлайны и важные точки в твоём плане</p>
      {plan.isPending ? <Loading label="Загружаем ваш план…" />
        : plan.isError ? <Notice tone="warning">{plan.error.message} <button type="button" className="text-button" onClick={() => plan.refetch()}>Повторить</button></Notice>
        : due.length ? <ul className="due-list">{due.map(item => <li key={item.olympiadId}>
          <Link className="due-row" to={`/olympiads/${item.olympiadId}`} state={{ backTo: '/olimp' }}>
            <span className="due-row__badge" aria-hidden="true"><small>{item.month}</small><strong>{item.day}</strong></span>
            <span className="due-row__copy"><strong>{item.title}</strong><small>{item.note}</small></span>
            <span className="sr-only">, {item.day} {item.month}</span>
          </Link>
        </li>)}</ul>
        : <p className="overview-empty">{entries.length ? 'У отслеживаемых олимпиад пока нет ближайших дат. Мы покажем их здесь, как только они появятся.' : 'В плане пока пусто. Сохрани олимпиады из каталога — здесь появятся их сроки.'}</p>}
      {events.isError && entries.length > 0 && <Notice tone="warning">Не удалось загрузить ближайшие события. <button type="button" className="text-button" onClick={() => events.refetch()}>Повторить</button></Notice>}
      {plan.isSuccess && <Link className="overview-outline-button" to={entries.length ? '/plan' : '/catalog'}>{entries.length ? 'Весь план' : 'Найти олимпиаду'}</Link>}
    </section>

    <section className="overview-section" aria-labelledby="overview-picks">
      <SectionHead id="overview-picks" icon="target" title="Подобрано для тебя" />
      <p className="overview-section__lead">{hasGoalIn(profile) ? 'По твоей цели: целевые вузы и направления' : personal ? 'На основании твоего профиля' : <>Популярное в каталоге. <Link className="text-link" to="/profile/edit">Укажи класс и предметы</Link> — подбор станет точнее</>}</p>
      {catalog.isPending ? <Loading label="Подбираем олимпиады…" />
        : catalog.isError ? <EmptyState title="Не удалось подобрать олимпиады" action={<button type="button" className="text-button" onClick={() => catalog.refetch()}>Попробовать снова</button>}>{catalog.error.message}</EmptyState>
        : picks.length ? <div className="catalog-list">{picks.map(item => <OlympiadCard key={item.id} item={item} saved={savedIds.has(item.id)}
          tracking={entries.find(entry => entry.olympiad.id === item.id)?.tracking} backTo="/olimp" />)}</div>
        : <p className="overview-empty">По твоему профилю ничего не нашлось. <Link className="text-link" to="/catalog">Открыть каталог</Link></p>}
      {catalog.isSuccess && catalog.data.total > picks.length && <button type="button" className="overview-outline-button" onClick={picksRoute.openPicks}>
        <Icon name="sparkle" size={14} />Ещё варианты</button>}
    </section>

    <section className="overview-section" aria-labelledby="overview-actions">
      <SectionHead id="overview-actions" icon="sparkle" title="Поручи это Олимпу" />
      <p className="overview-section__lead">Умные действия на основе твоих данных</p>
      <div className="settings-list olimp-actions">{olimpActions.map(action => <SettingsRow key={action.id} icon={action.icon} tone={action.tone}
        title={action.title} subtitle={action.subtitle} onClick={() => ask(action.prompt)} />)}</div>
    </section>

    <button type="button" className="olimp-ask-fab" onClick={() => ask()}><Icon name="sparkle" size={13} />Спросить Олимпа</button>
    {route.open && <OlimpChatSheet onClose={route.closeChat} />}
    {picksRoute.open && <MorePicksSheet shownIds={picks.map(item => item.id)} onClose={picksRoute.closePicks} />}
  </div>;
}
