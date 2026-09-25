import type { Olympiad } from '../../lib/api';
import { calendarLabels, formats, gradeLabel, levelLabel } from '../../lib/format';

export function OlympiadStatus({ item }: { item: Olympiad }) {
  const label = item.statusRaw?.trim() || calendarLabels[item.calendarState];
  if (/не указан/i.test(label)) return null;
  return <span className={`badge badge--${item.calendarState === 'not_held' ? 'gray' : 'blue'}`}>{label}</span>;
}

export function OlympiadMeta({ item }: { item: Olympiad }) {
  const text = [...(item.organizers ?? []), formats[item.format].toLocaleLowerCase('ru')].join(' · ');
  return <p className="olympiad-meta" title={text}>{!!item.organizers?.length && <><span className="olympiad-meta__organizer">{item.organizers.join(', ')}</span><span aria-hidden="true">·</span></>}<span className="olympiad-meta__format">{formats[item.format].toLocaleLowerCase('ru')}</span></p>;
}

export function OlympiadTags({ item, compact = false }: { item: Olympiad; compact?: boolean }) {
  const subjects = compact ? item.subjects.slice(0, 3) : item.subjects;
  return <div className="tags olympiad-tags">{subjects.map(subject => <span className="tag tag--blue" key={subject.id}>{subject.name}</span>)}{compact && item.subjects.length > 3 && <span className="tag">+{item.subjects.length - 3}</span>}<span className="tag">{gradeLabel(item)}</span>{levelLabel(item) !== 'Не указан' && <span className="tag" title={item.levelStatus ?? undefined}>{levelLabel(item)}</span>}</div>;
}
