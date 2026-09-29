/**
 * iCalendar (RFC 5545) export of the plan calendar: the API serves it as a subscription feed, the demo builds the file
 * in the browser. No dependencies, so the API, the Mini App and tests share it as is.
 *
 * Every stage becomes an all-day event: a stage with a start and a later end is one event over those days,
 * a one-day stage or a lone start/end (a deadline) is a one-day event.
 */
export type IcsEvent = {
  stageId: string; name: string | null; stageKind: 'registration' | 'competition' | 'other';
  kind: 'starts' | 'ends' | 'day'; date: string; estimated: boolean;
};
export type IcsItem = { olympiadId: number; title: string; url?: string | null; events: IcsEvent[] };
export type IcsOptions = { name?: string; now?: Date };

type Entry = { uid: string; start: string; end: string; summary: string; description: string; url?: string; alarm: boolean };

const day = (value: string) => value.replace(/-/g, '');
const nextDay = (value: string) => new Date(Date.parse(`${value}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** TEXT value escaping (RFC 5545 §3.3.11). */
export function icsText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
}

/** Lines longer than 75 octets are folded; a multi-byte character is never split. */
export function foldLine(line: string) {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = '', size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    const limit = parts.length ? 74 : 75; // a continuation line starts with a space
    if (size + bytes > limit) { parts.push(current); current = ''; size = 0; }
    current += char; size += bytes;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

/** FNV-1a: a short stable id for a stage, independent of stage ids that change with every reference import. */
function hash(value: string) {
  let h = 0x811c9dc5;
  for (const char of value) { h ^= char.codePointAt(0)!; h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}

function entries(item: IcsItem): Entry[] {
  const byStage = new Map<string, IcsEvent[]>();
  for (const event of item.events) byStage.set(event.stageId, [...byStage.get(event.stageId) ?? [], event]);
  const used = new Map<string, number>();
  const list: Entry[] = [];
  for (const events of byStage.values()) {
    const first = events[0]!;
    const registration = first.stageKind === 'registration';
    const name = first.name?.trim() || (registration ? 'Регистрация' : 'Этап');
    const start = events.find(event => event.kind === 'starts');
    const end = events.find(event => event.kind === 'ends');
    const estimated = events.some(event => event.estimated);
    const make = (from: string, to: string, label: string, alarm: boolean, part: string) => {
      const key = `${first.stageKind}|${name.toLocaleLowerCase('ru')}|${part}`;
      const n = (used.get(key) ?? 0) + 1;
      used.set(key, n);
      const lines = [`${item.title}`, `${registration ? 'Регистрация' : `Этап: ${name}`}`];
      if (estimated) lines.push('Год в расписании не указан и рассчитан по учебному сезону — сверьте даты на сайте организатора.');
      else lines.push('Сверяйте даты на сайте организатора.');
      if (item.url) lines.push(item.url);
      list.push({ uid: `olimp-${item.olympiadId}-${hash(key)}${n > 1 ? `-${n}` : ''}@olimp`, start: from, end: nextDay(to),
        summary: `${label} · ${item.title}`, description: lines.join('\n'), ...(item.url ? { url: item.url } : {}), alarm });
    };
    if (start && end && start.date < end.date) {
      make(start.date, end.date, registration ? 'Регистрация' : name, true, 'range');
      continue;
    }
    for (const event of events) {
      const label = event.kind === 'day' ? name
        : registration ? event.kind === 'starts' ? 'Начало регистрации' : 'Конец регистрации'
        : event.kind === 'starts' ? `${name}: начало` : `${name}: окончание`;
      // Deadlines and the first day of a stage get a reminder the day before; the end of a stage does not.
      make(event.date, event.date, label, !(event.kind === 'ends' && !registration), event.kind);
    }
  }
  return list;
}

/** The whole calendar as a string with CRLF line breaks. */
export function buildIcs(items: IcsItem[], options: IcsOptions = {}) {
  const now = stamp(options.now ?? new Date());
  const name = options.name ?? 'Olimp — мой план';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Olimp//Plan//RU', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(name)}`, 'X-WR-TIMEZONE:Europe/Moscow', 'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H'];
  const all = items.flatMap(entries).sort((a, b) => a.start.localeCompare(b.start) || a.uid.localeCompare(b.uid));
  for (const entry of all) {
    lines.push('BEGIN:VEVENT', `UID:${entry.uid}`, `DTSTAMP:${now}`, `DTSTART;VALUE=DATE:${day(entry.start)}`, `DTEND;VALUE=DATE:${day(entry.end)}`,
      `SUMMARY:${icsText(entry.summary)}`, `DESCRIPTION:${icsText(entry.description)}`, 'TRANSP:TRANSPARENT');
    if (entry.url) lines.push(`URL:${entry.url}`);
    // 09:00 of the previous day for an all-day event (it starts at midnight).
    if (entry.alarm) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(entry.summary)}`, 'TRIGGER:-PT15H', 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
