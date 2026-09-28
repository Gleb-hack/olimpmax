import type { Button, InlineKeyboardAttachmentRequest } from '@maxhub/max-bot-api/types';
import type { DueReminder } from './schedule.js';

/** Who the bot is: `open_app` buttons need the bot's username and user id (GET /me). */
export type BotIdentity = { username: string; userId: number };
/** start_param values the mini-app understands (see apps/web/src/lib/start-param.ts). */
export const startParam = { olympiad: (id: number) => `olympiad_${id}`, plan: 'plan', olimp: 'olimp' } as const;

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

/** HTML text of one reminder message: all olympiads due today in one message, not one message per deadline. */
export function reminderText(list: DueReminder[], options: { test?: boolean } = {}) {
  const groups = groupByOlympiad(list);
  const shown = groups.slice(0, MAX_OLYMPIADS);
  const mixed = list.some(d => d.estimated) && list.some(d => !d.estimated);
  const lines = [options.test ? '🔔 <b>Тестовое напоминание</b>' : '🔔 <b>Сроки олимпиад из вашего плана</b>', ''];
  for (const group of shown) {
    lines.push(`<b>${escapeHtml(clip(group.title, 150))}</b>`);
    for (const due of group.events) lines.push(`• ${escapeHtml(describeEvent(due))}${mixed && due.estimated ? '*' : ''}`);
    lines.push('');
  }
  if (groups.length > shown.length) lines.push(`И ещё ${groups.length - shown.length} — смотрите в разделе «План».`, '');
  if (list.some(d => d.estimated)) lines.push(`<i>${mixed ? '* ' : ''}${ESTIMATE_NOTE}</i>`);
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
  plan: 'plan', settings: 'settings', notifyOn: 'notify:on', notifyOff: 'notify:off',
} as const;

export function reminderKeyboard(list: DueReminder[], identity: BotIdentity | null): InlineKeyboardAttachmentRequest {
  const groups = groupByOlympiad(list).slice(0, 5);
  const rows: Button[][] = [];
  if (groups.length === 1) {
    const only = groups[0]!;
    if (identity) rows.push([openAppButton('Открыть карточку', identity, startParam.olympiad(only.olympiadId))]);
    rows.push([callbackButton('🔕 Не напоминать об этой олимпиаде', actions.mute(only.olympiadId))]);
  } else {
    if (identity) for (const group of groups) rows.push([openAppButton(clip(group.title, 48), identity, startParam.olympiad(group.olympiadId))]);
    rows.push([callbackButton('Все сроки', actions.plan), callbackButton('Настроить', actions.settings)]);
  }
  return keyboard(rows);
}
