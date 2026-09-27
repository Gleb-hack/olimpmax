// Human-readable overview of a reference bundle for data/reference-report.json.
import { catalogLevel, resolveLevel } from './levels.js';
import { scheduleConflicts } from './model.js';
import type { CatalogRow, ReferenceBundle } from './load.js';

export function referenceSummary(bundle: ReferenceBundle, catalog: CatalogRow[]) {
  const rsosh = { season: bundle.manifest.season, status: bundle.manifest.sources.rsosh.status, url: bundle.manifest.sources.rsosh.url };
  const series = new Map(bundle.series.map(s => [s.slug, s]));
  const links = new Map(bundle.links.map(l => [l.olympiadId, l]));
  const bySource: Record<string, number> = {};
  const levelChanges: { id: number; title: string; series: string; before: string | null; after: string | null; source: string | null; status: string | null }[] = [];
  for (const row of catalog) {
    const link = links.get(row.id);
    const entry = link ? series.get(link.series) : undefined;
    const before = catalogLevel(row.rawSource);
    let after = before;
    try {
      after = link && entry ? resolveLevel({ rawSource: row.rawSource, link, rsosh,
        series: { name: entry.name, generalLevel: entry.generalLevel, profiles: new Map([...entry.profiles].map(([p, v]) => [p, v.level])) } }) : before;
    } catch { /* reported by buildReference as an error */ }
    bySource[after.levelSource ?? 'none'] = (bySource[after.levelSource ?? 'none'] ?? 0) + 1;
    if (link && (before.level !== after.level || before.levelProfile !== after.levelProfile))
      levelChanges.push({ id: row.id, title: row.title, series: link.series, before: before.level, after: after.level, source: after.levelSource, status: after.levelStatus });
  }
  // Side by side: olympiads_clean vs the olimpiada.ru calendar for cards that now show the reference schedule.
  const scheduleComparison = bundle.series.filter(s => s.stages.length && s.scheduleQuality === 'ok').flatMap(s => {
    const card = catalog.find(row => links.get(row.id)?.series === s.slug && row.rawSource['Календарь статус'] === 'Опубликован');
    return card ? [{ series: s.slug, card: card.id, title: card.title, reference: s.stages.map(st => `${st.name}: ${st.rawDates}`).join('; '),
      catalog: (card.rawSource['Календарь'] ?? '').split(/\r?\n/).filter(Boolean).join('; '), catalogUpdated: card.rawSource['Расписание обновлено'] || null }] : [];
  });
  // Cards whose own published calendar contradicts an otherwise trusted series schedule keep the olimpiada.ru one.
  const conflicts = catalog.flatMap(row => {
    const link = links.get(row.id);
    const entry = link ? series.get(link.series) : undefined;
    if (!entry?.stages.length || entry.scheduleQuality !== 'ok') return [];
    return scheduleConflicts(row.rawSource['Календарь'] ?? null, row.rawSource['Календарь статус'] ?? null, entry.stages.map(s => s.rawDates))
      ? [{ id: row.id, title: row.title, series: entry.slug, catalog: (row.rawSource['Календарь'] ?? '').split(/\r?\n/).join('; ') }] : [];
  });
  const withSchedule = bundle.series.filter(s => s.stages.length);
  const quality = (q: string) => withSchedule.filter(s => s.scheduleQuality === q).map(s => s.slug);
  return {
    season: bundle.manifest.season,
    counts: {
      series: bundle.series.length, seriesWithSchedule: withSchedule.length, seriesInRsoshList: bundle.series.filter(s => s.profiles.size).length,
      rsoshProfiles: bundle.series.reduce((n, s) => n + s.profiles.size, 0), universities: bundle.universities.length,
      benefits: bundle.benefits.length, links: bundle.links.length, catalogCards: catalog.length,
      linkedCards: catalog.filter(r => links.has(r.id)).length,
    },
    schedule: { primary: quality('ok'), placeholder: quality('placeholder'), outdated: quality('outdated'), hidden: quality('hidden') },
    levelsBySource: bySource,
    levelChanges,
    scheduleComparison,
    scheduleConflicts: conflicts,
    series: bundle.series.map(s => ({
      slug: s.slug, name: s.name, cards: bundle.links.filter(l => l.series === s.slug).length, generalLevel: s.generalLevel,
      rsoshProfiles: s.profiles.size, stages: s.stages.length, scheduleQuality: s.stages.length ? s.scheduleQuality : null,
      benefits: bundle.benefits.filter(b => b.series === s.slug).length,
    })),
  };
}
