import { useQuery } from '@tanstack/react-query';
import { Link, type SetURLSearchParams } from 'react-router-dom';
import { Button, EmptyState, Icon, Loading, Select } from '@olimp/ui';
import { api, isMock } from '../../lib/api';
import { useDirections, useUniversities } from '../../lib/queries';
import { useProfile } from '../../lib/profile';
import { universityInitials } from './detail-format';
import { UniversityLogo } from '../university/UniversityLogo';
import { goalLimits, type University } from '../profile/goal-format';
import { filterUniversities, universityCities, universityFacts, universitySorts, type UniversitySort } from './university-search';

function UniversityCard({ item, backTo }: { item: University; backTo: string }) {
  const facts = universityFacts(item);
  return <article className="olympiad-card university-card">
    <div className="university-card__head">
      <UniversityLogo className="university-hero__avatar university-card__logo" slug={item.slug} initials={universityInitials(item.name)} />
      <div className="university-card__title">
        <h2><Link className="olympiad-card__link" to={`/universities/${item.slug}`} state={{ backTo }}>{item.name}</Link></h2>
        <p className="university-card__city"><Icon name="map-pin" size={12} />{item.city}</p>
      </div>
    </div>
    {item.fullName && item.fullName !== item.name && <p className="university-card__full">{item.fullName}</p>}
    {facts.length > 0 && <div className="university-card__facts">{facts.map(fact => <span key={fact} className="chip">{fact}</span>)}</div>}
    <div className="card-actions">
      <span className="university-card__more">Программы и льготы<Icon name="chevron-right" size={14} /></span>
    </div>
  </article>;
}

/**
 * «Каталог → Вузы»: the same page as the olympiad catalog, switched to universities. Search by name or city,
 * filters by city and direction of study, «Мои вузы» (the goal universities, chosen in the profile); a card opens the university page.
 */
export function UniversityCatalog({ params, setParams }: { params: URLSearchParams; setParams: SetURLSearchParams }) {
  const all = useUniversities();
  const directions = useDirections();
  const { profile } = useProfile();
  const q = params.get('q') ?? '';
  const city = params.get('city') ?? '';
  const direction = params.get('direction') ?? '';
  const sort = (universitySorts.some(option => option.value === params.get('sort')) ? params.get('sort') : 'name') as UniversitySort;
  const mine = params.get('mine') === '1';
  // A direction filter needs the programs, which only the API has; the demo shows the whole list.
  const byDirection = useQuery({ queryKey: ['universities', 'direction', direction], enabled: Boolean(direction) && !isMock,
    queryFn: ({ signal }) => api.universitiesFor([direction], signal), staleTime: 3_600_000 });
  const source = direction && !isMock ? byDirection : all;
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    setParams(next, { replace: key === 'q' });
  };
  const reset = () => setParams({ mode: 'universities' });
  const items = source.data ? filterUniversities(source.data.items, { q, city, sort, only: mine ? profile.universities : undefined }) : [];
  const cities = universityCities(all.data?.items ?? []);
  const backTo = `/catalog?${params}`;
  return <>
    <form className="search-page__field university-search" role="search" onSubmit={event => event.preventDefault()}>
      <Icon name="search" size={16} />
      <input aria-label="Поиск вузов" placeholder="Название вуза или город" autoComplete="off" enterKeyHint="search" maxLength={100} value={q} onChange={event => set('q', event.target.value)} />
      {q && <button type="button" aria-label="Очистить поиск" onClick={() => set('q', '')}><Icon name="x" size={13} /></button>}
    </form>
    <div className="filter-grid">
      <Select label="Город" placeholder="Город" icon="map-pin" searchable searchPlaceholder="Найти город" value={city} onChange={value => set('city', value)}
        options={[{ value: '', label: 'Все города' }, ...cities.map(({ city: name, count }) => ({ value: name, label: `${name} · ${count}` }))]} />
      <Select label="Сортировка" placeholder="По названию" icon="sort" align="right" value={sort === 'name' ? '' : sort} onChange={value => set('sort', value)}
        options={universitySorts.map(option => ({ value: option.value === 'name' ? '' : option.value, label: option.label }))} />
      {!isMock && <div className="filter-grid__wide"><Select label="Направление подготовки" placeholder="Любое направление" icon="graduation-cap" searchable searchPlaceholder="Например, врач или 09.03.04"
        value={direction} onChange={value => set('direction', value)}
        options={[{ value: '', label: 'Любое направление' }, ...(directions.data?.items ?? []).map(item => ({ value: item.code, label: `${item.name} · ${item.code}` }))]} /></div>}
    </div>
    <div className="subject-tabs university-chips">
      <button type="button" className={`chip ${!mine ? 'chip--active' : ''}`} aria-pressed={!mine} onClick={() => set('mine', '')}>Все вузы</button>
      <button type="button" className={`chip ${mine ? 'chip--active' : ''}`} aria-pressed={mine} onClick={() => set('mine', mine ? '' : '1')}>Мои вузы · {profile.universities.length} из {goalLimits.universities}</button>
    </div>
    <div className="results-label" aria-live="polite"><span>{source.data ? `Найдено: ${items.length}` : 'Вузы'}</span><span>{q || city || direction || mine ? 'По вашим фильтрам' : 'Все вузы'}</span></div>
    {source.isPending ? <Loading label="Загружаем вузы…" /> : source.isError
      ? <EmptyState title="Не удалось загрузить вузы" action={<Button onClick={() => source.refetch()}>Попробовать снова</Button>}>{source.error.message}</EmptyState>
      : !items.length ? <EmptyState icon="search" title={mine && !profile.universities.length ? 'Целевых вузов пока нет' : 'Ничего не нашлось'} action={<Button variant="secondary" onClick={reset}>Сбросить фильтры</Button>}>
        {mine && !profile.universities.length ? <>Укажите целевые вузы в <Link className="text-link" to="/profile/edit">профиле</Link> — они появятся здесь и в подборке олимпиад «Под мою цель».</> : 'Попробуйте другое название, город или направление.'}</EmptyState>
      : <div className="catalog-list">{items.map(item => <UniversityCard key={item.slug} item={item} backTo={backTo} />)}</div>}
  </>;
}
