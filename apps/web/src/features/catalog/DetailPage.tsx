import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { Button, EmptyState, Loading, Notice, Icon, type IconName } from '@olimp/ui';
import { api, isMock } from '../../lib/api';
import { usePlan, usePlanActions } from '../../lib/queries';
import { formats, formatDay, levelLabel, stageCountdown } from '../../lib/format';
import { parseContact, type Contact } from '../../lib/contacts';
import { max } from '../../lib/max';
import { canGoBack } from '../../lib/history';
import { useUI } from '../../lib/ui-store';
import { OlympiadMeta, OlympiadStatus, OlympiadTags } from './OlympiadSummary';
import { stageModeLabels } from '@olimp/contracts';
import { hiddenReferenceNote, primaryStages, registrationLabel, scheduleGroups, stageSummary, universityBenefits, verifiedStageDates } from './detail-format';
import { UniversityBenefits } from './UniversityBenefits';
import { AdmissionPrograms } from './AdmissionPrograms';
import { givesTargetBenefit } from './program-format';
import { DetailRow } from './DetailRow';
import { GoalReasonsSection } from './GoalReasons';
import { useProfile } from '../../lib/profile';
import { goalQuery } from '../../lib/goal';


const contactIcons: Record<Contact['kind'], IconName> = { email: 'mail', phone: 'phone', social: 'external-link', site: 'globe', text: 'globe' };
function ContactItem({ contact }: { contact: Contact }) {
  const href = contact.href;
  if (!href) return <li><span className="contact-list__text">{contact.label}</span></li>;
  // A real link keeps long-press and copy; the click itself goes through MAX like other external links.
  return <li><a className="text-link contact-list__link" href={href} onClick={event => { event.preventDefault(); max.openExternal(href); }}><Icon name={contactIcons[contact.kind]} size={16} /><span>{contact.label}</span></a></li>;
}

export function DetailPage() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const backTo = typeof state?.backTo === 'string' && /^\/(?:catalog|search|olimp|universities\/[a-z0-9-]+)(?:\?|$)/.test(state.backTo) ? state.backTo : '/catalog';
  // Opened from a university page: go back through history so the university page keeps its own «back».
  const historyBack = state?.historyBack === true && canGoBack();
  const returnTo = typeof state?.returnTo === 'string' && /^\/catalog(?:\?|$)/.test(state.returnTo) ? state.returnTo : '/catalog';
  const id = Number(useParams().id);
  const validId = Number.isInteger(id) && id > 0;
  const { profile } = useProfile();
  const goal = goalQuery(profile);
  const detail = useQuery({ queryKey: ['olympiad', id, goal], queryFn: () => api.detail(id, goal), enabled: validId });
  const plan = usePlan();
  const action = usePlanActions();
  const saved = plan.data?.items.find(entry => entry.olympiad.id === id);
  const compared = useUI(state => state.comparisonIds.includes(id));
  const toggleComparison = useUI(state => state.toggleComparison);
  const item = detail.data;
  const heading = useRef<HTMLHeadingElement>(null);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  useEffect(() => { setDescriptionOpen(false); }, [id]);
  useEffect(() => { if (item) { document.title = `${item.title} · Olimp`; heading.current?.focus({ preventScroll: true }); } }, [item]);
  const stages = item ? primaryStages(item) : [];
  const hasSchedule = stages.length > 0 || !!item?.calendarRaw;
  const groups = item ? scheduleGroups(item) : { verified: [], catalog: [], sources: [] };
  const catalogList = <ol>{groups.catalog.map(stage => <li key={stage.id}><strong>{stage.name || 'Этап олимпиады'}</strong><span>{stage.rawDates || 'Дата не указана'}</span>{stage.mode && <small>{stageModeLabels[stage.mode]}</small>}</li>)}</ol>;
  const referenceNote = item ? hiddenReferenceNote(item) : null;
  const benefits = item?.benefits;
  // A profile outside the RSOSH list has no level; say why instead of a bare «Не указан».
  // The draft status of the RSOSH list («Проект РСОШ 2026/27») is not shown next to the level.
  const levelHint = item?.levelProfile ? `Профиль: ${item.levelProfile}` : item?.levelSource === 'rsosh_list' && !/проект/i.test(item.levelStatus ?? '') ? item.levelStatus ?? undefined : undefined;
  const contacts = (item?.contacts ?? []).filter(value => value.trim()).map(parseContact);
  const countdown = item ? stageCountdown(item) : null;
  return <div className="olympiad-detail">
    <div className="olympiad-detail__navigation">{historyBack ? <button type="button" className="icon-button back-button" aria-label="Назад к вузу" onClick={() => navigate(-1)}><Icon name="chevron-left" size={18} /></button>
      : <Link to={backTo} state={{ backTo: returnTo }} className="icon-button back-button" aria-label={backTo.startsWith('/olimp') ? 'Назад к Олимпу' : backTo.startsWith('/search') ? 'Назад к поиску' : backTo.startsWith('/universities/') ? 'Назад к вузу' : 'Назад в каталог'}><Icon name="chevron-left" size={18} /></Link>}</div>
    {!validId ? <EmptyState title="Олимпиада не найдена" action={<Link className="button-link" to="/catalog">В каталог</Link>}>Проверьте ссылку или найдите олимпиаду в каталоге.</EmptyState> : detail.isPending ? <Loading /> : detail.isError ? <Notice tone="error">{detail.error.message}<Button variant="secondary" onClick={() => detail.refetch()}>Повторить</Button></Notice> : item && <>
      <header className="olympiad-detail__heading"><OlympiadStatus item={item} /><h1 ref={heading} tabIndex={-1}>{item.title}</h1><OlympiadMeta item={item} /><OlympiadTags item={item} /></header>
      <GoalReasonsSection match={item.goalMatch} />
      <section className="olympiad-detail__about"><h2>Об олимпиаде</h2><p id="olympiad-description" className={!descriptionOpen && (item.description?.length ?? 0) > 280 ? 'is-collapsed' : ''}>{item.description || 'Подробное описание пока не добавлено. Узнать условия участия можно на странице олимпиады.'}</p>{(item.description?.length ?? 0) > 280 && <button className="text-button olympiad-detail__read-more" aria-expanded={descriptionOpen} aria-controls="olympiad-description" onClick={() => setDescriptionOpen(!descriptionOpen)}>{descriptionOpen ? 'Свернуть' : 'Читать полностью'}</button>}</section>
      <section className="olympiad-detail__details"><h2>Детали</h2><dl className="olympiad-detail-list">
        <DetailRow icon="list" label="Формат" value={formats[item.format]} />
        <DetailRow icon="calendar" label="Статус по источнику" value={item.rawSource['Статус исходный'] || item.statusRaw || 'Не указан'} />
        <DetailRow icon="bar-chart" label="Уровень олимпиады" value={levelLabel(item)} hint={levelHint} />
        <DetailRow icon="bell" label="Сроки регистрации" value={registrationLabel(item)} />
        <DetailRow icon="calendar" label="Этапы" value={stageSummary(groups.verified.length ? groups.verified : stages)} />
        {countdown && <DetailRow icon="calendar" label={countdown.label} value={`${countdown.value} · ${countdown.stage}`} hint={countdown.hint} />}
        <DetailRow icon="book" label="Организатор" value={item.organizers.join(', ') || 'Не указан'} />
      </dl></section>
      <Button className={`full-width olympiad-detail__track ${saved?.tracking ? 'tracking-button--saved' : ''}`} variant={saved ? 'secondary' : 'primary'} disabled={action.isPending || plan.isPending} onClick={() => saved ? navigate('/plan') : action.mutate({ id, action: 'save' })}>{saved?.tracking && <Icon name="check" size={15} />}{action.isPending ? 'Сохраняем…' : saved ? saved.tracking ? 'Отслеживается' : 'В плане · на паузе' : 'Отслеживать'}</Button>
      <button type="button" className={`text-button olympiad-detail__compare ${compared ? 'is-active' : ''}`} aria-pressed={compared} onClick={() => toggleComparison(id)}><Icon name={compared ? 'check' : 'compare'} size={15} />{compared ? 'В сравнении' : 'Добавить к сравнению'}</button>
      {action.isError && <Notice tone="error">{action.error.message}</Notice>}
      {hasSchedule && <details className="olympiad-schedule" open><summary>Расписание этапов<Icon name="chevron-down" size={16} /></summary><div className="olympiad-schedule__content">
        {groups.verified.length > 0 && <><h3 className="olympiad-schedule__group">Сроки с сайта организатора</h3>
          <ol>{groups.verified.map(stage => <li key={stage.id}><strong>{stage.name || 'Этап олимпиады'}</strong><span>{verifiedStageDates(stage)}</span></li>)}</ol>
          <p className="olympiad-schedule__hint">Проверено {groups.verified[0]?.verifiedAt ? formatDay(groups.verified[0].verifiedAt.slice(0, 10)) : ''} · {groups.sources.map(({ host, url }, index) => <span key={url}>{index > 0 && ', '}<button type="button" className="text-button olympiad-schedule__source" onClick={() => max.openExternal(url)}>{host}</button></span>)}</p></>}
        {groups.catalog.length > 0 && groups.verified.length > 0 && <details className="olympiad-schedule__catalog"><summary>Расписание из каталога</summary>{catalogList}</details>}
        {groups.catalog.length > 0 && !groups.verified.length && catalogList}
        {!groups.catalog.length && !groups.verified.length && <p className="preserve-lines">{item.calendarRaw}</p>}
        {item.scheduleSource !== 'reference' && item.scheduleUpdatedRaw && <p className="olympiad-schedule__hint">{item.scheduleUpdatedRaw}</p>}
        {referenceNote && <p className="olympiad-schedule__hint">{referenceNote}</p>}
      </div></details>}
      {!isMock && benefits?.applicable && givesTargetBenefit(benefits.items, profile.universities) && <AdmissionPrograms olympiadId={item.id} goal={profile} />}
      {benefits && <UniversityBenefits groups={universityBenefits(benefits.items, item.organizers)} note={benefits.note} olympiadId={item.id} />}
      {contacts.length > 0 && <section className="olympiad-detail__about"><h2>Контакты</h2><ul className="contact-list">{contacts.map((contact, index) => <ContactItem key={index} contact={contact} />)}</ul></section>}
    </>}
  </div>;
}
