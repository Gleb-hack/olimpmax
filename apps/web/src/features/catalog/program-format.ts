import type { z } from 'zod';
import type { OlympiadProgramsResponse } from '@olimp/contracts';
import { shortBenefit } from './detail-format';

type Response = z.infer<typeof OlympiadProgramsResponse>;
export type ProgramRow = {
  key: string; slug: string; university: string; title: string; subtitle: string; score: string | null;
  examMatch: boolean; paidOnly: boolean;
};

/**
 * «Куда поможет поступить»: one row per program. Programs with the exam the diploma counts for come first
 * (100 баллов or БВИ confirmation work there), the server's order is kept otherwise.
 */
export function programRows(response: Response): ProgramRow[] {
  const rows = response.items.flatMap(item => {
    const benefit = [...new Set(item.benefits.map(shortBenefit))].join(' · ');
    return item.programs.map(program => {
      // «Без профиля» and a name equal to the direction say nothing new: the direction is the title then.
      const plain = program.name === 'Без профиля' || program.name === program.direction.name;
      return {
        key: `${item.university.slug}-${program.id}`, slug: item.university.slug, university: item.university.name,
        title: plain ? program.direction.name : program.name,
        subtitle: [item.university.name, plain ? null : program.direction.name, benefit].filter(Boolean).join(' · '),
        score: program.passingScore === null ? null : `Проходной ${program.passingScore}${program.passingYear ? ` в ${program.passingYear}` : ''}`,
        examMatch: program.examMatch, paidOnly: program.funding === 'paid_only',
      };
    });
  });
  return rows.map((row, index) => ({ row, index })).sort((a, b) => Number(b.row.examMatch) - Number(a.row.examMatch) || a.index - b.index).map(({ row }) => row);
}

/** «Куда поможет поступить» is shown only when the olympiad gives a benefit at one of the pupil's target universities. */
export function givesTargetBenefit(benefits: { university: { slug: string } }[], targetUniversities: string[]) {
  return benefits.some(benefit => targetUniversities.includes(benefit.university.slug));
}
