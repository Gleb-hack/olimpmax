import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { olympiadLevelOptions } from '@olimp/contracts';
import { Button, Dialog, EmptyState, Header, Loading, Notice, Select, Icon } from '@olimp/ui';
import { api } from '../../lib/api';
import { useFilters, usePlan } from '../../lib/queries';
import { formats } from '../../lib/format';
import { OlympiadCard } from './OlympiadCard';
import { CatalogPagination } from './CatalogPagination';

export function CatalogPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const paramsRef = useRef(params);
  useEffect(() => { paramsRef.current = params; }, [params]);
  const [sortOpen, setSortOpen] = useState(false);
  const filters = useFilters();
  const plan = usePlan();
  const query = new URLSearchParams(params);
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
  const hasFilters = ['q', 'subjectIds', 'grades', 'formats', 'levels'].some(key => params.has(key));
  return <>
    <Header title="Каталог" action={<button className="icon-button icon-button--blue" aria-label="Поиск олимпиад" onClick={() => navigate('/search', { state: { backTo: `/catalog${params.size ? `?${params}` : ''}` } })}><Icon name="search" size={18} /></button>} />
    <div className="filter-grid">
      <Select label="Предмет" placeholder="Предмет" icon="book" searchable searchPlaceholder="Найти предмет" value={params.get('subjectIds') || ''} onChange={value => updateParam('subjectIds', value)} options={[{ value: '', label: 'Все предметы' }, ...(filters.data?.subjects.map(subject => ({ value: String(subject.id), label: subject.name })) ?? [])]} />
      <Select label="Класс" placeholder="Класс" icon="graduation-cap" align="right" value={params.get('grades') || ''} onChange={value => updateParam('grades', value)} options={[{ value: '', label: 'Все классы' }, ...Array.from({ length: 11 }, (_, index) => ({ value: String(index + 1), label: `${index + 1} класс` }))]} />
      <Select label="Формат" placeholder="Формат" icon="list" value={params.get('formats') || ''} onChange={value => updateParam('formats', value)} options={[{ value: '', label: 'Любой формат' }, ...Object.entries(formats).map(([value, label]) => ({ value, label }))]} />
      <Select label="Уровень" placeholder="Уровень" icon="award" align="right" value={params.get('levels') || ''} onChange={value => updateParam('levels', value)} options={[{ value: '', label: 'Любой уровень' }, ...olympiadLevelOptions]} />
    </div>
    <button className="reset-filter full-width" onClick={reset}><Icon name="refresh" size={16} />Сбросить фильтры</button>
    {filters.isError && <Notice tone="warning">Список предметов не загрузился. <button className="text-button" onClick={() => filters.refetch()}>Повторить</button></Notice>}
    <Button className="full-width sort-button" onClick={() => setSortOpen(true)}><Icon name="sort" size={15} />{params.get('sort') === 'name' ? 'По названию' : 'Сортировать'}</Button>
    <div className="results-label" aria-live="polite"><span>{catalog.data ? `Найдено: ${catalog.data.total}` : 'Каталог олимпиад'}</span><span>{hasFilters ? 'По вашим фильтрам' : 'Все предметы'}</span></div>
    {catalog.isPending ? <Loading label="Загружаем олимпиады…" /> : catalog.isError ? <EmptyState title="Не удалось загрузить каталог" action={<Button onClick={() => catalog.refetch()}>Попробовать снова</Button>}>{catalog.error.message}</EmptyState> : !catalog.data.items.length ? <EmptyState icon="search" title="Ничего не нашлось" action={<Button variant="secondary" onClick={reset}>Сбросить фильтры</Button>}>Попробуйте другой запрос или выберите меньше фильтров.</EmptyState> : <>
      <div className="catalog-list">{catalog.data.items.map(item => <OlympiadCard key={item.id} item={item} saved={savedIds.has(item.id)} tracking={plan.data?.items.find(entry => entry.olympiad.id === item.id)?.tracking} backTo={`/catalog${params.size ? `?${params}` : ''}`} />)}</div>
      <CatalogPagination page={catalog.data.page} totalPages={Math.max(1, Math.ceil(catalog.data.total / catalog.data.pageSize))} onChange={page => { updateParam('page', String(page)); window.scrollTo(0, 0); }} />
    </>}
    {sortOpen && <Dialog title="Сортировка" onClose={() => setSortOpen(false)}><div className="choice-list">{[{ value: 'rating', label: 'По рейтингу источника', description: 'Сначала с высоким рейтингом' }, { value: 'name', label: 'По названию', description: 'От А до Я' }].map(option => <label key={option.value} className="choice-row"><input type="radio" name="sort" value={option.value} checked={(params.get('sort') || 'rating') === option.value} onChange={() => { updateParam('sort', option.value); setSortOpen(false); }} /><span><strong>{option.label}</strong><small>{option.description}</small></span></label>)}</div></Dialog>}
  </>;
}