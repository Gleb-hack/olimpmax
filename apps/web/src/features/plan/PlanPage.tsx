import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Button, EmptyState, Header, Loading, Notice, Icon } from '@olimp/ui';
import { useEvents, usePlan } from '../../lib/queries';
import { PlanCard } from './PlanCard';
import { PlanCalendar } from './PlanCalendar';
import { CalendarExportDialog } from './CalendarExport';
import { soonCount } from './calendar-model';
import { eventRelevant, groupByStatus, statusSections } from './plan-card-format';
import { moscowToday } from '../../lib/format';
import { BotPrompt } from './BotPrompt';
import { EditPlanItem } from './EditPlanItem';

export function PlanPage() {
  const [params, setParams] = useSearchParams();
  const { state } = useLocation();
  const backTo = typeof state?.backTo === 'string' && /^\/catalog(?:\?|$)/.test(state.backTo) ? state.backTo : undefined;
  const plan = usePlan();
  const events = useEvents();
  const [subject, setSubject] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const editingId = Number(params.get('olympiad')) || null;
  // The view is part of the URL, so returning from an olympiad page keeps the calendar open.
  const view = params.get('view') === 'calendar' ? 'calendar' : 'list';
  const setView = (value: 'list' | 'calendar') => {
    const next = new URLSearchParams(params);
    if (value === 'list') next.delete('view'); else next.set('view', value);
    setParams(next, { replace: true, state });
  };
  const setEditingId = (id: number | null) => {
    const next = new URLSearchParams(params);
    if (id === null) next.delete('olympiad'); else next.set('olympiad', String(id));
    setParams(next, { replace: id === null, state });
  };
  const entries = plan.data?.items ?? [];
  const subjects = [...new Map(entries.flatMap(entry => entry.olympiad.subjects).map(value => [value.id, value])).values()];
  const shownEntries = entries.filter(entry => subject === null || entry.olympiad.subjects.some(value => value.id === subject));
  const shownById = new Map(shownEntries.map(entry => [entry.olympiad.id, entry]));
  const shownEvents = (events.data?.items ?? []).filter(event => { const entry = shownById.get(event.olympiadId); return entry !== undefined && eventRelevant(entry, event); });
  const groups = groupByStatus(shownEntries);
  const editing = entries.find(entry => entry.olympiad.id === editingId);
  useEffect(() => { if (subject !== null && !subjects.some(value => value.id === subject)) setSubject(null); }, [subject, subjects]);
  return <><Header title="Мой план" />
    <div className="segmented plan-view-switch" role="tablist" aria-label="Вид плана">
      <button type="button" role="tab" aria-selected={view === 'list'} className={view === 'list' ? 'is-active' : ''} onClick={() => setView('list')}>Список</button>
      <button type="button" role="tab" aria-selected={view === 'calendar'} className={view === 'calendar' ? 'is-active' : ''} onClick={() => setView('calendar')}>Календарь</button>
    </div>
    {view === 'calendar' ? plan.isPending ? <Loading label="Загружаем ваш план…" /> : plan.isError
      ? <EmptyState icon="clipboard-list" title="План пока недоступен" action={<Button onClick={() => plan.refetch()}>Попробовать снова</Button>}>{plan.error.message}</EmptyState>
      : <>
        <PlanCalendar entries={entries} onOpen={setEditingId} />
        <Button className="full-width calendar-export-button" variant="secondary" onClick={() => setExporting(true)}><Icon name="download" size={15} />Экспорт в календарь телефона</Button>
      </> : <>
    <div className="subject-tabs" aria-label="Предметы в плане"><button className={`chip ${subject === null ? 'chip--active' : ''}`} aria-pressed={subject === null} onClick={() => setSubject(null)}>Все</button>{subjects.map(value => <button key={value.id} className={`chip ${subject === value.id ? 'chip--active' : ''}`} aria-pressed={subject === value.id} onClick={() => setSubject(value.id)}>{value.name}</button>)}</div>
    {plan.isPending ? <Loading label="Загружаем ваш план…" /> : plan.isError ? <EmptyState icon="clipboard-list" title="План пока недоступен" action={<Button onClick={() => { plan.refetch(); events.refetch(); }}>Попробовать снова</Button>}>{plan.error.message}</EmptyState> : <>
      <div className="stats" data-tour="plan-stats"><div className="stat"><span className="stat-icon tone-blue"><Icon name="book" size={14} /></span><strong>{entries.length}</strong><span>в плане</span></div><div className="stat"><span className="stat-icon tone-green"><Icon name="check" size={14} /></span><strong>{entries.filter(entry => entry.tracking).length}</strong><span>отслеживаются</span></div><div className="stat"><span className="stat-icon tone-amber"><Icon name="bell" size={14} /></span><strong>{soonCount(entries, moscowToday())}</strong><span>скоро</span></div></div>
      {!entries.length ? <EmptyState icon="calendar" title="Большие планы начинаются здесь" action={<Link className="button-link" to="/catalog">Найти олимпиаду</Link>}>Сохраните интересные олимпиады из каталога — они появятся в вашем плане.</EmptyState> : <>
        <BotPrompt tracked={entries.filter(entry => entry.tracking).length} />
        {events.isError && <Notice tone="warning">Не удалось загрузить ближайшие события. <button className="text-button" onClick={() => events.refetch()}>Повторить</button></Notice>}
        {(events.isPending || shownEvents.length > 0) && <section className="section"><h2 className="section-caption">Ближайшие этапы · 90 дней</h2>
          {events.isPending ? <Loading /> : <div className="plan-card-list">{shownEvents.map(event => <PlanCard key={`${event.stageId}-${event.kind}`} entry={shownById.get(event.olympiadId)!} event={event} onOpen={() => setEditingId(event.olympiadId)} />)}</div>}
        </section>}
        {groups.map(group => <section key={group.status} className="section plan-status-section" aria-labelledby={`plan-status-${group.status}`}>
          <h2 id={`plan-status-${group.status}`} className="section-caption">{statusSections[group.status]} · {group.entries.length}</h2>
          <div className="plan-card-list">{group.entries.map(entry => <PlanCard key={entry.olympiad.id} entry={entry} onOpen={() => setEditingId(entry.olympiad.id)} />)}</div>
        </section>)}
      </>}
    </>}</>}
    {editing && <EditPlanItem key={editing.olympiad.id} entry={editing} backTo={backTo} onClose={() => setEditingId(null)} />}
    {exporting && <CalendarExportDialog entries={entries} onClose={() => setExporting(false)} />}</>;
}
