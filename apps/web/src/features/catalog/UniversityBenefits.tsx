import { useState } from 'react';
import { Icon } from '@olimp/ui';
import type { UniversityBenefits as Group } from './detail-format';

const COLLAPSED = 5;
function UniversityCard({ group }: { group: Group }) {
  const [open, setOpen] = useState(false);
  const id = `university-benefit-${group.slug}`;
  return <li className={`university-benefit ${open ? 'is-open' : ''}`}>
    <button type="button" className="university-benefit__head" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
      <span className="university-benefit__avatar" aria-hidden="true">{group.initials}</span>
      <span className="university-benefit__copy"><strong>{group.name}{group.organizer && <em className="university-benefit__badge">организатор</em>}</strong><span>{group.summary}</span></span>
      <Icon name="chevron-right" size={18} className="university-benefit__chevron" />
    </button>
    <div id={id} className="university-benefit__details" hidden={!open}>
      <p className="university-benefit__city">{group.city}</p>
      <ul>{group.lines.map(line => <li key={line.title}><strong>{line.title}</strong><span>{line.requirement}</span></li>)}</ul>
    </div>
  </li>;
}

/** «Вузы с льготами» from the Figma «Олимпиада — Физтех» frame: universities of the database with a benefit for this olympiad. */
export function UniversityBenefits({ groups, note }: { groups: Group[]; note: string | null }) {
  const [all, setAll] = useState(false);
  if (!groups.length && !note) return null;
  const shown = all ? groups : groups.slice(0, COLLAPSED);
  return <section className="olympiad-detail__about olympiad-universities" aria-labelledby="olympiad-universities-title">
    <h2 id="olympiad-universities-title">Вузы с льготами{groups.length > 0 && <span className="olympiad-universities__count">{groups.length}</span>}</h2>
    {groups.length > 0 && <ul className="university-benefits">{shown.map(group => <UniversityCard key={group.slug} group={group} />)}</ul>}
    {groups.length > COLLAPSED && <button type="button" className="text-button olympiad-universities__more" onClick={() => setAll(!all)}>{all ? 'Свернуть' : `Показать все вузы (${groups.length})`}</button>}
    {note && <p className="olympiad-schedule__hint olympiad-universities__note">{note}</p>}
  </section>;
}
