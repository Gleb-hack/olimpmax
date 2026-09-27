import { ALL_PROFILES, combineLevels, parseGeneralLevel, type Level } from './model.js';

export type LevelSource = 'rsosh_list' | 'catalog' | 'series';
export type ResolvedLevel = {
  level: Level | null; levelProfile: string | null; levelStatus: string | null;
  levelSourceUrl: string | null; levelSource: LevelSource | null;
};
export type RsoshMeta = { season: string; status: string; url: string | null };
export type LevelInput = {
  rawSource: Record<string, string>;
  link?: { profiles: string[] } | null;
  series?: { name: string; generalLevel: Level | null; profiles: Map<string, number> } | null;
  rsosh: RsoshMeta;
};

const clean = (value: string | undefined) => {
  const v = value?.trim();
  return v && v !== '—' && v !== '-' ? v : null;
};
/** Level recorded in the catalog export itself (olimpiady.csv columns). */
export function catalogLevel(rawSource: Record<string, string>): ResolvedLevel {
  let level: Level | null = null;
  try { level = parseGeneralLevel(rawSource['Уровень олимпиады'] ?? ''); } catch { level = null; }
  return {
    level, levelProfile: level ? clean(rawSource['Профиль уровня']) : null,
    levelStatus: clean(rawSource['Статус уровня']), levelSourceUrl: level ? clean(rawSource['Источник уровня']) : null,
    levelSource: level ? 'catalog' : null,
  };
}

/**
 * Priority for a card linked to a series:
 * 1. its profile(s) in the RSOSH list file — the level is set per profile, not per olympiad;
 *    a profile missing from the list means «no level», even if other profiles of the series have one;
 * 2. the level already in the catalog export (older per-profile matching, covers olympiads absent from the list file),
 *    including its verdict that the profile is not in the list;
 * 3. the general level of the series from olympiads_clean — only when neither list says anything about the card.
 * Cards without a series keep the catalog value.
 */
export function resolveLevel(input: LevelInput): ResolvedLevel {
  const { link, series, rsosh } = input;
  if (link && series && series.profiles.size > 0) {
    const names = link.profiles.includes(ALL_PROFILES) ? [...series.profiles.keys()] : link.profiles;
    const levels = names.map(name => {
      const level = series.profiles.get(name);
      if (level === undefined) throw new Error(`Профиль «${name}» не найден у серии «${series.name}»`);
      return level;
    });
    const level = combineLevels(levels);
    if (!level) return { level: null, levelProfile: null, levelSourceUrl: rsosh.url, levelSource: 'rsosh_list',
      levelStatus: `Профиль не входит в перечень РСОШ ${rsosh.season}` };
    const profile = link.profiles.includes(ALL_PROFILES) ? `все профили (${names.length})` : names.join(', ');
    return { level, levelProfile: profile, levelStatus: rsosh.status, levelSourceUrl: rsosh.url, levelSource: 'rsosh_list' };
  }
  const fromCatalog = catalogLevel(input.rawSource);
  // «Этот профиль не найден в проекте РСОШ» is a verdict about this very profile, not a gap in the data.
  const profileRejected = /профиль не найден/i.test(fromCatalog.levelStatus ?? '');
  if (fromCatalog.level || profileRejected || !link || !series?.generalLevel) return fromCatalog;
  return {
    level: series.generalLevel, levelProfile: null, levelSourceUrl: null, levelSource: 'series',
    levelStatus: series.generalLevel === 'ВсОШ' ? 'ВсОШ: отдельная система; уровни I–III РСОШ не применяются'
      : `Общий уровень олимпиады по справочнику olympiads_clean; в перечне РСОШ ${rsosh.season} не найдена`,
  };
}
