/**
 * Time zone of a pupil for the reminder mailing, taken from the region of the profile (the list in
 * apps/web/src/lib/regions.ts). An empty or unknown region — Moscow time, and the bot asks to fill it in.
 * Reminders go out after school by local time: 16:00 in Moscow is already 23:00 in Vladivostok.
 */
export const DEFAULT_TIMEZONE = 'Europe/Moscow';

const ZONES: Record<string, readonly string[]> = {
  'Europe/Moscow': ['Москва', 'Московская область', 'Белгородская область', 'Брянская область', 'Владимирская область',
    'Воронежская область', 'Ивановская область', 'Калужская область', 'Костромская область', 'Курская область', 'Липецкая область',
    'Орловская область', 'Рязанская область', 'Смоленская область', 'Тамбовская область', 'Тверская область', 'Тульская область',
    'Ярославская область', 'Санкт-Петербург', 'Ленинградская область', 'Республика Карелия', 'Республика Коми', 'Архангельская область',
    'Вологодская область', 'Мурманская область', 'Новгородская область', 'Псковская область', 'Ненецкий автономный округ',
    'Республика Адыгея', 'Республика Калмыкия', 'Краснодарский край', 'Волгоградская область', 'Ростовская область', 'Республика Крым',
    'Севастополь', 'Донецкая Народная Республика', 'Луганская Народная Республика', 'Запорожская область', 'Херсонская область',
    'Республика Дагестан', 'Республика Ингушетия', 'Кабардино-Балкарская Республика', 'Карачаево-Черкесская Республика',
    'Республика Северная Осетия — Алания', 'Чеченская Республика', 'Ставропольский край', 'Республика Марий Эл', 'Республика Мордовия',
    'Республика Татарстан', 'Чувашская Республика', 'Кировская область', 'Нижегородская область', 'Пензенская область'],
  'Europe/Kaliningrad': ['Калининградская область'],
  'Europe/Samara': ['Самарская область', 'Удмуртская Республика', 'Удмуртия'],
  'Europe/Saratov': ['Саратовская область'],
  'Europe/Ulyanovsk': ['Ульяновская область'],
  'Europe/Astrakhan': ['Астраханская область'],
  'Asia/Yekaterinburg': ['Республика Башкортостан', 'Башкортостан', 'Башкирия', 'Оренбургская область', 'Пермский край', 'Курганская область',
    'Свердловская область', 'Тюменская область', 'Челябинская область', 'Ханты-Мансийский автономный округ — Югра', 'ХМАО', 'Югра',
    'Ямало-Ненецкий автономный округ', 'ЯНАО', 'Ямал'],
  'Asia/Omsk': ['Омская область'],
  'Asia/Novosibirsk': ['Новосибирская область'],
  'Asia/Barnaul': ['Алтайский край', 'Республика Алтай'],
  'Asia/Tomsk': ['Томская область'],
  'Asia/Novokuznetsk': ['Кемеровская область — Кузбасс', 'Кемеровская область', 'Кузбасс'],
  'Asia/Krasnoyarsk': ['Красноярский край', 'Республика Тыва', 'Тыва', 'Тува', 'Республика Хакасия', 'Хакасия'],
  'Asia/Irkutsk': ['Иркутская область', 'Республика Бурятия', 'Бурятия'],
  'Asia/Chita': ['Забайкальский край'],
  'Asia/Yakutsk': ['Амурская область', 'Республика Саха (Якутия)', 'Якутия', 'Саха'],
  'Asia/Vladivostok': ['Приморский край', 'Приморье', 'Хабаровский край', 'Еврейская автономная область', 'ЕАО'],
  'Asia/Magadan': ['Магаданская область'],
  'Asia/Sakhalin': ['Сахалинская область', 'Сахалин'],
  'Asia/Kamchatka': ['Камчатский край', 'Камчатка'],
  'Asia/Anadyr': ['Чукотский автономный округ', 'Чукотка'],
};
/** Same normalization as the region field of the profile: case, «ё», dashes and punctuation do not matter. */
const normalize = (text: string) => text.toLocaleLowerCase('ru').replaceAll('ё', 'е').replace(/[—–-]/g, ' ').replace(/[^\p{L}\p{N}() ]+/gu, ' ').replace(/\s+/g, ' ').trim();
const byRegion = new Map(Object.entries(ZONES).flatMap(([zone, names]) => names.map(name => [normalize(name), zone] as const)));

/** Every zone the mailing may meet: the scheduler skips a check when it is outside the sending hours everywhere. */
export const ALL_TIMEZONES = Object.keys(ZONES);
export function regionTimezone(region: string | null | undefined) {
  return byRegion.get(normalize(region ?? '')) ?? DEFAULT_TIMEZONE;
}
/** Whether the time zone came from the region or is the Moscow fallback: the bot then asks to fill in the region. */
export const isKnownRegion = (region: string | null | undefined) => byRegion.has(normalize(region ?? ''));

/** Hour 0–23 in a time zone. */
export function localHour(now: Date, timezone: string) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', hourCycle: 'h23' }).format(now));
}
/** Calendar day YYYY-MM-DD in a time zone. */
export function localDay(now: Date, timezone: string) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export type SendingHours = { from: number; until: number };
export const withinHours = (now: Date, timezone: string, hours: SendingHours) => {
  const hour = localHour(now, timezone);
  return hour >= hours.from && hour < hours.until;
};
