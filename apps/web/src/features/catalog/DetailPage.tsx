import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Bell, BookOpen, CalendarDays, Check, ChevronDown, ExternalLink, ListFilter, type LucideIcon } from 'lucide-react';
import { Button, EmptyState, Loading, Notice } from '@olimp/ui';
import { api } from '../../lib/api';
import { usePlan, usePlanActions } from '../../lib/queries';
import { formats, formatDay } from '../../lib/format';
import { max } from '../../lib/max';
import { OlympiadMeta, OlympiadStatus, OlympiadTags } from './OlympiadSummary';
import { registrationDeadline, stageSummary } from './detail-format';

function DetailRow({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value: string; hint?: string }) {
  return <div className="olympiad-detail-row"><span className="olympiad-detail-row__icon"><Icon size={18} strokeWidth={1.7} /></span><div><dt>{label}</dt><dd>{value}</dd>{hint && <p>{hint}</p>}</div></div>;
}

export function DetailPage() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const backTo = typeof state?.backTo === 'string' && /^\/(?:catalog|search|olimp)(?:\?|$)/.test(state.backTo) ? state.backTo : '/catalog';
  const returnTo = typeof state?.returnTo === 'string' && /^\/catalog(?:\?|$)/.test(state.returnTo) ? state.returnTo : '/catalog';
  const id = Number(useParams().id);
  const validId = Number.isInteger(id) && id > 0;
  const detail = useQuery({ queryKey: ['olympiad', id], queryFn: () => api.detail(id), enabled: validId });
  const plan = usePlan();
  const action = usePlanActions();
  const saved = plan.data?.items.find(entry => entry.olympiad.id === id);
  const item = detail.data;
  const heading = useRef<HTMLHeadingElement>(null);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  useEffect(() => { setDescriptionOpen(false); }, [id]);
  useEffect(() => { if (item) { document.title = `${item.title} · Olimp`; heading.current?.focus({ preventScroll: true }); } }, [item]);
  const deadline = item ? registrationDeadline(item) : null;
  const stages = item?.stages ?? [];
  const hasSchedule = stages.length > 0 || !!item?.calendarRaw;
  return <div className="olympiad-detail">
    <div className="olympiad-detail__navigation"><Link to={backTo} state={{ backTo: returnTo }} className="icon-button back-button" aria-label={backTo === '/olimp' ? 'Назад к Олимпу' : backTo.startsWith('/search') ? 'Назад к поиску' : 'Назад в каталог'}><ArrowLeft size={20} /></Link></div>
    {!validId ? <EmptyState title="Олимпиада не найдена" action={<Link className="button-link" to="/catalog">В каталог</Link>}>Проверьте ссылку или найдите олимпиаду в каталоге.</EmptyState> : detail.isPending ? <Loading /> : detail.isError ? <Notice tone="error">{detail.error.message}<Button variant="secondary" onClick={() => detail.refetch()}>Повторить</Button></Notice> : item && <>
      <header className="olympiad-detail__heading"><OlympiadStatus item={item} /><h1 ref={heading} tabIndex={-1}>{item.title}</h1><OlympiadMeta item={item} /><OlympiadTags item={item} /></header>
      <section className="olympiad-detail__about"><h2>Об олимпиаде</h2><p id="olympiad-description" className={!descriptionOpen && (item.description?.length ?? 0) > 280 ? 'is-collapsed' : ''}>{item.description || 'Подробное описание пока не добавлено. Узнать условия участия можно на странице олимпиады.'}</p>{(item.description?.length ?? 0) > 280 && <button className="text-button olympiad-detail__read-more" aria-expanded={descriptionOpen} aria-controls="olympiad-description" onClick={() => setDescriptionOpen(!descriptionOpen)}>{descriptionOpen ? 'Свернуть' : 'Читать полностью'}</button>}</section>
      <section className="olympiad-detail__details"><h2>Детали</h2><dl className="olympiad-detail-list">
        <DetailRow icon={ListFilter} label="Формат" value={formats[item.format]} />
        <DetailRow icon={Bell} label="Дедлайн регистрации" value={deadline ? formatDay(deadline) : item.calendarState === 'not_held' ? 'Проведение не запланировано' : 'Дата уточняется'} hint={item.calendarState === 'needs_review' ? 'Расписание изменилось, даты проверяются' : undefined} />
        <DetailRow icon={CalendarDays} label="Этапы" value={stageSummary(stages)} />
        <DetailRow icon={BookOpen} label="Организатор" value={item.organizers.join(', ') || 'Не указан'} />
      </dl></section>
      <Button className={`full-width olympiad-detail__track ${saved?.tracking ? 'tracking-button--saved' : ''}`} variant={saved ? 'secondary' : 'primary'} disabled={action.isPending || plan.isPending} onClick={() => saved ? navigate('/plan') : action.mutate({ id, action: 'save' })}>{saved?.tracking && <Check size={17} />}{action.isPending ? 'Сохраняем…' : saved ? saved.tracking ? 'Отслеживается' : 'В плане · на паузе' : 'Отслеживать'}</Button>
      {action.isError && <Notice tone="error">{action.error.message}</Notice>}
      {hasSchedule && <details className="olympiad-schedule"><summary>Расписание этапов<ChevronDown size={17} /></summary><div className="olympiad-schedule__content">
        {stages.some(stage => stage.verification !== 'verified') && <p className="olympiad-schedule__hint">В исходном расписании год не подтверждён. Уточните актуальные даты перед участием.</p>}
        {stages.length ? <ol>{stages.map(stage => <li key={stage.id}><strong>{stage.name || 'Этап олимпиады'}</strong><span>{stage.verification === 'verified' ? [stage.beginsOn && `С ${formatDay(stage.beginsOn)}`, stage.endsOn && `до ${formatDay(stage.endsOn)}`].filter(Boolean).join(' ') || 'Дата не указана' : stage.rawDates || 'Дата уточняется'}</span>{stage.verification === 'needs_review' && <small>Дата требует повторной проверки</small>}</li>)}</ol> : <p className="preserve-lines">{item.calendarRaw}</p>}
      </div></details>}
      <button className="olympiad-detail__source" onClick={() => max.openLink(item.sourceUrl)}>Подробнее об олимпиаде<ExternalLink size={14} /></button>
    </>}
  </div>;
}
