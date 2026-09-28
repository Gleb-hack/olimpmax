import type { z } from 'zod';
import type { UniversityResponse, SeriesBenefit } from '@olimp/contracts';
import { isOrganizer, requirementText, shortBenefit } from '../catalog/detail-format';

type University = z.infer<typeof UniversityResponse>;
type Benefit = z.infer<typeof SeriesBenefit>;

export const universityTypes = { state: 'Государственный вуз', private: 'Негосударственный вуз' } as const;

/** One card of «Олимпиады с льготами» (Figma «Вуз — МФТИ»): an olympiad series and the benefit it gives at the university. */
export type UniversitySeries = {
  slug: string; name: string; initials: string; benefit: string; requirement: string | null;
  bvi: boolean; current: boolean; own: boolean; olympiads: { id: number; title: string }[];
};

const stopWords = new Set(['олимпиада', 'олимпиады', 'олимпиад', 'школьников', 'по', 'и', 'для', 'имени', 'им.', 'им', 'на', 'базе']);
/** «Высшая проба» → «ВП», «Innopolis Open» → «IO», «Олимпиады КФУ» → «КФУ», «ВсОШ по физике» → «ВсОШ», «Ломоносов» → «Ло». */
export function seriesInitials(name: string) {
  const words = name.replace(/[«»"“”„()!?.,:]/g, ' ').split(/\s+/).filter(word => /\p{L}/u.test(word) && !stopWords.has(word.toLocaleLowerCase('ru')));
  const abbreviation = words.find(word => (word.match(/[А-ЯЁA-Z]/gu)?.length ?? 0) >= 2);
  if (abbreviation) return abbreviation.length <= 4 ? abbreviation : (abbreviation.match(/[А-ЯЁA-Z]/gu) ?? []).slice(0, 2).join('');
  if (words.length === 1) return words[0]!.charAt(0).toLocaleUpperCase('ru') + words[0]!.charAt(1).toLocaleLowerCase('ru');
  return words.slice(0, 2).map(word => word.charAt(0).toLocaleUpperCase('ru')).join('') || '?';
}

/**
 * Series with a benefit at the university, one card each. The series of the olympiad the user came from goes first,
 * then the university's own olympiads, БВИ before 100 баллов, and the series with more catalog cards.
 */
export function universitySeries(university: Pick<University, 'benefits' | 'name' | 'fullName' | 'slug' | 'city'>, currentOlympiadId?: number): UniversitySeries[] {
  const groups = new Map<string, Benefit[]>();
  for (const benefit of university.benefits) groups.set(benefit.series.slug, [...groups.get(benefit.series.slug) ?? [], benefit]);
  return [...groups.values()].map(list => {
    const sorted = [...list].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'bvi' ? -1 : 1) || (a.diploma === b.diploma ? 0 : a.diploma === 'any' ? -1 : 1));
    const first = sorted[0]!;
    const olympiads = first.olympiads ?? first.olympiadIds.map(id => ({ id, title: first.series.name }));
    return {
      slug: first.series.slug, name: first.series.name, initials: seriesInitials(first.series.name),
      benefit: [...new Set(sorted.map(shortBenefit))].join(' · '),
      requirement: sorted.some(b => b.requirement) ? requirementText(sorted.find(b => b.requirement)!) : null,
      bvi: sorted.some(b => b.kind === 'bvi'), current: currentOlympiadId !== undefined && olympiads.some(o => o.id === currentOlympiadId),
      own: isOrganizer(university, first.organizers ?? []), olympiads,
    };
  }).sort((a, b) => Number(b.current) - Number(a.current) || Number(b.own) - Number(a.own) || Number(b.bvi) - Number(a.bvi)
    || b.olympiads.length - a.olympiads.length || a.name.localeCompare(b.name, 'ru'));
}

const olympiadsDative = (count: number) => new Intl.PluralRules('ru').select(count) === 'one' ? 'олимпиаде' : 'олимпиадам';
/** «БВИ по 38 олимпиадам · 100 баллов ЕГЭ по 12 олимпиадам». */
export function benefitOverview(series: Pick<UniversitySeries, 'benefit'>[]) {
  const bvi = series.filter(s => s.benefit.includes('БВИ')).length;
  const score = series.filter(s => s.benefit.includes('100 баллов')).length;
  return [bvi && `БВИ по ${bvi} ${olympiadsDative(bvi)}`, score && `100 баллов ЕГЭ по ${score} ${olympiadsDative(score)}`].filter(Boolean).join(' · ') || 'Льготы не указаны';
}

/** The most frequent way to confirm a benefit, e.g. «ЕГЭ по профильному предмету от 75 до 85 баллов». */
export function commonRequirement(university: Pick<University, 'benefits'>) {
  const counts = new Map<string, number>();
  for (const benefit of university.benefits) if (benefit.requirement) counts.set(benefit.requirement, (counts.get(benefit.requirement) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export function siteLabel(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

/** «Документ PDF на pk.mipt.ru» / «Страница на hse.ru»: what the admission-rules link opens. */
export function rulesLabel(url: string) {
  const pdf = /\.pdf$/i.test((() => { try { return decodeURIComponent(new URL(url).pathname); } catch { return url; } })());
  return `${pdf ? 'Документ PDF' : 'Страница'} на ${siteLabel(url)}`;
}
