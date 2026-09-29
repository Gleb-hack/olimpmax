import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIcs, foldLine, icsText, type IcsEvent } from '../packages/contracts/src/ics.js';

const event = (stageId: string, stageKind: IcsEvent['stageKind'], kind: IcsEvent['kind'], date: string, name: string | null = null, estimated = false): IcsEvent =>
  ({ stageId, name, stageKind, kind, date, estimated });
const now = new Date('2026-09-29T12:00:00Z');
const unfold = (ics: string) => ics.replace(/\r\n /g, '');
const vevents = (ics: string) => unfold(ics).split('BEGIN:VEVENT').slice(1).map(block => block.split('END:VEVENT')[0]!);

test('a stage with a start and an end is one all-day event over those days, the end date exclusive', () => {
  const ics = buildIcs([{ olympiadId: 88, title: 'Высшая проба', url: 'https://olimpiada.ru/activity/88', events: [
    event('a', 'registration', 'starts', '2026-10-01'), event('a', 'registration', 'ends', '2026-11-10'),
    event('b', 'competition', 'day', '2026-11-15', 'Отборочный этап'),
  ] }], { now });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!/[^\r]\n/.test(ics), 'every line ends with CRLF');
  const [registration, stage] = vevents(ics);
  assert.match(registration!, /DTSTART;VALUE=DATE:20261001\r\nDTEND;VALUE=DATE:20261111/);
  assert.match(registration!, /SUMMARY:Регистрация · Высшая проба/);
  assert.match(stage!, /DTSTART;VALUE=DATE:20261115\r\nDTEND;VALUE=DATE:20261116/);
  assert.match(stage!, /SUMMARY:Отборочный этап · Высшая проба/);
  assert.match(stage!, /URL:https:\/\/olimpiada.ru\/activity\/88/);
  assert.match(stage!, /TRIGGER:-PT15H/);
  assert.match(ics, /DTSTAMP:20260929T120000Z/);
});

test('a lone deadline is a one-day event; the end of a competition stage has no alarm', () => {
  const ics = buildIcs([{ olympiadId: 1, title: 'ВсОШ', events: [
    event('r', 'registration', 'ends', '2026-10-20'), event('c', 'competition', 'ends', '2026-12-25', 'Муниципальный этап', true),
  ] }], { now });
  const [deadline, end] = vevents(ics);
  assert.match(deadline!, /SUMMARY:Конец регистрации · ВсОШ/);
  assert.match(deadline!, /BEGIN:VALARM/);
  assert.match(end!, /SUMMARY:Муниципальный этап: окончание · ВсОШ/);
  assert.doesNotMatch(end!, /BEGIN:VALARM/);
  assert.match(end!, /рассчитан по учебному сезону/);
});

test('UIDs are stable across stage ids and unique within the calendar', () => {
  const first = buildIcs([{ olympiadId: 5, title: 'Т', events: [event('x1', 'competition', 'day', '2026-11-01', 'Финал'), event('x2', 'competition', 'day', '2026-12-01', 'Финал')] }], { now });
  const second = buildIcs([{ olympiadId: 5, title: 'Т', events: [event('y1', 'competition', 'day', '2026-11-01', 'Финал'), event('y2', 'competition', 'day', '2026-12-01', 'Финал')] }], { now });
  const uids = (ics: string) => [...unfold(ics).matchAll(/UID:(.+)\r/g)].map(match => match[1]);
  assert.deepEqual(uids(first), uids(second));
  assert.equal(new Set(uids(first)).size, 2);
});

test('text is escaped and long lines are folded at 75 octets without splitting a character', () => {
  assert.equal(icsText('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
  const line = `SUMMARY:${'Всероссийская олимпиада школьников, '.repeat(6)}`;
  const folded = foldLine(line);
  for (const part of folded.split('\r\n')) assert.ok(new TextEncoder().encode(part).length <= 75);
  assert.equal(folded.replace(/\r\n /g, ''), line);
  assert.equal(buildIcs([], { now }).includes('BEGIN:VEVENT'), false);
});
