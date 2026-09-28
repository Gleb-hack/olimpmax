import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import { Button, EmptyState, Loading, Notice, Icon, type IconName } from '@olimp/ui';
import { api } from '../../lib/api';
import { usePlan, usePlanActions } from '../../lib/queries';
import { formats, formatDay, levelLabel, stageCountdown } from '../../lib/format';
import { parseContact, type Contact } from '../../lib/contacts';
import { max } from '../../lib/max';
import { useUI } from '../../lib/ui-store';
import { OlympiadMeta, OlympiadStatus, OlympiadTags } from './OlympiadSummary';
import { stageModeLabels } from '@olimp/contracts';
import { hiddenReferenceNote, primaryStages, registrationLabel, stageSummary, universityBenefits } from './detail-format';
import { UniversityBenefits } from './UniversityBenefits';

function DetailRow({ icon, label, value, hint }: { icon: IconName; label: string; value: string; hint?: string }) {
  return <div className="olympiad-detail-row"><span className="olympiad-detail-row__icon"><Icon name={icon} size={17} /></span><div><dt>{label}</dt><dd>{value}</dd>{hint && <p>{hint}</p>}</div></div>;
}

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
  const backTo = typeof state?.backTo === 'string' && /^\/(?:catalog|search|olimp)(?:\?|$)/.test(state.backTo) ? state.backTo : '/catalog';
  const returnTo = typeof state?.returnTo === 'string' && /^\/catalog(?:\?|$)/.test(state.returnTo) ? state.returnTo : '/catalog';
  const id = Number(useParams().id);
  const validId = Number.isInteger(id) && id > 0;
  const detail = useQuery({ queryKey: ['olympiad', id], queryFn: () => api.detail(id), enabled: validId });
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
  const referenceNote = item ? hiddenReferenceNote(item) : null;
  const benefits = item?.benefits;
  // A profile outside the RSOSH list has no level; say why instead of a bare «Не указан».
  const levelHint = item?.levelProfile ? `Профиль: ${item.levelProfile}` : item?.levelSource === 'rsosh_list' ? item.levelStatus ?? undefined : undefined;
  const contacts = (item?.contacts ?? []).filter(value => value.trim()).map(parseContact);
  const countdown = item ? stageCountdown(item) : null;
  return <div className="olympiad-detail">
    <div className="olympiad-detail__navigation"><Link to={backTo} state={{ backTo: returnTo }} className="icon-button back-button" aria-label={backTo === '/olimp' ? 'Назад к Олимпу' : backTo.startsWith('/search') ? 'Назад к поиску' : 'Назад в каталог'}><Icon name="chevron-left" size={18} /></Link></div>
    {!validId ? <EmptyState title="Олимпиада не найдена" action={<Link className="button-link" to="/catalog">В каталог</Link>}>Проверьте ссылку или найдите олимпиаду в каталоге.</EmptyState> : detail.isPending ? <Loading /> : detail.isError ? <Notice tone="error">{detail.error.message}<Button variant="secondary" onClick={() => detail.refetch()}>Повторить</Button></Notice> : item && <>
      <header className="olympiad-detail__heading"><OlympiadStatus item={item} /><h1 ref={heading} tabIndex={-1}>{item.title}</h1><OlympiadMeta item={item} /><OlympiadTags item={item} /></header>
      <section className="olympiad-detail__about"><h2>Об олимпиаде</h2><p id="olympiad-description" className={!descriptionOpen && (item.description?.length ?? 0) > 280 ? 'is-collapsed' : ''}>{item.description || 'Подробное описание пока не добавлено. Узнать условия участия можно на странице олимпиады.'}</p>{(item.description?.length ?? 0) > 280 && <button className="text-button olympiad-detail__read-more" aria-expanded={descriptionOpen} aria-controls="olympiad-description" onClick={() => setDescriptionOpen(!descriptionOpen)}>{descriptionOpen ? 'Свернуть' : 'Читать полностью'}</button>}</section>
      <section className="olympiad-detail__details"><h2>Детали</h2><dl className="olympiad-detail-list">
        <DetailRow icon="list" label="Формат" value={formats[item.format]} />
        <DetailRow icon="calendar" label="Статус по источнику" value={item.rawSource['Статус исходный'] || item.statusRaw || 'Не указан'} />
        <DetailRow icon="bar-chart" label="Уровень олимпиады" value={levelLabel(item)} hint={levelHint} />
        <DetailRow icon="bell" label="Сроки регистрации" value={registrationLabel(item)} />
        <DetailRow icon="calendar" label="Этапы" value={stageSummary(stages)} />
        {countdown && <DetailRow icon="calendar" label="До следующего этапа" value={`${countdown.value} · ${countdown.stage}`}
          hint={`Начало — ${countdown.date}${countdown.estimated ? ' Год в источнике не указан и рассчитан по текущему сезону — сверяйте даты у организатора.' : ''}`} />}
        <DetailRow icon="book" label="Организатор" value={item.organizers.join(', ') || 'Не указан'} />
      </dl></section>
      <Button className={`full-width olympiad-detail__track ${saved?.tracking ? 'tracking-button--saved' : ''}`} variant={saved ? 'secondary' : 'primary'} disabled={action.isPending || plan.isPending} onClick={() => saved ? navigate('/plan') : action.mutate({ id, action: 'save' })}>{saved?.tracking && <Icon name="check" size={15} />}{action.isPending ? 'Сохраняем…' : saved ? saved.tracking ? 'Отслеживается' : 'В плане · на паузе' : 'Отслеживать'}</Button>
      <button type="button" className={`text-button olympiad-detail__compare ${compared ? 'is-active' : ''}`} aria-pressed={compared} onClick={() => toggleComparison(id)}><Icon name={compared ? 'check' : 'compare'} size={15} />{compared ? 'В сравнении' : 'Добавить к сравнению'}</button>
      {action.isError && <Notice tone="error">{action.error.message}</Notice>}
      {benefits && <UniversityBenefits groups={universityBenefits(benefits.items, item.organizers)} note={benefits.note} />}
      {hasSchedule && <details className="olympiad-schedule" open><summary>Расписание этапов<Icon name="chevron-down" size={16} /></summary><div className="olympiad-schedule__content">
        {item.scheduleSource === 'reference' && <p className="olympiad-schedule__hint">По справочнику проекта{item.series ? ` для олимпиады «${item.series.name}»` : ''}. Год не указан в источнике — сверяйте сезон на сайте организатора.</p>}
        {stages.length ? <ol>{stages.map(stage => <li key={stage.id}><strong>{stage.name || 'Этап олимпиады'}</strong><span>{stage.verification === 'verified' ? [stage.beginsOn && `С ${formatDay(stage.beginsOn)}`, stage.endsOn && `до ${formatDay(stage.endsOn)}`].filter(Boolean).join(' ') || 'Дата не указана' : stage.rawDates || 'Дата не указана'}</span>{stage.mode && <small>{stageModeLabels[stage.mode]}</small>}</li>)}</ol> : <p className="preserve-lines">{item.calendarRaw}</p>}
        {item.scheduleSource !== 'reference' && item.scheduleUpdatedRaw && <p className="olympiad-schedule__hint">{item.scheduleUpdatedRaw}</p>}
        {referenceNote && <p className="olympiad-schedule__hint">{referenceNote}</p>}
      </div></details>}
      {contacts.length > 0 && <section className="olympiad-detail__about"><h2>Контакты</h2><ul className="contact-list">{contacts.map((contact, index) => <ContactItem key={index} contact={contact} />)}</ul></section>}
      <button className="olympiad-detail__source" onClick={() => max.openExternal(item.sourceUrl)}>Подробнее об олимпиаде<Icon name="external-link" size={14} /></button>
    </>}
  </div>;
}
