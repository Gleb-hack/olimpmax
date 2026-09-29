import type { Button, InlineKeyboardAttachmentRequest } from '@maxhub/max-bot-api/types';
import type { ChangedEvent, DueReminder, ScheduleChange } from './schedule.js';

/** Who the bot is: `open_app` buttons need the bot's username and user id (GET /me). */
export type BotIdentity = { username: string; userId: number };
/** Text for a start parameter: MAX takes only [A-Za-z0-9_-], so the (Cyrillic) text goes as UTF-8 in base64url. */
const encodeText = (value: string, max: number) => Buffer.from(clip(value, max), 'utf8').toString('base64url');
/** Longest text a start parameter carries: base64url of Cyrillic is ~2.7× longer, and MAX allows 512 characters. */
export const START_TEXT_LIMIT = { ask: 150, search: 60 } as const;
/** start_param values the mini-app understands (see apps/web/src/lib/start-param.ts). */
export const startParam = {
  olympiad: (id: number) => `olympiad_${id}`, plan: 'plan', olimp: 'olimp',
  /** The Olimp chat with the question already typed in (the pupil sends it). */
  ask: (text: string) => `ask_${encodeText(text, START_TEXT_LIMIT.ask)}`,
  /** Catalog search for the text. */
  search: (text: string) => `search_${encodeText(text, START_TEXT_LIMIT.search)}`,
} as const;

export const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const clip = (value: string, max: number) => { const text = value.replace(/\s+/g, ' ').trim(); return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text; };
const capitalize = (value: string) => value.charAt(0).toLocaleUpperCase('ru') + value.slice(1);

export function pluralDays(n: number) {
  const mod10 = n % 10, mod100 = n % 100;
  const word = mod10 === 1 && mod100 !== 11 ? 'день' : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'дня' : 'дней';
  return `${n} ${word}`;
}
const dayFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', weekday: 'short', timeZone: 'UTC' });
/** 2026-10-05 → «5 октября, пн». */
export function formatDay(iso: string) {
  const parts = dayFormat.formatToParts(new Date(iso + 'T12:00:00Z'));
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return `${get('day')} ${get('month')}, ${get('weekday')}`;
}
export function when(daysLeft: number, date: string) {
  const relative = daysLeft === 0 ? 'сегодня' : daysLeft === 1 ? 'завтра' : daysLeft === 2 ? 'послезавтра' : `через ${pluralDays(daysLeft)}`;
  return `${relative} — ${formatDay(date)}`;
}
/** «Регистрация закрывается завтра — 5 октября, пн». Plain text: callers escape it. */
export function describeEvent(due: Pick<DueReminder, 'stageKind' | 'eventKind' | 'stageName' | 'daysLeft' | 'eventDate'>) {
  const at = when(due.daysLeft, due.eventDate);
  const name = due.stageName && !/^дополнительная дата$/i.test(due.stageName.trim()) ? capitalize(clip(due.stageName, 80)) : null;
  if (due.stageKind === 'registration') {
    if (due.eventKind === 'ends') return `Регистрация закрывается ${at}`;
    if (due.eventKind === 'starts') return `Регистрация открывается ${at}`;
    return `Регистрация: ${at}`;
  }
  const stage = name ?? (due.stageKind === 'competition' ? 'Этап олимпиады' : 'Событие олимпиады');
  if (due.eventKind === 'starts') return `${stage} начинается ${at}`;
  if (due.eventKind === 'ends') return `${stage} заканчивается ${at}`;
  return `${stage}: ${at}`;
}

export const ESTIMATE_NOTE = 'Даты взяты из расписания в каталоге Olimp, год подставлен по учебному сезону. Перед регистрацией сверьте их на сайте олимпиады.';
const MAX_OLYMPIADS = 8;

export function groupByOlympiad(list: DueReminder[]) {
  const groups = new Map<number, { olympiadId: number; title: string; events: DueReminder[] }>();
  for (const due of list) {
    const group = groups.get(due.olympiadId) ?? { olympiadId: due.olympiadId, title: due.title, events: [] };
    group.events.push(due); groups.set(due.olympiadId, group);
  }
  return [...groups.values()];
}

/** «4 октября» — the old date next to a moved one. */
const shortDay = (iso: string) => formatDay(iso).replace(/, .*$/, '');
function changedLine(event: ChangedEvent) {
  return `${describeEvent(event)}${event.previousDate ? ` (было ${shortDay(event.previousDate)})` : ' (новая дата)'}`;
}

/**
 * HTML text of one daily message: all olympiads due today and, below them, dates that changed since the last
 * message — one message per day, not one per deadline.
 */
export function reminderText(list: DueReminder[], options: { test?: boolean; changes?: ScheduleChange[] } = {}) {
  // A moved date that is also due today is said once: in the reminder, with the old date next to it.
  const key = (due: DueReminder) => `${due.olympiadId}|${due.eventKey}`;
  const dueKeys = new Set(list.map(key));
  const moved = new Map((options.changes ?? []).flatMap(change => change.events).filter(event => dueKeys.has(key(event))).map(event => [key(event), event]));
  const changes = (options.changes ?? []).map(change => ({ ...change, events: change.events.filter(event => !moved.has(key(event))) }))
    .filter(change => change.events.length);
  const dueLine = (due: DueReminder) => { const was = moved.get(key(due)); return was ? changedLine(was) : describeEvent(due); };
  const all = [...list, ...changes.flatMap(change => change.events)];
  const mixed = all.some(d => d.estimated) && all.some(d => !d.estimated);
  const mark = (due: DueReminder) => mixed && due.estimated ? '*' : '';
  const lines: string[] = [];
  let left = MAX_OLYMPIADS, hidden = 0;
  if (list.length || options.test) {
    lines.push(options.test ? '🔔 <b>Тестовое напоминание</b>' : '🔔 <b>Сроки олимпиад из вашего плана</b>', '');
    for (const group of groupByOlympiad(list)) {
      if (left-- <= 0) { hidden++; continue; }
      lines.push(`<b>${escapeHtml(clip(group.title, 150))}</b>`);
      for (const due of group.events) lines.push(`• ${escapeHtml(dueLine(due))}${mark(due)}`);
      lines.push('');
    }
  }
  if (changes.length) {
    lines.push(list.length ? '📅 <b>Изменились сроки</b>' : '📅 <b>Изменились сроки олимпиад из вашего плана</b>', '');
    for (const change of changes) {
      if (left-- <= 0) { hidden++; continue; }
      lines.push(`<b>${escapeHtml(clip(change.title, 150))}</b>`);
      for (const event of change.events) lines.push(`• ${escapeHtml(changedLine(event))}${mark(event)}`);
      lines.push('');
    }
  }
  if (hidden) lines.push(`И ещё ${hidden} — смотрите в разделе «План».`, '');
  if (all.some(d => d.estimated)) lines.push(`<i>${mixed ? '* ' : ''}${ESTIMATE_NOTE}</i>`);
  if (options.test) lines.push('', 'Так будут приходить напоминания: за неделю до конца регистрации, за 3 дня, накануне и в день события.');
  return lines.join('\n').trim();
}

export function openAppButton(text: string, identity: BotIdentity, payload?: string): Button {
  return { type: 'open_app', text, web_app: identity.username, contact_id: identity.userId, ...(payload ? { payload } : {}) };
}
export const callbackButton = (text: string, payload: string): Button => ({ type: 'callback', text, payload });
export const keyboard = (rows: Button[][]): InlineKeyboardAttachmentRequest => ({ type: 'inline_keyboard', payload: { buttons: rows } });

/** Callback payloads the bot understands. */
export const actions = {
  /** `fromSettings` — the button sits in the settings message, which is then redrawn in place. */
  mute: (id: number, fromSettings = false) => `mute:${id}${fromSettings ? ':s' : ''}`, unmute: (id: number) => `unmute:${id}`,
  /** «Я зарегистрировался»: plan status planned → registered, so registration reminders stop; `unregistered` undoes it. */
  registered: (id: number) => `reg:${id}`, unregistered: (id: number) => `unreg:${id}`,
  plan: 'plan', settings: 'settings', notifyOn: 'notify:on', notifyOff: 'notify:off',
} as const;

/**
 * Buttons under the daily message. The first thing a pupil does after «registration closes in 3 days» is register,
 * so an olympiad with a registration date gets «✅ Я зарегистрировался» first; muting comes last.
 */
export function reminderKeyboard(list: DueReminder[], identity: BotIdentity | null): InlineKeyboardAttachmentRequest {
  const groups = groupByOlympiad(list).slice(0, 5);
  const registration = (group: { events: DueReminder[] }) => group.events.some(due => due.stageKind === 'registration');
  const rows: Button[][] = [];
  if (groups.length === 1) {
    const only = groups[0]!;
    if (registration(only)) rows.push([callbackButton('✅ Я зарегистрировался', actions.registered(only.olympiadId))]);
    if (identity) rows.push([openAppButton('Открыть карточку', identity, startParam.olympiad(only.olympiadId))]);
    rows.push([callbackButton('🔕 Не напоминать об этой олимпиаде', actions.mute(only.olympiadId))]);
  } else {
    for (const group of groups) {
      if (identity) rows.push([openAppButton(clip(group.title, 48), identity, startParam.olympiad(group.olympiadId))]);
      if (registration(group)) rows.push([callbackButton(`✅ Зарегистрировался · ${clip(group.title, 30)}`, actions.registered(group.olympiadId))]);
    }
    rows.push([callbackButton('Все сроки', actions.plan), callbackButton('Настроить', actions.settings)]);
  }
  return keyboard(rows);
}
