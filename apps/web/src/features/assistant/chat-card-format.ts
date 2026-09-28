import type { Olympiad } from '../../lib/api';
import { gradeLabel, moscowToday } from '../../lib/format';

const dayMonth = (day: string) => new Date(`${day}T12:00:00+03:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' });

/** «до 20 мая», «этап с 3 октября», «регистрация до 1 ноября»: the nearest date of the olympiad for the chat card. */
export function chatCardDate(item: Pick<Olympiad, 'calendarState' | 'nextEvent' | 'upcomingStage'>, today = moscowToday()) {
  if (item.calendarState === 'not_held') return 'не проводится';
  if (item.nextEvent && item.nextEvent.date >= today) return `${item.nextEvent.kind === 'ends' ? 'до' : 'с'} ${dayMonth(item.nextEvent.date)}`;
  const stage = item.upcomingStage;
  if (stage && stage.date >= today) return `${stage.kind === 'registration' ? 'регистрация' : 'этап'} ${stage.event === 'ends' ? 'до' : 'с'} ${dayMonth(stage.date)}`;
  return null;
}

/** Figma «Олимп» (177:309): «СПбГУ · до 20 мая» under the title; the grades when no date is known. */
export function chatCardMeta(item: Pick<Olympiad, 'organizers' | 'calendarState' | 'nextEvent' | 'upcomingStage' | 'gradeFrom' | 'gradeTo' | 'classesRaw'>, today = moscowToday()) {
  return [item.organizers?.[0], chatCardDate(item, today) ?? gradeLabel(item)].filter(Boolean).join(' · ');
}
