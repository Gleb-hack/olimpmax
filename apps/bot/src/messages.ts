import type { Button, InlineKeyboardAttachmentRequest } from '@maxhub/max-bot-api/types';
import {
  actions, callbackButton, describeEvent, escapeHtml, ESTIMATE_NOTE, keyboard, openAppButton, startParam, type BotIdentity,
} from '../../api/src/features/reminders/format.js';
import type { DueReminder } from '../../api/src/features/reminders/schedule.js';
import type { PlanStatus } from '../../api/src/features/reminders/delivery.js';

/** A bot reply: HTML text and an optional inline keyboard. */
export type Reply = { text: string; keyboard?: InlineKeyboardAttachmentRequest };
const clip = (value: string, max: number) => { const text = value.replace(/\s+/g, ' ').trim(); return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text; };
const rows = (...list: (Button[] | null)[]) => keyboard(list.filter((row): row is Button[] => row !== null && row.length > 0));
const appRow = (identity: BotIdentity | null, text: string, payload?: string) => identity ? [openAppButton(text, identity, payload)] : null;

/** When the bot writes, in the pupil's own time: the region of the profile sets it, Moscow time until it is filled in. */
export type Schedule = { hour: number; localTime: boolean };
const whenText = (s: Schedule) => s.localTime ? `после ${s.hour}:00 по вашему времени` : `после ${s.hour}:00 по Москве`;
const REGION_HINT = 'Укажите регион в профиле Olimp — и я буду писать по вашему местному времени.';

/**
 * How the dialog was opened: `max.ru/<bot>?start=notify` from the mini-app («Подключить напоминания»), or
 * `?start=olympiad_<id>` — a link to an olympiad. Anything else is a plain «Начать».
 */
export type StartReason = { kind: 'plain' } | { kind: 'notify' } | { kind: 'olympiad'; id: number; title: string };
export function parseStartPayload(payload: string | null | undefined): { kind: 'plain' } | { kind: 'notify' } | { kind: 'olympiad'; id: number } {
  if (payload === 'notify' || payload === 'plan') return { kind: 'notify' };
  const olympiad = /^olympiad_([1-9]\d{0,8})$/.exec(payload ?? '');
  return olympiad ? { kind: 'olympiad', id: Number(olympiad[1]) } : { kind: 'plain' };
}

export function welcomeMessage(identity: BotIdentity | null, input: { firstName: string; registered: boolean; enabled: boolean; schedule: Schedule; reason?: StartReason }): Reply {
  const reason = input.reason ?? { kind: 'plain' };
  const name = escapeHtml(clip(input.firstName, 40) || 'друг');
  const lines = reason.kind === 'notify'
    ? [`Готово, ${name}! 🔔 Бот подключён.`, '', 'Буду писать о сроках олимпиад из вашего плана: за неделю до конца регистрации, за 3 дня, накануне и в день события. Если организатор перенесёт даты — тоже сообщу.']
    : [`Привет, ${name}! 👋`, '',
      'Я бот <b>Olimp</b>. Слежу за сроками олимпиад из вашего плана и пишу заранее: за неделю до конца регистрации, за 3 дня, накануне и в день события. Если даты перенесут — сообщу.', '',
      input.registered ? 'Добавляйте олимпиады в «План» в приложении и оставляйте у них отслеживание — остальное я возьму на себя.'
        : 'Откройте Olimp, заполните профиль и добавьте олимпиады в «План». Напоминания включатся сами.'];
  if (reason.kind === 'olympiad') lines.push('', `Вы пришли по ссылке на олимпиаду «${escapeHtml(clip(reason.title, 120))}». Добавьте её в план в приложении — и я напомню о сроках.`);
  lines.push('', `Пишу только когда подходит срок, ${whenText(input.schedule)}.${input.schedule.localTime ? '' : ` ${REGION_HINT}`}`);
  if (!input.enabled) lines.push('', '⚠️ Сейчас напоминания выключены. Включить: /settings');
  lines.push('', '/plan — ближайшие сроки\n/settings — настройки напоминаний');
  const open = reason.kind === 'olympiad' ? appRow(identity, 'Открыть олимпиаду', startParam.olympiad(reason.id)) : null;
  return { text: lines.join('\n'), keyboard: rows(open, appRow(identity, 'Открыть Olimp', reason.kind === 'notify' ? startParam.plan : undefined), [callbackButton('Мои сроки', actions.plan)]) };
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

export function settingsMessage(identity: BotIdentity | null, input: { enabled: boolean; tracked: { id: number; title: string }[]; schedule: Schedule }): Reply {
  const lines = [
    `<b>Напоминания:</b> ${input.enabled ? 'включены ✅' : 'выключены'}`, '',
    input.enabled ? `Пишу только когда подходит срок, ${whenText(input.schedule)}: за неделю, за 3 дня, накануне и в последний день регистрации; об этапе — накануне и в день; о перенесённых датах — сразу после изменения.`
      : 'Пока напоминания выключены, я не пишу первым. Команда /plan по-прежнему работает.',
    ...(input.enabled && !input.schedule.localTime ? ['', REGION_HINT] : []),
    '', input.tracked.length ? `Отслеживаю олимпиад: ${input.tracked.length}. Чтобы больше не напоминать о какой-то из них, нажмите на неё ниже.`
      : 'В плане нет отслеживаемых олимпиад.',
  ];
  const olympiads = input.enabled ? input.tracked.slice(0, 8).map(o => [callbackButton(`🔕 ${clip(o.title, 44)}`, actions.mute(o.id, true))]) : [];
  if (input.enabled && input.tracked.length > 8) lines.push(`Здесь первые 8; остальные — переключателем отслеживания в «Плане».`);
  return { text: lines.join('\n'), keyboard: rows(
    [callbackButton(input.enabled ? 'Выключить все напоминания' : 'Включить напоминания', input.enabled ? actions.notifyOff : actions.notifyOn)],
    ...olympiads, appRow(identity, 'Открыть план', startParam.plan)) };
}

export function mutedMessage(title: string, olympiadId: number): Reply {
  return { text: `Больше не напоминаю об олимпиаде «${escapeHtml(clip(title, 150))}». Она осталась в плане, отслеживание можно включить там же.`,
    keyboard: rows([callbackButton('Вернуть напоминания', actions.unmute(olympiadId))]) };
}

const STATUS_TEXT: Record<PlanStatus, string> = { planned: 'в планах', registered: 'зарегистрирован', in_progress: 'участвую', done: 'завершено' };
/** After «✅ Я зарегистрировался»: what changed and an undo. */
export function registeredMessage(identity: BotIdentity | null, title: string, olympiadId: number): Reply {
  return { text: `Отметил в плане: вы зарегистрированы на «${escapeHtml(clip(title, 150))}». 🎉\n\nО регистрации больше не напоминаю, а о датах этапов — напомню.`,
    keyboard: rows([callbackButton('Отменить', actions.unregistered(olympiadId))], appRow(identity, 'Открыть карточку', startParam.olympiad(olympiadId))) };
}
/** The pop-up after «Я зарегистрировался» when nothing changed. */
export function registeredNotice(result: { status: PlanStatus; changed: boolean } | null) {
  if (!result) return 'Этой олимпиады уже нет в вашем плане';
  if (result.changed) return 'Отметил: вы зарегистрированы';
  return `В плане уже стоит статус «${STATUS_TEXT[result.status]}»`;
}

/**
 * Anything the bot does not handle itself. The bot is a companion to the mini-app, not a second copy of it: a question
 * goes to Olimp and a query to the catalog search — both open in the app with the text already typed in.
 */
export function fallbackMessage(identity: BotIdentity | null, text?: string): Reply {
  const query = text?.replace(/\s+/g, ' ').trim() ?? '';
  const footer = [callbackButton('Мои сроки', actions.plan), callbackButton('Настройки', actions.settings)];
  if (!query || query.startsWith('/') || !identity) return {
    text: 'Я присылаю напоминания о сроках олимпиад. С вопросами об олимпиадах, льготах и поступлении поможет Олимп — чат-помощник в приложении.',
    keyboard: rows(appRow(identity, 'Спросить Олимпа', startParam.olimp), footer),
  };
  // A short query without a question looks like a search («физтех», «олимпиады по химии»): the search button goes first.
  const looksLikeSearch = !/[?？]/.test(query) && query.split(' ').length <= 4;
  const ask = [openAppButton('💬 Спросить Олимпа', identity, startParam.ask(query))];
  const search = [openAppButton('🔎 Найти в каталоге', identity, startParam.search(query))];
  return {
    text: `Сам я на вопросы не отвечаю — я слежу за сроками. ${looksLikeSearch ? 'Найти олимпиады или спросить Олимпа' : 'Спросить Олимпа или найти олимпиады'} можно в приложении: ваш текст уже будет там.`,
    keyboard: rows(...(looksLikeSearch ? [search, ask] : [ask, search]), footer),
  };
}
