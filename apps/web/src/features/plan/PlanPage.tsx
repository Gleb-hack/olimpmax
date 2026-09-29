import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Switch } from '@maxhub/max-ui';
import { planStatusLabels, stageResultLabels } from '@olimp/contracts';
import { Button, Dialog, EmptyState, Header, Loading, Notice, Icon } from '@olimp/ui';
import { useEvents, usePlan, usePlanActions } from '../../lib/queries';
import { PlanCard } from './PlanCard';
import { PlanCalendar } from './PlanCalendar';
import { CalendarExportDialog } from './CalendarExport';
import { soonCount } from './calendar-model';
import { eventRelevant, groupByStatus, resultStageOptions, statusSections, type PlanStatus } from './plan-card-format';
import { moscowToday } from '../../lib/format';
import type { PlanEntry } from '../../lib/api';
import { BotPrompt } from './BotPrompt';

type StageResult = keyof typeof stageResultLabels;
type Result = { stage: string; result: StageResult };
const resultOptions = Object.entries(stageResultLabels) as [StageResult, string][];
const OTHER_STAGE = '__other';
/** In the dialog the statuses go in the order the pupil passes them. */
const dialogStatuses: PlanStatus[] = ['planned', 'registered', 'in_progress', 'done'];

/** Results of the olympiad's stages: one row per stage, a new row from the schedule's stages or a stage typed by hand. */
function StageResults({ entry, value, onChange }: { entry: PlanEntry; value: Result[]; onChange: (value: Result[]) => void }) {
  const free = resultStageOptions(entry).filter(stage => !value.some(result => result.stage.toLocaleLowerCase('ru') === stage.toLocaleLowerCase('ru')));
  const [stage, setStage] = useState(free[0] ?? OTHER_STAGE);
  const [custom, setCustom] = useState('');
  const [result, setResult] = useState<StageResult>('passed');
  const name = (stage === OTHER_STAGE ? custom : stage).trim();
  const duplicate = value.some(item => item.stage.toLocaleLowerCase('ru') === name.toLocaleLowerCase('ru'));
  useEffect(() => { if (stage !== OTHER_STAGE && !free.includes(stage)) setStage(free[0] ?? OTHER_STAGE); }, [stage, free]);
  function add() {
    if (!name || duplicate || value.length >= 20) return;
    onChange([...value, { stage: name.slice(0, 200), result }]);
    setCustom('');
  }
  return <section className="stage-results" aria-labelledby="stage-results-title">
    <h4 id="stage-results-title">Результаты этапов</h4>
    {value.length > 0 && <ul className="stage-results__list">{value.map((item, index) => <li key={item.stage}>
      <span className="stage-results__stage">{item.stage}</span>
      <select aria-label={`Результат: ${item.stage}`} value={item.result} onChange={event => onChange(value.map((row, i) => i === index ? { ...row, result: event.target.value as StageResult } : row))}>
        {resultOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      <button type="button" className="icon-button" aria-label={`Удалить результат: ${item.stage}`} onClick={() => onChange(value.filter((_, i) => i !== index))}><Icon name="x" size={11} /></button>
    </li>)}</ul>}
    <div className="stage-results__add">
      <select aria-label="Этап" value={stage} onChange={event => setStage(event.target.value)}>
        {free.map(option => <option key={option} value={option}>{option}</option>)}
        <option value={OTHER_STAGE}>Другой этап…</option>
      </select>
      {stage === OTHER_STAGE && <input aria-label="Название этапа" placeholder="Например, отборочный этап" maxLength={200} value={custom} onChange={event => setCustom(event.target.value)} />}
      <select aria-label="Результат" value={result} onChange={event => setResult(event.target.value as StageResult)}>
        {resultOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      <Button size="small" variant="secondary" disabled={!name || duplicate || value.length >= 20} onClick={add}><Icon name="plus" size={13} />Добавить результат</Button>
    </div>
  </section>;
}

function EditPlanItem({ entry, onClose, backTo }: { entry: PlanEntry; onClose: () => void; backTo?: string }) {
  const [note, setNote] = useState(entry.note || '');
  const [tracking, setTracking] = useState(entry.tracking);
  const [status, setStatus] = useState<PlanStatus>(entry.status);
  const [results, setResults] = useState<Result[]>(entry.results);
  const [removeConfirm, setRemoveConfirm] = useState(false);
  const mutation = usePlanActions();
  // A finished olympiad needs no reminders: switch tracking off right away, the user still sees it and can keep it on.
  const chooseStatus = (value: PlanStatus) => { setStatus(value); if (value === 'done' && status !== 'done') setTracking(false); };
  return <Dialog title="В моём плане" onClose={onClose}>
    <h3 className="dialog-item-title">{entry.olympiad.title}</h3>
    <div className="plan-status" role="radiogroup" aria-label="Статус">
      {dialogStatuses.map(value =>
        <button key={value} type="button" role="radio" aria-checked={status === value} className={`chip ${status === value ? 'chip--active' : ''}`} onClick={() => chooseStatus(value)}>{planStatusLabels[value]}</button>)}
    </div>
    <label className="switch-row"><span><strong>Отслеживать этапы</strong><small>Ближайшие события в плане и напоминания от бота</small></span><Switch checked={tracking} onChange={event => setTracking(event.target.checked)} aria-label="Отслеживать этапы" /></label>
    <StageResults entry={entry} value={results} onChange={setResults} />
    <label className="field"><span>Моя заметка</span><textarea value={note} onChange={event => setNote(event.target.value)} maxLength={2000} rows={4} placeholder="Например, подготовить документы" /><small>{note.length} / 2000</small></label>
    {mutation.isError && <Notice tone="error">{mutation.error.message}</Notice>}
    <Button className="full-width" disabled={mutation.isPending} onClick={() => mutation.mutate({ id: entry.olympiad.id, action: 'patch', patch: { tracking, note: note.trim() || null, status, results } }, { onSuccess: onClose })}>{mutation.isPending ? 'Сохраняем…' : 'Сохранить'}</Button>
    <Link className="text-link centered" to={`/olympiads/${entry.olympiad.id}`}>Подробнее об олимпиаде</Link>
    {backTo && <Link className="text-link centered" to={backTo}>Назад в каталог</Link>}
    {removeConfirm ? <div className="remove-confirm"><p>Убрать олимпиаду, её заметку и результаты из плана?</p><div className="button-pair"><Button variant="secondary" onClick={() => setRemoveConfirm(false)}>Оставить</Button><Button variant="danger" disabled={mutation.isPending} onClick={() => mutation.mutate({ id: entry.olympiad.id, action: 'remove' }, { onSuccess: onClose })}>Убрать</Button></div></div> : <button className="danger-link centered" onClick={() => setRemoveConfirm(true)}><Icon name="trash" size={15} />Убрать из плана</button>}
  </Dialog>;
}

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
      <div className="stats"><div className="stat"><span className="stat-icon tone-blue"><Icon name="book" size={14} /></span><strong>{entries.length}</strong><span>в плане</span></div><div className="stat"><span className="stat-icon tone-green"><Icon name="check" size={14} /></span><strong>{entries.filter(entry => entry.tracking).length}</strong><span>отслеживаются</span></div><div className="stat"><span className="stat-icon tone-amber"><Icon name="bell" size={14} /></span><strong>{soonCount(entries, moscowToday())}</strong><span>скоро</span></div></div>
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
