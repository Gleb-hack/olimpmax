import type { Button, InlineKeyboardAttachmentRequest } from '@maxhub/max-bot-api/types';
import {
  actions, callbackButton, describeEvent, escapeHtml, ESTIMATE_NOTE, keyboard, openAppButton, startParam, type BotIdentity,
} from '../../api/src/features/reminders/format.js';
import type { DueReminder } from '../../api/src/features/reminders/schedule.js';

/** A bot reply: HTML text and an optional inline keyboard. */
export type Reply = { text: string; keyboard?: InlineKeyboardAttachmentRequest };
const clip = (value: string, max: number) => { const text = value.replace(/\s+/g, ' ').trim(); return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text; };
const rows = (...list: (Button[] | null)[]) => keyboard(list.filter((row): row is Button[] => row !== null && row.length > 0));
const appRow = (identity: BotIdentity | null, text: string, payload?: string) => identity ? [openAppButton(text, identity, payload)] : null;

export function welcomeMessage(identity: BotIdentity | null, input: { firstName: string; registered: boolean; enabled: boolean; hour: number }): Reply {
  const lines = [
    `Привет, ${escapeHtml(clip(input.firstName, 40) || 'друг')}! 👋`, '',
    'Я бот <b>Olimp</b>. Слежу за сроками олимпиад из вашего плана и пишу заранее: за неделю до конца регистрации, за 3 дня, накануне и в день события.', '',
    input.registered ? 'Добавляйте олимпиады в «План» в приложении и оставляйте у них отслеживание — остальное я возьму на себя.'
      : 'Откройте Olimp, заполните профиль и добавьте олимпиады в «План». Напоминания включатся сами.',
    '', `Пишу один раз в день, около ${input.hour}:00 по Москве.`,
    ...(input.enabled ? [] : ['', '⚠️ Сейчас напоминания выключены. Включить: /settings']),
    '', '/plan — ближайшие сроки\n/settings — настройки напоминаний',
  ];
  return { text: lines.join('\n'), keyboard: rows(appRow(identity, 'Открыть Olimp'), [callbackButton('Мои сроки', actions.plan)]) };
}

export function unknownUserMessage(identity: BotIdentity | null): Reply {
  return { text: 'Я пока не знаю ваш план. Откройте Olimp, войдите через MAX и добавьте олимпиады в «План» — тогда я смогу напоминать о сроках.',
    keyboard: rows(appRow(identity, 'Открыть Olimp')) };
}

export function planMessage(identity: BotIdentity | null, input: { tracked: number; upcoming: DueReminder[]; horizon: number; enabled: boolean }): Reply {
  const footer = rows(appRow(identity, 'Открыть план', startParam.plan), [callbackButton('Настроить напоминания', actions.settings)]);
  if (!input.tracked) return { text: 'В плане нет отслеживаемых олимпиад. Добавьте олимпиаду в «План» в приложении — и я начну следить за её сроками.', keyboard: footer };
  if (!input.upcoming.length) return {
    text: `У отслеживаемых олимпиад (${input.tracked}) нет известных дат в ближайшие ${input.horizon} дней. Расписание без точных дат смотрите в карточках олимпиад.`,
    keyboard: footer,
  };
  const shown = input.upcoming.slice(0, 12);
  const lines = [`<b>Ближайшие сроки</b> · ${input.horizon} дней`, ''];
  if (!input.enabled) lines.unshift('⚠️ Напоминания выключены — /settings', '');
  for (const due of shown) lines.push(`• ${escapeHtml(describeEvent(due))}`, `   <i>${escapeHtml(clip(due.title, 120))}</i>`);
  if (input.upcoming.length > shown.length) lines.push('', `И ещё ${input.upcoming.length - shown.length} — в разделе «План».`);
  if (shown.some(d => d.estimated)) lines.push('', `<i>${ESTIMATE_NOTE}</i>`);
  return { text: lines.join('\n'), keyboard: footer };
}

export function settingsMessage(identity: BotIdentity | null, input: { enabled: boolean; tracked: { id: number; title: string }[]; hour: number }): Reply {
  const lines = [
    `<b>Напоминания:</b> ${input.enabled ? 'включены ✅' : 'выключены'}`, '',
    input.enabled ? `Пишу раз в день около ${input.hour}:00 по Москве: за 7, 3 и 1 день до конца регистрации и в сам день; о начале этапа — за 3 дня, накануне и в день.`
      : 'Пока напоминания выключены, я не пишу первым. Команда /plan по-прежнему работает.',
    '', input.tracked.length ? `Отслеживаю олимпиад: ${input.tracked.length}. Чтобы больше не напоминать о какой-то из них, нажмите на неё ниже.`
      : 'В плане нет отслеживаемых олимпиад.',
  ];
  const olympiads = input.enabled ? input.tracked.slice(0, 8).map(o => [callbackButton(`🔕 ${clip(o.title, 44)}`, actions.mute(o.id, true))]) : [];
  return { text: lines.join('\n'), keyboard: rows(
    [callbackButton(input.enabled ? 'Выключить все напоминания' : 'Включить напоминания', input.enabled ? actions.notifyOff : actions.notifyOn)],
    ...olympiads, appRow(identity, 'Открыть план', startParam.plan)) };
}

export function mutedMessage(title: string, olympiadId: number): Reply {
  return { text: `Больше не напоминаю об олимпиаде «${escapeHtml(clip(title, 150))}». Она осталась в плане, отслеживание можно включить там же.`,
    keyboard: rows([callbackButton('Вернуть напоминания', actions.unmute(olympiadId))]) };
}

export function fallbackMessage(identity: BotIdentity | null): Reply {
  return { text: 'Я присылаю напоминания о сроках олимпиад. С вопросами об олимпиадах, льготах и поступлении поможет Олимп — чат-помощник в приложении.',
    keyboard: rows(appRow(identity, 'Спросить Олимпа', startParam.olimp), [callbackButton('Мои сроки', actions.plan), callbackButton('Настройки', actions.settings)]) };
}
