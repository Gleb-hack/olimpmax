import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Icon, Loading } from '@olimp/ui';
import { api } from '../../lib/api';
import { hasGoal, type GoalKeys } from '../../lib/goal';
import { programRows } from './program-format';

const COLLAPSED = 5;

/**
 * «Куда поможет поступить»: programs of the pupil's target universities and directions where the olympiad gives a benefit,
 * with the passing score and whether the program has the exam the diploma counts for (/olympiads/:id/programs).
 * Without a goal the list would cover every university, so it asks for the goal instead.
 */
export function AdmissionPrograms({ olympiadId, goal }: { olympiadId: number; goal: GoalKeys }) {
  const [all, setAll] = useState(false);
  const withGoal = hasGoal(goal);
  const programs = useQuery({ queryKey: ['olympiad-programs', olympiadId, goal.universities, goal.directions], enabled: withGoal,
    queryFn: ({ signal }) => api.olympiadPrograms(olympiadId, goal, signal), staleTime: 3_600_000 });
  const rows = programs.data ? programRows(programs.data) : [];
  // Nothing to say: the card gives no benefits, or the request failed (the university list below still shows the benefits).
  if (programs.isError || (programs.data && !programs.data.applicable)) return null;
  const shown = all ? rows : rows.slice(0, COLLAPSED);
  return <section className="olympiad-detail__about admission-programs" aria-labelledby="admission-programs-title">
    <h2 id="admission-programs-title">Куда поможет поступить{rows.length > 0 && <span className="olympiad-universities__count">{rows.length}</span>}</h2>
    {!withGoal ? <p className="admission-programs__empty">Укажи целевые вузы и направления в <Link className="text-link" to="/profile/edit">профиле</Link> — покажем программы, где эта олимпиада даёт льготу, и их проходные баллы.</p>
      : programs.isPending ? <Loading label="Подбираем программы…" />
      : !rows.length ? <p className="admission-programs__empty">В твоих целевых вузах и направлениях нет программ, куда эта олимпиада даёт льготу.</p>
      : <ul className="admission-programs__list">{shown.map(row => <li key={row.key} className="admission-program">
        <Link className="admission-program__link" to={`/universities/${row.slug}`} state={{ fromOlympiad: olympiadId }}>
          <span className="admission-program__copy"><strong>{row.title}</strong><span>{row.subtitle}</span>
            <span className="admission-program__facts">
              <em className={`admission-program__exam ${row.examMatch ? 'is-match' : ''}`}><Icon name={row.examMatch ? 'check' : 'x'} size={11} />{row.examMatch ? 'Экзамен совпадает' : 'Экзамен не совпадает'}</em>
              {row.score && <em>{row.score}</em>}
              {row.paidOnly && <em>Только платно</em>}
            </span></span>
          <Icon name="chevron-right" size={16} className="admission-program__chevron" />
        </Link></li>)}</ul>}
    {rows.length > COLLAPSED && <button type="button" className="text-button olympiad-universities__more" onClick={() => setAll(!all)}>{all ? 'Свернуть' : `Показать все программы (${rows.length})`}</button>}
    {rows.length > 0 && programs.data?.note && <p className="olympiad-schedule__hint olympiad-universities__note">{programs.data.note} «Экзамен совпадает» — в программе есть экзамен, за который засчитывается диплом. Проходные баллы — по данным Табитуриента и сайтов вузов.</p>}
  </section>;
}
