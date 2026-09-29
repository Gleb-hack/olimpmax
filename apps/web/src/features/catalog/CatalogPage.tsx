import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams, type SetURLSearchParams } from 'react-router-dom';
import { olympiadLevelOptions } from '@olimp/contracts';
import { Button, Dialog, EmptyState, Header, Loading, Notice, Select, Icon } from '@olimp/ui';
import { api } from '../../lib/api';
import { useFilters, usePlan } from '../../lib/queries';
import { formats } from '../../lib/format';
import { OlympiadCard } from './OlympiadCard';
import { CatalogPagination } from './CatalogPagination';
import { useProfile } from '../../lib/profile';
import { hasGoal, withGoal } from '../../lib/goal';
import { UniversityCatalog } from './UniversityCatalog';

// «Сначала подробные» is the default: dated stages, days to the next stage and university benefits come first.
const sortOptions = [
  { value: 'complete', label: 'Сначала подробные', short: 'Сначала подробные', description: 'Даты этапов, дни до этапа, льготы вузов' },
  { value: 'rating', label: 'По рейтингу источника', short: 'По рейтингу', description: 'Сначала с высоким рейтингом' },
  { value: 'name', label: 'По названию', short: 'По названию', description: 'От А до Я' },
];
// Only with a goal in the profile: льготы целевых вузов, then the RSOSH list, then subjects of target directions.
const goalSort = { value: 'goal', label: 'Под мою цель', short: 'Под мою цель', description: 'Льготы целевых вузов и подходящие направления' };

/** «Олимпиады | Вузы» above the catalog; each mode keeps its own filters in the URL, switching starts from a clean list. */
function CatalogModeSwitch({ universities, onChange }: { universities: boolean; onChange: (universities: boolean) => void }) {
  return <div className="segmented catalog-mode-switch" role="tablist" aria-label="Что искать">
    <button type="button" role="tab" aria-selected={!universities} className={!universities ? 'is-active' : ''} onClick={() => onChange(false)}>Олимпиады</button>
    <button type="button" role="tab" aria-selected={universities} className={universities ? 'is-active' : ''} onClick={() => onChange(true)}>Вузы</button>
  </div>;
}

export function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const universities = params.get('mode') === 'universities';
  const switchMode = (next: boolean) => { if (next !== universities) setParams(next ? { mode: 'universities' } : {}); };
  if (universities) return <>
    <Header title="Каталог" />
    <CatalogModeSwitch universities onChange={switchMode} />
    <UniversityCatalog params={params} setParams={setParams} />
  </>;
  return <OlympiadCatalog params={params} setParams={setParams} modeSwitch={<CatalogModeSwitch universities={false} onChange={switchMode} />} />;
}

function OlympiadCatalog({ params, setParams, modeSwitch }: { params: URLSearchParams; setParams: SetURLSearchParams; modeSwitch: ReactNode }) {
  const navigate = useNavigate();
  const paramsRef = useRef(params);
  useEffect(() => { paramsRef.current = params; }, [params]);
  const [sortOpen, setSortOpen] = useState(false);
  const filters = useFilters();
  const plan = usePlan();
  const { profile } = useProfile();
  const query = withGoal(new URLSearchParams(params), profile);
  query.set('pageSize', '20');
  const catalog = useQuery({ queryKey: ['catalog', query.toString()], queryFn: ({ signal }) => api.catalog(query.toString(), signal) });
  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(paramsRef.current);
    value ? next.set(key, value) : next.delete(key);
    if (key !== 'page') next.delete('page');
    paramsRef.current = next;
    setParams(next);
  };
  const reset = () => { paramsRef.current = new URLSearchParams(); setParams({}); };
  const savedIds = new Set(plan.data?.items.map(entry => entry.olympiad.id));
  const hasFilters = ['q', 'subjectIds', 'grades', 'formats', 'levels', 'universities'].some(key => params.has(key));
  const universityOptions = filters.data?.universities ?? [];
  const sort = params.get('sort') || 'complete';
  const sorts = hasGoal(profile) ? [goalSort, ...sortOptions] : sortOptions;
  return <>
    <Header title="Каталог" action={<button className="icon-button icon-button--blue" aria-label="Поиск олимпиад" onClick={() => navigate('/search', { state: { backTo: `/catalog${params.size ? `?${params}` : ''}` } })}><Icon name="search" size={18} /></button>} />
    {modeSwitch}
    <div className="filter-grid">
      <Select label="Предмет" placeholder="Предмет" icon="book" searchable searchPlaceholder="Найти предмет" value={params.get('subjectIds') || ''} onChange={value => updateParam('subjectIds', value)} options={[{ value: '', label: 'Все предметы' }, ...(filters.data?.subjects.map(subject => ({ value: String(subject.id), label: subject.name })) ?? [])]} />
      <Select label="Класс" placeholder="Класс" icon="graduation-cap" align="right" value={params.get('grades') || ''} onChange={value => updateParam('grades', value)} options={[{ value: '', label: 'Все классы' }, ...Array.from({ length: 11 }, (_, index) => ({ value: String(index + 1), label: `${index + 1} класс` }))]} />
      <Select label="Формат" placeholder="Формат" icon="list" value={params.get('formats') || ''} onChange={value => updateParam('formats', value)} options={[{ value: '', label: 'Любой формат' }, ...Object.entries(formats).map(([value, label]) => ({ value, label }))]} />
      <Select label="Уровень" placeholder="Уровень" icon="bar-chart" align="right" value={params.get('levels') || ''} onChange={value => updateParam('levels', value)} options={[{ value: '', label: 'Любой уровень' }, ...olympiadLevelOptions]} />
      {universityOptions.length > 0 && <div className="filter-grid__wide"><Select label="Льготы в вузе" placeholder="Льготы в вузе" icon="graduation-cap" searchable searchPlaceholder="Найти вуз" value={params.get('universities') || ''} onChange={value => updateParam('universities', value)} options={[{ value: '', label: 'Любой вуз' }, ...universityOptions.map(u => ({ value: u.slug, label: `${u.name} · ${u.city}` }))]} /></div>}
    </div>
    <button className="reset-filter full-width" onClick={reset}><Icon name="refresh" size={16} />Сбросить фильтры</button>
    {filters.isError && <Notice tone="warning">Список предметов не загрузился. <button className="text-button" onClick={() => filters.refetch()}>Повторить</button></Notice>}
    <Button className="full-width sort-button" onClick={() => setSortOpen(true)}><Icon name="sort" size={15} />{sorts.find(option => option.value === sort && option.value !== 'complete')?.short ?? 'Сортировать'}</Button>
    <div className="results-label" aria-live="polite"><span>{catalog.data ? `Найдено: ${catalog.data.total}` : 'Каталог олимпиад'}</span><span>{hasFilters ? 'По вашим фильтрам' : 'Все предметы'}</span></div>
    {catalog.isPending ? <Loading label="Загружаем олимпиады…" /> : catalog.isError ? <EmptyState title="Не удалось загрузить каталог" action={<Button onClick={() => catalog.refetch()}>Попробовать снова</Button>}>{catalog.error.message}</EmptyState> : !catalog.data.items.length ? <EmptyState icon="search" title="Ничего не нашлось" action={<Button variant="secondary" onClick={reset}>Сбросить фильтры</Button>}>Попробуйте другой запрос или выберите меньше фильтров.</EmptyState> : <>
      <div className="catalog-list">{catalog.data.items.map(item => <OlympiadCard key={item.id} item={item} saved={savedIds.has(item.id)} tracking={plan.data?.items.find(entry => entry.olympiad.id === item.id)?.tracking} backTo={`/catalog${params.size ? `?${params}` : ''}`} />)}</div>
      <CatalogPagination page={catalog.data.page} totalPages={Math.max(1, Math.ceil(catalog.data.total / catalog.data.pageSize))} onChange={page => { updateParam('page', String(page)); window.scrollTo(0, 0); }} />
    </>}
    {sortOpen && <Dialog title="Сортировка" onClose={() => setSortOpen(false)}><div className="choice-list">{sorts.map(option => <label key={option.value} className="choice-row"><input type="radio" name="sort" value={option.value} checked={sort === option.value} onChange={() => { updateParam('sort', option.value === 'complete' ? '' : option.value); setSortOpen(false); }} /><span><strong>{option.label}</strong><small>{option.description}</small></span></label>)}</div></Dialog>}
  </>;
}