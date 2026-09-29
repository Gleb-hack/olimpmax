import { useMemo, useState } from 'react';
import { Icon } from '@olimp/ui';
import type { PlanEntry } from '../../lib/api';
import { dateParts, moscowToday } from '../../lib/format';
import { dayKey, dayTitle, monthGrid, monthOf, monthTitle, ongoingItems, planCalendarItems, planCalendarRanges, rangeDays, shiftMonth, visibleItems, type CalendarItem, type MonthRef } from './calendar-model';

const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function EventRow({ item, onOpen }: { item: CalendarItem; onOpen: () => void }) {
  const parts = dateParts(item.date);
  return <li><button type="button" className="calendar-event" onClick={onOpen}>
    <span className={`date-tile calendar-event__date calendar-tone--${item.tone}`} aria-hidden="true"><small>{parts.month}</small><strong>{parts.day}</strong></span>
    <span className="calendar-event__copy"><strong>{item.title}</strong><span>{item.label}</span></span>
    <Icon name="chevron-right" size={16} className="calendar-event__chevron" />
  </button></li>;
}

/** «Мой план — Календарь» from Figma: month grid with registration and selection/final marks, events under it. */
export function PlanCalendar({ entries, onOpen }: { entries: PlanEntry[]; onOpen: (olympiadId: number) => void }) {
  const today = moscowToday();
  const [shown, setShown] = useState<MonthRef>(() => monthOf(today));
  const [selected, setSelected] = useState<string | null>(null);
  const items = useMemo(() => planCalendarItems(entries), [entries]);
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items) map.set(item.date, [...map.get(item.date) ?? [], item]);
    return map;
  }, [items]);
  const ranges = useMemo(() => planCalendarRanges(items), [items]);
  const periods = useMemo(() => rangeDays(ranges), [ranges]);
  const list = visibleItems(items, shown, today, selected, ranges);
  // The first event after the shown month, to jump to when this month has nothing left.
  const next = items.find(item => item.date >= today && item.date > dayKey(shown, 31));
  const go = (delta: number) => { setShown(month => shiftMonth(month, delta)); setSelected(null); };

  return <div className="plan-calendar">
    <div className="calendar-notice"><Icon name="bell" size={16} /><p>Здесь этапы олимпиад, которые ты отслеживаешь. Нажми на день, чтобы увидеть его события.</p></div>
    <section className="calendar-card" aria-label={`Календарь: ${monthTitle(shown)}`}>
      <div className="calendar-card__head"><h2>{monthTitle(shown)}</h2>
        <div className="calendar-card__nav"><button type="button" aria-label="Предыдущий месяц" onClick={() => go(-1)}><Icon name="chevron-left" size={18} /></button><button type="button" aria-label="Следующий месяц" onClick={() => go(1)}><Icon name="chevron-right" size={18} /></button></div>
      </div>
      <div className="calendar-grid" role="grid">
        <div className="calendar-grid__row calendar-grid__weekdays" role="row">{weekdays.map(day => <span key={day} role="columnheader">{day}</span>)}</div>
        {monthGrid(shown).map((week, index) => <div className="calendar-grid__row" role="row" key={index}>{week.map((day, column) => {
          if (day === null) return <span key={column} className="calendar-day calendar-day--empty" role="gridcell" />;
          const key = dayKey(shown, day);
          const events = byDay.get(key) ?? [];
          const tones = [...new Set(events.map(event => event.tone))];
          const tone = tones.includes('registration') ? 'registration' : tones[0];
          const period = periods.get(key);
          const described = [...events, ...ongoingItems(ranges, key)];
          const label = `${dayTitle(key)}${described.length ? `: ${described.map(event => `${event.title} — ${event.label}`).join('; ')}` : ''}`;
          const cell = period ? ['calendar-cell--range', `calendar-tone--${period.tone}`, period.start ? 'calendar-cell--range-start' : '', period.end ? 'calendar-cell--range-end' : '', key < today ? 'calendar-cell--past' : ''].filter(Boolean).join(' ') : undefined;
          return <span key={column} role="gridcell" className={cell}><button type="button" aria-label={label} aria-pressed={selected === key}
            className={['calendar-day', tone ? `calendar-day--marked calendar-tone--${tone}` : '', period && !tone ? 'calendar-day--in-range' : '', period && tone && (period.start || period.end) && !(period.start && period.end) ? 'calendar-day--range-edge' : '', key === today ? 'calendar-day--today' : '', key < today ? 'calendar-day--past' : '', selected === key ? 'calendar-day--selected' : ''].filter(Boolean).join(' ')}
            onClick={() => setSelected(selected === key ? null : key)}>
            <span className="calendar-day__number">{day}</span>
            {tones.length > 0 && <span className="calendar-day__dots" aria-hidden="true">{tones.map(value => <i key={value} className={`calendar-tone--${value}`} />)}</span>}
          </button></span>;
        })}</div>)}
      </div>
    </section>
    <div className="calendar-legend" aria-hidden="true"><span><i className="calendar-tone--registration" />Регистрация</span><span><i className="calendar-tone--competition" />Отбор / финал</span></div>
    <section className="calendar-events"><h2>{list.heading}</h2>
      {list.items.length ? <ul>{list.items.map(item => <EventRow key={item.key} item={item} onOpen={() => onOpen(item.olympiadId)} />)}</ul>
        : <p className="calendar-events__empty">{selected ? 'В этот день нет этапов.' : items.length ? 'В этом месяце больше нет этапов.' : 'Пока нет дат этапов. Отслеживай олимпиады из каталога — их этапы появятся здесь.'}
          {!selected && next && <> <button type="button" className="text-button" onClick={() => { setShown(monthOf(next.date)); setSelected(next.date); }}>Ближайшее: {dayTitle(next.date)}</button></>}</p>}
    </section>
  </div>;
}
