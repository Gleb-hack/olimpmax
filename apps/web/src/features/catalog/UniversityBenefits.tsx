import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@olimp/ui';
import type { UniversityBenefits as Group } from './detail-format';
import { UniversityLogo } from '../university/UniversityLogo';

const COLLAPSED = 5;
/** A university of «Вузы с льготами»: opens its page (Figma «Вуз — МФТИ»), where this olympiad is listed first. */
function UniversityCard({ group, olympiadId }: { group: Group; olympiadId: number }) {
  return <li className="university-benefit">
    <Link className="university-benefit__head" to={`/universities/${group.slug}`} state={{ fromOlympiad: olympiadId }}>
      <UniversityLogo className="university-benefit__avatar" slug={group.slug} initials={group.initials} />
      <span className="university-benefit__copy"><strong>{group.name}{group.organizer && <em className="university-benefit__badge">организатор</em>}</strong><span>{group.summary}</span>{group.coverage && <small className="university-benefit__coverage" title={group.coverageEstimated ? 'Оценка по экзаменам программ вуза' : undefined}>{group.coverage}</small>}</span>
      <Icon name="chevron-right" size={18} className="university-benefit__chevron" />
    </Link>
  </li>;
}

/** «Вузы с льготами» from the Figma «Олимпиада — Физтех» frame: universities of the database with a benefit for this olympiad. */
export function UniversityBenefits({ groups, note, olympiadId }: { groups: Group[]; note: string | null; olympiadId: number }) {
  const [all, setAll] = useState(false);
  if (!groups.length && !note) return null;
  const shown = all ? groups : groups.slice(0, COLLAPSED);
  return <section className="olympiad-detail__about olympiad-universities" aria-labelledby="olympiad-universities-title">
    <h2 id="olympiad-universities-title">Вузы с льготами{groups.length > 0 && <span className="olympiad-universities__count">{groups.length}</span>}</h2>
    {groups.length > 0 && <ul className="university-benefits">{shown.map(group => <UniversityCard key={group.slug} group={group} olympiadId={olympiadId} />)}</ul>}
    {groups.length > COLLAPSED && <button type="button" className="text-button olympiad-universities__more" onClick={() => setAll(!all)}>{all ? 'Свернуть' : `Показать все вузы (${groups.length})`}</button>}
    {note && <p className="olympiad-schedule__hint olympiad-universities__note">{note}</p>}
  </section>;
}
