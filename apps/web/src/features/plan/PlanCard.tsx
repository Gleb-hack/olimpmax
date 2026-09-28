import { Icon } from '@olimp/ui';
import type { PlanEntry } from '../../lib/api';
import { dateParts, formatDay, formats, moscowToday, scheduleLabel } from '../../lib/format';
import { OlympiadTags, StageCountdown } from '../catalog/OlympiadSummary';
import { eventLabel, eventTiming, planCardDate, type PlanCardEvent } from './plan-card-format';

export function PlanCard({ entry, event, onOpen }: { entry: PlanEntry; event?: PlanCardEvent; onOpen: () => void }) {
  const item = entry.olympiad;
  const next = entry.tracking ? event ?? item.nextEvent : null;
  const tileDate = entry.tracking ? planCardDate(entry, next, moscowToday()) : null;
  const parts = tileDate ? dateParts(tileDate) : null;
  const timing = next ? eventTiming(next.date) : null;
  const subtitle = event?.name || item.organizers?.join(', ');
  const noDate = scheduleLabel({ ...item, calendarRaw: entry.calendarRaw });
  return <article className={`plan-card ${entry.tracking ? '' : 'plan-card--paused'}`}>
    <div className="plan-card__header">
      <span className={`date-tile plan-card__date ${entry.tracking ? '' : 'plan-card__date--paused'}`} aria-hidden="true">{parts ? <><small>{parts.month}</small><strong>{parts.day}</strong></> : entry.tracking ? <Icon name="calendar" size={22} /> : <Icon name="pause" size={20} />}</span>
      <div className="plan-card__heading"><h3><button type="button" className="plan-card__open" onClick={onOpen}>{item.title}</button></h3><p className="plan-card__subtitle" title={[subtitle, formats[item.format]].filter(Boolean).join(' · ')}>{subtitle && <><span>{subtitle}</span><span aria-hidden="true">·</span></>}<span>{formats[item.format].toLocaleLowerCase('ru')}</span></p></div>
      <Icon name="chevron-right" className="plan-card__chevron" size={18} />
    </div>
    <OlympiadTags item={item} compact />
    <div className="plan-card__schedule"><span className="plan-card__caption">{next ? eventLabel(entry, next) : 'Расписание'}</span><p className={next ? '' : 'plan-card__unconfirmed'}><Icon name="bell" size={15} /><span>{next ? `${next.kind === 'ends' ? 'до' : 'с'} ${formatDay(next.date)} · ${timing?.relative}` : entry.tracking ? noDate : 'Отслеживание на паузе'}</span></p>{!next && entry.tracking && <StageCountdown item={item} />}</div>
    {next?.kind === 'ends' && timing?.urgency && <span className="plan-card__urgency">{timing.urgency}</span>}
    {entry.note && <p className="plan-card__note"><Icon name="message-square" size={12} /><span>{entry.note}</span></p>}
  </article>;
}
