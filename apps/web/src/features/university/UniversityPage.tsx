import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Button, EmptyState, Icon, Loading, Notice } from '@olimp/ui';
import { api } from '../../lib/api';
import { max } from '../../lib/max';
import { canGoBack } from '../../lib/history';
import { DetailRow } from '../catalog/DetailRow';
import { universityInitials } from '../catalog/detail-format';
import { UniversityLogo } from './UniversityLogo';
import { benefitOverview, commonRequirement, rulesLabel, siteLabel, universitySeries, universityTypes, type UniversitySeries } from './university-format';

const COLLAPSED = 8;
// A real link keeps long-press and copy; the click itself goes through MAX like other external links.
function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return <a className="text-link" href={href} onClick={event => { event.preventDefault(); max.openExternal(href); }}>{children}<Icon name="external-link" size={13} /></a>;
}
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function SeriesCard({ card, backTo, currentId }: { card: UniversitySeries; backTo: string; currentId?: number }) {
  const [open, setOpen] = useState(false);
  const single = card.olympiads.length === 1 ? card.olympiads[0]! : null;
  const id = `university-series-${card.slug}`;
  const copy = <>
    <span className="university-benefit__avatar" aria-hidden="true" data-length={card.initials.length > 2 ? 'long' : undefined}>{card.initials}</span>
    <span className="university-benefit__copy"><strong>{card.name}{card.current ? <em className="university-benefit__badge">эта олимпиада</em> : card.own && <em className="university-benefit__badge">олимпиада вуза</em>}</strong><span>{card.benefit}</span></span>
  </>;
  // One catalog card: go straight to it. Several (one per subject): open the list. None: nothing to open.
  if (single) return <li className="university-benefit"><Link className="university-benefit__head" to={`/olympiads/${single.id}`} state={{ backTo, historyBack: true }}>
    {copy}<Icon name="chevron-right" size={18} className="university-benefit__chevron" /></Link></li>;
  if (!card.olympiads.length) return <li className="university-benefit"><div className="university-benefit__head">{copy}</div></li>;
  return <li className={`university-benefit ${open ? 'is-open' : ''}`}>
    <button type="button" className="university-benefit__head" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
      {copy}<span className="university-series__count">{card.olympiads.length}</span><Icon name="chevron-right" size={18} className="university-benefit__chevron" />
    </button>
    <div id={id} className="university-benefit__details university-series" hidden={!open}>
      {card.requirement && <p className="university-benefit__city">{card.requirement}</p>}
      <ul>{card.olympiads.map(olympiad => <li key={olympiad.id}><Link to={`/olympiads/${olympiad.id}`} state={{ backTo, historyBack: true }} aria-current={olympiad.id === currentId ? 'page' : undefined}>
        <span>{olympiad.title}</span><Icon name="chevron-right" size={14} /></Link></li>)}</ul>
    </div>
  </li>;
}

/** Figma «Вуз — МФТИ» / «Вуз — НИУ ВШЭ»: about the university, details and the olympiads that give a benefit there. */
export function UniversityPage() {
  const slug = useParams().slug ?? '';
  const valid = slugPattern.test(slug);
  const navigate = useNavigate();
  const location = useLocation();
  const fromOlympiad = typeof location.state?.fromOlympiad === 'number' ? location.state.fromOlympiad as number : undefined;
  const university = useQuery({ queryKey: ['university', slug], queryFn: () => api.university(slug), enabled: valid });
  const [all, setAll] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const item = university.data;
  useEffect(() => { setAll(false); }, [slug]);
  useEffect(() => { if (item) { document.title = `${item.name} · Olimp`; heading.current?.focus({ preventScroll: true }); } }, [item]);
  const back = () => canGoBack() ? navigate(-1) : navigate('/catalog');
  const series = item ? universitySeries(item, fromOlympiad) : [];
  const shown = all ? series : series.slice(0, COLLAPSED);
  const requirement = item ? commonRequirement(item) : null;
  const backTo = `/universities/${slug}`;
  return <div className="olympiad-detail university-page">
    <div className="olympiad-detail__navigation"><button type="button" className="icon-button back-button" aria-label="Назад" onClick={back}><Icon name="chevron-left" size={18} /></button></div>
    {!valid ? <EmptyState title="Вуз не найден" action={<Link className="button-link" to="/catalog">В каталог</Link>}>Проверьте ссылку или найдите олимпиаду в каталоге.</EmptyState>
      : university.isPending ? <Loading />
      : university.isError ? <Notice tone="error">{university.error.message}<Button variant="secondary" onClick={() => university.refetch()}>Повторить</Button></Notice>
      : item && <>
        <header className="university-hero">
          <UniversityLogo className="university-hero__avatar" slug={item.slug} initials={universityInitials(item.name)} />
          <div><h1 ref={heading} tabIndex={-1}>{item.name}</h1><p>{item.city}</p></div>
        </header>
        {(item.description || item.fullName) && <section className="olympiad-detail__about"><h2>О вузе</h2><p>{item.description ?? item.fullName}</p></section>}
        <section className="olympiad-detail__details"><h2>Детали</h2><dl className="olympiad-detail-list">
          {item.type && <DetailRow icon="graduation-cap" label="Тип" value={universityTypes[item.type]} />}
          {item.fullName && item.fullName !== item.name && <DetailRow icon="book" label="Полное название" value={item.fullName} />}
          <DetailRow icon="bar-chart" label="Льготы" value={benefitOverview(series)} hint={requirement ? `Подтверждение: ${requirement}` : undefined} />
          {item.rules && <DetailRow icon="clipboard-list" label="Правила приёма" value={<ExternalLink href={item.rules}>{rulesLabel(item.rules)}</ExternalLink>} />}
          {item.site && <DetailRow icon="globe" label="Официальный сайт" value={<ExternalLink href={item.site}>{siteLabel(item.site)}</ExternalLink>} />}
        </dl></section>
        <section className="olympiad-detail__about olympiad-universities" aria-labelledby="university-olympiads-title">
          <h2 id="university-olympiads-title">Олимпиады с льготами{series.length > 0 && <span className="olympiad-universities__count">{series.length}</span>}</h2>
          {series.length ? <ul className="university-benefits">{shown.map(card => <SeriesCard key={card.slug} card={card} backTo={backTo} currentId={fromOlympiad} />)}</ul>
            : <p>В базе пока нет олимпиад с льготами в этом вузе.</p>}
          {series.length > COLLAPSED && <button type="button" className="text-button olympiad-universities__more" onClick={() => setAll(!all)}>{all ? 'Свернуть' : `Показать все олимпиады (${series.length})`}</button>}
          {series.length > 0 && <p className="olympiad-schedule__hint olympiad-universities__note">Льгота зависит от профиля олимпиады и направления поступления — сверяйтесь с правилами приёма вуза.</p>}
        </section>
        {series.length > 0 && <Button className="full-width olympiad-detail__track" onClick={() => navigate(`/catalog?universities=${slug}`)}>Олимпиады с льготами в каталоге</Button>}
      </>}
  </div>;
}
