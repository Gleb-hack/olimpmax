import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, type SetURLSearchParams } from 'react-router-dom';
import { Button, EmptyState, Icon, Loading, Notice } from '@olimp/ui';
import { api, isMock } from '../../lib/api';
import { useDirections, useUniversities } from '../../lib/queries';
import { useProfile } from '../../lib/profile';
import { universityInitials } from './detail-format';
import { UniversityLogo } from '../university/UniversityLogo';
import { directionNote, directionRank, goalLimits, pickByKey, type University } from '../profile/goal-format';
import { filterUniversities, parseUniversitySort, universityCities, universityFacts, universitySorts } from './university-search';
import { FilterChip, SingleChoiceDialog, SortDialog, type Choice } from './CatalogDialogs';

export const universitySearchId = 'university-search';

/** Figma «VuzCard»: logo, name and city, the full name, facts, «Программы и льготы» and the target toggle. */
function UniversityCard({ item, backTo, target, canAdd, busy, onTarget }: {
  item: University; backTo: string; target: boolean; canAdd: boolean; busy: boolean; onTarget: () => void;
}) {
  const facts = universityFacts(item);
  return <article className={`olympiad-card university-card ${target ? 'is-target' : ''}`}>
    <div className="university-card__head">
      <UniversityLogo className="university-hero__avatar university-card__logo" slug={item.slug} initials={universityInitials(item.name)} />
      <div className="university-card__title">
        <h2><Link className="olympiad-card__link" to={`/universities/${item.slug}`} state={{ backTo }}>{item.name}</Link></h2>
        <p className="university-card__city"><Icon name="map-pin" size={12} />{item.city}</p>
      </div>
    </div>
    {item.fullName && item.fullName !== item.name && <p className="university-card__full">{item.fullName}</p>}
    {facts.length > 0 && <div className="university-card__facts">{facts.map(fact => <span key={fact} className="chip">{fact}</span>)}</div>}
    <div className="card-actions university-card__actions">
      <span className="university-card__more">Программы и льготы<Icon name="chevron-right" size={14} /></span>
      <button type="button" className={`target-button ${target ? 'is-on' : ''}`} aria-pressed={target} disabled={busy || (!target && !canAdd)} onClick={onTarget}
        title={!target && !canAdd ? `Целевых вузов может быть не больше ${goalLimits.universities}` : undefined}>
        <Icon name={target ? 'check' : 'plus'} size={13} />{target ? 'В целевых' : 'В целевые'}
      </button>
    </div>
  </article>;
}

type Popup = 'city' | 'direction' | 'sort' | null;

/**
 * Figma «📱 Каталог — Вузы» and «Каталог — Вузы (таб: Целевые активен)»: search by name or city, the city and direction
 * chips, «Все вузы | Целевые вузы», the order in a popup. A card adds the university to the goal of the profile or removes it;
 * the goal then orders the olympiad catalog («Сначала актуальные»).
 */
export function UniversityCatalog({ params, setParams }: { params: URLSearchParams; setParams: SetURLSearchParams }) {
  const all = useUniversities();
  const directions = useDirections();
  const { profile, update, saving, storageError } = useProfile();
  const [popup, setPopup] = useState<Popup>(null);
  const q = params.get('q') ?? '';
  const city = params.get('city') ?? '';
  const direction = params.get('direction') ?? '';
  const sort = parseUniversitySort(params.get('sort'));
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
  // «Сбросить» clears the search and the filters; the tab and the order stay.
  const reset = () => {
    const next = new URLSearchParams({ mode: 'universities' });
    if (mine) next.set('mine', '1');
    if (params.get('sort')) next.set('sort', params.get('sort')!);
    setParams(next);
  };
  const targets = profile.universities;
  const items = source.data ? filterUniversities(source.data.items, { q, city, sort, only: mine ? targets : undefined, targets }) : [];
  const cities = universityCities(all.data?.items ?? []);
  const directionItem = directions.data?.items.find(item => item.code === direction);
  const backTo = `/catalog?${params}`;
  const toggleTarget = (slug: string) => {
    void update({ universities: targets.includes(slug) ? targets.filter(item => item !== slug) : [...targets, slug] });
  };
  const targetNames = pickByKey(all.data?.items, targets, item => item.slug).map(item => item.name);
  const cityOptions: Choice[] = cities.map(({ city: name, count }) => ({ value: name, label: name, note: universityCount(count) }));
  const directionOptions: Choice[] = (directions.data?.items ?? []).map(item => ({ value: item.code, label: item.name, note: directionNote(item) }));
  const hasFilters = Boolean(q || city || direction);
  // «По городу» groups the list under city headings.
  const groups = sort === 'city' ? items.reduce<{ city: string; items: University[] }[]>((list, item) => {
    const last = list[list.length - 1];
    if (last?.city === item.city) last.items.push(item); else list.push({ city: item.city, items: [item] });
    return list;
  }, []) : [{ city: '', items }];
  const card = (item: University) => <UniversityCard key={item.slug} item={item} backTo={backTo} target={targets.includes(item.slug)}
    canAdd={targets.length < goalLimits.universities} busy={saving} onTarget={() => toggleTarget(item.slug)} />;

  return <>
    <form className="search-page__field university-search" role="search" onSubmit={event => event.preventDefault()}>
      <Icon name="search" size={16} />
      <input id={universitySearchId} aria-label="Поиск вузов" placeholder="Название вуза или город" autoComplete="off" enterKeyHint="search" maxLength={100} value={q} onChange={event => set('q', event.target.value)} />
      {q && <button type="button" aria-label="Очистить поиск" onClick={() => set('q', '')}><Icon name="x" size={13} /></button>}
    </form>
    <div className="catalog-controls catalog-controls--universities">
      <div className="filter-chips" role="group" aria-label="Фильтры">
        <FilterChip icon="map-pin" label={city || 'Город'} active={Boolean(city)} onClick={() => setPopup('city')} />
        {!isMock && <FilterChip icon="book" label={directionItem?.name ?? (direction || 'Направление')} active={Boolean(direction)} onClick={() => setPopup('direction')} />}
      </div>
      <div className="catalog-utils catalog-utils--single">
        <button type="button" className="catalog-util" disabled={!hasFilters} onClick={reset}><Icon name="refresh" size={15} />Сбросить</button>
      </div>
      <div className="segmented segmented--scope" role="tablist" aria-label="Какие вузы показать">
        <button type="button" role="tab" aria-selected={!mine} className={!mine ? 'is-active' : ''} onClick={() => set('mine', '')}>Все вузы</button>
        <button type="button" role="tab" aria-selected={mine} className={mine ? 'is-active' : ''} onClick={() => set('mine', '1')}>Целевые вузы</button>
      </div>
    </div>
    {mine && <p className="catalog-caption">Из твоего профиля · {targets.length} из {goalLimits.universities}. Отмечай вузы кнопкой «В целевые» — по ним подбираются олимпиады.</p>}
    <div className="catalog-result-row" aria-live="polite">
      <span>{source.data ? `${mine ? 'Целевые вузы' : 'Найдено'}: ${items.length}` : 'Вузы'}</span>
      <button type="button" className={`catalog-util catalog-util--inline ${sort !== 'name' ? 'is-active' : ''}`} aria-haspopup="dialog" onClick={() => setPopup('sort')}>
        <Icon name="sort" size={15} />{sort === 'name' ? 'Сортировать' : universitySorts.find(option => option.value === sort)?.label ?? 'Сортировать'}</button>
    </div>
    {storageError && <Notice tone="error">{storageError}</Notice>}
    {source.isPending ? <Loading label="Загружаем вузы…" /> : source.isError
      ? <EmptyState title="Не удалось загрузить вузы" action={<Button onClick={() => source.refetch()}>Попробовать снова</Button>}>{source.error.message}</EmptyState>
      : !items.length ? <EmptyState icon={mine ? 'target' : 'search'} title={mine && !targets.length ? 'Целевых вузов пока нет' : 'Ничего не нашлось'}
        action={mine && !targets.length ? <Button variant="secondary" onClick={() => set('mine', '')}>Выбрать из всех вузов</Button> : <Button variant="secondary" onClick={reset}>Сбросить фильтры</Button>}>
        {mine && !targets.length ? <>Нажми «В целевые» на карточке вуза или укажи вузы в <Link className="text-link" to="/profile/edit">профиле</Link> — по ним подберём олимпиады с льготами.</> : 'Попробуйте другое название, город или направление.'}</EmptyState>
      : groups.map(group => group.city
        ? <section key={group.city} className="university-group" aria-label={group.city}><h2 className="university-group__title">{group.city}</h2><div className="catalog-list">{group.items.map(card)}</div></section>
        : <div key="all" className="catalog-list">{group.items.map(card)}</div>)}
    {mine && targets.length > 0 && <Link className="match-explainer" to="/catalog">
      <span className="match-explainer__icon" aria-hidden="true"><Icon name="target" size={18} /></span>
      <span className="match-explainer__copy"><strong>Мы подбираем олимпиады под эти вузы</strong>
        <small>В первую очередь показываем олимпиады, которые дают льготы именно в {listNames(targetNames)}.</small></span>
      <Icon name="chevron-right" size={16} className="match-explainer__chevron" />
    </Link>}
    {popup === 'city' && <SingleChoiceDialog title="Город" value={city} options={cityOptions} onPick={value => set('city', value)} onClose={() => setPopup(null)}
      search={cityOptions.length > 8 ? { placeholder: 'Найти город', rank: (option, query) => option.label.toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru')) ? 0 : null } : undefined} />}
    {popup === 'direction' && <SingleChoiceDialog title="Направление подготовки" value={direction} options={directionOptions} onPick={value => set('direction', value)} onClose={() => setPopup(null)}
      pending={directions.isPending} error={directions.isError} onRetry={() => directions.refetch()}
      search={{ placeholder: 'Например, врач или 09.03.04', rank: (option, query) => { const item = directions.data?.items.find(d => d.code === option.value); return item ? directionRank(item, query) : null; } }} />}
    {popup === 'sort' && <SortDialog options={universitySorts} value={sort === 'programs' ? 'name' : sort} onPick={value => set('sort', value === 'name' ? '' : value)} onClose={() => setPopup(null)} />}
  </>;
}

/** «1 вуз», «3 вуза», «12 вузов». */
export function universityCount(count: number) {
  const form = new Intl.PluralRules('ru').select(count);
  return `${count} ${form === 'one' ? 'вуз' : form === 'few' ? 'вуза' : 'вузов'}`;
}

/** «МФТИ и СПбГУ», «МФТИ, СПбГУ и МГУ», «МФТИ, СПбГУ, МГУ и ещё 2». */
export function listNames(names: string[]) {
  if (!names.length) return 'твоих целевых вузах';
  if (names.length === 1) return names[0]!;
  if (names.length <= 3) return `${names.slice(0, -1).join(', ')} и ${names[names.length - 1]}`;
  return `${names.slice(0, 3).join(', ')} и ещё ${names.length - 3}`;
}
