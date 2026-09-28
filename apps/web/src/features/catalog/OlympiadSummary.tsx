import { Icon } from '@olimp/ui';
import type { Olympiad } from '../../lib/api';
import { calendarLabels, formats, gradeLabel, levelLabel, stageCountdown } from '../../lib/format';

// Fixed pastel hues keep each status recognizable across catalog cards and details.
const statusHues: Record<string, number> = {
  'Этап указан': 210,
  'Расписание не опубликовано': 235,
  'Следующий цикл ожидается': 280,
  'Итоги опубликованы': 175,
  'Идёт этап': 135,
  'Этап запланирован': 195,
  'Регистрация открыта': 100,
  'Регистрация завершена': 350,
  'Регистрация откроется позже': 40,
  'Информация ожидается': 65,
  'Расписание опубликовано': 255,
  'Есть ближайшее событие': 155,
  'Расписание обновлено': 315,
  'Нет ближайших событий': 25,
  'Не проводится по данным источника': 5,
};

export function OlympiadStatus({ item }: { item: Olympiad }) {
  const label = item.statusRaw?.trim() || calendarLabels[item.calendarState];
  if (/не указан/i.test(label)) return null;
  const hue = statusHues[label] ?? [...label].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % 360, 0);
  return <span className="badge" style={{ backgroundColor: `hsl(${hue} 58% 92%)`, color: `hsl(${hue} 32% 33%)` }}>{label}</span>;
}

export function OlympiadMeta({ item }: { item: Olympiad }) {
  const text = [...(item.organizers ?? []), formats[item.format].toLocaleLowerCase('ru')].join(' · ');
  return <p className="olympiad-meta" title={text}>{!!item.organizers?.length && <><span className="olympiad-meta__organizer">{item.organizers.join(', ')}</span><span aria-hidden="true">·</span></>}<span className="olympiad-meta__format">{formats[item.format].toLocaleLowerCase('ru')}</span></p>;
}

export function OlympiadTags({ item, compact = false }: { item: Olympiad; compact?: boolean }) {
  const subjects = compact ? item.subjects.slice(0, 3) : item.subjects;
  return <div className="tags olympiad-tags">{subjects.map(subject => <span className="tag tag--blue" key={subject.id}>{subject.name}</span>)}{compact && item.subjects.length > 3 && <span className="tag">+{item.subjects.length - 3}</span>}<span className="tag">{gradeLabel(item)}</span>{levelLabel(item) !== 'Не указан' && <span className="tag" title={item.levelStatus ?? undefined}>{levelLabel(item)}</span>}</div>;
}

/** «35 дней до этапа «…»». Hidden when the next stage start is unknown or has passed. */
export function StageCountdown({ item, className }: { item: Olympiad; className?: string }) {
  const countdown = stageCountdown(item);
  if (!countdown) return null;
  const title = `Начало — ${countdown.date}${countdown.estimated ? '. Год в источнике не указан и рассчитан по текущему сезону' : ''}`;
  return <p className={['stage-countdown', countdown.days <= 3 ? 'stage-countdown--soon' : '', className].filter(Boolean).join(' ')} title={title}>
    <Icon name="calendar" size={13} /><strong>{countdown.value}</strong><span>{countdown.text}</span>
  </p>;
}
