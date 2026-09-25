import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Award, Bell, BookOpen, CalendarDays, Check, ChevronDown, ExternalLink, ListFilter, type LucideIcon } from 'lucide-react';
import { Button, EmptyState, Loading, Notice } from '@olimp/ui';
import { api } from '../../lib/api';
import { usePlan, usePlanActions } from '../../lib/queries';
import { formats, formatDay, levelLabel } from '../../lib/format';
import { max } from '../../lib/max';
import { OlympiadMeta, OlympiadStatus, OlympiadTags } from './OlympiadSummary';
import { registrationLabel, stageSummary } from './detail-format';

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
  const stages = (item?.stages ?? []).filter(stage => stage.origin === 'csv' || stage.verification === 'verified');
  const hasSchedule = stages.length > 0 || !!item?.calendarRaw;
  return <div className="olympiad-detail">
    <div className="olympiad-detail__navigation"><Link to={backTo} state={{ backTo: returnTo }} className="icon-button back-button" aria-label={backTo === '/olimp' ? 'Назад к Олимпу' : backTo.startsWith('/search') ? 'Назад к поиску' : 'Назад в каталог'}><ArrowLeft size={20} /></Link></div>
    {!validId ? <EmptyState title="Олимпиада не найдена" action={<Link className="button-link" to="/catalog">В каталог</Link>}>Проверьте ссылку или найдите олимпиаду в каталоге.</EmptyState> : detail.isPending ? <Loading /> : detail.isError ? <Notice tone="error">{detail.error.message}<Button variant="secondary" onClick={() => detail.refetch()}>Повторить</Button></Notice> : item && <>
      <header className="olympiad-detail__heading"><OlympiadStatus item={item} /><h1 ref={heading} tabIndex={-1}>{item.title}</h1><OlympiadMeta item={item} /><OlympiadTags item={item} /></header>
      <section className="olympiad-detail__about"><h2>Об олимпиаде</h2><p id="olympiad-description" className={!descriptionOpen && (item.description?.length ?? 0) > 280 ? 'is-collapsed' : ''}>{item.description || 'Подробное описание пока не добавлено. Узнать условия участия можно на странице олимпиады.'}</p>{(item.description?.length ?? 0) > 280 && <button className="text-button olympiad-detail__read-more" aria-expanded={descriptionOpen} aria-controls="olympiad-description" onClick={() => setDescriptionOpen(!descriptionOpen)}>{descriptionOpen ? 'Свернуть' : 'Читать полностью'}</button>}</section>
      <section className="olympiad-detail__details"><h2>Детали</h2><dl className="olympiad-detail-list">
        <DetailRow icon={ListFilter} label="Формат" value={formats[item.format]} />
        <DetailRow icon={CalendarDays} label="Статус по источнику" value={item.rawSource['Статус исходный'] || item.statusRaw || 'Не указан'} />
        <DetailRow icon={Award} label="Уровень олимпиады" value={levelLabel(item)} hint={item.levelProfile ? `Профиль: ${item.levelProfile}` : undefined} />
        <DetailRow icon={Bell} label="Сроки регистрации" value={registrationLabel(item)} />
        <DetailRow icon={CalendarDays} label="Этапы" value={stageSummary(stages)} />
        <DetailRow icon={BookOpen} label="Организатор" value={item.organizers.join(', ') || 'Не указан'} />
      </dl></section>
      <Button className={`full-width olympiad-detail__track ${saved?.tracking ? 'tracking-button--saved' : ''}`} variant={saved ? 'secondary' : 'primary'} disabled={action.isPending || plan.isPending} onClick={() => saved ? navigate('/plan') : action.mutate({ id, action: 'save' })}>{saved?.tracking && <Check size={17} />}{action.isPending ? 'Сохраняем…' : saved ? saved.tracking ? 'Отслеживается' : 'В плане · на паузе' : 'Отслеживать'}</Button>
      {action.isError && <Notice tone="error">{action.error.message}</Notice>}
      {hasSchedule && <details className="olympiad-schedule" open><summary>Расписание этапов<ChevronDown size={17} /></summary><div className="olympiad-schedule__content">
        {stages.length ? <ol>{stages.map(stage => <li key={stage.id}><strong>{stage.name || 'Этап олимпиады'}</strong><span>{stage.verification === 'verified' ? [stage.beginsOn && `С ${formatDay(stage.beginsOn)}`, stage.endsOn && `до ${formatDay(stage.endsOn)}`].filter(Boolean).join(' ') || 'Дата не указана' : stage.rawDates || 'Дата не указана'}</span></li>)}</ol> : <p className="preserve-lines">{item.calendarRaw}</p>}
        {item.scheduleUpdatedRaw && <p className="olympiad-schedule__hint">{item.scheduleUpdatedRaw}</p>}
      </div></details>}
      {item.featuresRaw && <section className="olympiad-detail__about"><h2>Особенности участия</h2><p className="preserve-lines">{item.featuresRaw.split(' | ').join('\n')}</p></section>}
      {!!item.contacts.length && <section className="olympiad-detail__about"><h2>Контакты</h2><p className="preserve-lines">{item.contacts.join('\n')}</p></section>}
      {!!item.documents.length && <section className="olympiad-detail__about"><h2>Документы</h2><p>{item.documents.join(' · ')}</p></section>}
      {item.levelSourceUrl && <button className="olympiad-detail__source" onClick={() => max.openLink(item.levelSourceUrl!)}>Источник уровня олимпиады<ExternalLink size={14} /></button>}
      <button className="olympiad-detail__source" onClick={() => max.openLink(item.sourceUrl)}>Подробнее об олимпиаде<ExternalLink size={14} /></button>
    </>}
  </div>;
}
