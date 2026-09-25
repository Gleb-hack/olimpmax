import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Switch } from '@maxhub/max-ui';
import { Bell, Bookmark, CalendarDays, Check, ClipboardList, Trash2 } from 'lucide-react';
import { Button, Dialog, EmptyState, Header, Loading, Notice } from '@olimp/ui';
import { useEvents, usePlan, usePlanActions } from '../../lib/queries';
import { PlanCard } from './PlanCard';
import type { PlanEntry } from '../../lib/api';

function EditPlanItem({ entry, onClose }: { entry: PlanEntry; onClose: () => void }) {
  const [note, setNote] = useState(entry.note || '');
  const [tracking, setTracking] = useState(entry.tracking);
  const [removeConfirm, setRemoveConfirm] = useState(false);
  const mutation = usePlanActions();
  return <Dialog title="В моём плане" onClose={onClose}>
    <h3 className="dialog-item-title">{entry.olympiad.title}</h3>
    <label className="switch-row"><span><strong>Отслеживать этапы</strong><small>Показывать ближайшие события в плане</small></span><Switch checked={tracking} onChange={event => setTracking(event.target.checked)} aria-label="Отслеживать этапы" /></label>
    <label className="field"><span>Моя заметка</span><textarea value={note} onChange={event => setNote(event.target.value)} maxLength={2000} rows={4} placeholder="Например, подготовить документы" /><small>{note.length} / 2000</small></label>
    {mutation.isError && <Notice tone="error">{mutation.error.message}</Notice>}
    <Button className="full-width" disabled={mutation.isPending} onClick={() => mutation.mutate({ id: entry.olympiad.id, action: 'patch', patch: { tracking, note: note.trim() || null } }, { onSuccess: onClose })}>{mutation.isPending ? 'Сохраняем…' : 'Сохранить'}</Button>
    <Link className="text-link centered" to={`/olympiads/${entry.olympiad.id}`}>Подробнее об олимпиаде</Link>
    {removeConfirm ? <div className="remove-confirm"><p>Убрать олимпиаду и её заметку из плана?</p><div className="button-pair"><Button variant="secondary" onClick={() => setRemoveConfirm(false)}>Оставить</Button><Button variant="danger" disabled={mutation.isPending} onClick={() => mutation.mutate({ id: entry.olympiad.id, action: 'remove' }, { onSuccess: onClose })}>Убрать</Button></div></div> : <button className="danger-link centered" onClick={() => setRemoveConfirm(true)}><Trash2 size={15} />Убрать из плана</button>}
  </Dialog>;
}

export function PlanPage() {
  const plan = usePlan();
  const events = useEvents();
  const [subject, setSubject] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const entries = plan.data?.items ?? [];
  const subjects = [...new Map(entries.flatMap(entry => entry.olympiad.subjects).map(value => [value.id, value])).values()];
  const shownEntries = entries.filter(entry => subject === null || entry.olympiad.subjects.some(value => value.id === subject));
  const shownById = new Map(shownEntries.map(entry => [entry.olympiad.id, entry]));
  const shownEvents = (events.data?.items ?? []).filter(event => shownById.has(event.olympiadId));
  const withoutEvent = shownEntries.filter(entry => !entry.tracking || !entry.olympiad.nextEvent);
  const editing = entries.find(entry => entry.olympiad.id === editingId);
  useEffect(() => { if (subject !== null && !subjects.some(value => value.id === subject)) setSubject(null); }, [subject, subjects]);
  return <><Header title="Мой план" />
    <div className="subject-tabs" aria-label="Предметы в плане"><button className={`chip ${subject === null ? 'chip--active' : ''}`} aria-pressed={subject === null} onClick={() => setSubject(null)}>Все</button>{subjects.map(value => <button key={value.id} className={`chip ${subject === value.id ? 'chip--active' : ''}`} aria-pressed={subject === value.id} onClick={() => setSubject(value.id)}>{value.name}</button>)}</div>
    {plan.isPending ? <Loading label="Загружаем ваш план…" /> : plan.isError ? <EmptyState icon={ClipboardList} title="План пока недоступен" action={<Button onClick={() => { plan.refetch(); events.refetch(); }}>Попробовать снова</Button>}>{plan.error.message}</EmptyState> : <>
      <div className="stats"><div className="stat"><span className="stat-icon tone-blue"><Bookmark size={17} /></span><strong>{entries.length}</strong><span>в плане</span></div><div className="stat"><span className="stat-icon tone-green"><Check size={17} /></span><strong>{entries.filter(entry => entry.tracking).length}</strong><span>отслеживаются</span></div><div className="stat"><span className="stat-icon tone-amber"><Bell size={17} /></span><strong>{events.data ? new Set(events.data.items.map(event => event.olympiadId)).size : '—'}</strong><span>скоро</span></div></div>
      {!entries.length ? <EmptyState icon={CalendarDays} title="Большие планы начинаются здесь" action={<Link className="button-link" to="/catalog">Найти олимпиаду</Link>}>Сохраните интересные олимпиады из каталога — они появятся в вашем плане.</EmptyState> : <>
        {events.isError && <Notice tone="warning">Не удалось загрузить ближайшие события. <button className="text-button" onClick={() => events.refetch()}>Повторить</button></Notice>}
        {(events.isPending || shownEvents.length > 0) && <section className="section"><h2 className="section-caption">Ближайшие этапы · 90 дней</h2>
          {events.isPending ? <Loading /> : <div className="plan-card-list">{shownEvents.map(event => <PlanCard key={`${event.stageId}-${event.kind}`} entry={shownById.get(event.olympiadId)!} event={event} onOpen={() => setEditingId(event.olympiadId)} />)}</div>}
        </section>}
        <section className="section"><h2 className="section-caption">{withoutEvent.length === shownEntries.length ? 'Сохранённые олимпиады' : 'Все олимпиады в плане'}</h2><div className="plan-card-list">{shownEntries.map(entry => <PlanCard key={entry.olympiad.id} entry={entry} onOpen={() => setEditingId(entry.olympiad.id)} />)}</div></section>
        <p className="hint">«Скоро» — олимпиады с подтверждёнными событиями в ближайшие 90 дней. Напоминания от бота ещё не подключены.</p>
      </>}
    </>}{editing && <EditPlanItem entry={editing} onClose={() => setEditingId(null)} />}</>;
}
