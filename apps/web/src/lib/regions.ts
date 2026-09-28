// Regions of Russia by federal district, for the region field of the profile (from regions.txt, plus the Chukotka
// autonomous okrug that the file left out). `aliases` are spellings people type: «ХМАО», «Питер», «Якутия».

export type Region = { name: string; aliases?: string[] };
export type RegionGroup = { district: string; regions: Region[] };

const r = (name: string, ...aliases: string[]): Region => aliases.length ? { name, aliases } : { name };

export const regionGroups: RegionGroup[] = [
  { district: 'Центральный округ', regions: [
    r('Белгородская область'), r('Брянская область'), r('Владимирская область'), r('Воронежская область'), r('Ивановская область'),
    r('Калужская область'), r('Костромская область'), r('Курская область'), r('Липецкая область'), r('Московская область', 'Подмосковье', 'МО'),
    r('Орловская область'), r('Рязанская область'), r('Смоленская область'), r('Тамбовская область'), r('Тверская область'),
    r('Тульская область'), r('Ярославская область'), r('Москва', 'Мск'),
  ] },
  { district: 'Северо-Западный округ', regions: [
    r('Республика Карелия', 'Карелия'), r('Республика Коми', 'Коми'), r('Архангельская область'), r('Вологодская область'),
    r('Калининградская область'), r('Ленинградская область', 'Ленобласть'), r('Мурманская область'), r('Новгородская область'),
    r('Псковская область'), r('Санкт-Петербург', 'СПб', 'Питер', 'Петербург'), r('Ненецкий автономный округ', 'НАО'),
  ] },
  { district: 'Южный округ', regions: [
    r('Республика Адыгея', 'Адыгея'), r('Республика Калмыкия', 'Калмыкия'), r('Краснодарский край', 'Кубань'), r('Астраханская область'),
    r('Волгоградская область'), r('Ростовская область'), r('Запорожская область'), r('Республика Крым', 'Крым'), r('Севастополь'),
    r('Донецкая Народная Республика', 'ДНР'), r('Луганская Народная Республика', 'ЛНР'), r('Херсонская область'),
  ] },
  { district: 'Северо-Кавказский округ', regions: [
    r('Республика Дагестан', 'Дагестан'), r('Республика Ингушетия', 'Ингушетия'), r('Кабардино-Балкарская Республика', 'Кабардино-Балкария', 'КБР'),
    r('Карачаево-Черкесская Республика', 'Карачаево-Черкесия', 'КЧР'), r('Республика Северная Осетия — Алания', 'Северная Осетия', 'Осетия'),
    r('Чеченская Республика', 'Чечня'), r('Ставропольский край'),
  ] },
  { district: 'Приволжский округ', regions: [
    r('Республика Башкортостан', 'Башкортостан', 'Башкирия'), r('Республика Марий Эл', 'Марий Эл'), r('Республика Мордовия', 'Мордовия'),
    r('Республика Татарстан', 'Татарстан', 'Татария'), r('Удмуртская Республика', 'Удмуртия'), r('Чувашская Республика', 'Чувашия'),
    r('Кировская область'), r('Нижегородская область'), r('Оренбургская область'), r('Пензенская область'), r('Пермский край'),
    r('Самарская область'), r('Саратовская область'), r('Ульяновская область'),
  ] },
  { district: 'Уральский округ', regions: [
    r('Курганская область'), r('Свердловская область'), r('Тюменская область'), r('Челябинская область'),
    r('Ханты-Мансийский автономный округ — Югра', 'ХМАО', 'Югра'), r('Ямало-Ненецкий автономный округ', 'ЯНАО', 'Ямал'),
  ] },
  { district: 'Сибирский округ', regions: [
    r('Республика Алтай'), r('Республика Тыва', 'Тыва', 'Тува'), r('Республика Хакасия', 'Хакасия'), r('Алтайский край'), r('Красноярский край'),
    r('Иркутская область'), r('Кемеровская область — Кузбасс', 'Кузбасс'), r('Новосибирская область'), r('Омская область'), r('Томская область'),
  ] },
  { district: 'Дальневосточный округ', regions: [
    r('Республика Бурятия', 'Бурятия'), r('Республика Саха (Якутия)', 'Якутия', 'Саха'), r('Приморский край', 'Приморье'), r('Хабаровский край'),
    r('Амурская область'), r('Камчатский край', 'Камчатка'), r('Магаданская область'), r('Сахалинская область', 'Сахалин'),
    r('Забайкальский край'), r('Еврейская автономная область', 'ЕАО'), r('Чукотский автономный округ', 'Чукотка'),
  ] },
];

export const regionNames = regionGroups.flatMap(group => group.regions.map(region => region.name));

export const normalizeRegion = (text: string) => text.toLocaleLowerCase('ru').replaceAll('ё', 'е').replace(/[—–-]/g, ' ').replace(/[^\p{L}\p{N}() ]+/gu, ' ').replace(/\s+/g, ' ').trim();

/** The region as it is written in the list («республика татарстан» → «Республика Татарстан»); null when the text is not a region. */
export function canonicalRegion(text: string) {
  const key = normalizeRegion(text);
  if (!key) return null;
  return regionNames.find(name => normalizeRegion(name) === key) ?? null;
}

/**
 * Regions for the typed text, grouped by federal district: every word must start a word of the name or an alias
 * («сар об» → Саратовская область, «хмао» → Ханты-Мансийский…), so «ленин» does not match «Калининградская».
 */
export function searchRegions(query: string): RegionGroup[] {
  const words = normalizeRegion(query).split(' ').filter(Boolean);
  if (!words.length) return regionGroups;
  const matches = (text: string) => {
    const parts = normalizeRegion(text).replace(/[()]/g, ' ').split(' ').filter(Boolean);
    return words.every(word => parts.some(part => part.startsWith(word)));
  };
  return regionGroups.map(group => ({ ...group, regions: group.regions.filter(region => [region.name, ...region.aliases ?? []].some(matches)) }))
    .filter(group => group.regions.length);
}
